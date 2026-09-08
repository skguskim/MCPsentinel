import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  assertExpectedChain,
  loadProjectEnv,
  readBlockchainConfig,
  readRegistryDeployment,
  RegistryDeploymentSchema,
  isLoopback,
  type BlockchainConfig,
  type RegistryDeployment,
} from "@mcpsentinel/shared/blockchain";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Public Hardhat development account. Never fund it on a public chain.
const LOCAL_DEVELOPMENT_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export async function createClients(environment?: NodeJS.ProcessEnv) {
  if (environment === undefined) loadProjectEnv();
  const env = environment ?? process.env;
  const config = readBlockchainConfig(env);
  const { rpcUrl, chainId } = config;
  const transport = http(rpcUrl, { timeout: 10_000, retryCount: 0 });
  const probe = createPublicClient({ transport });
  // Check the intended network before constructing a signer or sending a tx.
  await assertExpectedChain(probe, chainId);
  const key = env.DEPLOYER_PRIVATE_KEY ?? LOCAL_DEVELOPMENT_KEY;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key))
    throw new Error("DEPLOYER_PRIVATE_KEY must be a 32-byte hex private key.");
  const account = privateKeyToAccount(key as Hex);
  if (
    account.address.toLowerCase() ===
      "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" &&
    (chainId !== 31337 || !isLoopback(rpcUrl))
  ) {
    throw new Error(
      "The public Hardhat development key requires a loopback RPC on chain 31337. Set DEPLOYER_PRIVATE_KEY for a testnet.",
    );
  }
  const chain = defineChain({
    id: chainId,
    name: chainId === 31337 ? "Hardhat Local" : `EVM ${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  return {
    config,
    chainId,
    account,
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ chain, account, transport }),
  };
}

export function readDeployment(config: BlockchainConfig): RegistryDeployment {
  return readRegistryDeployment(
    config.deploymentPath,
    config.chainId,
    config.registryAddress,
  );
}

export async function saveDeployment(
  deployment: RegistryDeployment,
  config: BlockchainConfig,
) {
  RegistryDeploymentSchema.parse(deployment);
  if (deployment.chainId !== config.chainId)
    throw new Error("Deployment chain ID does not match configuration.");
  await mkdir(dirname(config.deploymentPath), { recursive: true });
  await writeFile(
    config.deploymentPath,
    `${JSON.stringify(deployment, null, 2)}\n`,
    "utf8",
  );
  return config.deploymentPath;
}
