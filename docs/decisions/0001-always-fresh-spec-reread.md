# 0001 — Always-fresh spec re-read on every invocation

## Context

An AI agent in a rapid edit-verify loop needs the API surface it sees to match
the server it is about to hit. The competing mechanisms all go stale in that
loop: a generated SDK is frozen at build time; an MCP tool catalog refreshes
unevenly (Claude Code only across turns since v2.1.0, with startup-race gaps;
Cursor ignores `tools/list_changed` entirely) (PRD §2, §5). The original
ideation even proposed a `runtimecli dev` daemon + watcher (`agentcli.md` §8.3),
which the dialogue then argued against: managing a background daemon lifecycle
via an LLM is flaky, and "hot reloading just becomes always reading the latest
disk state" if the binary is fast enough (`agentcli.md` lines 606–614).

## Decision

`rac` is stateless and re-reads the live spec (live URL or static file) on
**every** invocation. No daemon, no persistent process, no spec cache.

## Rationale

- **Structurally cannot go stale.** Freshness is a property of the architecture,
  not of a refresh protocol that clients may or may not honor (PRD §3).
- **Zero standing context cost.** Nothing is injected into the agent's context
  until it asks (PRD §5).
- **No lifecycle to babysit.** No daemon for the agent to start, crash, or leave
  running (PRD §3; `agentcli.md` lines 606–614).
- The cost is paid back: the assessment measures the per-call hit at sub-100ms
  on a local server, dominated by spec fetch + `JSON.parse`, not tool code
  (assessment "Speed"). The assessment explicitly calls caching the spec a
  defeat of the purpose: "This is a feature, not an oversight."

## Alternatives considered

- **Daemon + thin client** (the original `runtimecli dev`) — rejected: flaky LLM
  lifecycle management; defeats "lightweight" (`agentcli.md` lines 606–614).
- **Cache the parsed spec across calls** — rejected: reintroduces exactly the
  staleness the product exists to eliminate (assessment "Speed").
- **Rely on MCP's `tools/list_changed`** — rejected as the core mechanism: client
  support is uneven, so it lags in the rapid loop (PRD §5).

## Status

**Implemented.** Stateless re-read is the load-bearing architectural property;
measured sub-100ms per call (assessment "Speed").
