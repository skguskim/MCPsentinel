import { readFile } from "node:fs/promises";
import type { Abi, Hex } from "viem";
import { createClients, saveDeployment } from "./clients.js";
import { assertExpectedChain } from "@mcpsentinel/shared/blockchain";

const { account, chainId, config, publicClient, walletClient } =
  await createClients();
const artifact = JSON.parse(
  await readFile(
    new URL(
      "../artifacts/contracts/ToolRegistry.sol/ToolRegistry.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { abi: Abi; bytecode: Hex };

await assertExpectedChain(publicClient, chainId);
const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args: [account.address],
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success" || !receipt.contractAddress)
  throw new Error("Registry deployment failed.");
const path = await saveDeployment(
  {
    address: receipt.contractAddress,
    chainId,
    abi: artifact.abi,
  },
  config,
);
console.log(
  `ToolRegistry deployed on chain ${chainId}: ${receipt.contractAddress}`,
);
console.log(`Deployment and ABI saved to ${path}`);
