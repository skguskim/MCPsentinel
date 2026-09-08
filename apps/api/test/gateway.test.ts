import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createDemoManifests } from "@mcpsentinel/shared/demo";
import { createToolsApp, type ToolsConfig } from "../../tools/src/server.js";
import { createApiApp } from "../src/app.js";
import { Gateway } from "../src/gateway.js";
import { ToolConnection } from "../src/mcp.js";
import { DemoRegistry } from "../src/registry.js";
import { RunStore } from "../src/store.js";

test("real MCP HTTP gateway: execution, review, block, persistence and origin boundaries", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sentinel-test-"));
  const config: ToolsConfig = {
    port: 0,
    endpoint: "http://127.0.0.1:1/mcp",
    token: "test-only-token",
    dataDir: dir,
    demoEnabled: true,
  };
  const tools = createToolsApp(config);
  const toolServer = tools.app.listen(0, "127.0.0.1");
  await once(toolServer, "listening");
  const toolsUrl = `http://127.0.0.1:${(toolServer.address() as AddressInfo).port}`;
  config.endpoint = `${toolsUrl}/mcp`;
  const store = new RunStore(join(dir, "runs.sqlite"));
  const registry = new DemoRegistry(createDemoManifests(config.endpoint));
  const gateway = new Gateway(
    registry,
    new ToolConnection(toolsUrl, config.token),
    store,
  );
  const server = createApiApp(gateway).listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function request(
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const res = await fetch(url + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, data: (await res.json()) as any };
  }
  async function count() {
    const res = await fetch(toolsUrl + "/__demo/executions", {
      headers: { Authorization: `Bearer ${config.token}` },
    });
    return ((await res.json()) as any).executions.length as number;
  }
  const report = () =>
    request("/api/runs", {
      toolId: "update_report",
      arguments: { title: "Test", content: "Approved exact contents" },
    });
  const exchange = () => request("/api/runs", { prompt: "달러 환율 알려줘" });
  try {
    await t.test("normal metadata permits an actual MCP call", async () => {
      const { data } = await exchange();
      assert.equal(data.run.status, "completed", JSON.stringify(data.run));
      assert.equal(data.run.decision, "ALLOW");
      assert.equal(data.run.result.rate, 1350);
      assert.equal(await count(), 1);
    });
    await t.test(
      "tool listing serializes registry revisions without losing the publisher",
      async () => {
        const { status, data } = await request("/api/tools");
        assert.equal(status, 200);
        assert.equal(data.tools.length, 2);
        assert.equal(data.tools[0].revision, "1");
        assert.equal(
          data.tools[0].publisher,
          createDemoManifests(config.endpoint)[0].publisher,
        );
      },
    );
    await t.test(
      "same-name tool from an unregistered publisher is blocked before execution",
      async () => {
        const before = await count();
        const originalPublisher = config.publisher;
        try {
          config.publisher = "0x0000000000000000000000000000000000000001";
          const { data } = await exchange();
          assert.equal(data.run.status, "blocked");
          assert.equal(
            data.run.checks.find(
              (check: { key: string }) => check.key === "registry_available",
            )?.passed,
            true,
          );
          assert.equal(
            data.run.checks.find(
              (check: { key: string }) => check.key === "registered",
            )?.passed,
            false,
          );
          assert.equal(await count(), before);
        } finally {
          config.publisher = originalPublisher;
        }
      },
    );
    await t.test(
      "REVIEW does not execute until approval; concurrent approval executes exactly once",
      async () => {
        const before = await count();
        const { data } = await report();
        assert.equal(data.run.status, "pending_review");
        assert.equal(await count(), before);
        const responses = await Promise.all([
          request(`/api/runs/${data.run.id}/approve`, {}),
          request(`/api/runs/${data.run.id}/approve`, {}),
        ]);
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
        assert.equal(await count(), before + 1);
        assert.equal(
          responses.find((r) => r.status === 200)?.data.run.status,
          "completed",
        );
      },
    );
    await t.test(
      "rejecting and injecting replacement arguments never executes",
      async () => {
        const before = await count();
        const { data } = await report();
        assert.equal(
          (
            await request(`/api/runs/${data.run.id}/approve`, {
              arguments: { content: "changed" },
            })
          ).status,
          400,
        );
        assert.equal(
          (await request(`/api/runs/${data.run.id}/reject`, {})).data.run
            .status,
          "rejected",
        );
        assert.equal(
          (await request(`/api/runs/${data.run.id}/approve`, {})).status,
          409,
        );
        assert.equal(await count(), before);
      },
    );
    for (const scenario of [
      "tampered",
      "revoked",
      "version-mismatch",
      "permission-denied",
      "registry-unavailable",
    ]) {
      await t.test(`${scenario} BLOCKs without tools/call`, async () => {
        await request("/api/demo/scenario", { scenario });
        const before = await count();
        const { data } = await exchange();
        assert.equal(data.run.decision, "BLOCK", JSON.stringify(data.run));
        assert.equal(data.run.status, "blocked");
        assert.equal(await count(), before);
        await request("/api/demo/scenario", { scenario: "normal" });
      });
    }
    await t.test(
      "approval rechecks revocation and changed manifest",
      async () => {
        for (const scenario of ["revoked", "tampered"]) {
          const { data } = await report();
          const before = await count();
          await request("/api/demo/scenario", { scenario });
          assert.equal(
            (await request(`/api/runs/${data.run.id}/approve`, {})).data.run
              .status,
            "blocked",
          );
          assert.equal(await count(), before);
          await request("/api/demo/scenario", { scenario: "normal" });
        }
      },
    );
    await t.test(
      "invalid tool arguments and unknown tools are blocked",
      async () => {
        const before = await count();
        for (const body of [
          {
            toolId: "exchange_rate",
            arguments: { base: "NOT-A-CURRENCY", quote: "KRW" },
          },
          { toolId: "not-registered", arguments: {} },
        ]) {
          assert.equal(
            (await request("/api/runs", body)).data.run.status,
            "blocked",
          );
        }
        assert.equal(await count(), before);
      },
    );
    await t.test(
      "browser cross-origin requests and direct unauthenticated MCP calls are rejected",
      async () => {
        assert.equal(
          (
            await request(
              "/api/runs",
              { prompt: "환율" },
              { Origin: "https://attacker.example" },
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await fetch(toolsUrl + "/mcp", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            })
          ).status,
          401,
        );
      },
    );
    await t.test("run history survives reopening SQLite", async () => {
      const history = store.list();
      assert.ok(history.length > 5);
      const reopened = new RunStore(join(dir, "runs.sqlite"));
      assert.equal(reopened.get(history[0].id)?.status, history[0].status);
      reopened.close();
    });
  } finally {
    server.closeAllConnections();
    toolServer.closeAllConnections();
    await Promise.all([
      new Promise<void>((r) => server.close(() => r())),
      new Promise<void>((r) => toolServer.close(() => r())),
    ]);
    await tools.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
