import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { isAddress } from "viem";
import { createDemoManifests } from "@mcpsentinel/shared/demo";
import { createApiApp } from "./app.js";
import { Gateway } from "./gateway.js";
import { ToolConnection } from "./mcp.js";
import {
  DemoRegistry,
  OnchainRegistry,
  deploymentAddress,
} from "./registry.js";
import { RunStore } from "./store.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
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
const address =
  mode === "onchain"
    ? process.env.REGISTRY_ADDRESS ||
      deploymentAddress(
        resolve(
          root,
          process.env.REGISTRY_DEPLOYMENT ||
            "packages/contracts/deployments/localhost.json",
        ),
      )
    : undefined;
if (address && !isAddress(address)) throw new Error("Invalid REGISTRY_ADDRESS");
const registry =
  mode === "onchain"
    ? new OnchainRegistry(
        address as `0x${string}`,
        process.env.RPC_URL || "http://127.0.0.1:8545",
        Number(process.env.CHAIN_ID || 31337),
      )
    : new DemoRegistry(
        createDemoManifests(`${baseUrl}/mcp`, process.env.TOOL_PUBLISHER),
      );
const store = new RunStore(
  resolve(process.env.DATA_DIR || resolve(root, "data"), "sentinel.sqlite"),
);
const gateway = new Gateway(
  registry,
  new ToolConnection(baseUrl, token),
  store,
);
const webPort = process.env.WEB_PORT || 3000;
const app = createApiApp(gateway, [
  `http://localhost:${webPort}`,
  `http://127.0.0.1:${webPort}`,
  ...(process.env.WEB_ORIGIN ? [process.env.WEB_ORIGIN] : []),
]);
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
