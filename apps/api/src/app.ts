import express from "express";
import { z, ZodError } from "zod";
import { scenarios } from "@mcpsentinel/shared/demo";
import { Gateway, HttpError } from "./gateway.js";
import { DemoRegistry } from "./registry.js";
import type { MCPAgent } from "./agent/agent.js";

const RunRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(4000).optional(),
    toolId: z.string().min(1).max(128).optional(),
    arguments: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine(
    (body) => body.prompt || body.toolId,
    "prompt 또는 toolId가 필요합니다.",
  );

const ChatRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(4000),
  })
  .strict();

export function createApiApp(
  gateway: Gateway,
  webOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"],
  agent?: MCPAgent,
) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(req.hostname)) {
      res.status(403).json({ error: "Invalid host" });
      return;
    }
    const origin = req.headers.origin;
    if (origin && !webOrigins.includes(origin)) {
      res.status(403).json({ error: "Origin is not allowed" });
      return;
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET, POST");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.sendStatus(204);
      return;
    }
    if (req.method === "POST" && !req.is("application/json")) {
      res.status(415).json({ error: "application/json is required" });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "32kb" }));
  app.get("/api/health", (_req, res) =>
    res.json({
      status: "ok",
      registryMode: gateway.registry.mode,
      routingMode: "demo",
      scenario:
        gateway.registry instanceof DemoRegistry
          ? gateway.registry.scenario
          : undefined,
    }),
  );
  app.get("/api/tools", async (_req, res) => {
    const manifests = await gateway.connection.manifests();
    const tools = await Promise.all(
      manifests.map(async (m) => {
        let record = null;
        try {
          record = await gateway.registry.get(m);
        } catch {
          /* list remains viewable during outage; verify fails closed */
        }
        return {
          toolId: m.toolId,
          name: m.name,
          description: m.description,
          version: m.version,
          publisher: m.publisher,
          permissions: m.permissions,
          approved: record?.approved || false,
          revoked: record?.revoked || false,
          revision: record?.revision ?? null,
        };
      }),
    );
    res.json({ tools });
  });
  app.post("/api/chat", async (req, res) => {
    if (!agent) {
      throw new HttpError(503, "AI Agent가 활성화되지 않았습니다.");
    }

    const { prompt } = ChatRequestSchema.parse(req.body);

    const decision = await agent.decide(prompt);

    // Tool이 필요 없는 일반 질문
    if (decision.type === "answer") {
      res.json({
        type: "answer",
        answer: decision.content,
      });
      return;
    }

    // Tool이 필요한 경우
    const created = await gateway.create({
      prompt,
      toolId: decision.toolId,
      arguments: decision.arguments,
    });

    const runs = Array.isArray(created) ? created : [created];
    const run = runs[runs.length - 1];

    if (!run) {
      throw new HttpError(
        500,
        "실행 요청이 생성되지 않았습니다.",
      );
    }

    if (run.status === "completed") {
      const answer = await agent.finalizeToolResult({
        userPrompt: prompt,
        toolName: decision.toolName,
        arguments: decision.arguments,
        result: run.result,
      });

      res.status(201).json({
        type: "run",
        run,
        runs,
        answer,
      });
      return;
    }

    res.status(201).json({
      type: "run",
      run,
      runs,
    });
    });
  app.get("/api/runs", (_req, res) => res.json({ runs: gateway.store.list() }));
  app.get("/api/runs/:id", (req, res) => {
    const run = gateway.store.get(req.params.id);
    if (!run) throw new HttpError(404, "실행 요청을 찾을 수 없습니다.");
    res.json({ run });
  });
  app.post("/api/runs", async (req, res) => {
    const created = await gateway.create(RunRequestSchema.parse(req.body));

    const runs = Array.isArray(created) ? created : [created];

    res.status(201).json({
      run: runs[runs.length - 1],
      runs,
    });
  });
  app.post("/api/runs/:id/approve", async (req, res) => {
    z.object({})
      .strict()
      .parse(req.body ?? {});

    res.json({
      run: await gateway.approve(req.params.id),
    });
  });
  app.post("/api/runs/:id/reject", async (req, res) => {
    z.object({})
      .strict()
      .parse(req.body ?? {});
    res.json({ run: await gateway.reject(req.params.id) });
  });
  app.post("/api/chat/runs/:id/approve", async (req, res) => {
    if (!agent) {
      throw new HttpError(
        503,
        "AI Agent가 활성화되지 않았습니다.",
      );
    }

    z.object({})
      .strict()
      .parse(req.body ?? {});

    // 승인 전에 기존 실행 요청 정보 보관
    const existingRun = gateway.store.get(req.params.id);

    if (!existingRun) {
      throw new HttpError(
        404,
        "실행 요청을 찾을 수 없습니다.",
      );
    }

    // Sentinel 재검증 + 실제 MCP Tool 실행
    const run = await gateway.approve(req.params.id);

    if (run.status !== "completed") {
      res.json({
        type: "run",
        run,
      });
      return;
    }

    // 실행된 Tool의 이름 확인
    const manifests = await gateway.connection.manifests();

    const manifest = manifests.find(
      (item) => item.toolId === run.toolId,
    );

    if (!manifest) {
      throw new HttpError(
        500,
        "실행된 Tool의 Manifest를 찾을 수 없습니다.",
      );
    }

    // Tool 실행 결과 → LLM → 최종 자연어 응답
    const answer = await agent.finalizeToolResult({
      userPrompt: existingRun.prompt || "",
      toolName: manifest.name,
      arguments: existingRun.arguments,
      result: run.result,
    });

    res.json({
      type: "run",
      run,
      answer,
    });
  });
  app.post("/api/demo/scenario", async (req, res) => {
    const { scenario } = z
      .object({ scenario: z.enum(scenarios) })
      .strict()
      .parse(req.body);
    res.json(await gateway.setScenario(scenario));
  });
  app.use((_req, res) =>
    res.status(404).json({ error: "API endpoint not found" }),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: "입력 형식을 확인해주세요.",
          details: error.issues.map((i) => i.message),
        });
        return;
      }
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      if (error instanceof SyntaxError) {
        res.status(400).json({ error: "올바른 JSON이 필요합니다." });
        return;
      }
      console.error(
        "[API]",
        error instanceof Error ? error.message : "Unknown error",
      );
      res.status(503).json({
        error:
          "서비스 연결에 실패했습니다. API와 MCP 서버 상태를 확인해주세요.",
      });
    },
  );
  return app;
}
