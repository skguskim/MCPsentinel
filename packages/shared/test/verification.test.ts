import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, toHex } from "viem";
import {
  canonicalJson,
  hashManifest,
  hashPermissions,
  hashToolId,
  ToolManifestSchema,
  verifyTool,
  type ObservedTool,
  type RegistryRecord,
  type ToolManifest,
  type VerificationPolicy,
} from "../src/index.js";

const manifest: ToolManifest = {
  toolId: "exchange-rate",
  name: "exchange_rate",
  description: "Return a demonstration exchange rate.",
  version: "1.0.0",
  publisher: "0x1234567890123456789012345678901234567890",
  endpoint: "http://127.0.0.1:3002/mcp",
  permissions: ["rates:read"],
  inputSchema: {
    type: "object",
    properties: { base: { type: "string" }, quote: { type: "string" } },
    required: ["base", "quote"],
    additionalProperties: false,
  },
};
const observedTool: ObservedTool = {
  name: manifest.name,
  description: manifest.description,
  inputSchema: manifest.inputSchema,
};
const policy: VerificationPolicy = {
  allowedPermissions: ["rates:read"],
  reviewPermissions: ["report:write"],
};
function registered(tool: ToolManifest = manifest): RegistryRecord {
  return {
    publisher: tool.publisher,
    version: tool.version,
    manifestHash: hashManifest(tool),
    permissionHash: hashPermissions(tool.permissions),
    approved: true,
    revoked: false,
    exists: true,
  };
}
function verify(overrides: Partial<Parameters<typeof verifyTool>[0]> = {}) {
  return verifyTool({
    manifest,
    registry: registered(),
    policy,
    observedTool,
    ...overrides,
  });
}

test("canonical hashes ignore nested object key order and permission order/duplicates", () => {
  const left = {
    ...manifest,
    permissions: ["report:write", "rates:read", "rates:read"],
  };
  const right = {
    ...manifest,
    permissions: ["rates:read", "report:write"],
    inputSchema: {
      additionalProperties: false,
      required: ["base", "quote"],
      properties: { quote: { type: "string" }, base: { type: "string" } },
      type: "object",
    },
  };
  assert.equal(hashManifest(left), hashManifest(right));
  assert.equal(
    hashPermissions(left.permissions),
    hashPermissions(right.permissions),
  );
  assert.equal(
    canonicalJson({ z: { y: 2, a: 1 }, a: true }),
    '{"a":true,"z":{"a":1,"y":2}}',
  );
});

test("ordinary array order is preserved and tool IDs use Ethereum Keccak-256", () => {
  assert.notEqual(
    hashManifest(manifest),
    hashManifest({
      ...manifest,
      inputSchema: { ...manifest.inputSchema, required: ["quote", "base"] },
    }),
  );
  assert.equal(hashToolId("exchange-rate"), keccak256(toHex("exchange-rate")));
  assert.notEqual(hashToolId("exchange-rate"), hashToolId("Exchange-rate"));
});

test("invalid manifests and non-JSON values are rejected", () => {
  assert.equal(ToolManifestSchema.safeParse(manifest).success, true);
  for (const patch of [
    { publisher: "not-a-wallet" },
    { endpoint: "not-a-url" },
    { endpoint: "file:///tmp/tool" },
    { endpoint: "http://user:password@localhost/mcp" },
    { permissions: [1] },
    { name: "" },
    { version: "" },
    { unexpected: true },
    { inputSchema: { type: undefined } },
  ])
    assert.equal(
      ToolManifestSchema.safeParse({ ...manifest, ...patch }).success,
      false,
    );
  for (const value of [
    undefined,
    NaN,
    Infinity,
    1n,
    new Date(),
    { a: undefined },
    [, 1],
  ]) {
    assert.throws(() => canonicalJson(value), TypeError);
  }
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalJson(cyclic), /cycles/);
});

test("registered, approved, matching tool with allowed permissions is ALLOW", () => {
  const result = verify();
  assert.equal(result.decision, "ALLOW");
  assert.deepEqual(result.reasons, []);
  assert.ok(result.checks.every((check) => check.passed));
});

test("known review permission yields REVIEW only after integrity passes", () => {
  const reviewManifest = {
    ...manifest,
    permissions: ["rates:read", "report:write"],
  };
  const result = verify({
    manifest: reviewManifest,
    registry: registered(reviewManifest),
  });
  assert.equal(result.decision, "REVIEW");
  assert.match(result.reasons[0]!, /report:write/);
  assert.equal(
    result.checks.find((check) => check.key === "permission_policy")?.passed,
    true,
  );
});

test("allowed permission wins when also listed as reviewable", () => {
  assert.equal(
    verify({
      policy: {
        allowedPermissions: ["rates:read"],
        reviewPermissions: ["rates:read"],
      },
    }).decision,
    "ALLOW",
  );
});

test("unregistered, unapproved, revoked, and unavailable registry all BLOCK", () => {
  const cases: Partial<Parameters<typeof verifyTool>[0]>[] = [
    { registry: null },
    { registry: { ...registered(), exists: false } },
    { registry: { ...registered(), approved: false } },
    { registry: { ...registered(), revoked: true } },
    { registryError: "RPC unavailable" },
  ];
  for (const item of cases) {
    const result = verify(item);
    assert.equal(result.decision, "BLOCK");
    assert.ok(result.reasons.length > 0);
  }
});

test("publisher, approved version, manifest and permission hash changes BLOCK", () => {
  const mutations: Partial<RegistryRecord>[] = [
    { publisher: "0x0000000000000000000000000000000000000001" },
    { version: "2.0.0" },
    { manifestHash: hashToolId("tampered") },
    { permissionHash: hashPermissions(["admin:write"]) },
  ];
  for (const mutation of mutations) {
    assert.equal(
      verify({ registry: { ...registered(), ...mutation } }).decision,
      "BLOCK",
    );
  }
  assert.equal(
    verify({
      manifest: { ...manifest, endpoint: "https://unexpected.example/mcp" },
    }).decision,
    "BLOCK",
  );
  assert.equal(
    verify({ manifest: { ...manifest, description: "Changed instructions" } })
      .decision,
    "BLOCK",
  );
});

test("MCP discovery must match approved name, description and nested input schema", () => {
  const cases: Array<ObservedTool | null> = [
    null,
    { ...observedTool, name: "other_tool" },
    { ...observedTool, description: "Do something else" },
    { name: observedTool.name, inputSchema: observedTool.inputSchema },
    {
      ...observedTool,
      inputSchema: { ...manifest.inputSchema, additionalProperties: true },
    },
    { ...observedTool, inputSchema: { type: undefined } },
  ];
  for (const observed of cases)
    assert.equal(verify({ observedTool: observed }).decision, "BLOCK");
});

test("unknown permissions BLOCK and never become reviewable by request", () => {
  const tool = { ...manifest, permissions: ["report:write", "secrets:read"] };
  const result = verify({ manifest: tool, registry: registered(tool) });
  assert.equal(result.decision, "BLOCK");
  assert.match(result.reasons.join(" "), /secrets:read/);
  assert.equal(
    result.checks.some((check) => check.key === "permission_review"),
    false,
  );
});

test("revocation or altered metadata takes precedence over REVIEW", () => {
  const tool = { ...manifest, permissions: ["report:write"] };
  assert.equal(
    verify({ manifest: tool, registry: { ...registered(tool), revoked: true } })
      .decision,
    "BLOCK",
  );
  assert.equal(
    verify({ manifest: tool, registry: registered() }).decision,
    "BLOCK",
  );
});

test("verification is deterministic and does not mutate its inputs", () => {
  const before = canonicalJson({ manifest, observedTool, policy });
  assert.deepEqual(verify(), verify());
  assert.equal(canonicalJson({ manifest, observedTool, policy }), before);
});
