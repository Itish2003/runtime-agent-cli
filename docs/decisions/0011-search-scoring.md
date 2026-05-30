# 0011 — Search: a hand-rolled field-aware lexical scorer (not MiniSearch, not literal BM25)

## Context

`search` is the discovery-at-scale command: it must return the relevant subset
of operations without dumping the catalog, which is the entire token-efficiency
thesis (PRD §12 P2). The assessment names search ranking as the **most impactful
gap** (assessment "What's weak", §1): on fable2.0 (3 ops) or Petstore (19 ops)
ranking is invisible, but on Stripe (587 ops) or GitHub (1,186 ops) wrong ranking
means the agent inspects the wrong operation and the token-efficiency argument
breaks.

The PRD originally specified "BM25 over operationId/path/summary/tags"
(PRD §7, §12 P2).

## Decision

Improve `search` as a **hand-rolled field-aware lexical scorer**: IDF weighting +
field boosts + a deterministic tie-break. Explicitly **not** MiniSearch (a
dependency) and **not** literal BM25.

## Rationale

- **It fixes a real determinism defect.** The current scorer
  (`src/commands/search.ts`) sorts by score with `sort((a, b) => b.s - a.s)` and
  no secondary key — so equal-scoring operations have implementation-defined
  order. A non-deterministic `search` undermines a tool agents are supposed to
  trust. A deterministic tie-break closes this.
- **Zero added dependencies** — keeps the five-dep core
  ([ADR 0006](./0006-language-neutral-core.md)); a hand-rolled scorer adds none,
  unlike MiniSearch.
- **Fits always-fresh** — the index is rebuilt per invocation from the freshly
  re-read spec ([ADR 0001](./0001-always-fresh-spec-reread.md)); a lightweight
  scorer keeps that cheap, whereas a heavy index would fight the per-call cost.
- **IDF over literal BM25** — IDF down-weights terms common across the catalog
  (e.g. "get", "id") without BM25's full length-normalization machinery, which is
  overkill for short operationId/summary/path/tag fields.

## Alternatives considered

- **MiniSearch** — rejected: a runtime dependency, against the zero-dep core.
- **Literal BM25** (as the PRD first wrote) — narrowed: full BM25 length
  normalization is unnecessary for these short fields; IDF + field boosts captures
  the relevance win at lower complexity.
- **Keep the current naive scorer** — rejected: substring field boosts (3/2/2/1)
  with no IDF and no tie-break mis-rank on large specs and are non-deterministic
  on ties (`src/commands/search.ts`).

## Status

**In progress — direction decided, not yet landed.** The shipped
`src/commands/search.ts` is still the naive version: plain `includes()` field
boosts (operationId 3, summary 2, path 2, tags 1), **no IDF**, **no deterministic
tie-break**, with the in-code comment "BM25 is the eventual upgrade." The
determinism defect this ADR resolves is therefore still live in the code as of
this writing.

> _Author's note: confirm the final scorer shape once it lands — IDF formula,
> field weights, and the exact tie-break key (e.g. operationId lexical)._
