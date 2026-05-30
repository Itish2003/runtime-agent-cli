# 0008 — hey-api is a sibling, not a feature; codegen is a non-goal

## Context

`hey-api` (and Orval, openapi-generator) also treat the OpenAPI spec as the
source of truth. The obvious challenge — "if hey-api already does this, why build
`rac`?" (`agentcli.md` line 1432) — needs a principled answer, not a feature race.

## Decision

Treat hey-api as a **sibling that consumes the same spec for a different job**,
not as a feature to absorb. **Codegen is a non-goal** (PRD §10 Non-goals). The
partnership lives in the doctrine and positioning, not in the core code.

## Rationale

- **Different jobs.** hey-api is for *writing production applications* (typed
  client wiring); `rac` is for *autonomous testing and execution* (`agentcli.md`
  lines 1434, 1469–1471). They are "the missing puzzle piece that sits right next
  to it" (`agentcli.md` line 1482) — agents use `rac` to *test*, humans use
  hey-api to *integrate*.
- **Why codegen is a non-goal for the core:** generated SDKs are thousands of
  lines of token-heavy boilerplate that bloat agent context, need a build step,
  and go stale — the hypothesis frozen into code (`agentcli.md` lines 1438–1452;
  PRD §10). That is the opposite of always-fresh
  ([ADR 0001](./0001-always-fresh-spec-reread.md)).
- **The non-goal is read precisely** (`runtimecli-next-step.md` "Direction 1"):
  it forbids *shipping SDK artifacts*; it does not forbid generating *ephemeral,
  in-sandbox typed bindings*. So hey-api's only coherent role is an optional
  ergonomics sub-component of the MCP direction
  ([ADR 0009](./0009-mcp-codemode-inversion.md),
  [ADR 0010](./0010-optional-addons-two-shapes.md)) — gated on earning its place,
  never in the core.

## Alternatives considered

- **A `rac sdk` subcommand wrapping hey-api** — prototyped in the planning, then
  rejected for the core's purity; if it ever ships it is an optional, lazy peer
  dependency, not a core feature ([ADR 0010](./0010-optional-addons-two-shapes.md);
  `runtimecli-next-step.md` "SDK add-on"). _(Note: "prototyped" is per the task
  framing; there is no `sdk` command in `src/commands/`, confirming it did not
  land in the core.)_
- **Compete with hey-api on codegen** — rejected: it is a mature tool and codegen
  is a non-goal; the differentiated asset is `conform`, which ports onto an MCP
  surface and not onto codegen (`runtimecli-next-step.md` "The one test").

## Status

**Implemented as a non-goal.** No `sdk` command exists in `src/commands/`
(verified: `conform, doctor, guide, init, inspect, run, search`). The partnership
is documentation/positioning only.
