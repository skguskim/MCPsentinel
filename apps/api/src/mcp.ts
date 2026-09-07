import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { z } from "zod";
import { ToolManifestSchema } from "@mcpsentinel/shared";

export class ToolConnection {
  constructor(
    readonly baseUrl: string,
    private token: string,
  ) {}
  async manifests() {
    const response = await fetch(`${this.baseUrl}/manifest`, {
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Tool manifest could not be loaded");
    const body = await response.text();
    if (body.length > 128_000)
      throw new Error("Tool manifest exceeds size limit");
    const { tools } = z
      .object({ tools: z.array(ToolManifestSchema).max(32) })
      .parse(JSON.parse(body));
    if (
      new Set(tools.map((t) => t.toolId)).size !== tools.length ||
      new Set(tools.map((t) => t.name)).size !== tools.length
    )
      throw new Error("Duplicate tool identity");
    return tools;
  }
  async connect() {
    const client = new Client({
      name: "mcpsentinel-gateway",
      version: "0.1.0",
    });
    const transport = new StreamableHTTPClientTransport(
      new URL(`${this.baseUrl}/mcp`),
      {
        requestInit: { headers: { Authorization: `Bearer ${this.token}` } },
      },
    );
    try {
      await client.connect(transport, { timeout: 5000 });
    } catch (error) {
      await client.close().catch(() => {});
      throw error;
    }
    return client;
  }
  async setScenario(scenario: string) {
    const response = await fetch(`${this.baseUrl}/__demo/scenario`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ scenario }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Could not change demo server scenario");
  }
}
