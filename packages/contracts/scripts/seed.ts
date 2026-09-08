import {
  hashManifest,
  hashPermissions,
  hashToolId,
  ToolManifestSchema,
  RegistryRecordSchema,
} from "@mcpsentinel/shared";
import { BaseError, ContractFunctionRevertedError, getAddress } from "viem";
import { createClients, readDeployment } from "./clients.js";
import {
  assertExpectedChain,
  assertRegistryContract,
} from "@mcpsentinel/shared/blockchain";

const { account, chainId, config, publicClient, walletClient } =
  await createClients();
const deployment = readDeployment(config);
await assertRegistryContract(publicClient, deployment.address, chainId);
const manifestUrl =
  process.env.MANIFEST_URL ??
  `${(process.env.TOOL_SERVER_URL ?? `http://127.0.0.1:${process.env.TOOLS_PORT || 4100}`).replace(/\/$/, "")}/manifest`;
const response = await fetch(manifestUrl, {
  signal: AbortSignal.timeout(10_000),
});
if (!response.ok)
  throw new Error(`Manifest fetch failed: HTTP ${response.status}`);
const body = (await response.json()) as { tools?: unknown };
const manifests = ToolManifestSchema.array().min(1).max(100).parse(body.tools);
if (
  new Set(
    manifests.map((manifest) =>
      hashToolId(manifest.publisher, manifest.toolId),
    ),
  ).size !== manifests.length
) {
  throw new Error("Manifest response contains duplicate tool IDs.");
}
for (const manifest of manifests) {
  if (getAddress(manifest.publisher) !== account.address) {
    throw new Error(
      `Publisher mismatch for ${manifest.toolId}. Set the server publisher and signer consistently.`,
    );
  }
}

async function send(functionName: string, args: unknown[]) {
  await assertRegistryContract(publicClient, deployment.address, chainId);
  const { request } = await publicClient.simulateContract({
    ...deployment,
    functionName,
    args,
    account,
  });
  await assertExpectedChain(publicClient, chainId);
  const hash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success")
    throw new Error(`${functionName} transaction reverted.`);
}

// Seeding is an explicit local demo trust action. Review manifests before seeding other chains.
for (const manifest of manifests) {
  const id = hashToolId(manifest.publisher, manifest.toolId);
  const manifestHash = hashManifest(manifest);
  const permissionHash = hashPermissions(manifest.permissions);
  async function readRegistered() {
    try {
      return RegistryRecordSchema.parse(
        await publicClient.readContract({
          ...deployment,
          functionName: "getTool",
          args: [id],
        }),
      );
    } catch (error) {
      const cause =
        error instanceof BaseError
          ? error.walk((item) => item instanceof ContractFunctionRevertedError)
          : undefined;
      if (
        cause instanceof ContractFunctionRevertedError &&
        cause.data?.errorName === "ToolNotFound" &&
        cause.data.args?.[0] === id
      )
        return undefined;
      throw error;
    }
  }
  let registered = await readRegistered();
  if (!registered) {
    await send("registerTool", [
      manifest.toolId,
      manifest.version,
      manifestHash,
      permissionHash,
    ]);
    registered = await readRegistered();
  }
  if (!registered)
    throw new Error(`${manifest.toolId} was not found after registration.`);
  // Recheck exactly the state being approved after any registration transaction.
  if (
    registered.publisher.toLowerCase() !== account.address.toLowerCase() ||
    registered.version !== manifest.version ||
    registered.manifestHash !== manifestHash ||
    registered.permissionHash !== permissionHash
  ) {
    throw new Error(
      `Existing ${manifest.toolId} differs from the supplied manifest. Publish/review a new version explicitly.`,
    );
  }
  if (registered.revoked)
    throw new Error(
      `${manifest.toolId} is revoked. Use restoreVersion with a reviewed revision; seed will not restore it.`,
    );
  if (!registered.approved)
    await send("approveVersion", [
      id,
      manifest.version,
      BigInt(registered.revision),
    ]);
  console.log(`Registered and approved ${manifest.toolId}@${manifest.version}`);
}
