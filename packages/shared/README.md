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

## Hash format v1

Hashes are Ethereum Keccak-256 over UTF-8 strings, returned as `0x` bytes32 hex.
`hashToolId(id)` hashes the exact identifier. `hashPermissions()` hashes canonical
JSON of the sorted, deduplicated permission array. `hashManifest()` applies that
same permission normalization to the manifest, then hashes its canonical JSON.
Canonical JSON recursively sorts object keys with JavaScript's default string
ordering and preserves all other arrays. Strings, addresses, endpoints, and
versions are otherwise unchanged. It rejects non-finite numbers, undefined,
cycles, and non-plain objects. All registrars and gateways must use these helpers;
this is a project-specific encoding, not RFC 8785.

Hashes establish agreement with registered metadata. They do **not** attest the
remote server's running code or enforce permissions inside a malicious server.
Actual permission enforcement requires server-side controls or isolation.

Run the security decision tests with `pnpm --filter @mcpsentinel/shared test`
after installing dependencies from the repository root.
