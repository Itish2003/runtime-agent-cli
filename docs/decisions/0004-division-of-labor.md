# 0004 — Division of labor: deterministic mechanics = tool, judgment = LLM

## Context

The product sits between an LLM and an HTTP API. Some work LLMs do well
(judgment) and some they do unreliably (deterministic mechanics). Putting the
wrong work on the wrong side is the failure mode the product exists to fix.

## Decision

Draw one line and let nothing bleed across it (PRD §6):

- **Tool (deterministic):** fetch the spec, dereference `$ref`, slice to the
  relevant operation, construct the HTTP request, diff observed-vs-declared.
- **LLM (judgment):** what to test, what payload, is the response correct, what
  to probe next.

## Rationale

- **You can't fight LLM unreliability with more LLM.** Offloading parsing to the
  model forces the whole raw spec into context (the MCP bloat the tool exists to
  kill) and makes `$ref` resolution probabilistic (the hallucination it exists to
  kill) (PRD §6).
- The interface follows the same split (PRD §6b): strategic "how" (which command,
  when, what to probe) is the agent's judgment, taught by `guide`; tactical "how"
  (the exact syntax of one call) is rigid and deterministic, so the agent never
  guesses `--input` vs `--payload` or escapes nested JSON wrong.
- The payoff: **discovery emits its own invocation.** `inspect <op>` can return a
  type-correct skeleton + ready-to-fill `run` template *only because* the tool
  holds the dereferenced schema (PRD §6b). This is the proof of the deterministic
  parse, not a contradiction of it.
- The assessment confirms the line is held in the shipped code: "Nothing bleeds
  across that line" (assessment "What's strong").

## Alternatives considered

- **Let the LLM parse the raw spec** — rejected: context bloat + probabilistic
  `$ref` resolution (PRD §6).
- **Over-prescribe the strategy** (script the agent's probing sequence) — rejected:
  strategy is judgment; `guide` teaches the mental model and the agent composes
  (PRD §6b).

## Status

**Implemented.** Realized across `src/lib/load.ts` (parse/catalog), `inspect`,
`run`, and `src/lib/diff.ts` (assessment "What's strong").
