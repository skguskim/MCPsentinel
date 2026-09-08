# Shared trust model

This package supplies runtime schemas, deterministic hashes, the execution-gate
decision function, and API run types. Import it as `@mcpsentinel/shared` from the
TypeScript workspace.

## Data contract

- Parse data from a remote manifest with `ToolManifestSchema` before using it.
  Unknown top-level fields and non-JSON values are rejected.
- `manifest.name` is the exact MCP tool name used in `tools/call`, not a display
  label. The manifest description and input schema must match `tools/list`.
- Supply `observedTool: null` when discovery does not return the selected tool.
  Failure to retrieve a registry record or tool definition blocks execution.
- `verifyTool()` returns `BLOCK` for any integrity, approval, identity, discovery,
  or policy failure. `REVIEW` is possible only after these checks pass.
- A permission in `allowedPermissions` needs no review. A permission only in
  `reviewPermissions` needs an explicit approval. Any other permission blocks.
- The gateway owns approval and execution. It must bind approval to the stored
  request, re-fetch the current manifest, MCP definition, and registry state,
  re-run verification, then execute only the exact approved tool and arguments.
- Registry lookups accept `ToolIdentity = { publisher, toolId }` from the validated
  manifest. The human-readable ID alone is ambiguous across publishers. The
  current gateway selects unique local IDs within one configured MCP server and
  rejects duplicate IDs/names in that server.
- Registry v2 records include `revision`. `RegistryRecordSchema` converts raw
  uint256 bigints into positive decimal strings for lossless JSON serialization.
  `/api/tools` returns this string, or `null` when no record is available.

## Registry identity v2 and metadata hash format v1

`hashToolId(publisher, toolId)` returns Ethereum Keccak-256 of
`abi.encode(address publisher, string toolId)`, as `0x` bytes32 hex. Solidity's
`computeToolId()` uses the same encoding; `registerTool()` derives the publisher
from `msg.sender`. Address letter case does not affect the ID. Tool strings are
exact UTF-8, without case folding or Unicode normalization. An empty ID or zero
publisher is invalid. This replaces the v1 name-only hash and requires redeployment.

Metadata hashes remain Ethereum Keccak-256 over UTF-8 JSON. `hashPermissions()` hashes canonical
JSON of the sorted, deduplicated permission array. `hashManifest()` applies that
same permission normalization to the manifest, then hashes its canonical JSON.
Canonical JSON recursively sorts object keys with JavaScript's default string
ordering and preserves all other arrays. Strings, addresses, endpoints, and
versions are otherwise unchanged. It rejects non-finite numbers, undefined,
cycles, and non-plain objects. All registrars and gateways must use these helpers;
this is a project-specific encoding, not RFC 8785.

The existing Manifest fields are sufficient: keep `toolId` as the human-readable
identifier and `publisher` as its publisher wallet. Do not replace the Manifest
`toolId` with the on-chain hash. `manifest.name` remains the exact MCP name used
for execution. Import the v2 ABI and compatibility/configuration helpers from
`@mcpsentinel/shared/blockchain` in Node entry points.

Hashes establish agreement with registered metadata. They do **not** attest the
remote server's running code or enforce permissions inside a malicious server.
Actual permission enforcement requires server-side controls or isolation.

Run the security decision tests with `pnpm --filter @mcpsentinel/shared test`
after installing dependencies from the repository root.
