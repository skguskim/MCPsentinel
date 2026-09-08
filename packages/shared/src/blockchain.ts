import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { z } from "zod";
import {
  getAddress,
  isAddress,
  parseAbi,
  zeroAddress,
  type Abi,
  type Address,
  type PublicClient,
} from "viem";

export const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const isLoopback = (url: string) =>
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname);

// Node's loader preserves values already supplied by the shell. Call only at
// process entry; readBlockchainConfig remains pure for callers and tests.
export function loadProjectEnv(path = resolve(projectRoot, ".env")) {
  if (existsSync(path)) process.loadEnvFile(path);
}

const ChainIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const AddressSchema = z
  .string()
  .refine(
    (value) => isAddress(value) && value.toLowerCase() !== zeroAddress,
    "Expected a non-zero EVM address.",
  )
  .transform((value) => getAddress(value));

export interface BlockchainConfig {
  rpcUrl: string;
  chainId: number;
  deploymentPath: string;
  deploymentFileExplicit: boolean;
  registryAddress?: Address;
}

export function defaultDeploymentPath(chainId: number) {
  ChainIdSchema.parse(chainId);
  return resolve(
    projectRoot,
    "packages/contracts/deployments",
    chainId === 31337 ? "localhost.json" : `${chainId}.json`,
  );
}

export function readBlockchainConfig(
  env: NodeJS.ProcessEnv = process.env,
): BlockchainConfig {
  const rpcUrl = env.RPC_URL ?? "http://127.0.0.1:8545";
  if (!URL.canParse(rpcUrl)) throw new Error("RPC_URL must be an HTTP(S) URL.");
  const url = new URL(rpcUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "RPC_URL must be HTTP(S), without user credentials or fragments.",
    );
  }
  if (env.CHAIN_ID === undefined && !isLoopback(rpcUrl)) {
    throw new Error("CHAIN_ID is required for a non-local RPC_URL.");
  }
  const rawChainId = env.CHAIN_ID ?? "31337";
  if (
    !/^[1-9]\d*$/.test(rawChainId) ||
    !ChainIdSchema.safeParse(Number(rawChainId)).success
  ) {
    throw new Error("CHAIN_ID must be a positive safe integer.");
  }
  const chainId = Number(rawChainId);
  if (
    env.REGISTRY_DEPLOYMENT !== undefined &&
    !env.REGISTRY_DEPLOYMENT.trim()
  ) {
    throw new Error("REGISTRY_DEPLOYMENT must not be empty.");
  }
  const address =
    env.REGISTRY_ADDRESS === undefined
      ? undefined
      : AddressSchema.safeParse(env.REGISTRY_ADDRESS);
  if (address && !address.success)
    throw new Error("REGISTRY_ADDRESS must be a non-zero EVM address.");
  return {
    rpcUrl,
    chainId,
    deploymentPath:
      env.REGISTRY_DEPLOYMENT === undefined
        ? defaultDeploymentPath(chainId)
        : resolve(projectRoot, env.REGISTRY_DEPLOYMENT),
    deploymentFileExplicit: env.REGISTRY_DEPLOYMENT !== undefined,
    registryAddress: address?.success ? address.data : undefined,
  };
}

type Parameter = {
  type: string;
  components?: Parameter[];
  [key: string]: unknown;
};
const ParameterSchema: z.ZodType<Parameter> = z.lazy(() =>
  z
    .object({
      type: z.string().min(1),
      name: z.string().optional(),
      components: z.array(ParameterSchema).optional(),
      indexed: z.boolean().optional(),
    })
    .passthrough()
    .refine(
      (p) => !p.type.startsWith("tuple") || p.components !== undefined,
      "Tuple ABI parameters require components.",
    ),
);
const parameters = z.array(ParameterSchema);
const mutability = z.enum(["pure", "view", "nonpayable", "payable"]);
const AbiEntrySchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("function"),
      name: z.string().min(1),
      inputs: parameters,
      outputs: parameters,
      stateMutability: mutability,
    })
    .passthrough(),
  z
    .object({
      type: z.literal("constructor"),
      inputs: parameters,
      stateMutability: z.enum(["nonpayable", "payable"]),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("event"),
      name: z.string().min(1),
      inputs: parameters,
      anonymous: z.boolean(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("error"),
      name: z.string().min(1),
      inputs: parameters,
    })
    .passthrough(),
  z
    .object({
      type: z.literal("fallback"),
      stateMutability: z.enum(["nonpayable", "payable"]),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("receive"),
      stateMutability: z.literal("payable"),
    })
    .passthrough(),
]);
export const TOOL_REGISTRY_VERSION = 2n;
export const toolRegistryAbi = parseAbi([
  "struct Tool { address publisher; string version; bytes32 manifestHash; bytes32 permissionHash; bool approved; bool revoked; bool exists; uint256 revision; }",
  "function REGISTRY_VERSION() view returns (uint256)",
  "function computeToolId(address publisher, string toolName) pure returns (bytes32)",
  "function getTool(bytes32 toolId) view returns (Tool)",
  "function registerTool(string toolName, string version, bytes32 manifestHash, bytes32 permissionHash) returns (bytes32 toolId)",
  "function approveVersion(bytes32 toolId, string version, uint256 expectedRevision)",
  "function restoreVersion(bytes32 toolId, string version, uint256 expectedRevision)",
  "function revokeTool(bytes32 toolId)",
  "error ToolNotFound(bytes32 toolId)",
]);

function parameterShape(parameter: Parameter): unknown {
  return {
    type: parameter.type,
    // Struct field names matter: viem decodes the Tool tuple into an object.
    components: parameter.components?.map((component) => ({
      name: component.name,
      shape: parameterShape(component),
    })),
  };
}
function abiSignature(entry: z.infer<typeof AbiEntrySchema>) {
  if (entry.type !== "function" && entry.type !== "error") return undefined;
  return JSON.stringify({
    type: entry.type,
    name: entry.name,
    inputs: entry.inputs.map(parameterShape),
    ...(entry.type === "function"
      ? {
          outputs: entry.outputs.map(parameterShape),
          stateMutability: entry.stateMutability,
        }
      : {}),
  });
}
const requiredSignatures = toolRegistryAbi.map((entry) =>
  abiSignature(AbiEntrySchema.parse(entry)),
);
export const RegistryDeploymentSchema = z.object({
  address: AddressSchema,
  chainId: ChainIdSchema,
  abi: z
    .array(AbiEntrySchema)
    .min(1)
    .refine((entries) => {
      const signatures = new Set(entries.map(abiSignature));
      return requiredSignatures.every((signature) => signatures.has(signature));
    }, "ABI must match the ToolRegistry functions, return tuple and ToolNotFound error."),
});
export type RegistryDeployment = {
  address: Address;
  chainId: number;
  abi: Abi;
};

export function readRegistryDeployment(
  path: string,
  expectedChainId: number,
  expectedAddress?: Address,
): RegistryDeployment {
  ChainIdSchema.parse(expectedChainId);
  let input: unknown;
  try {
    input = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error(
        `Registry deployment file not found: ${path}. Deploy first or set REGISTRY_ADDRESS.`,
      );
    throw new Error(
      `Registry deployment file is unreadable or contains invalid JSON: ${path}`,
    );
  }
  const parsed = RegistryDeploymentSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      `Invalid Registry deployment file (address, chainId or ABI): ${path}. Registry v2 requires redeployment; regenerate the deployment file.`,
    );
  if (parsed.data.chainId !== expectedChainId) {
    throw new Error(
      `Deployment chain ID mismatch: expected ${expectedChainId}, file has ${parsed.data.chainId}.`,
    );
  }
  if (
    expectedAddress &&
    parsed.data.address.toLowerCase() !== expectedAddress.toLowerCase()
  ) {
    throw new Error(
      "REGISTRY_ADDRESS does not match the deployment file address.",
    );
  }
  return parsed.data as RegistryDeployment;
}

export function resolveRegistryAddress(config: BlockchainConfig): Address {
  // An explicit address works without a deployment file. If the user also
  // supplied a file, require the two settings to agree instead of ignoring it.
  if (config.registryAddress && !config.deploymentFileExplicit)
    return config.registryAddress;
  return readRegistryDeployment(
    config.deploymentPath,
    config.chainId,
    config.registryAddress,
  ).address;
}

export async function assertExpectedChain(
  client: Pick<PublicClient, "getChainId">,
  expectedChainId: number,
) {
  ChainIdSchema.parse(expectedChainId);
  const actual = await client.getChainId();
  if (actual !== expectedChainId)
    throw new Error(
      `RPC chain ID mismatch: expected ${expectedChainId}, received ${actual}.`,
    );
}

export async function assertRegistryContract(
  client: Pick<PublicClient, "getChainId" | "getCode" | "readContract">,
  address: Address,
  chainId: number,
) {
  await assertExpectedChain(client, chainId);
  const code = await client.getCode({ address });
  if (!code || code === "0x")
    throw new Error(
      "Registry contract code not found at the configured address. Check deployment and chain settings.",
    );
  let version: bigint;
  try {
    version = await client.readContract({
      address,
      abi: toolRegistryAbi,
      functionName: "REGISTRY_VERSION",
    });
  } catch (cause) {
    throw new Error(
      "Cannot verify ToolRegistry v2 compatibility. Check RPC connectivity and redeploy older registries.",
      { cause },
    );
  }
  if (version !== TOOL_REGISTRY_VERSION)
    throw new Error(
      "Unsupported ToolRegistry version. Deploy Registry v2 and update the configured address.",
    );
}
