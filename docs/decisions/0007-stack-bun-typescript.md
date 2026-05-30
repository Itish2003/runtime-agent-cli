# 0007 — Stack: Bun + TypeScript, ship raw `.ts`, harden later

## Context

An agent may run many sequential verification calls; per-process cold start is a
real bottleneck. The original ideation flagged Node's startup cost and floated
Go/Rust for sub-10ms binaries (`agentcli.md` lines 645–658). The team's expertise
is TypeScript.

## Decision

Build on **Bun + TypeScript.** Ship raw `.ts` executed via `bunx` as the primary
distribution; a `bun build --compile` standalone binary is optional, not the
primary path (PRD §11.2, §11.6). Harden over time with `tsc --noEmit` typecheck,
`bun test`, CI gates, pinned tooling, and schema typing.

## Rationale

- **Cold start.** Bun starts in ~8–15ms (Bun startup ~30ms in the assessment's
  measurements) vs Node's ~40–120ms for a bare process — the often-cited
  150–300ms is *serverless* cold start, not `node` itself (PRD §11.6). The
  assessment measures the full per-call time at sub-100ms, dominated by spec
  fetch/parse (assessment "Speed").
- **No build step in dev** — native TS; `bun build --compile` cross-compiles to
  `bun-{linux,darwin,windows}-{x64,arm64}` from one host, verified before
  committing (PRD §11.6).
- **Stay in the team's language** rather than adopt Go/Rust (`agentcli.md` lines
  645–658).
- **Hardening was layered in after V1, not up front** (git log): typecheck + test
  CI gates and pinned tooling (`843cd9a`), schema typing via `openapi-types` while
  the parse boundary stays `any` (`1978805`), three verified behavioral bug fixes
  (`1b9f759`), P0 suite + fixture corpus (`f0a8eb6`).

## Alternatives considered

- **Go / Rust** — faster cold start and single-binary distribution, but off the
  team's stack; Bun closes most of the startup gap while keeping TS
  (`agentcli.md` lines 645–658; PRD §11.6).
- **Node** — rejected: slower cold start, needs a build step for TS (PRD §11.6).
- **Compiled binary as the primary distribution** — kept optional: devs distrust
  global tooling and the tool is project-coupled, so `bunx`/devDependency is the
  primary path (PRD §11.2). Note the compiled binary cannot carry an optional
  peer dep, so `rac sdk` is an npm-distribution-only feature
  (`runtimecli-next-step.md` "Caveat — the compiled binary").

## Status

**Implemented.** `package.json`: `engines.bun >=1.0.0`, `bin` exposes both
`runtime-agent-cli` and `rac`, scripts for `typecheck` (`tsc --noEmit`) and
`test` (`bun test`), `typescript ~6.0.3` pinned.
