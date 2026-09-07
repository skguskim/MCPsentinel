import assert from "node:assert/strict";
import { hashToolId } from "@mcpsentinel/shared";
import { OnchainRegistry } from "../../../apps/api/src/registry.js";
import { createClients, readDeployment } from "./clients.js";

// This check deliberately exercises the gateway's real adapter against a local chain.
const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(rpcUrl).hostname)) {
  throw new Error("The smoke test only operates on a loopback RPC.");
}
const { account, chainId, publicClient, walletClient } = await createClients();
assert.equal(
  chainId,
  31337,
  "The smoke test only operates on local chain 31337.",
);
const deployment = await readDeployment(chainId);
const registry = new OnchainRegistry(deployment.address, rpcUrl, chainId);

async function send(functionName: string, args: unknown[]) {
  const { request } = await publicClient.simulateContract({
    ...deployment,
    functionName,
    args,
    account,
  });
  const hash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success", `${functionName} failed.`);
}

for (const toolId of ["exchange_rate", "update_report"]) {
  const record = await registry.get(toolId);
  assert.equal(record?.exists, true);
  assert.equal(
    record?.approved,
    true,
    `${toolId} must be approved. Run seed first.`,
  );
  assert.equal(record?.revoked, false);
  console.log(`OnchainRegistry: ${toolId} is registered and approved.`);
}

const toolId = hashToolId("exchange_rate");
const original = await registry.get("exchange_rate");
assert.ok(original);
let needsRestoration = false;
try {
  await send("revokeTool", [toolId]);
  needsRestoration = true;
  const revoked = await registry.get("exchange_rate");
  assert.equal(revoked?.approved, false);
  assert.equal(revoked?.revoked, true);
  console.log(
    "OnchainRegistry: revocation is visible immediately and approval is invalidated.",
  );
} finally {
  if (needsRestoration)
    await send("approveVersion", [toolId, original.version]);
}
const restored = await registry.get("exchange_rate");
assert.equal(restored?.approved, true);
assert.equal(restored?.revoked, false);
console.log(
  "OnchainRegistry: explicit verifier approval restored the tool. Both demo tools remain active.",
);
