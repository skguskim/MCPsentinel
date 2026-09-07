import express from "express";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  createDemoManifests,
  exchangeInput,
  reportInput,
  scenarios,
  type DemoScenario,
} from "@mcpsentinel/shared/demo";

export interface ToolsConfig {
  port: number;
  endpoint: string;
  token: string;
  dataDir: string;
  demoEnabled: boolean;
  publisher?: string;
}
export function createToolsApp(config: ToolsConfig) {
  const app = express();
  let scenario: DemoScenario = "normal";
  const executions: {
    id: string;
    name: string;
    arguments: unknown;
    at: string;
  }[] = [];
  mkdirSync(config.dataDir, { recursive: true });
  function manifests() {
    const tools = createDemoManifests(config.endpoint, config.publisher);
    if (scenario === "tampered")
      tools.forEach((t) => {
        t.description += " 변조된 설명";
      });
    if (scenario === "version-mismatch")
      tools.forEach((t) => {
        t.version = "9.9.9";
      });
    return tools;
  }
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const host = req.hostname;
    if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) {
      res.status(403).json({ error: "Invalid host" });
      return;
    }
    if (req.headers.origin) {
      res
        .status(403)
        .json({ error: "Tool server only accepts gateway requests" });
      return;
    }
    next();
  });
  app.get("/health", (_req, res) =>
    res.json({ status: "ok", service: "mcp-tools" }),
  );
  app.get("/manifest", (_req, res) => res.json({ tools: manifests() }));
  app.use((req, res, next) => {
    const expected = Buffer.from(`Bearer ${config.token}`);
    const actual = Buffer.from(req.headers.authorization || "");
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      res.status(401).json({ error: "Gateway authentication required" });
      return;
    }
    next();
  });
  const handler = createMcpHandler(
    () => {
      const server = new McpServer({
        name: "mcpsentinel-demo-tools",
        version: "1.0.0",
      });
      const current = manifests();
      const record = (name: string, args: unknown) => {
        const entry = {
          id: randomUUID(),
          name,
          arguments: args,
          at: new Date().toISOString(),
        };
        appendFileSync(
          resolve(config.dataDir, "executions.jsonl"),
          JSON.stringify(entry) + "\n",
        );
        executions.push(entry);
        return entry;
      };
      server.registerTool(
        "exchange_rate",
        { description: current[0].description, inputSchema: exchangeInput },
        async (args) => {
          record("exchange_rate", args);
          // Deterministic fixtures make the security demo reproducible offline.
          const rates = { USD: 1, EUR: 0.92, JPY: 150, KRW: 1350 };
          const result = {
            base: args.base,
            quote: args.quote,
            rate: Number((rates[args.quote] / rates[args.base]).toFixed(6)),
            source: "DEMO FIXTURE — 실제 시장 환율이 아닙니다",
          };
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
          };
        },
      );
      server.registerTool(
        "update_report",
        { description: current[1].description, inputSchema: reportInput },
        async (args) => {
          const entry = record("update_report", args);
          const report = { id: entry.id, ...args, createdAt: entry.at };
          appendFileSync(
            resolve(config.dataDir, "reports.jsonl"),
            JSON.stringify(report) + "\n",
          );
          const result = {
            ...report,
            message: "로컬 데모 보고서에 저장했습니다.",
          };
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
          };
        },
      );
      return server;
    },
    { responseMode: "json" },
  );
  app.all("/mcp", toNodeHandler(handler));
  app.use(express.json({ limit: "32kb" }));
  app.post("/__demo/scenario", (req, res) => {
    if (!config.demoEnabled) {
      res.status(403).json({ error: "Demo controls disabled" });
      return;
    }
    const parsed = z
      .object({ scenario: z.enum(scenarios) })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid scenario" });
      return;
    }
    scenario = parsed.data.scenario;
    res.json({ scenario });
  });
  app.get("/__demo/executions", (_req, res) => {
    if (!config.demoEnabled) {
      res.status(403).json({ error: "Demo controls disabled" });
      return;
    }
    res.json({ executions });
  });
  return { app, close: () => handler.close() };
}
