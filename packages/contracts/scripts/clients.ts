import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Public Hardhat development account. Never fund it on a public chain.
const LOCAL_DEVELOPMENT_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const deploymentsDirectory = new URL("../deployments/", import.meta.url);

export type Deployment = { address: Address; chainId: number; abi: Abi };

export async function createClients() {
  const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
  const transport = http(rpcUrl, { timeout: 10_000 });
  const probe = createPublicClient({ transport });
  const chainId = await probe.getChainId();
  const key = process.env.DEPLOYER_PRIVATE_KEY ?? LOCAL_DEVELOPMENT_KEY;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key))
    throw new Error("DEPLOYER_PRIVATE_KEY must be a 32-byte hex private key.");
  const account = privateKeyToAccount(key as Hex);
  if (
    account.address.toLowerCase() ===
      "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" &&
    chainId !== 31337
  ) {
    throw new Error(
      "The public Hardhat development key is only allowed on chain 31337. Set DEPLOYER_PRIVATE_KEY.",
    );
  }
  if (
    !process.env.DEPLOYER_PRIVATE_KEY &&
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(rpcUrl).hostname)
  ) {
    throw new Error(
      "The default development signer requires a loopback RPC URL.",
    );
  }
  const chain = defineChain({
    id: chainId,
    name: chainId === 31337 ? "Hardhat Local" : `EVM ${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  return {
    chainId,
    account,
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ chain, account, transport }),
  };
}

export function deploymentPath(chainId: number) {
  return new URL(
    chainId === 31337 ? "localhost.json" : `${chainId}.json`,
    deploymentsDirectory,
  );
}

export async function readDeployment(chainId: number): Promise<Deployment> {
  const path = deploymentPath(chainId);
  const deployment = JSON.parse(await readFile(path, "utf8")) as Deployment;
  if (deployment.chainId !== chainId)
    throw new Error("Deployment chainId does not match RPC.");
  return deployment;
}

export async function saveDeployment(deployment: Deployment) {
  await mkdir(deploymentsDirectory, { recursive: true });
  const path = deploymentPath(deployment.chainId);
  await writeFile(path, `${JSON.stringify(deployment, null, 2)}\n`, "utf8");
  return fileURLToPath(path);
}
