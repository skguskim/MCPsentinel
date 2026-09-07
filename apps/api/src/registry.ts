import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi, type Address } from "viem";
import {
  hashManifest,
  hashPermissions,
  hashToolId,
  RegistryRecordSchema,
  type RegistryRecord,
  type ToolManifest,
} from "@mcpsentinel/shared";
import type { DemoScenario } from "@mcpsentinel/shared/demo";

export interface Registry {
  mode: "demo" | "onchain";
  get(toolId: string): Promise<RegistryRecord | null>;
}
export class DemoRegistry implements Registry {
  readonly mode = "demo";
  scenario: DemoScenario = "normal";
  private records: Map<string, RegistryRecord>;
  constructor(trusted: ToolManifest[]) {
    this.records = new Map(
      trusted.map((m) => [
        m.toolId,
        {
          publisher: m.publisher,
          version: m.version,
          manifestHash: hashManifest(m),
          permissionHash: hashPermissions(m.permissions),
          approved: true,
          revoked: false,
          exists: true,
        },
      ]),
    );
  }
  async get(toolId: string) {
    if (this.scenario === "registry-unavailable")
      throw new Error("Demo registry outage");
    const record = this.records.get(toolId);
    return record ? { ...record, revoked: this.scenario === "revoked" } : null;
  }
}
const abi = parseAbi([
  "struct ToolRecord { address publisher; string version; bytes32 manifestHash; bytes32 permissionHash; bool approved; bool revoked; bool exists; }",
  "function getTool(bytes32 toolId) view returns (ToolRecord)",
]);
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
  async get(toolId: string) {
    if ((await this.client.getChainId()) !== this.chainId)
      throw new Error("Unexpected chain ID");
    // No fallback to demo, cached allow, or trust-on-first-use on RPC failure.
    return RegistryRecordSchema.parse(
      await this.client.readContract({
        address: this.address,
        abi,
        functionName: "getTool",
        args: [hashToolId(toolId)],
      }),
    );
  }
}
export function deploymentAddress(path: string): Address {
  const data = JSON.parse(readFileSync(path, "utf8")) as { address?: string };
  if (!data.address || !/^0x[0-9a-fA-F]{40}$/.test(data.address))
    throw new Error("Invalid Registry deployment address");
  return data.address as Address;
}
