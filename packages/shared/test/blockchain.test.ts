import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseAbi, zeroAddress } from "viem";
import {
  defaultDeploymentPath,
  loadProjectEnv,
  projectRoot,
  readBlockchainConfig,
  readRegistryDeployment,
  resolveRegistryAddress,
} from "../src/blockchain.js";

const address = "0x1234567890123456789012345678901234567890";
const abi = parseAbi([
  "struct Tool { address publisher; string version; bytes32 manifestHash; bytes32 permissionHash; bool approved; bool revoked; bool exists; }",
  "function getTool(bytes32 toolId) view returns (Tool)",
  "function registerTool(bytes32 toolId, string version, bytes32 manifestHash, bytes32 permissionHash)",
  "function approveVersion(bytes32 toolId, string version)",
  "function revokeTool(bytes32 toolId)",
  "error ToolNotFound(bytes32 toolId)",
]);

function withFile(run: (path: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "sentinel-config-"));
  const path = join(dir, "settings");
  writeFileSync(path, "");
  try {
    run(path);
  } finally {
    unlinkSync(path);
    rmdirSync(dir);
  }
}

test("local defaults and deployment paths are independent of the caller's directory", () => {
  const config = readBlockchainConfig({});
  assert.equal(config.chainId, 31337);
  assert.equal(config.rpcUrl, "http://127.0.0.1:8545");
  assert.equal(
    config.deploymentPath,
    resolve(projectRoot, "packages/contracts/deployments/localhost.json"),
  );
  assert.equal(
    defaultDeploymentPath(11155111),
    resolve(projectRoot, "packages/contracts/deployments/11155111.json"),
  );
  assert.equal(
    readBlockchainConfig({ REGISTRY_DEPLOYMENT: "tmp/custom.json" })
      .deploymentPath,
    resolve(projectRoot, "tmp/custom.json"),
  );
});

test("remote RPC requires an explicit positive safe chain ID", () => {
  assert.throws(
    () => readBlockchainConfig({ RPC_URL: "https://rpc.example" }),
    /CHAIN_ID is required/,
  );
  assert.equal(
    readBlockchainConfig({
      RPC_URL: "https://rpc.example",
      CHAIN_ID: "11155111",
    }).chainId,
    11155111,
  );
  for (const CHAIN_ID of [
    "",
    "0",
    "-1",
    "1.5",
    "0x7a69",
    "1e3",
    " 31337",
    "NaN",
    "Infinity",
    "9007199254740992",
  ]) {
    assert.throws(
      () => readBlockchainConfig({ CHAIN_ID }),
      /CHAIN_ID/,
      CHAIN_ID,
    );
  }
});

test("invalid RPC, address and deployment settings fail without exposing credentials", () => {
  for (const RPC_URL of [
    "",
    "not-a-url",
    "file:///etc/passwd",
    "ws://localhost",
    "https://user:secret@rpc.example",
    "https://rpc.example/#secret",
  ]) {
    assert.throws(
      () => readBlockchainConfig({ RPC_URL }),
      (error: Error) =>
        /RPC_URL/.test(error.message) && !error.message.includes("secret"),
    );
  }
  for (const REGISTRY_ADDRESS of ["", "invalid", zeroAddress]) {
    assert.throws(
      () => readBlockchainConfig({ REGISTRY_ADDRESS }),
      /REGISTRY_ADDRESS/,
    );
  }
  assert.throws(
    () => readBlockchainConfig({ REGISTRY_DEPLOYMENT: " " }),
    /REGISTRY_DEPLOYMENT/,
  );
});

test("deployment reader rejects missing files, invalid JSON, addresses, chain metadata and ABI", () => {
  withFile((path) => {
    assert.throws(
      () => readRegistryDeployment(path + ".missing", 31337),
      /file not found/,
    );
    writeFileSync(path, "{broken-json");
    assert.throws(() => readRegistryDeployment(path, 31337), /invalid JSON/);
    const deployment = { address, chainId: 31337, abi };
    for (const patch of [
      { address: zeroAddress },
      { address: "invalid" },
      { chainId: "31337" },
      { chainId: -1 },
      { abi: undefined },
      { abi: [] },
      { abi: [{ type: "function", name: "getTool" }] },
      {
        abi: abi.filter(
          (item) => !("name" in item) || item.name !== "revokeTool",
        ),
      },
      {
        abi: abi.map((item) =>
          item.type === "function" && item.name === "getTool"
            ? { ...item, outputs: [] }
            : item,
        ),
      },
      {
        abi: abi.map((item) =>
          item.type === "function" && item.name === "approveVersion"
            ? { ...item, inputs: [] }
            : item,
        ),
      },
      { abi: abi.filter((item) => item.type !== "error") },
    ]) {
      writeFileSync(path, JSON.stringify({ ...deployment, ...patch }));
      assert.throws(
        () => readRegistryDeployment(path, 31337),
        /Invalid Registry deployment/,
      );
    }
    writeFileSync(path, JSON.stringify(deployment));
    assert.deepEqual(readRegistryDeployment(path, 31337), deployment);
    assert.throws(
      () => readRegistryDeployment(path, 11155111),
      /Deployment chain ID mismatch/,
    );
    assert.throws(
      () =>
        readRegistryDeployment(
          path,
          31337,
          "0x0000000000000000000000000000000000000001",
        ),
      /does not match/,
    );
  });
});

test("explicit registry address works alone but must agree with an explicit deployment file", () => {
  assert.equal(
    resolveRegistryAddress(readBlockchainConfig({ REGISTRY_ADDRESS: address })),
    address,
  );
  withFile((path) => {
    writeFileSync(path, JSON.stringify({ address, chainId: 31337, abi }));
    assert.equal(
      resolveRegistryAddress(
        readBlockchainConfig({ REGISTRY_DEPLOYMENT: path }),
      ),
      address,
    );
    assert.equal(
      resolveRegistryAddress(
        readBlockchainConfig({
          REGISTRY_DEPLOYMENT: path,
          REGISTRY_ADDRESS: address,
        }),
      ),
      address,
    );
    assert.throws(
      () =>
        resolveRegistryAddress(
          readBlockchainConfig({
            REGISTRY_DEPLOYMENT: path,
            CHAIN_ID: "11155111",
          }),
        ),
      /Deployment chain ID mismatch/,
    );
    assert.throws(
      () =>
        resolveRegistryAddress(
          readBlockchainConfig({
            REGISTRY_DEPLOYMENT: path,
            REGISTRY_ADDRESS: "0x0000000000000000000000000000000000000001",
          }),
        ),
      /does not match/,
    );
  });
});

test("env loading fills absent settings and preserves shell values", () => {
  const keys = ["SENTINEL_TEST_FROM_FILE", "SENTINEL_TEST_FROM_SHELL"] as const;
  const previous = keys.map((key) => process.env[key]);
  try {
    delete process.env.SENTINEL_TEST_FROM_FILE;
    process.env.SENTINEL_TEST_FROM_SHELL = "shell-value";
    withFile((path) => {
      writeFileSync(
        path,
        "SENTINEL_TEST_FROM_FILE=file-value\nSENTINEL_TEST_FROM_SHELL=file-value\n",
      );
      loadProjectEnv(path);
      assert.equal(process.env.SENTINEL_TEST_FROM_FILE, "file-value");
      assert.equal(process.env.SENTINEL_TEST_FROM_SHELL, "shell-value");
      loadProjectEnv(path + ".missing");
    });
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});
