import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import hre from "hardhat";
import { getAddress, keccak256, toHex } from "viem";
import { hashToolId } from "@mcpsentinel/shared";

const connection = await hre.network.create("hardhatMainnet");
const { viem } = connection;
after(() => connection.close());
const toolName = "exchange_rate";
const manifestHash = keccak256(toHex("reviewed-manifest"));
const permissionHash = keccak256(toHex("reviewed-permissions"));
async function fixture() {
  const [admin, publisher, outsider] = await viem.getWalletClients();
  const registry = await viem.deployContract("ToolRegistry", [
    admin.account.address,
  ]);
  const toolId = hashToolId(publisher.account.address, toolName);
  return { registry, admin, publisher, outsider, toolId };
}
async function registered() {
  const state = await fixture();
  await state.registry.write.registerTool(
    [toolName, "1.0.0", manifestHash, permissionHash],
    { account: state.publisher.account },
  );
  return state;
}

describe("R1: publisher-scoped identities", () => {
  it("Solidity and shared hashing agree for exact UTF-8 names and address casing", async () => {
    const { registry, publisher } = await fixture();
    for (const name of [
      toolName,
      "Exchange_Rate",
      "환율_조회",
      "tool:🚀",
      "é",
      "e\u0301",
    ]) {
      const id = hashToolId(publisher.account.address, name);
      assert.equal(
        await registry.read.computeToolId([publisher.account.address, name]),
        id,
      );
      assert.equal(hashToolId(getAddress(publisher.account.address), name), id);
    }
    assert.notEqual(
      hashToolId(publisher.account.address, "é"),
      hashToolId(publisher.account.address, "e\u0301"),
    );
  });
  it("a third party's first registration cannot reserve a publisher's same-name tool", async () => {
    const { registry, publisher, outsider, toolId } = await fixture();
    await registry.write.registerTool(
      [toolName, "1.0.0", manifestHash, permissionHash],
      { account: outsider.account },
    );
    const outsiderId = hashToolId(outsider.account.address, toolName);
    assert.notEqual(outsiderId, toolId);
    await viem.assertions.revertWithCustomError(
      registry.read.getTool([toolId]),
      registry,
      "ToolNotFound",
    );
    await registry.write.revokeTool([outsiderId]);
    await registry.write.registerTool(
      [toolName, "1.0.0", manifestHash, permissionHash],
      { account: publisher.account },
    );
    assert.equal(
      (await registry.read.getTool([toolId])).publisher,
      getAddress(publisher.account.address),
    );
    assert.equal((await registry.read.getTool([toolId])).revoked, false);
    assert.equal((await registry.read.getTool([outsiderId])).revoked, true);
    assert.equal(
      (await registry.read.getTool([outsiderId])).publisher,
      getAddress(outsider.account.address),
    );
  });
  it("raw victim IDs and same names always register in the caller's own namespace", async () => {
    const { registry, publisher, outsider, admin, toolId } = await registered();
    const before = await registry.read.getTool([toolId]);
    for (const caller of [outsider, admin]) {
      for (const name of [toolName, toolId]) {
        await registry.write.registerTool(
          [name, "2.0.0", manifestHash, permissionHash],
          { account: caller.account },
        );
        const ownId = hashToolId(caller.account.address, name);
        assert.notEqual(ownId, toolId);
        assert.equal(
          (await registry.read.getTool([ownId])).publisher,
          getAddress(caller.account.address),
        );
      }
    }
    assert.deepEqual(await registry.read.getTool([toolId]), before);
    await registry.write.registerTool(
      [toolName, "2.0.0", manifestHash, permissionHash],
      { account: publisher.account },
    );
    assert.equal((await registry.read.getTool([toolId])).version, "2.0.0");
  });
});

describe("R2: revision-bound approval and explicit restoration", () => {
  it("rejects approval prepared before revocation and requires a separate verifier restoration", async () => {
    const { registry, admin, publisher, outsider, toolId } = await registered();
    const preparedApproval = [toolId, "1.0.0", 1n] as const;
    await registry.write.revokeTool([toolId], { account: publisher.account });
    await viem.assertions.revertWithCustomError(
      registry.write.approveVersion(preparedApproval),
      registry,
      "RevisionMismatch",
    );
    await viem.assertions.revertWithCustomError(
      registry.write.approveVersion([toolId, "1.0.0", 2n]),
      registry,
      "ToolIsRevoked",
    );
    for (const caller of [publisher, outsider]) {
      await viem.assertions.revertWithCustomError(
        registry.write.restoreVersion([toolId, "1.0.0", 2n], {
          account: caller.account,
        }),
        registry,
        "AccessControlUnauthorizedAccount",
      );
    }
    assert.equal((await registry.read.getTool([toolId])).revoked, true);
    await viem.assertions.emitWithArgs(
      registry.write.restoreVersion([toolId, "1.0.0", 2n]),
      registry,
      "VersionRestored",
      [toolId, "1.0.0", getAddress(admin.account.address), 3n],
    );
    assert.equal((await registry.read.getTool([toolId])).approved, true);
    assert.equal((await registry.read.getTool([toolId])).revoked, false);
    await viem.assertions.revertWithCustomError(
      registry.write.approveVersion(preparedApproval),
      registry,
      "RevisionMismatch",
    );
  });
  it("invalidates prepared restoration on every revocation, including repeated revocation", async () => {
    const { registry, publisher, toolId } = await registered();
    await registry.write.revokeTool([toolId]);
    const preparedRestore = [toolId, "1.0.0", 2n] as const;
    await registry.write.revokeTool([toolId], { account: publisher.account });
    assert.equal((await registry.read.getTool([toolId])).revision, 3n);
    await viem.assertions.revertWithCustomError(
      registry.write.restoreVersion(preparedRestore),
      registry,
      "RevisionMismatch",
    );
    await registry.write.restoreVersion([toolId, "1.0.0", 3n]);
    await registry.write.revokeTool([toolId]);
    await viem.assertions.revertWithCustomError(
      registry.write.restoreVersion([toolId, "1.0.0", 3n]),
      registry,
      "RevisionMismatch",
    );
    assert.equal((await registry.read.getTool([toolId])).revoked, true);
    assert.equal((await registry.read.getTool([toolId])).revision, 5n);
    await registry.write.restoreVersion([toolId, "1.0.0", 5n]);
    assert.equal((await registry.read.getTool([toolId])).revision, 6n);
  });
  it("publishing while revoked preserves revocation and invalidates an older restoration", async () => {
    const { registry, publisher, toolId } = await registered();
    await registry.write.revokeTool([toolId]);
    await registry.write.registerTool(
      [toolName, "2.0.0", keccak256(toHex("next-manifest")), permissionHash],
      { account: publisher.account },
    );
    const updated = await registry.read.getTool([toolId]);
    assert.equal(updated.revoked, true);
    assert.equal(updated.approved, false);
    assert.equal(updated.revision, 3n);
    await viem.assertions.revertWithCustomError(
      registry.write.restoreVersion([toolId, "1.0.0", 2n]),
      registry,
      "RevisionMismatch",
    );
    await viem.assertions.revertWithCustomError(
      registry.write.restoreVersion([toolId, "1.0.0", 3n]),
      registry,
      "VersionMismatch",
    );
    await viem.assertions.revertWithCustomError(
      registry.write.approveVersion([toolId, "2.0.0", 3n]),
      registry,
      "ToolIsRevoked",
    );
    await registry.write.restoreVersion([toolId, "2.0.0", 3n]);
    assert.equal((await registry.read.getTool([toolId])).approved, true);
  });
  it("approval consumes its revision, rejects zero/stale revisions and cannot use restoration on active tools", async () => {
    const { registry, toolId } = await registered();
    await viem.assertions.revertWithCustomError(
      registry.write.approveVersion([toolId, "1.0.0", 0n]),
      registry,
      "RevisionMismatch",
    );
    await viem.assertions.revertWithCustomError(
      registry.write.restoreVersion([toolId, "1.0.0", 1n]),
      registry,
      "ToolIsNotRevoked",
    );
    await registry.write.approveVersion([toolId, "1.0.0", 1n]);
    await viem.assertions.revertWithCustomError(
      registry.write.approveVersion([toolId, "1.0.0", 1n]),
      registry,
      "RevisionMismatch",
    );
    assert.equal((await registry.read.getTool([toolId])).revision, 2n);
  });
});
