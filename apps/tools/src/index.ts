import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createToolsApp } from "./server.js";
import { loadProjectEnv } from "@mcpsentinel/shared/blockchain";

const root = fileURLToPath(new URL("../../../", import.meta.url));
loadProjectEnv();
const port = Number(process.env.TOOLS_PORT || 4100);
const token = process.env.TOOL_AUTH_TOKEN;
if (!token)
  throw new Error(
    "TOOL_AUTH_TOKEN is required. Run pnpm dev to generate one, or set the same token for API and tools.",
  );
const baseUrl = (
  process.env.TOOL_SERVER_URL || `http://127.0.0.1:${port}`
).replace(/\/$/, "");
const tools = createToolsApp({
  port,
  token,
  endpoint: `${baseUrl}/mcp`,
  dataDir: resolve(process.env.DATA_DIR || resolve(root, "data"), "tools"),
  demoEnabled: (process.env.REGISTRY_MODE || "demo") === "demo",
  publisher: process.env.TOOL_PUBLISHER,
});
const server = tools.app.listen(port, "127.0.0.1", () =>
  console.log(`MCP tools listening at http://127.0.0.1:${port}/mcp`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.close();
    void tools.close().finally(() => process.exit(0));
  });
