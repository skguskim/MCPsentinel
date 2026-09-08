import {
  encodeAbiParameters,
  keccak256,
  toHex,
  zeroAddress,
  type Address,
} from "viem";
import { z } from "zod";

/** JSON normalization used by both registration and the execution gateway.
 * Object keys are sorted recursively; array order is preserved. This is the
 * project's v1 format, not a claim of RFC 8785 compatibility.
 */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  function serialize(item: unknown): string {
    if (item === null) return "null";
    if (typeof item === "string" || typeof item === "boolean") {
      return JSON.stringify(item);
    }
    if (typeof item === "number" && Number.isFinite(item)) {
      return JSON.stringify(item);
    }
    if (typeof item !== "object") {
      throw new TypeError("Canonical JSON accepts only finite JSON values.");
    }
    if (ancestors.has(item))
      throw new TypeError("Canonical JSON cannot contain cycles.");
    const prototype = Object.getPrototypeOf(item);
    if (
      !Array.isArray(item) &&
      prototype !== Object.prototype &&
      prototype !== null
    ) {
      throw new TypeError(
        "Canonical JSON accepts only plain objects and arrays.",
      );
    }
    ancestors.add(item);
    try {
      if (Array.isArray(item)) {
        return `[${Array.from(item, (element) => serialize(element)).join(",")}]`;
      }
      const object = item as Record<string, unknown>;
      return `{${Object.keys(object)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${serialize(object[key])}`)
        .join(",")}}`;
    } finally {
      ancestors.delete(item);
    }
  }
  return serialize(value);
}

const JsonObjectSchema = z
  .record(z.string(), z.unknown())
  .superRefine((value, context) => {
    try {
      canonicalJson(value);
    } catch {
      context.addIssue({
        code: "custom",
        message: "Must contain only finite JSON values.",
      });
    }
  });
const PermissionSchema = z.string().min(1).max(128);
const AddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Expected an EVM address.")
  .refine(
    (value) => value.toLowerCase() !== zeroAddress,
    "Publisher must not be the zero address.",
  );
const HashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a bytes32 hash.");

export const ToolManifestSchema = z
  .object({
    toolId: z.string().min(1).max(128),
    name: z.string().min(1).max(128),
    description: z.string().min(1).max(8192),
    version: z.string().min(1).max(64),
    publisher: AddressSchema,
    endpoint: z
      .string()
      .url()
      .max(2048)
      .refine((value) => {
        if (!URL.canParse(value)) return false;
        const url = new URL(value);
        return (
          ["http:", "https:"].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.hash
        );
      }, "Expected an HTTP(S) endpoint without credentials or a fragment."),
    permissions: z.array(PermissionSchema).max(100),
    inputSchema: JsonObjectSchema,
  })
  .strict();

export type ToolManifest = z.infer<typeof ToolManifestSchema>;
/** Human-readable IDs are scoped to the publisher from the validated manifest. */
export type ToolIdentity = Pick<ToolManifest, "publisher" | "toolId">;

export const RegistryRecordSchema = z.object({
  publisher: AddressSchema,
  version: z.string(),
  manifestHash: HashSchema,
  permissionHash: HashSchema,
  approved: z.boolean(),
  revoked: z.boolean(),
  exists: z.boolean(),
  // JSON-facing records use decimal strings; raw viem uint256 values are bigint.
  revision: z
    .union([z.bigint().positive(), z.string().regex(/^[1-9]\d*$/)])
    .transform(String),
});
export type RegistryRecord = z.infer<typeof RegistryRecordSchema>;

export const VerificationPolicySchema = z.object({
  allowedPermissions: z.array(PermissionSchema),
  reviewPermissions: z.array(PermissionSchema),
});
export type VerificationPolicy = z.infer<typeof VerificationPolicySchema>;

export const ObservedToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: JsonObjectSchema,
});
export type ObservedTool = z.infer<typeof ObservedToolSchema>;

export const DecisionSchema = z.enum(["ALLOW", "REVIEW", "BLOCK"]);
export type Decision = z.infer<typeof DecisionSchema>;
export const VerificationCheckSchema = z.object({
  key: z.string(),
  label: z.string(),
  passed: z.boolean(),
  detail: z.string(),
});
export type VerificationCheck = z.infer<typeof VerificationCheckSchema>;
export const VerificationResultSchema = z.object({
  decision: DecisionSchema,
  checks: z.array(VerificationCheckSchema),
  reasons: z.array(z.string()),
});
export type VerificationResult = z.infer<typeof VerificationResultSchema>;

export const RunSchema = z.object({
  id: z.string(),
  toolId: z.string(),
  arguments: JsonObjectSchema,
  prompt: z.string().optional(),
  decision: DecisionSchema,
  status: z.enum([
    "completed",
    "pending_review",
    "blocked",
    "rejected",
    "failed",
  ]),
  checks: z.array(VerificationCheckSchema),
  reasons: z.array(z.string()),
  result: z.unknown().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Run = z.infer<typeof RunSchema>;

/** Permissions are sets. This normalization is normative for both hashes. */
export function normalizePermissions(permissions: readonly string[]): string[] {
  return [...new Set(permissions)].sort();
}

export function hashManifest(manifest: ToolManifest): `0x${string}` {
  return keccak256(
    toHex(
      canonicalJson({
        ...manifest,
        permissions: normalizePermissions(manifest.permissions),
      }),
    ),
  );
}

export function hashPermissions(permissions: readonly string[]): `0x${string}` {
  return keccak256(toHex(canonicalJson(normalizePermissions(permissions))));
}

export function hashToolId(publisher: string, toolId: string): `0x${string}` {
  AddressSchema.parse(publisher);
  z.string().min(1).parse(toolId);
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "string" }],
      [publisher.toLowerCase() as Address, toolId],
    ),
  );
}

export interface VerifyToolInput {
  manifest: ToolManifest;
  registry: RegistryRecord | null;
  policy: VerificationPolicy;
  registryError?: string;
  /** The definition returned by the connected server's tools/list call. */
  observedTool: ObservedTool | null;
}

/** Deterministic, fail-closed metadata and policy checks.
 * This does not attest remote executable code or sandbox server-side behavior.
 * The caller must validate ToolManifestSchema before calling and must prevent
 * tools/call when this returns BLOCK or an unapproved REVIEW.
 */
export function verifyTool(input: VerifyToolInput): VerificationResult {
  const { manifest, registry, policy, registryError, observedTool } = input;
  const checks: VerificationCheck[] = [];
  const reasons: string[] = [];
  function check(
    key: string,
    label: string,
    passed: boolean,
    success: string,
    failure: string,
  ) {
    checks.push({ key, label, passed, detail: passed ? success : failure });
    if (!passed) reasons.push(failure);
  }

  check(
    "registry_available",
    "Registry availability",
    !registryError,
    "Registry lookup completed.",
    "Registry lookup failed; execution is blocked.",
  );
  check(
    "registered",
    "Registered tool",
    !!registry?.exists,
    "Tool is registered.",
    "Tool is not registered.",
  );

  if (registry?.exists) {
    check(
      "approved",
      "Version approval",
      registry.approved,
      "Version is approved.",
      "Tool version is not approved.",
    );
    check(
      "not_revoked",
      "Revocation",
      !registry.revoked,
      "Tool is active.",
      "Tool has been revoked.",
    );
    check(
      "publisher",
      "Publisher identity",
      registry.publisher.toLowerCase() === manifest.publisher.toLowerCase(),
      "Publisher matches the registry.",
      "Publisher does not match the registry.",
    );
    check(
      "version",
      "Approved version",
      registry.version === manifest.version,
      "Version matches the registry.",
      "Version does not match the approved version.",
    );
    check(
      "manifest_hash",
      "Manifest integrity",
      registry.manifestHash.toLowerCase() ===
        hashManifest(manifest).toLowerCase(),
      "Manifest hash matches the registry.",
      "Manifest hash does not match the registry.",
    );
    check(
      "permission_hash",
      "Permission integrity",
      registry.permissionHash.toLowerCase() ===
        hashPermissions(manifest.permissions).toLowerCase(),
      "Permission hash matches the registry.",
      "Permission hash does not match the registry.",
    );
  }

  const observed = ObservedToolSchema.safeParse(observedTool);
  check(
    "tool_available",
    "MCP tool discovery",
    observed.success,
    "Tool definition was discovered from the MCP server.",
    "MCP tool is missing or its definition is invalid.",
  );
  if (observed.success) {
    check(
      "tool_name",
      "MCP tool name",
      observed.data.name === manifest.name,
      "MCP tool name matches the manifest.",
      "MCP tool name does not match the manifest.",
    );
    check(
      "tool_description",
      "MCP tool description",
      observed.data.description === manifest.description,
      "MCP tool description matches the manifest.",
      "MCP tool description does not match the manifest.",
    );
    check(
      "tool_input_schema",
      "MCP input schema",
      canonicalJson(observed.data.inputSchema) ===
        canonicalJson(manifest.inputSchema),
      "MCP input schema matches the manifest.",
      "MCP input schema does not match the manifest.",
    );
  }

  const allowed = new Set(policy.allowedPermissions);
  const reviewable = new Set(policy.reviewPermissions);
  const permissions = normalizePermissions(manifest.permissions);
  const denied = permissions.filter(
    (permission) => !allowed.has(permission) && !reviewable.has(permission),
  );
  const review = permissions.filter(
    (permission) => !allowed.has(permission) && reviewable.has(permission),
  );
  check(
    "permission_policy",
    "Permission policy",
    denied.length === 0,
    "All requested permissions are allowed or eligible for review.",
    `Permissions are forbidden by policy: ${denied.join(", ")}.`,
  );

  if (reasons.length > 0) return { decision: "BLOCK", checks, reasons };
  if (review.length > 0) {
    const detail = `User approval is required for permissions: ${review.join(", ")}.`;
    checks.push({
      key: "permission_review",
      label: "User approval",
      passed: false,
      detail,
    });
    return { decision: "REVIEW", checks, reasons: [detail] };
  }
  return { decision: "ALLOW", checks, reasons: [] };
}
