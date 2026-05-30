# 0012 — Safety model: config-level fencing, not an embedded sandbox

## Context

`rac` fires real HTTP requests at the user's backend with their tokens. It needs
a safety model — but it runs inside an agent that already has code execution, so
the question is *what kind* of safety (PRD §6, §8).

## Decision

Safety is **config-level fencing**, not an embedded sandbox (PRD §8):

- **Environment fencing** — must name an env (`local`/`staging`); no silent
  default to whatever `base_url` is.
- **Read-only by default** — `GET`/`HEAD` only unless `--allow-writes`.
- **Destructive-verb guard** — `DELETE`/`PUT` require an explicit unlock.
- **`--dry-run`** — print the fully-resolved request (secrets redacted), send
  nothing, so the agent can self-verify the constructed call.
- **Secrets resolved at runtime** — config references `${env:API_TOKEN}` /
  keychain; the agent authenticates without ever seeing the secret; redacted in
  all output.

## Rationale

- **No embedded sandbox.** The host agent already has code execution; embedding
  one fights "lightweight" and only contains *code*, not *consequences* — the
  consequence here is an HTTP side effect on a real backend, which a code sandbox
  doesn't fence (PRD §6).
- **Make the disciplined path the default.** Safe-by-default is tenet 5, and the
  enforcement-in-ergonomics rule means defaults must gate the dangerous path
  ([ADR 0003](./0003-doctrine-as-product.md); PRD §4, §8).
- **The agent authenticates without seeing the secret** — runtime resolution +
  redaction is part of why the CLI/JSON envelope is the only surface
  ([ADR 0006](./0006-language-neutral-core.md); PRD §8).
- **`--dry-run` precedes the live call by design** — it is the pure, deterministic,
  network-free core, unit-testable with no server (PRD §12 P3).

## Alternatives considered

- **Embedded code sandbox** — rejected: contains code, not the HTTP consequence;
  fights lightweight (PRD §6).
- **Default to writes / silent base_url** — rejected: violates safe-by-default;
  an agent could mutate the wrong environment (PRD §8).
- **Pass secrets as plain args** — rejected: leaks tokens into output and history;
  runtime resolution + redaction instead (PRD §8).

## Status

**Implemented.** Realized in `run`/`conform` (read-only default, verb guard,
`--dry-run`, env fencing) and the config loader's `${env:VAR}` resolution; the P4
gate is "DELETE blocked without the flag; server-down returns clean JSON"
(PRD §12 P4). Dynamic auth / token-capture vault remains a separate open item
(assessment "What's weak", §5).
