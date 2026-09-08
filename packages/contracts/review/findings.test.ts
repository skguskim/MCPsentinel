// Review-only reproductions. These assertions describe the current problems;
// a passing test is evidence of the problem, not a security regression guarantee.
// Run explicitly with: hardhat test nodejs review/findings.test.ts
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import hre from "hardhat";
import { getAddress, keccak256, toHex } from "viem";

const connection = await hre.network.create("hardhatMainnet");
const [admin, publisher, outsider] = await connection.viem.getWalletClients();
const toolId = keccak256(toHex("exchange_rate"));
const manifestHash = keccak256(toHex("review-manifest"));
const permissionHash = keccak256(toHex("review-permissions"));

after(async () => {
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
});
