# 0005 — Parser: `@readme/openapi-parser` for OpenAPI 3.1

## Context

Dereferencing `$ref` and validating the spec is the deterministic core
([ADR 0004](./0004-division-of-labor.md)) — the tool consumes a parser library,
it does not write one (PRD §6). The target is modern frameworks: FastAPI emits
OpenAPI **3.1** (since v0.99.0, Jun 2023; JSON Schema 2020-12), so 3.1 support is
non-negotiable; 3.0 must work and 2.0 is best-effort only (PRD §10).

## Decision

Use **`@readme/openapi-parser`** (`^6.1.1` in `package.json`) for parse +
dereference + validate.

## Rationale

- **Decided by a spike, not by docs (PRD §10).** The spike ran both
  `@readme/openapi-parser` 6.1.1 and `@apidevtools/swagger-parser` 12.1.0 against
  a basic 3.1 spec under Bun 1.3.14. **Both** dereferenced *and* validated — the
  latter contradicting its own stale README, which still claims 3.0-only. The
  probe overrode the documentation.
- `@readme/openapi-parser` was chosen anyway because it is the only one that
  *officially* commits to 3.1, making it the safer bet for the exotic 2020-12
  constructs the spike did not exercise (`prefixItems`, `if`/`then`/`else`,
  `$dynamicRef`, webhooks) (PRD §10).
- This honors the principle that an isolated repro outranks documentation, while
  still hedging toward the vendor that contractually owns 3.1.

## Alternatives considered

- **`@apidevtools/swagger-parser`** — passed the spike but no official 3.1
  commitment; riskier on unexercised 2020-12 edge cases (PRD §10).
- **Hand-roll a parser / offload parsing to the LLM** — rejected: out of scope and
  re-introduces probabilistic `$ref` resolution ([ADR 0004](./0004-division-of-labor.md)).

## Status

**Implemented.** `@readme/openapi-parser ^6.1.1` is a dependency in
`package.json`. The recommendation in the PRD is to keep a 3.1 regression spike
and extend it as real specs surface edge cases.

> _Author's note: any 3.1 edge case that has actually bitten in practice since?_
