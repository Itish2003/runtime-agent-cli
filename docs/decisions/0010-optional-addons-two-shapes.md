# 0010 — Optional add-ons have two shapes (inward peer / outward wrapper)

## Context

Two add-ons are planned — an SDK generator (hey-api, TS) and an MCP surface
(fastmcp, Python). The governing constraint is that the core must stay
language- and framework-neutral and gain zero new runtime deps
([ADR 0006](./0006-language-neutral-core.md);
`runtimecli-next-step.md` "Packaging").

## Decision

Ship both as **opt-in add-ons**, but recognize they are *different kinds of
thing*, and that asymmetry is exactly what keeps the core clean
(`runtimecli-next-step.md` "Packaging"):

| Add-on | Language | Dependency direction | Mechanism |
|---|---|---|---|
| **SDK (hey-api)** | npm/TS | **inward** — `rac` calls it | optional `peerDependency` + lazy `import()`, gated behind a `rac sdk` subcommand |
| **MCP (fastmcp)** | Python | **outward/inverted** — it calls `rac` | external wrapper, not a dependency; shells out to the `rac` binary over the JSON contract |

## Rationale

- **Inward (hey-api):** declared as an optional `peerDependency`
  (`peerDependenciesMeta … optional: true`) — "install it yourself when you want
  SDK generation." `rac sdk` does `await import("@hey-api/openapi-ts")`; on
  `MODULE_NOT_FOUND` it emits a doctrine-style error envelope
  (`{ ok:false, error:"SDK_ADDON_MISSING", hint:"bun add -d …" }`). The "install
  me" error *is* the pedagogical-error mechanism — the heavy dep only loads when
  the subcommand runs and the peer is present, so zero core bloat
  (`runtimecli-next-step.md` "SDK add-on").
- **Outward (fastmcp):** a separate pip-installed companion; `rac` never imports
  fastmcp, so MCP is pure by construction. `rac`'s only obligation is to keep the
  §7 JSON contract stable, which the P0 tests pin
  (`runtimecli-next-step.md` "MCP add-on"; [ADR 0006](./0006-language-neutral-core.md)).
- **One spine, two projections, core never grows** — serves the "shopping site"
  loop: write code (`rac sdk`), test it (`rac run`/`conform`), expose it
  (fastmcp wrapper) (`runtimecli-next-step.md` "How it serves").

## Alternatives considered

- **Bundle either add-on into the core deps** — rejected: violates the
  zero-new-runtime-deps constraint and the neutrality principle
  ([ADR 0006](./0006-language-neutral-core.md)).
- **Auto-install the peer** — rejected: opt-in install is the point; a missing
  peer is a teaching moment, not a failure (`runtimecli-next-step.md` "SDK add-on").

## Status

**Open.** The packaging *principle* is decided and constrains the core (which
ships with five runtime deps and no add-on). Neither add-on is implemented: no
`sdk` command, no `peerDependencies` block in `package.json` (verified). The
compiled-binary caveat applies — `bun build --compile` bundles reachable code, so
`rac sdk` is an npm-distribution-only feature (`runtimecli-next-step.md`
"Caveat — the compiled binary").
