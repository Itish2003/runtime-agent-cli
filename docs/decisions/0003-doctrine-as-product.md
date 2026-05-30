# 0003 — The doctrine is the product; enforce it in the ergonomics

## Context

The binary is a thin, cloneable primitive — a contract-aware HTTP caller plus a
diff. A wrapper alone is not defensible. The PRD's claim: tools win on point of
view (rspec, Playwright, pytest), not on the wrapper, so the defensible asset is
the **shipped methodology** (PRD §3, "Mechanism vs. doctrine (the moat)").

## Decision

Ship a five-tenet **doctrine** as the actual product, kept in one place
(`src/doctrine.ts` as `TENETS` / `WORKFLOW` / `HINTS`) and surfaced two ways:
advisory (via the skill and `rac guide`) and enforced (via the binary's
defaults). Design rule: **doctrine in the prose, enforcement in the ergonomics**
(PRD §4).

The five tenets (PRD §4; `src/doctrine.ts`):
1. The running server is the fact; the source is a hypothesis.
2. Observe before you assert.
3. Reconcile the two truths (`conform`).
4. Stress, don't confirm.
5. Safe by default.

## Rationale

- **A skill is advisory and agents drift under context pressure.** So the
  disciplined path must be the path of least resistance: `inspect` emits a
  ready-to-fill `run` template, errors return the doctrine + the correct shape
  rather than `"invalid argument"`, and destructive verbs are gated (PRD §4, §6b).
- The "WHY" — the self-confirming-test loop where assertion and implementation
  share a belief, so a green test proves nothing — is the problem statement the
  doctrine answers (PRD §2). (Note: this rationale lives in the PRD's problem
  section, not in `doctrine.ts`, which holds the tenets/workflow/hints.)
- The pedagogical-error and in-band-guide mechanisms are *more reliable* than the
  out-of-band skill, which is forgettable under context pressure (PRD §6b).

## Alternatives considered

- **Be a test framework** (bake assertions into the binary) — non-goal: the
  doctrine lives in the skill/guide, not as enforced test logic; `--batch` stays
  dumb and never grows assertions (PRD §10 Non-goals, §11.4).
- **Ship only a manifesto/README** — rejected: advisory-only drifts; enforcement
  in defaults is what makes it stick (PRD §4).

## Status

**Implemented.** `src/doctrine.ts` is the single source; `guide` ships it in-band;
error envelopes reuse `HINTS`. The assessment confirms "the doctrine-as-moat
thesis holds" (assessment "What's strong").
