// Review-only reproductions. These assertions describe the current problems;
// a passing test is evidence of the problem, not a security regression guarantee.
// Run explicitly with: hardhat test nodejs review/findings.test.ts
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import hre from "hardhat";
import { getAddress, keccak256, toHex } from "viem";
import {
  OnchainRegistry,
  deploymentAddress,
} from "../../../apps/api/src/registry.js";
import { createClients } from "../scripts/clients.js";

const connection = await hre.network.create("hardhatMainnet");
const [admin, publisher, outsider] = await connection.viem.getWalletClients();
const toolId = keccak256(toHex("exchange_rate"));
const manifestHash = keccak256(toHex("review-manifest"));
const permissionHash = keccak256(toHex("review-permissions"));

// Isolated loopback bridge to the in-process chain. No external network, real
// account, persistent deployment file, or existing developer chain is touched.
const rpc = createServer(async (req, res) => {
  let text = "";
  for await (const chunk of req) text += chunk;
  const message = JSON.parse(text);
  res.setHeader("Content-Type", "application/json");
  try {
    const result = await connection.provider.request({
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

async function fixture() {
  return connection.viem.deployContract("ToolRegistry", [
    admin.account.address,
  ]);
}

describe("Review evidence (current behavior, not desired fixed behavior)", () => {
  it("R1: an untrusted first registrant permanently reserves a global tool ID", async () => {
    const registry = await fixture();
    await registry.write.registerTool(
      [toolId, "1.0.0", manifestHash, permissionHash],
      { account: outsider.account },
    );
    const record = await registry.read.getTool([toolId]);
    assert.equal(record.publisher, getAddress(outsider.account.address));
    assert.equal(
      record.approved,
      false,
      "This is ID denial of service, not automatic execution approval",
    );
    await connection.viem.assertions.revertWithCustomError(
      registry.write.registerTool(
        [toolId, "1.0.0", manifestHash, permissionHash],
        { account: publisher.account },
      ),
      registry,
      "NotPublisher",
    );
    await registry.write.revokeTool([toolId]);
    await connection.viem.assertions.revertWithCustomError(
      registry.write.registerTool(
        [toolId, "2.0.0", manifestHash, permissionHash],
        { account: publisher.account },
      ),
      registry,
      "NotPublisher",
    );
  });

  it("R2: the same approval calldata also restores a later-revoked version", async () => {
    const registry = await fixture();
    await registry.write.registerTool(
      [toolId, "1.0.0", manifestHash, permissionHash],
      { account: publisher.account },
    );
    await registry.write.approveVersion([toolId, "1.0.0"]);
    await registry.write.revokeTool([toolId], { account: publisher.account });
    assert.equal((await registry.read.getTool([toolId])).revoked, true);
    // Models an authorized approval prepared before revocation but mined after
    // it. It is a NEW transaction with identical calldata, not nonce replay.
    await registry.write.approveVersion([toolId, "1.0.0"]);
    const after = await registry.read.getTool([toolId]);
    assert.equal(after.revoked, false);
    assert.equal(after.approved, true);
  });

  it("R3: missing tool throws through OnchainRegistry even when RPC is healthy", async () => {
    const registry = await fixture();
    await registry.write.registerTool([
      toolId,
      "1.0.0",
      manifestHash,
      permissionHash,
    ]);
    const adapter = new OnchainRegistry(registry.address, rpcUrl, 31337);
    assert.equal((await adapter.get("exchange_rate"))?.exists, true);
    await assert.rejects(adapter.get("never-registered"));
    assert.equal(
      await connection.provider.request({ method: "eth_chainId" }),
      "0x7a69",
    );
  });

  it("R4: deployment client ignores configured CHAIN_ID mismatch", async () => {
    const saved = {
      RPC_URL: process.env.RPC_URL,
      CHAIN_ID: process.env.CHAIN_ID,
      DEPLOYER_PRIVATE_KEY: process.env.DEPLOYER_PRIVATE_KEY,
    };
    try {
      process.env.RPC_URL = rpcUrl;
      process.env.CHAIN_ID = "11155111";
      delete process.env.DEPLOYER_PRIVATE_KEY;
      const clients = await createClients();
      assert.equal(clients.chainId, 31337);
      assert.notEqual(clients.chainId, Number(process.env.CHAIN_ID));
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("R4: gateway deployment-file loader ignores chain metadata", async () => {
    const registry = await fixture();
    const dir = await mkdtemp(join(tmpdir(), "sentinel-review-"));
    const file = join(dir, "deployment.json");
    try {
      await writeFile(
        file,
        JSON.stringify({ address: registry.address, chainId: "wrong-chain" }),
      );
      assert.equal(deploymentAddress(file), registry.address);
    } finally {
      await unlink(file);
      await rmdir(dir);
    }
  });
});
