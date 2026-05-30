# 0006 — Language/framework-neutral core; CLI + JSON envelope is the only public surface

## Context

The roadmap anticipates optional add-ons in different languages — a TS SDK
generator (hey-api) and a Python MCP wrapper (fastmcp)
([ADR 0008](./0008-heyapi-sibling-not-feature.md),
[ADR 0009](./0009-mcp-codemode-inversion.md)). If integrators couple to an
importable TS module API, the core re-couples to the JS ecosystem and can no
longer be wrapped neutrally (`runtimecli-next-step.md` "Packaging").

## Decision

The **only public integration surface is the CLI + the §7 JSON envelope.** The
core is language- and framework-neutral. Integrators target the CLI/JSON
contract, never an importable module API (`runtimecli-next-step.md` "Packaging").
This follows the LSP/protoc model: a stable wire contract, many wrappers.

Concrete consequences in the code:
- **Always-JSON envelope, even on crash** — every command prints through one
  envelope module (`src/envelope.ts`); success and error shapes are fixed
  (PRD §7). Network failures like `ECONNREFUSED` come back as clean JSON, not a
  stack trace (PRD §12 P4).
- **`die(): never`** — a single typed exit path so failures still emit a valid
  envelope.
- **Read-only by default + runtime secret redaction** — see
  [ADR 0012](./0012-safety-model-config-not-sandbox.md); secrets are resolved at
  runtime from `${env:VAR}`/keychain and redacted in all output, so the agent
  authenticates without ever seeing the secret (PRD §8).

## Rationale

- **Neutrality is what lets anything wrap `rac`** without the core taking on a
  language runtime or a framework opinion — `rac` stays a neutral primitive
  (curl/jq-like); couplings live in the wrappers (`runtimecli-next-step.md`
  "Packaging").
- **A stable contract is what an external wrapper needs.** The P0 tests pin the
  envelope precisely so the Python MCP companion can shell out to it safely
  (`runtimecli-next-step.md` "MCP add-on").
- **JSON-in/JSON-out is also the agent-native requirement** — agents want strict,
  predictable JSON, not human tables (`agentcli.md` lines 739–742; PRD §7).

## Alternatives considered

- **Expose an importable TS module API for integrators** — rejected: re-couples
  the core to the JS ecosystem the moment people `import` it
  (`runtimecli-next-step.md` "Packaging").
- **Per-command bespoke output formats** — rejected: one envelope keeps the
  contract stable and machine-parseable (PRD §7).

## Status

**Implemented.** Single envelope (`src/envelope.ts`) enforced as a typed
`Envelope` return (git `1978805`), pinned by the P0 test suite (git `f0a8eb6`).
