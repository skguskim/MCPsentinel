import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import hre from "hardhat";
import { getAddress, keccak256, toHex, zeroAddress, zeroHash } from "viem";
import { hashToolId } from "@mcpsentinel/shared";

const connection = await hre.network.create("hardhatMainnet");
const { viem } = connection;
after(() => connection.close());
const toolName = "exchange_rate";
const manifestHash = keccak256(toHex("manifest-v1"));
const permissionHash = keccak256(toHex("permissions-v1"));

async function fixture() {
  const [admin, publisher, outsider] = await viem.getWalletClients();
  const registry = await viem.deployContract("ToolRegistry", [
    admin.account.address,
  ]);
  const toolId = hashToolId(publisher.account.address, toolName);
  return { registry, admin, publisher, outsider, toolId };
}
async function registeredFixture() {
  const state = await fixture();
  await state.registry.write.registerTool(
    [toolName, "1.0.0", manifestHash, permissionHash],
    { account: state.publisher.account },
  );
  return state;
}

describe("ToolRegistry v2", () => {
  it("records the publisher, scoped name, hashes and initial revision without approving", async () => {
    const { registry, publisher, toolId } = await fixture();
    assert.equal(await registry.read.REGISTRY_VERSION(), 2n);
    await viem.assertions.emitWithArgs(
      registry.write.registerTool(
        [toolName, "1.0.0", manifestHash, permissionHash],
        { account: publisher.account },
      ),
      registry,
      "ToolRegistered",
      [
        toolId,
        getAddress(publisher.account.address),
        toolName,
        "1.0.0",
        manifestHash,
        permissionHash,
        1n,
      ],
    );
    assert.deepEqual(await registry.read.getTool([toolId]), {
      publisher: getAddress(publisher.account.address),
      version: "1.0.0",
      manifestHash,
      permissionHash,
      approved: false,
      revoked: false,
      exists: true,
      revision: 1n,
    });
  });
  it("requires verifier role for approval and administrator role for delegation", async () => {
    const { registry, admin, publisher, outsider, toolId } =
      await registeredFixture();
    for (const caller of [publisher, outsider]) {
      await viem.assertions.revertWithCustomError(
        registry.write.approveVersion([toolId, "1.0.0", 1n], {
          account: caller.account,
        }),
        registry,
        "AccessControlUnauthorizedAccount",
      );
    }
    const role = await registry.read.VERIFIER_ROLE();
    await viem.assertions.revertWithCustomError(
      registry.write.grantRole([role, outsider.account.address], {
        account: outsider.account,
      }),
      registry,
      "AccessControlUnauthorizedAccount",
    );
    await viem.assertions.emitWithArgs(
      registry.write.approveVersion([toolId, "1.0.0", 1n]),
      registry,
      "VersionApproved",
      [toolId, "1.0.0", getAddress(admin.account.address), 2n],
    );
    assert.equal((await registry.read.getTool([toolId])).approved, true);
  });
  it("allows an administrator to delegate and remove verifier authority", async () => {
    const { registry, outsider, toolId } = await registeredFixture();
    const role = await registry.read.VERIFIER_ROLE();
    await registry.write.grantRole([role, outsider.account.address]);
    await registry.write.approveVersion([toolId, "1.0.0", 1n], {
      account: outsider.account,
    });
    await registry.write.revokeRole([role, outsider.account.address]);
    await viem.assertions.revertWithCustomError(
      registry.write.approveVersion([toolId, "1.0.0", 2n], {
        account: outsider.account,
      }),
      registry,
      "AccessControlUnauthorizedAccount",
    );
    assert.equal((await registry.read.getTool([toolId])).approved, true);
  });
  it("invalidates approval on update and rejects a stale version even with a fresh revision", async () => {
    const { registry, publisher, toolId } = await registeredFixture();
    await registry.write.approveVersion([toolId, "1.0.0", 1n]);
    const nextHash = keccak256(toHex("manifest-v2"));
    await registry.write.registerTool(
      [toolName, "2.0.0", nextHash, permissionHash],
      { account: publisher.account },
    );
    const tool = await registry.read.getTool([toolId]);
    assert.equal(tool.approved, false);
    assert.equal(tool.manifestHash, nextHash);
    assert.equal(tool.revision, 3n);
    await viem.assertions.revertWithCustomError(
      registry.write.approveVersion([toolId, "1.0.0", 3n]),
      registry,
      "VersionMismatch",
    );
    await registry.write.approveVersion([toolId, "2.0.0", 3n]);
    assert.equal((await registry.read.getTool([toolId])).approved, true);
  });
  it("forbids rewriting or reusing a version within the same publisher namespace", async () => {
    const { registry, publisher, toolId } = await registeredFixture();
    const changed = keccak256(toHex("changed"));
    await viem.assertions.revertWithCustomError(
      registry.write.registerTool(
        [toolName, "1.0.0", changed, permissionHash],
        { account: publisher.account },
      ),
      registry,
      "VersionAlreadyUsed",
    );
    assert.equal((await registry.read.getTool([toolId])).revision, 1n);
    await registry.write.registerTool(
      [toolName, "2.0.0", changed, permissionHash],
      { account: publisher.account },
    );
    await viem.assertions.revertWithCustomError(
      registry.write.registerTool(
        [toolName, "1.0.0", manifestHash, permissionHash],
        { account: publisher.account },
      ),
      registry,
      "VersionAlreadyUsed",
    );
  });
  it("allows publisher or verifier revocation and denies outsiders", async () => {
    const { registry, publisher, outsider, toolId } = await registeredFixture();
    await registry.write.approveVersion([toolId, "1.0.0", 1n]);
    await viem.assertions.revertWithCustomError(
      registry.write.revokeTool([toolId], { account: outsider.account }),
      registry,
      "NotRevoker",
    );
    await viem.assertions.emitWithArgs(
      registry.write.revokeTool([toolId], { account: publisher.account }),
      registry,
      "ToolRevoked",
      [toolId, getAddress(publisher.account.address), 3n],
    );
    const revoked = await registry.read.getTool([toolId]);
    assert.equal(revoked.revoked, true);
    assert.equal(revoked.approved, false);
    await registry.write.restoreVersion([toolId, "1.0.0", 3n]);
    await registry.write.revokeTool([toolId]);
    assert.equal((await registry.read.getTool([toolId])).revision, 5n);
  });
  it("rejects missing tools for all lifecycle operations", async () => {
    const { registry, toolId } = await fixture();
    for (const operation of [
      () => registry.read.getTool([toolId]),
      () => registry.write.approveVersion([toolId, "1.0.0", 1n]),
      () => registry.write.restoreVersion([toolId, "1.0.0", 1n]),
      () => registry.write.revokeTool([toolId]),
    ])
      await viem.assertions.revertWithCustomError(
        operation(),
        registry,
        "ToolNotFound",
      );
  });
  it("rejects malformed registration metadata and zero publisher identity", async () => {
    const { registry } = await fixture();
    for (const args of [
      ["", "1.0.0", manifestHash, permissionHash],
      [toolName, "", manifestHash, permissionHash],
      [toolName, "1.0.0", zeroHash, permissionHash],
      [toolName, "1.0.0", manifestHash, zeroHash],
    ] as const)
      await viem.assertions.revertWithCustomError(
        registry.write.registerTool(args),
        registry,
        "InvalidToolMetadata",
      );
    await viem.assertions.revertWithCustomError(
      registry.read.computeToolId([zeroAddress, toolName]),
      registry,
      "InvalidToolMetadata",
    );
  });
  it("rejects deployment without an administrator", async () => {
    await assert.rejects(viem.deployContract("ToolRegistry", [zeroAddress]));
  });
});
