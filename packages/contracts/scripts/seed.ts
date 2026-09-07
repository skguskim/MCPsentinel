import {
  hashManifest,
  hashPermissions,
  hashToolId,
  ToolManifestSchema,
} from "@mcpsentinel/shared";
import {
  BaseError,
  ContractFunctionRevertedError,
  getAddress,
  type Hex,
} from "viem";
import { createClients, readDeployment } from "./clients.js";

const { account, chainId, publicClient, walletClient } = await createClients();
const deployment = await readDeployment(chainId);
if (!(await publicClient.getCode({ address: deployment.address }))) {
  throw new Error(
    "Registry contract not found. Redeploy after restarting the local chain.",
  );
}
const manifestUrl =
  process.env.MANIFEST_URL ?? "http://127.0.0.1:4100/manifest";
const response = await fetch(manifestUrl, {
  signal: AbortSignal.timeout(10_000),
});
if (!response.ok)
  throw new Error(`Manifest fetch failed: HTTP ${response.status}`);
const body = (await response.json()) as { tools?: unknown };
const manifests = ToolManifestSchema.array().min(1).max(100).parse(body.tools);
if (
  new Set(manifests.map((manifest) => manifest.toolId)).size !==
  manifests.length
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

type RegisteredTool = {
  publisher: string;
  version: string;
  manifestHash: Hex;
  permissionHash: Hex;
  approved: boolean;
  revoked: boolean;
  exists: boolean;
};

async function send(functionName: string, args: unknown[]) {
  const { request } = await publicClient.simulateContract({
    ...deployment,
    functionName,
    args,
    account,
  });
  const hash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success")
    throw new Error(`${functionName} transaction reverted.`);
}

// Seeding is an explicit local demo trust action. Review manifests before seeding other chains.
for (const manifest of manifests) {
  const id = hashToolId(manifest.toolId);
  const manifestHash = hashManifest(manifest);
  const permissionHash = hashPermissions(manifest.permissions);
  let registered: RegisteredTool | undefined;
  try {
    registered = (await publicClient.readContract({
      ...deployment,
      functionName: "getTool",
      args: [id],
    })) as RegisteredTool;
  } catch (error) {
    const cause =
      error instanceof BaseError
        ? error.walk((item) => item instanceof ContractFunctionRevertedError)
        : undefined;
    if (
      !(cause instanceof ContractFunctionRevertedError) ||
      cause.data?.errorName !== "ToolNotFound"
    )
      throw error;
  }
  if (registered) {
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
        `${manifest.toolId} is revoked. Explicit verifier reapproval is required; seed will not restore it.`,
      );
  } else {
    await send("registerTool", [
      id,
      manifest.version,
      manifestHash,
      permissionHash,
    ]);
  }
  if (!registered?.approved)
    await send("approveVersion", [id, manifest.version]);
  console.log(`Registered and approved ${manifest.toolId}@${manifest.version}`);
}
