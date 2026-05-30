# 0002 — Thesis: a runtime-truth instrument, not a code reader

## Context

When an AI agent builds or touches a backend, it verifies its work badly
(PRD §2): it writes confirmation-bias tests (assertion and implementation from
the same belief, so the test passes and proves nothing); it hand-builds fragile
curl and, on failure, wrongly blames its own code and deletes good work
(`agentcli.md` lines 750–765); and it reads the route file, which tells it what
*should* happen but not whether the route is mounted, 500-ing on boot, or altered
by middleware (PRD §2).

## Decision

Position `rac` as a **runtime-truth instrument**: the source file is a
*hypothesis*; the running server is the *fact*; the tool reports the fact, and —
via `conform` — reconciles the observed behavior against the declared contract
(PRD §3).

## Rationale

- **The real competitor is "the agent just reads the source file," not curl or
  MCP.** The edge over that: only this tool sees the *running* behavior, and only
  this tool sees **both** the declared contract and the observed response and can
  reconcile them (PRD §3). Same reason a debugger beats re-reading code.
- The thesis is what makes the doctrine coherent: four of the five tenets
  (observe, reconcile, stress, safe) only mean something once you can execute and
  observe (PRD §11.1).
- It is honest about its central vulnerability: value ∝ spec quality × freshness,
  and legacy codebases are worst on both axes (PRD §9b). The product positions for
  modern/greenfield agentic dev (FastAPI/NestJS with a live spec) and uses
  `conform` as the legacy wedge — the one thing that can surface where a drifted
  spec lies.

## Alternatives considered

- **Generic "OpenAPI → semantic CLI" projection** (the original `agentcli.md`
  PRD) — subsumed: a nicer command tree alone is roughly Restish-for-agents and
  doesn't address the verification failure modes (`agentcli.md` lines 735–742).
- **Spec generation / inferring a spec from legacy code** — non-goal: kept out so
  the tool stays a projection over an authoritative spec; the agent can bootstrap
  a spec and `conform` keeps it honest (PRD §9b, §10 Non-goals).

## Status

**Implemented.** The assessment confirms the core thesis "holds up under
scrutiny" (assessment "Verdict").
