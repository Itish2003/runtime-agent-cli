# 0009 — MCP as the remote transport: use fastmcp directly, don't wrap rac (yet)

## Context

MCP answers exactly one need for this project: **exposing the API's capabilities
over the internet to remote agents.** Locally there is nothing to add — the agent
runs the `rac` CLI directly against the repo (and the CLI is already always-fresh).
MCP earns its place *only* as the network transport for remote exposure (an
Axis-2 / transport concern), not as a local tool.

The deciding question (`runtimecli-next-step.md`, "The one test"): **what would a
custom `rac`-wrapping MCP package add that fastmcp does not?**

## Decision

**Use existing fastmcp directly; do NOT ship a custom MCP companion** for plain
remote exposure. fastmcp generates an MCP server from any OpenAPI spec
(`OpenAPIProvider`, v3.0.0+), collapses it with `CodeMode` (search/execute
meta-tools + sandbox, so the catalog isn't dumped), and serves over HTTP with
native OAuth. That *is* the transport layer. Point **fastmcp + CodeMode** at the
project's `/openapi.json` and deploy. Treat it as a partner — exactly what the
PARTNERS doctrine already says ("expose via a transport, e.g. fastmcp"), the same
sibling relationship as hey-api.

## Rationale

- **A custom wrapper would be a thin layer over fastmcp** — the anti-pattern the
  deciding question exists to catch. fastmcp already does spec→MCP + CodeMode +
  OAuth + HTTP.
- **The remote surface is a *call* surface, not a *verify* surface.** Third-party
  consumers want to invoke the API; conformance is the provider's concern. So the
  `fire_and_conform` inversion — `rac`'s differentiator — is not what a remote
  exposure surface needs.
- **Verification stays local.** `conform` is served by the CLI in the dev loop,
  where the spec changes constantly and the always-fresh re-read matters. A
  deployed API's spec is stable between deploys, so per-call freshness adds little
  remotely (a refresh/restart on deploy covers it).
- **fastmcp's own guidance:** naive OpenAPI→MCP underperforms for complex APIs
  ("Stop Converting Your REST APIs to MCP"); the fix is curation + CodeMode —
  still fastmcp, no custom package.

## Alternatives considered

- **Earlier decision — a custom PyPI companion wrapping `rac` with
  `fire_and_conform` over MCP** — superseded. It only re-earns its place if the
  goal becomes a deliberate **verified agent gateway**: remote access that *also*
  reconciles observed-vs-declared. That is a more ambitious product than plain
  exposure. The `examples/mcp` spike (`worktree-agent-afeb…`, kept) is the
  reference seed if that path is ever taken.
- **Port the diff engine to Python** — rejected (two sources of truth).
- **A TS MCP framework over the engine** — rejected (rebuilds what fastmcp gives
  free, including CodeMode).

## Status

**Decided: route to fastmcp directly; ship no `rac` MCP package.** The
remote-exposure need is met by fastmcp + CodeMode + OAuth on the spec; `rac`'s job
is the local verify loop plus the doctrine that routes here. Revisit only if a
verified-gateway product becomes a deliberate goal.

> _Author's note: the inversion (`fire_and_conform`) was a real idea worth probing
> — record whether you still want it as a future "verified gateway," or consider it
> closed in favor of "rac local + fastmcp remote."_
