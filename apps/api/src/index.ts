import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  loadProjectEnv,
  readBlockchainConfig,
  resolveRegistryAddress,
} from "@mcpsentinel/shared/blockchain";
import { createDemoManifests } from "@mcpsentinel/shared/demo";
import { createApiApp } from "./app.js";
import { Gateway } from "./gateway.js";
import { ToolConnection } from "./mcp.js";
import { DemoRegistry, OnchainRegistry } from "./registry.js";
import { RunStore } from "./store.js";
import { MCPAgent } from "./agent/agent.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
loadProjectEnv();
const port = Number(process.env.API_PORT || 4000);
const baseUrl = (
  process.env.TOOL_SERVER_URL ||
  `http://127.0.0.1:${process.env.TOOLS_PORT || 4100}`
).replace(/\/$/, "");
const token = process.env.TOOL_AUTH_TOKEN;
if (!token)
  throw new Error(
    "TOOL_AUTH_TOKEN is required. Run pnpm dev to generate one, or set the same token for API and tools.",
  );
const mode = process.env.REGISTRY_MODE || "demo";
if (!["demo", "onchain"].includes(mode))
  throw new Error("REGISTRY_MODE must be demo or onchain");
const chain = mode === "onchain" ? readBlockchainConfig() : undefined;
const registry = chain
  ? new OnchainRegistry(
      resolveRegistryAddress(chain),
      chain.rpcUrl,
      chain.chainId,
    )
  : new DemoRegistry(
      createDemoManifests(`${baseUrl}/mcp`, process.env.TOOL_PUBLISHER),
    );
// Invalid startup configuration must not present a healthy on-chain service.
if (registry instanceof OnchainRegistry) await registry.validateConnection();
const store = new RunStore(
  resolve(process.env.DATA_DIR || resolve(root, "data"), "sentinel.sqlite"),
);
const connection = new ToolConnection(baseUrl, token);
const agent = new MCPAgent(connection);
const gateway = new Gateway(registry, connection, store);
const webPort = process.env.WEB_PORT || 3000;
const app = createApiApp(
  gateway,
  [
    `http://localhost:${webPort}`,
    `http://127.0.0.1:${webPort}`,
    ...(process.env.WEB_ORIGIN ? [process.env.WEB_ORIGIN] : []),
  ],
  agent,
);
const server = app.listen(port, "127.0.0.1", () =>
  console.log(
    `Sentinel API http://127.0.0.1:${port} (Registry: ${mode}, router: demo)`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
