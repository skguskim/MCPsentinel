import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { mkdtemp, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import hre from "hardhat";
import { encodeErrorResult, getAddress, parseAbi, type Hex } from "viem";
import {
  hashManifest,
  hashPermissions,
  hashToolId,
  verifyTool,
} from "@mcpsentinel/shared";
import { createDemoManifests } from "@mcpsentinel/shared/demo";
import { readBlockchainConfig } from "@mcpsentinel/shared/blockchain";
import { OnchainRegistry } from "../../../apps/api/src/registry.js";
import {
  createClients,
  readDeployment,
  saveDeployment,
} from "../scripts/clients.js";

const connection = await hre.network.create("hardhatMainnet");
const [admin] = await connection.viem.getWalletClients();
const methods: string[] = [];
let fault: "outage" | "malformed" | "revert" | undefined;
let revertData: Hex = "0x";
// Bridge an isolated in-process chain; faults affect only this test server.
const rpc = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const message = JSON.parse(body);
  methods.push(message.method);
  res.setHeader("Content-Type", "application/json");
  if (fault === "outage") {
    res.writeHead(503).end("unavailable");
    return;
  }
  try {
    if (message.method === "eth_call" && fault === "revert") {
      throw { code: 3, message: "execution reverted", data: revertData };
    }
    const result =
      message.method === "eth_call" && fault === "malformed"
        ? "0x01"
        : await connection.provider.request({
            method: message.method,
            params: message.params,
          });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
  } catch (error) {
    const e = error as { code?: number; message: string; data?: unknown };
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: e.code ?? -32000, message: e.message, data: e.data },
      }),
    );
  }
});
rpc.listen(0, "127.0.0.1");
await once(rpc, "listening");
const rpcUrl = `http://127.0.0.1:${(rpc.address() as AddressInfo).port}`;
after(async () => {
  rpc.closeAllConnections();
  await new Promise<void>((resolve) => rpc.close(() => resolve()));
  await connection.close();
});

test("R3: on-chain lookup distinguishes missing tools from unavailable registry", async (t) => {
  const registry = await connection.viem.deployContract("ToolRegistry", [
    admin.account.address,
  ]);
  const adapter = new OnchainRegistry(registry.address, rpcUrl, 31337);
  const manifest = createDemoManifests("http://127.0.0.1:4100/mcp")[0]!;
  const verify = (
    record: Awaited<ReturnType<typeof adapter.get>>,
    registryError?: string,
  ) =>
    verifyTool({
      manifest,
      registry: record,
      registryError,
      observedTool: {
        name: manifest.name,
        description: manifest.description,
        inputSchema: manifest.inputSchema,
      },
      policy: {
        allowedPermissions: manifest.permissions,
        reviewPermissions: [],
      },
    });
  await t.test(
    "missing ToolNotFound returns null and records healthy registry with unregistered BLOCK",
    async () => {
      const record = await adapter.get(manifest.toolId);
      assert.equal(record, null);
      const result = verify(record);
      assert.equal(result.decision, "BLOCK");
      assert.equal(
        result.checks.find((check) => check.key === "registry_available")
          ?.passed,
        true,
      );
      assert.equal(
        result.checks.find((check) => check.key === "registered")?.passed,
        false,
      );
    },
  );
  await t.test(
    "registered and approved metadata still returns ALLOW",
    async () => {
      const id = hashToolId(manifest.toolId);
      await registry.write.registerTool([
        id,
        manifest.version,
        hashManifest(manifest),
        hashPermissions(manifest.permissions),
      ]);
      await registry.write.approveVersion([id, manifest.version]);
      const record = await adapter.get(manifest.toolId);
      assert.equal(record?.exists, true);
      assert.equal(verify(record).decision, "ALLOW");
    },
  );
  await t.test(
    "wrong chain and address without code reject at startup and lookup",
    async () => {
      for (const [invalid, pattern] of [
        [
          new OnchainRegistry(registry.address, rpcUrl, 11155111),
          /RPC chain ID mismatch/,
        ],
        [
          new OnchainRegistry(admin.account.address, rpcUrl, 31337),
          /contract code not found/,
        ],
      ] as const) {
        await assert.rejects(invalid.validateConnection(), pattern);
        await assert.rejects(invalid.get(manifest.toolId), pattern);
      }
    },
  );
  await t.test(
    "RPC outage stays an error and produces registry-unavailable BLOCK",
    async () => {
      fault = "outage";
      try {
        await assert.rejects(adapter.get(manifest.toolId), (error: Error) => {
          const result = verify(null, error.message);
          assert.equal(result.decision, "BLOCK");
          assert.equal(
            result.checks.find((check) => check.key === "registry_available")
              ?.passed,
            false,
          );
          return true;
        });
      } finally {
        fault = undefined;
      }
    },
  );
  await t.test(
    "malformed data, unrelated reverts and ToolNotFound for another ID remain errors",
    async () => {
      try {
        fault = "malformed";
        await assert.rejects(adapter.get(manifest.toolId));
        fault = "revert";
        for (const data of [
          encodeErrorResult({
            abi: parseAbi(["error Error(string message)"]),
            errorName: "Error",
            args: ["ToolNotFound is only text"],
          }),
          encodeErrorResult({
            abi: parseAbi(["error ToolNotFound(bytes32 toolId)"]),
            errorName: "ToolNotFound",
            args: [hashToolId("another-tool")],
          }),
          "0xdeadbeef" as Hex,
        ]) {
          revertData = data;
          await assert.rejects(adapter.get(manifest.toolId));
        }
      } finally {
        fault = undefined;
      }
      assert.equal((await adapter.get(manifest.toolId))?.approved, true);
    },
  );
});

test("R4: deployment clients validate intended chain before signer creation", async () => {
  methods.length = 0;
  await assert.rejects(
    createClients({
      RPC_URL: rpcUrl,
      CHAIN_ID: "11155111",
      DEPLOYER_PRIVATE_KEY: "invalid",
    }),
    /RPC chain ID mismatch: expected 11155111, received 31337/,
  );
  assert.deepEqual(
    methods,
    ["eth_chainId"],
    "Mismatch must not reach signing or transaction RPC methods",
  );
  const clients = await createClients({ RPC_URL: rpcUrl, CHAIN_ID: "31337" });
  assert.equal(clients.chainId, 31337);
  assert.equal(clients.account.address, getAddress(admin.account.address));
  assert.equal(await clients.publicClient.getChainId(), 31337);
});

test("R4: deployment metadata round-trips at the configured path and rejects other chains", async () => {
  const registry = await connection.viem.deployContract("ToolRegistry", [
    admin.account.address,
  ]);
  const artifact = await hre.artifacts.readArtifact("ToolRegistry");
  const dir = await mkdtemp(join(tmpdir(), "sentinel-deployment-"));
  const path = join(dir, "custom.json");
  const config = readBlockchainConfig({
    RPC_URL: rpcUrl,
    REGISTRY_DEPLOYMENT: path,
  });
  try {
    const deployment = {
      address: getAddress(registry.address),
      chainId: 31337,
      abi: artifact.abi,
    };
    assert.equal(await saveDeployment(deployment, config), path);
    assert.deepEqual(readDeployment(config), deployment);
    assert.throws(
      () => readDeployment({ ...config, chainId: 11155111 }),
      /Deployment chain ID mismatch/,
    );
    assert.throws(
      () =>
        readDeployment({ ...config, registryAddress: admin.account.address }),
      /does not match/,
    );
    await assert.rejects(
      saveDeployment({ ...deployment, chainId: 11155111 }, config),
      /does not match configuration/,
    );
    assert.deepEqual(
      readDeployment(config),
      deployment,
      "Failed save must preserve existing metadata",
    );
  } finally {
    await unlink(path);
    await rmdir(dir);
  }
});

test("R4: real deploy/seed entry points share configuration and reject invalid targets before writes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sentinel-cli-"));
  const path = join(dir, "registry.json");
  const manifests = createDemoManifests("http://127.0.0.1:4100/mcp");
  const manifestServer = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ tools: manifests }));
  });
  manifestServer.listen(0, "127.0.0.1");
  await once(manifestServer, "listening");
  const manifestUrl = `http://127.0.0.1:${(manifestServer.address() as AddressInfo).port}/manifest`;
  const environment = {
    ...process.env,
    RPC_URL: rpcUrl,
    CHAIN_ID: "31337",
    REGISTRY_DEPLOYMENT: path,
    REGISTRY_ADDRESS: admin.account.address,
    REGISTRY_MODE: "onchain",
    TOOL_AUTH_TOKEN: "integration-test-only",
    MANIFEST_URL: manifestUrl,
    // Explicit public local key prevents an inherited .env key being used.
    DEPLOYER_PRIVATE_KEY:
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  };
  async function run(script: string, override: NodeJS.ProcessEnv = {}) {
    const child = spawn(process.execPath, ["--import", "tsx", script], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      env: { ...environment, ...override },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    const timer = setTimeout(() => child.kill(), 20_000);
    try {
      const [code] = await once(child, "close");
      assert.notEqual(code, null, `CLI timed out: ${script}`);
      return { code, output };
    } finally {
      clearTimeout(timer);
    }
  }
  const noTransactions = () =>
    assert.equal(
      methods.some(
        (method) =>
          method.startsWith("eth_send") || method.startsWith("eth_sign"),
      ),
      false,
    );
  try {
    methods.length = 0;
    const wrongDeploy = await run("scripts/deploy.ts", {
      CHAIN_ID: "11155111",
    });
    assert.notEqual(wrongDeploy.code, 0);
    assert.match(wrongDeploy.output, /RPC chain ID mismatch/);
    noTransactions();

    const deployed = await run("scripts/deploy.ts");
    assert.equal(deployed.code, 0, deployed.output);
    const config = readBlockchainConfig({
      RPC_URL: rpcUrl,
      REGISTRY_DEPLOYMENT: path,
    });
    const deployment = readDeployment(config);
    // The freshly deployed registry has no tools, but is a valid connection.
    const adapter = new OnchainRegistry(deployment.address, rpcUrl, 31337);
    assert.equal(await adapter.get(manifests[0]!.toolId), null);

    for (const override of [
      { CHAIN_ID: "11155111" },
      { REGISTRY_ADDRESS: admin.account.address },
      { REGISTRY_DEPLOYMENT: path + ".missing" },
    ]) {
      methods.length = 0;
      const result = await run("scripts/seed.ts", override);
      assert.notEqual(result.code, 0);
      assert.match(
        result.output,
        /chain ID mismatch|does not match|file not found/,
      );
      noTransactions();
    }
    methods.length = 0;
    const invalidApi = await run("../../apps/api/src/index.ts", {
      CHAIN_ID: "11155111",
    });
    assert.notEqual(invalidApi.code, 0);
    assert.match(invalidApi.output, /Deployment chain ID mismatch/);
    noTransactions();

    const seeded = await run("scripts/seed.ts", {
      REGISTRY_ADDRESS: deployment.address,
    });
    assert.equal(seeded.code, 0, seeded.output);
    for (const manifest of manifests)
      assert.equal((await adapter.get(manifest.toolId))?.approved, true);
    methods.length = 0;
    const repeated = await run("scripts/seed.ts", {
      REGISTRY_ADDRESS: deployment.address,
    });
    assert.equal(repeated.code, 0, repeated.output);
    noTransactions();
  } finally {
    manifestServer.closeAllConnections();
    await new Promise<void>((resolve) => manifestServer.close(() => resolve()));
    await unlink(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    await rmdir(dir);
  }
});
