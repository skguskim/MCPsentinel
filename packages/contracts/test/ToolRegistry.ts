import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import hre from "hardhat";
import { getAddress, keccak256, toHex, zeroAddress, zeroHash } from "viem";

const connection = await hre.network.create("hardhatMainnet");
const { viem } = connection;
after(async () => {
  await connection.close();
});

const toolId = keccak256(toHex("exchange_rate"));
const manifestHash = keccak256(toHex("manifest-v1"));
const permissionHash = keccak256(toHex("permissions-v1"));

async function fixture() {
  const [admin, publisher, outsider] = await viem.getWalletClients();
  const registry = await viem.deployContract("ToolRegistry", [
    admin.account.address,
  ]);
  return { registry, admin, publisher, outsider };
}

async function registeredFixture() {
  const state = await fixture();
  await state.registry.write.registerTool(
    [toolId, "1.0.0", manifestHash, permissionHash],
    {
      account: state.publisher.account,
    },
  );
  return state;
}

describe("ToolRegistry", () => {
  it("records publisher and hashes without trusting a publisher's registration", async () => {
    const { registry, publisher } = await fixture();
    await viem.assertions.emitWithArgs(
      registry.write.registerTool(
        [toolId, "1.0.0", manifestHash, permissionHash],
        { account: publisher.account },
      ),
      registry,
      "ToolRegistered",
      [
        toolId,
        getAddress(publisher.account.address),
        "1.0.0",
        manifestHash,
        permissionHash,
      ],
    );
    const tool = await registry.read.getTool([toolId]);
    assert.equal(tool.publisher, getAddress(publisher.account.address));
    assert.equal(tool.version, "1.0.0");
    assert.equal(tool.manifestHash, manifestHash);
    assert.equal(tool.permissionHash, permissionHash);
    assert.equal(tool.approved, false);
    assert.equal(tool.revoked, false);
    assert.equal(tool.exists, true);
  });

  it("prevents ID takeover even by a verifier", async () => {
    const { registry, outsider, admin, publisher } = await registeredFixture();
    for (const caller of [outsider, admin]) {
      await viem.assertions.revertWithCustomError(
        registry.write.registerTool(
          [toolId, "2.0.0", manifestHash, permissionHash],
          { account: caller.account },
        ),
        registry,
        "NotPublisher",
      );
    }
    assert.equal(
      (await registry.read.getTool([toolId])).publisher,
      getAddress(publisher.account.address),
    );
  });

  it("requires verifier role for approval and role administration", async () => {
    const { registry, admin, publisher, outsider } = await registeredFixture();
    for (const caller of [publisher, outsider]) {
      await viem.assertions.revertWithCustomError(
        registry.write.approveVersion([toolId, "1.0.0"], {
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
      registry.write.approveVersion([toolId, "1.0.0"]),
      registry,
      "VersionApproved",
      [toolId, "1.0.0", getAddress(admin.account.address)],
    );
    assert.equal((await registry.read.getTool([toolId])).approved, true);
  });

  it("allows an administrator to delegate and remove verifier authority", async () => {
    const { registry, outsider } = await registeredFixture();
    const role = await registry.read.VERIFIER_ROLE();
    await registry.write.grantRole([role, outsider.account.address]);
    await registry.write.approveVersion([toolId, "1.0.0"], {
      account: outsider.account,
    });
    assert.equal((await registry.read.getTool([toolId])).approved, true);
    await registry.write.revokeRole([role, outsider.account.address]);
    await viem.assertions.revertWithCustomError(
      registry.write.approveVersion([toolId, "1.0.0"], {
        account: outsider.account,
      }),
      registry,
      "AccessControlUnauthorizedAccount",
    );
  });

  it("invalidates approval on update and rejects approval of a stale version", async () => {
    const { registry, publisher } = await registeredFixture();
    await registry.write.approveVersion([toolId, "1.0.0"]);
    const nextHash = keccak256(toHex("manifest-v2"));
    await registry.write.registerTool(
      [toolId, "2.0.0", nextHash, permissionHash],
      { account: publisher.account },
    );
    const tool = await registry.read.getTool([toolId]);
    assert.equal(tool.approved, false);
    assert.equal(tool.manifestHash, nextHash);
    await viem.assertions.revertWithCustomError(
      registry.write.approveVersion([toolId, "1.0.0"]),
      registry,
      "VersionMismatch",
    );
    await registry.write.approveVersion([toolId, "2.0.0"]);
    assert.equal((await registry.read.getTool([toolId])).approved, true);
  });

  it("forbids rewriting or reusing a version to defeat pending verifier approvals", async () => {
    const { registry, publisher } = await registeredFixture();
    const nextHash = keccak256(toHex("changed"));
    await viem.assertions.revertWithCustomError(
      registry.write.registerTool([toolId, "1.0.0", nextHash, permissionHash], {
        account: publisher.account,
      }),
      registry,
      "VersionAlreadyUsed",
    );
    await registry.write.registerTool(
      [toolId, "2.0.0", nextHash, permissionHash],
      { account: publisher.account },
    );
    await viem.assertions.revertWithCustomError(
      registry.write.registerTool(
        [toolId, "1.0.0", manifestHash, permissionHash],
        { account: publisher.account },
      ),
      registry,
      "VersionAlreadyUsed",
    );
  });

  it("allows publisher or verifier revocation, denies outsiders", async () => {
    const { registry, publisher, outsider } = await registeredFixture();
    await registry.write.approveVersion([toolId, "1.0.0"]);
    await viem.assertions.revertWithCustomError(
      registry.write.revokeTool([toolId], { account: outsider.account }),
      registry,
      "NotRevoker",
    );
    await viem.assertions.emitWithArgs(
      registry.write.revokeTool([toolId], { account: publisher.account }),
      registry,
      "ToolRevoked",
      [toolId, getAddress(publisher.account.address)],
    );
    assert.equal((await registry.read.getTool([toolId])).revoked, true);
    assert.equal((await registry.read.getTool([toolId])).approved, false);
    await registry.write.approveVersion([toolId, "1.0.0"]);
    await registry.write.revokeTool([toolId]);
    assert.equal((await registry.read.getTool([toolId])).revoked, true);
  });

  it("keeps revocation across publisher updates until an explicit verifier approval", async () => {
    const { registry, publisher } = await registeredFixture();
    await registry.write.revokeTool([toolId]);
    await registry.write.registerTool(
      [toolId, "2.0.0", manifestHash, permissionHash],
      { account: publisher.account },
    );
    const revoked = await registry.read.getTool([toolId]);
    assert.equal(revoked.revoked, true);
    assert.equal(revoked.approved, false);
    await registry.write.approveVersion([toolId, "2.0.0"]);
    const restored = await registry.read.getTool([toolId]);
    assert.equal(restored.revoked, false);
    assert.equal(restored.approved, true);
  });

  it("rejects missing tools and malformed registration metadata", async () => {
    const { registry } = await fixture();
    for (const operation of [
      () => registry.read.getTool([toolId]),
      () => registry.write.approveVersion([toolId, "1.0.0"]),
      () => registry.write.revokeTool([toolId]),
    ]) {
      await viem.assertions.revertWithCustomError(
        operation(),
        registry,
        "ToolNotFound",
      );
    }
    for (const args of [
      [zeroHash, "1.0.0", manifestHash, permissionHash],
      [toolId, "", manifestHash, permissionHash],
      [toolId, "1.0.0", zeroHash, permissionHash],
      [toolId, "1.0.0", manifestHash, zeroHash],
    ] as const) {
      await viem.assertions.revertWithCustomError(
        registry.write.registerTool(args),
        registry,
        "InvalidToolMetadata",
      );
    }
  });

  it("rejects deployment without an administrator", async () => {
    await assert.rejects(viem.deployContract("ToolRegistry", [zeroAddress]));
  });
});
