import { randomUUID } from "node:crypto";
import { Ajv2020 } from "ajv/dist/2020.js";
import {
  hashManifest,
  verifyTool,
  type VerificationPolicy,
  type VerificationResult,
} from "@mcpsentinel/shared";
import type { DemoScenario } from "@mcpsentinel/shared/demo";
import { RunStore, type StoredRun } from "./store.js";
import { DemoRegistry, type Registry } from "./registry.js";
import { ToolConnection } from "./mcp.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export interface RunRequest {
  prompt?: string;
  toolId?: string;
  arguments?: Record<string, unknown>;
}
const basePolicy: VerificationPolicy = {
  allowedPermissions: ["exchange:read"],
  reviewPermissions: ["report:write"],
};
const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: false,
});

export class Gateway {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    readonly registry: Registry,
    readonly connection: ToolConnection,
    readonly store: RunStore,
  ) {}
  // Serializes local state mutations and approvals, so double-clicks never execute a pending run twice.
  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn, fn);
    this.queue = result.catch(() => {});
    return result;
  }
  async setScenario(scenario: DemoScenario) {
    return this.exclusive(async () => {
      if (!(this.registry instanceof DemoRegistry))
        throw new HttpError(
          403,
          "시나리오 변경은 데모 Registry에서만 가능합니다.",
        );
      await this.connection.setScenario(scenario);
      this.registry.scenario = scenario;
      return { scenario };
    });
  }
  create(input: RunRequest) {
    return this.exclusive(async () => {
      const plan = this.plan(input);
      const at = new Date().toISOString();
      const run: StoredRun = {
        id: randomUUID(),
        ...plan,
        prompt: input.prompt,
        decision: "BLOCK",
        status: "blocked",
        checks: [],
        reasons: [],
        createdAt: at,
        updatedAt: at,
      };
      return this.evaluate(run, false);
    });
  }
  approve(id: string) {
    return this.exclusive(async () => {
      const run = this.store.get(id);
      if (!run) throw new HttpError(404, "실행 요청을 찾을 수 없습니다.");
      if (run.status !== "pending_review")
        throw new HttpError(409, "승인 대기 중인 요청만 승인할 수 있습니다.");
      if (Date.now() - Date.parse(run.createdAt) > 10 * 60_000) {
        run.status = "blocked";
        run.decision = "BLOCK";
        run.reasons = ["승인 요청이 만료되었습니다. 새 요청을 생성하세요."];
        return this.store.save(run);
      }
      return this.evaluate(run, true);
    });
  }
  reject(id: string) {
    return this.exclusive(async () => {
      const run = this.store.get(id);
      if (!run) throw new HttpError(404, "실행 요청을 찾을 수 없습니다.");
      if (run.status !== "pending_review")
        throw new HttpError(409, "승인 대기 중인 요청만 거절할 수 있습니다.");
      run.status = "rejected";
      run.reasons = ["사용자가 실행을 거절했습니다."];
      return this.store.save(run);
    });
  }
  private plan(input: RunRequest): {
    toolId: string;
    arguments: Record<string, unknown>;
  } {
    if (input.toolId)
      return { toolId: input.toolId, arguments: input.arguments || {} };
    const prompt = input.prompt || "";
    // Transparent offline routing for the MVP; replace this module with an LLM tool planner.
    if (/보고서|report/i.test(prompt))
      return {
        toolId: "update_report",
        arguments: { title: "이번 주 보고서", content: prompt },
      };
    if (/환율|달러|exchange|usd|eur|jpy/i.test(prompt))
      return {
        toolId: "exchange_rate",
        arguments: {
          base: /eur|유로/i.test(prompt)
            ? "EUR"
            : /jpy|엔화/i.test(prompt)
              ? "JPY"
              : "USD",
          quote: "KRW",
        },
      };
    throw new HttpError(
      400,
      "데모 라우터는 환율 조회와 보고서 업데이트를 지원합니다. 예시 요청을 사용하세요.",
    );
  }
  private policy(approved: boolean): VerificationPolicy {
    if (
      this.registry instanceof DemoRegistry &&
      this.registry.scenario === "permission-denied"
    )
      return { allowedPermissions: [], reviewPermissions: [] };
    return approved
      ? {
          allowedPermissions: [
            ...basePolicy.allowedPermissions,
            ...basePolicy.reviewPermissions,
          ],
          reviewPermissions: [],
        }
      : basePolicy;
  }
  private async evaluate(
    run: StoredRun,
    approved: boolean,
  ): Promise<StoredRun> {
    let client: Awaited<ReturnType<ToolConnection["connect"]>> | undefined;
    try {
      const manifest = (await this.connection.manifests()).find(
        (t) => t.toolId === run.toolId,
      );
      if (!manifest) throw new Error("Tool Manifest를 찾을 수 없습니다.");
      // Never connect to a URL supplied by the user, model or a mutable manifest.
      if (manifest.endpoint !== `${this.connection.baseUrl}/mcp`)
        throw new Error("Manifest의 연결 주소가 허용된 MCP 서버와 다릅니다.");
      const currentHash = hashManifest(manifest);
      if (approved && currentHash !== run.manifestHash)
        throw new Error(
          "승인 대기 중 Tool 정보가 변경되었습니다. 새 요청이 필요합니다.",
        );
      let registry = null;
      let registryError: string | undefined;
      try {
        registry = await this.registry.get(manifest);
      } catch {
        registryError = "Registry 조회에 실패했습니다.";
      }
      client = await this.connection.connect();
      const listed = await client.listTools({}, { timeout: 5000 });
      const observedTool =
        listed.tools.find((t) => t.name === manifest.name) || null;
      const validation = verifyTool({
        manifest,
        registry,
        registryError,
        policy: this.policy(approved),
        observedTool,
      });
      Object.assign(run, validation);
      run.manifestHash = currentHash;
      if (validation.decision === "BLOCK") {
        run.status = "blocked";
        return this.store.save(run);
      }
      const validate = ajv.compile(manifest.inputSchema);
      if (!validate(run.arguments))
        throw new Error(
          `실행 인자가 Tool 입력 형식과 다릅니다: ${ajv.errorsText(validate.errors)}`,
        );
      if (validation.decision === "REVIEW") {
        run.status = "pending_review";
        return this.store.save(run);
      }
      if (approved) {
        run.approvedAt = new Date().toISOString();
        run.checks.push({
          key: "user_approval",
          label: "User approval",
          passed: true,
          detail: "저장된 Tool·버전·실행 인자에 대한 승인을 확인했습니다.",
        });
      }
      // Persist a non-retryable marker before the side effect. A process crash cannot replay approval.
      run.status = "failed";
      run.error =
        "실행 중 연결이 끊겼을 수 있습니다. Tool 이력을 확인하고 새 요청을 생성하세요.";
      this.store.save(run);
      const result = await client.callTool(
        { name: manifest.name, arguments: run.arguments },
        { timeout: 10_000 },
      );
      if (result.isError)
        throw new Error("MCP Tool이 실행 오류를 반환했습니다.");
      run.result = result.structuredContent ?? result.content;
      run.status = "completed";
      delete run.error;
      return this.store.save(run);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "검증 중 오류가 발생했습니다.";
      if (run.status === "failed") {
        run.error = message;
      } else {
        const blocked: VerificationResult = {
          decision: "BLOCK",
          checks: [
            ...run.checks,
            {
              key: "gateway",
              label: "Execution gateway",
              passed: false,
              detail: message,
            },
          ],
          reasons: [message],
        };
        Object.assign(run, blocked);
        run.status = "blocked";
      }
      return this.store.save(run);
    } finally {
      await client?.close().catch(() => {});
    }
  }
}
