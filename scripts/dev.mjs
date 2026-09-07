import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
if (existsSync(".env")) process.loadEnvFile(".env");
const env = {
  ...process.env,
  TOOL_AUTH_TOKEN:
    process.env.TOOL_AUTH_TOKEN || randomBytes(32).toString("hex"),
  NEXT_TELEMETRY_DISABLED: "1",
  API_BASE_URL: `http://127.0.0.1:${process.env.API_PORT || 4000}`,
};
const children = [];
let stopping = false;
function launch(args, cwd = root) {
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  children.push(child);
  child.once("exit", (code) => {
    if (!stopping) stop(code || 0);
  });
  child.once("error", (error) => {
    console.error(error.message);
    stop(1);
  });
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === "win32" && child.pid) {
      // Next.js can spawn a worker; close only the process trees we started.
      spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 500).unref();
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
launch(["--import", "tsx", "apps/tools/src/index.ts"]);
launch(["--import", "tsx", "apps/api/src/index.ts"]);
launch(
  [
    resolve(root, "apps/web/node_modules/next/dist/bin/next"),
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    process.env.WEB_PORT || "3000",
  ],
  resolve(root, "apps/web"),
);
console.log(
  `\nMCP Sentinel → http://localhost:${process.env.WEB_PORT || 3000} (${process.env.REGISTRY_MODE || "demo"} registry)\n`,
);
