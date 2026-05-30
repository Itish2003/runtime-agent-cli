# 0009 — MCP/CodeMode via an inverted primitive (`fire_and_conform`)

## Context

MCP projection was the planned V2 from the start — "swap the CLI projection layer
for an MCP projection layer" (`agentcli.md` line 661; PRD §10 Later). FastMCP's
`OpenAPIProvider` + `CodeMode` already turns an OpenAPI spec into
search/execute meta-tools plus a sandbox. So the deciding question is not
doctrine-coherence but: **what does `rac` add that fastmcp does not?**
(`runtimecli-next-step.md` "The one test").

## Decision

Expose the transport not as MCP's trusting `call_tool`, but via an **inverted
primitive** — `fire_and_conform(op, input)` = *execute + reconcile*, returning
`{ observed, declared, mismatches, verdict }` (`runtimecli-next-step.md` "The
centerpiece"). Ship it as an **external PyPI companion** (fastmcp is Python) plus
a `rac mcp` pointer — not as an npm dependency of the core.

## Rationale

- **The inversion is the entire differentiated product.** fastmcp's sandbox gives
  `call_tool` (trust + execute), the exact opposite of tenet 1. A `rac`-flavored
  sandbox's verbs *verify*. Neither fastmcp nor hey-api can offer it because
  neither has the diff engine (`runtimecli-next-step.md` "The centerpiece").
- **It extends, not contradicts, the thesis.** CodeMode's search + on-demand
  schema fetch *is* the "don't dump the spec into context" design; the
  always-fresh re-read survives because the engine re-reads per call
  (`runtimecli-next-step.md`; PRD §12 P2 cites the CodeMode pattern).
- **Python sidecar that shells out to the `rac` binary** keeps `rac` the single
  conform engine — MCP is just another projection over the stable JSON contract
  ([ADR 0006](./0006-language-neutral-core.md);
  `runtimecli-next-step.md` "The fork", option (a)).
- **Strategic upside:** a hosted, networked conform/drift surface is the natural
  wedge into the open-core commercial layer — far more defensible than a CLI
  (PRD §9c; `runtimecli-next-step.md` "Strategic upside").

## Alternatives considered

- **(b) Port the conform/diff engine to Python** — rejected: duplicate logic, two
  sources of truth (`runtimecli-next-step.md` "The fork").
- **(c) Build a TS MCP framework over the existing engine** — rejected for now:
  rebuilds what fastmcp gives free, including the CodeMode transform
  (`runtimecli-next-step.md` "The fork").
- **Plain fastmcp `OpenAPIProvider` (trust + `call_tool`)** — rejected: trusts the
  spec; no verification, which is the whole point.

## Status

**Open — not built.** No `mcp` command in `src/commands/` and no `examples/`
directory in the repo (both verified). The task framing calls this a prototyped
`examples/` spike with the companion not yet built; the spike is not present in
this worktree. Recommended next step: a one-meta-tool fastmcp server backed by
`rac conform`, dogfooded against a real FastAPI app to decide whether the MCP
projection earns its keep (`runtimecli-next-step.md` "Recommended next step").

> _Author's note: is the inversion still the bet you'd lead with, or has dogfooding
> shifted your view?_
