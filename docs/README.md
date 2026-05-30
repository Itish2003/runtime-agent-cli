# Design docs

This directory captures the **design rationale** of `runtime-agent-cli` (`rac`): how
it came to be, what decisions were taken, what was considered and rejected, and
why. It is the "why," not the "how-to" — for usage, see the root `README.md` and
`rac guide`.

## How to read these

- **[`design-journal.md`](./design-journal.md)** — the narrative. How the idea
  evolved from a generic "OpenAPI → CLI" PRD into a *runtime-truth verification
  instrument with a shipped doctrine*. Read this first for context; it links out
  to the individual decisions.
- **[`decisions/`](./decisions/)** — ADR-style records, one decision per file,
  numbered. Each follows **Context / Decision / Rationale / Alternatives
  considered / Status**. Read these when you want the precise reasoning (and the
  evidence) behind one specific choice.

## A note on voice and honesty

These docs are an **evidence-grounded scaffold**. Every load-bearing claim cites
its source — a section of the PRD, the assessment, the ideation dialogue, or a
file in `src/`. They are written in a neutral, factual voice.

Where the author's personal motivation or reflection belongs, there is an
explicit placeholder:

> _Author's note: …_

These are intentionally empty for the author to fill in. Do not treat them as
written; do not invent the author's voice around them.

Anything genuinely undecided is marked **Open** in the relevant ADR's Status.

## Source documents

The rationale here is grounded in four planning documents (kept outside the repo)
plus the code and git history:

| Source | What it is |
|---|---|
| `runtimecli-prd.md` | The PRD — thesis, doctrine, architecture, scope, resolved open questions. |
| `runtimecli-assessment.md` | Post-V1 competitive assessment, measured performance, gap analysis. |
| `agentcli.md` | The long ideation dialogue — origin of the idea, the hey-api analysis, MCP-as-V2. |
| `runtimecli-next-step.md` | Strategy memo — the CodeMode inversion, two-shapes packaging, language-neutral principle. |

## Index of decisions

| ADR | Title | Status |
|---|---|---|
| [0001](./decisions/0001-always-fresh-spec-reread.md) | Always-fresh spec re-read on every invocation | Implemented |
| [0002](./decisions/0002-runtime-truth-thesis.md) | Thesis: a runtime-truth instrument, not a code reader | Implemented |
| [0003](./decisions/0003-doctrine-as-product.md) | The doctrine is the product; enforce it in the ergonomics | Implemented |
| [0004](./decisions/0004-division-of-labor.md) | Division of labor: deterministic mechanics = tool, judgment = LLM | Implemented |
| [0005](./decisions/0005-parser-choice.md) | Parser: `@readme/openapi-parser` for OpenAPI 3.1 | Implemented |
| [0006](./decisions/0006-language-neutral-core.md) | Language/framework-neutral core; CLI + JSON envelope is the only public surface | Implemented |
| [0007](./decisions/0007-stack-bun-typescript.md) | Stack: Bun + TypeScript, ship raw `.ts`, harden later | Implemented |
| [0008](./decisions/0008-heyapi-sibling-not-feature.md) | hey-api is a sibling, not a feature; codegen is a non-goal | Implemented (as a non-goal) |
| [0009](./decisions/0009-mcp-codemode-inversion.md) | MCP/CodeMode via an inverted primitive (`fire_and_conform`) | Open |
| [0010](./decisions/0010-optional-addons-two-shapes.md) | Optional add-ons have two shapes (inward peer / outward wrapper) | Open |
| [0011](./decisions/0011-search-scoring.md) | Search: a hand-rolled field-aware lexical scorer (not MiniSearch, not literal BM25) | In progress |
| [0012](./decisions/0012-safety-model-config-not-sandbox.md) | Safety model: config-level fencing, not an embedded sandbox | Implemented |
