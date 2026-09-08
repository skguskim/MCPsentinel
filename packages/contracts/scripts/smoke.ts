import assert from "node:assert/strict";
import { hashToolId } from "@mcpsentinel/shared";
import { OnchainRegistry } from "../../../apps/api/src/registry.js";
import { createClients, readDeployment } from "./clients.js";
import { assertExpectedChain } from "@mcpsentinel/shared/blockchain";

// This check deliberately exercises the gateway's real adapter against a local chain.
const { account, chainId, config, publicClient, walletClient } =
  await createClients();
const { rpcUrl } = config;
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(rpcUrl).hostname)) {
  throw new Error("The smoke test only operates on a loopback RPC.");
}
assert.equal(
  chainId,
  31337,
  "The smoke test only operates on local chain 31337.",
);
const deployment = readDeployment(config);
const registry = new OnchainRegistry(deployment.address, rpcUrl, chainId);
const identity = (toolId: string) => ({ publisher: account.address, toolId });

async function send(functionName: string, args: unknown[]) {
  await assertExpectedChain(publicClient, chainId);
  const { request } = await publicClient.simulateContract({
    ...deployment,
    functionName,
    args,
    account,
  });
  await assertExpectedChain(publicClient, chainId);
  const hash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success", `${functionName} failed.`);
}

for (const toolId of ["exchange_rate", "update_report"]) {
  const record = await registry.get(identity(toolId));
  assert.equal(record?.exists, true);
  assert.equal(
    record?.approved,
    true,
    `${toolId} must be approved. Run seed first.`,
  );
  assert.equal(record?.revoked, false);
  console.log(`OnchainRegistry: ${toolId} is registered and approved.`);
}

const toolId = hashToolId(account.address, "exchange_rate");
const original = await registry.get(identity("exchange_rate"));
assert.ok(original);
let needsRestoration = false;
try {
  await send("revokeTool", [toolId]);
  needsRestoration = true;
  const revoked = await registry.get(identity("exchange_rate"));
  assert.equal(revoked?.approved, false);
  assert.equal(revoked?.revoked, true);
  assert.equal(revoked.revision, String(BigInt(original.revision) + 1n));
  console.log(
    "OnchainRegistry: revocation is visible immediately and approval is invalidated.",
  );
} finally {
  if (needsRestoration)
    await send("restoreVersion", [
      toolId,
      original.version,
      BigInt(original.revision) + 1n,
    ]);
}
const restored = await registry.get(identity("exchange_rate"));
assert.equal(restored?.approved, true);
assert.equal(restored?.revoked, false);
console.log(
  "OnchainRegistry: explicit revision-bound restoration restored the tool. Both demo tools remain active.",
);
