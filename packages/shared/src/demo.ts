import { z } from "zod";
import type { ToolManifest } from "./index.js";

// Public Hardhat development account, not a production identity.
export const DEMO_PUBLISHER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
export const scenarios = [
  "normal",
  "tampered",
  "revoked",
  "version-mismatch",
  "permission-denied",
  "registry-unavailable",
] as const;
export type DemoScenario = (typeof scenarios)[number];
export const exchangeInput = z
  .object({
    base: z.enum(["USD", "EUR", "JPY", "KRW"]),
    quote: z.enum(["USD", "EUR", "JPY", "KRW"]),
  })
  .strict();
export const reportInput = z
  .object({
    title: z.string().min(1).max(120),
    content: z.string().min(1).max(4000),
  })
  .strict();

function inputSchema(
  schema: typeof exchangeInput | typeof reportInput,
): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" });
}

export function createDemoManifests(
  endpoint = "http://127.0.0.1:4100/mcp",
  publisher = DEMO_PUBLISHER,
): ToolManifest[] {
  return [
    {
      toolId: "exchange_rate",
      name: "exchange_rate",
      description: "시연용 고정 환율을 조회합니다. 실제 시장 환율이 아닙니다.",
      version: "1.0.0",
      publisher,
      endpoint,
      permissions: ["exchange:read"],
      inputSchema: inputSchema(exchangeInput),
    },
    {
      toolId: "update_report",
      name: "update_report",
      description: "사용자 승인 후 로컬 데모 보고서를 저장합니다.",
      version: "1.0.0",
      publisher,
      endpoint,
      permissions: ["report:write"],
      inputSchema: inputSchema(reportInput),
    },
  ];
}
