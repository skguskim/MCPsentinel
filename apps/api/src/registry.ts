import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  http,
  type Address,
} from "viem";
import {
  assertRegistryContract,
  readRegistryDeployment,
  toolRegistryAbi,
} from "@mcpsentinel/shared/blockchain";
import {
  hashManifest,
  hashPermissions,
  hashToolId,
  RegistryRecordSchema,
  type RegistryRecord,
  type ToolManifest,
  type ToolIdentity,
} from "@mcpsentinel/shared";
import type { DemoScenario } from "@mcpsentinel/shared/demo";

export interface Registry {
  mode: "demo" | "onchain";
  get(tool: ToolIdentity): Promise<RegistryRecord | null>;
}
export class DemoRegistry implements Registry {
  readonly mode = "demo";
  scenario: DemoScenario = "normal";
  private records: Map<string, RegistryRecord>;
  constructor(trusted: ToolManifest[]) {
    this.records = new Map(
      trusted.map((m) => [
        hashToolId(m.publisher, m.toolId),
        {
          publisher: m.publisher,
          version: m.version,
          manifestHash: hashManifest(m),
          permissionHash: hashPermissions(m.permissions),
          approved: true,
          revoked: false,
          exists: true,
          revision: "1",
        },
      ]),
    );
  }
  async get(tool: ToolIdentity) {
    if (this.scenario === "registry-unavailable")
      throw new Error("Demo registry outage");
    const record = this.records.get(hashToolId(tool.publisher, tool.toolId));
    return record ? { ...record, revoked: this.scenario === "revoked" } : null;
  }
}
export class OnchainRegistry implements Registry {
  readonly mode = "onchain";
  private client;
  constructor(
    private address: Address,
    rpcUrl: string,
    private chainId: number,
  ) {
    this.client = createPublicClient({
      transport: http(rpcUrl, { timeout: 5000, retryCount: 0 }),
    });
  }
  async validateConnection() {
    await assertRegistryContract(this.client, this.address, this.chainId);
  }
  async get(tool: ToolIdentity): Promise<RegistryRecord | null> {
    await this.validateConnection();
    // No fallback to demo, cached allow, or trust-on-first-use on RPC failure.
    const id = hashToolId(tool.publisher, tool.toolId);
    try {
      return RegistryRecordSchema.parse(
        await this.client.readContract({
          address: this.address,
          abi: toolRegistryAbi,
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
        return null;
      // Other reverts, RPC failures and malformed responses remain failures.
      throw error;
    }
  }
}
export function deploymentAddress(
  path: string,
  expectedChainId: number,
): Address {
  return readRegistryDeployment(path, expectedChainId).address;
}
