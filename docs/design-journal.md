# Design journal

A narrative of how `runtime-agent-cli` (`rac`) came to be — organized by phase,
grounded in the planning documents and the git history. For the precise reasoning
behind any single decision, follow the links into [`decisions/`](./decisions/).

> _Author's note: the personal "why I started this" — what frustration with my own
> agent loops kicked it off — goes here._

---

## Phase 0 — The generic idea, and the pivot away from it

The first draft (in `agentcli.md`, the opening "PRD — RuntimeCLI") framed the
product as a **dynamic CLI projection** of an OpenAPI spec: read `openapi.json`,
synthesize a semantic command tree (`api users create`), hot-reload on spec
changes (`agentcli.md` §8.2–8.3). That framing is generic — it is roughly what
Restish already does for humans (`agentcli.md` lines 735–742).

Two things in the ideation dialogue moved it off that generic track:

1. **The daemon-vs-stateless question.** The original flow implied a
   `runtimecli dev` watcher plus a thin client. The reviewer pushed for the
   stateless fast binary instead — "hot reloading just becomes always reading the
   latest disk state" (`agentcli.md` lines 606–614). This is the seed of the
   always-fresh re-read → [ADR 0001](./decisions/0001-always-fresh-spec-reread.md).
2. **The real failure mode.** The dialogue surfaced the actual pain: an agent
   hand-builds a `curl`, forgets `Content-Type`, the request fails, and the agent
   *concludes its own backend code is broken and deletes good work*
   (`agentcli.md` lines 750–765). The product is not "a nicer CLI" — it is a
   **reliable bridge between the AI that writes code and the AI that tests it.**

The consolidated PRD (`runtimecli-prd.md`) then re-anchored the whole thing on a
sharper thesis → [ADR 0002](./decisions/0002-runtime-truth-thesis.md).

> _Author's note: which of these reframings felt like the real unlock — and why._

---

## Phase 1 — The thesis: verify runtime fact, not source hypothesis

The PRD's one-line definition: *a dev-time, repo-local CLI that reflects your live
API as a discoverable, executable surface for AI agents — so the agent verifies
backend work against what the server actually does, not what it assumes the code
does* (PRD §1).

The mental model is **`vite dev` / `tsc --watch`, not an SDK or a gateway** (PRD §1)
— stateless, on-demand, always-fresh. The PRD sharpens the problem into four named
failure modes (PRD §2): confirmation-bias tests, fragile curl, source ≠ runtime,
and laggy MCP refresh.

A notable honesty beat: the PRD corrects an earlier blanket claim that "MCP can't
hot-reload." MCP *does* define `notifications/tools/list_changed`; the real,
verified problem is uneven client support (Claude Code refreshes across turns
only; Cursor ignores it) (PRD §2, §5). The differentiator is therefore
"always-fresh **by construction**," not "MCP is incapable."

See [ADR 0002](./decisions/0002-runtime-truth-thesis.md).

---

## Phase 2 — The doctrine becomes the product

The most consequential conceptual move: the binary is a thin, cloneable primitive,
so **the defensible asset is the shipped methodology** — a point of view on how
reliable agentic verification is done (PRD §3, "Mechanism vs. doctrine (the
moat)"). Tools win on POV (rspec, Playwright, pytest), not on the wrapper.

The doctrine is five tenets (PRD §4), and they live in code at
`src/doctrine.ts` as `TENETS` / `WORKFLOW` / `HINTS`:

1. The running server is the fact; the source is a hypothesis.
2. Observe before you assert.
3. Reconcile the two truths (`conform`).
4. Stress, don't confirm.
5. Safe by default.

The design rule that makes this more than a manifesto: **doctrine in the prose,
enforcement in the ergonomics** (PRD §4). A skill is advisory and agents drift, so
the binary's *defaults* must make the disciplined path the path of least
resistance — `inspect` emits a ready-to-fill `run` template, errors teach the
correct shape, destructive verbs are gated.

The "WHY" behind the doctrine — the self-confirming-test loop where assertion and
implementation come from the same belief, so the test passes and proves nothing —
is stated in the PRD's problem section (PRD §2, "Confirmation-bias tests"), not in
`doctrine.ts`. See [ADR 0003](./decisions/0003-doctrine-as-product.md).

> _Author's note: the doctrine is the part of this project that's most "mine."
> Say what you actually believe about agentic verification here._

---

## Phase 3 — The load-bearing engineering principle: division of labor

Everything mechanical that LLMs do unreliably (fetch spec, dereference `$ref`,
slice to one operation, construct the request, diff observed-vs-declared) is the
**tool's** job; everything that is judgment (what to test, what payload, is the
response correct, what to probe next) is the **LLM's** job (PRD §6).

The reasoning is explicitly anti-circular: you cannot fight LLM unreliability with
more LLM. Offloading parsing to the model forces the whole raw spec into context
(the MCP bloat the tool exists to kill) and makes `$ref` resolution probabilistic
(the hallucination it exists to kill) (PRD §6).

This principle has a direct payoff in the interface: discovery *emits its own
invocation*. `inspect <op>` returns the resolved schema **plus** a type-correct
example skeleton and a ready-to-fill `run` template — which is only possible
*because* the tool holds the dereferenced schema (PRD §6b). It is the proof of the
parse decision, not a contradiction of it.

See [ADR 0004](./decisions/0004-division-of-labor.md) and, for the parser that
makes the deterministic half possible, [ADR 0005](./decisions/0005-parser-choice.md).

---

## Phase 4 — Stack and parser, de-risked empirically

The stack is **Bun + TypeScript**, chosen for fast cold start, native TS (no build
step in dev), and `bun build --compile` to a single binary (PRD §11.6). Cross-
compile was verified before committing.

The parser decision is a good example of *probe over docs*: the spike ran both
`@readme/openapi-parser` and `@apidevtools/swagger-parser` against a 3.1 spec under
Bun. **Both** dereferenced and validated — the latter contradicting its own stale
README that still claims 3.0-only. `@readme/openapi-parser` was chosen anyway,
because it is the only one that *officially* commits to 3.1, making it the safer
bet for exotic 2020-12 constructs the spike didn't exercise (PRD §10). This honors
the user's own rule: an isolated repro result outranks documentation.

See [ADR 0005](./decisions/0005-parser-choice.md) and
[ADR 0007](./decisions/0007-stack-bun-typescript.md).

> _Author's note: how the spike felt — was the `@apidevtools` README contradiction
> a surprise? Did it change how you trust docs?_

---

## Phase 5 — Building V1, then over-delivering it

The build sequence (PRD §12) is ordered by hard dependency, each phase ending in a
runnable Gate: P0 scaffold + JSON envelope, P1 spec load + `inspect`, P2 `search`,
P3 request construction + `--dry-run` (offline, unit-testable), P4 live `run` +
safety guards, P5 `--batch`, P6 `init` + `guide`. **V1 was meant to ship at P6.**

The git history shows it went further. The PRD put `conform` (the observed-vs-
declared diff) firmly in "Later / likely V2" (PRD §7, §10). It shipped in V1
anyway, with `doctor`, in commit `76a700a` ("feat: add doctor and conform
commands"). The assessment confirms `conform` is implemented and validates the full
contract with ajv — `oneOf`/`anyOf`/`allOf`, formats, `additionalProperties`,
3.0 `nullable`, and recursive schemas with explicit FAIL-on-truncation rather than
a silent false PASS (assessment "What's strong").

This is the cleanest evolution beat in the project: the *flagship reliability
feature* arrived a version early because it is the tenet-#3 differentiator that
nothing else in the market offers (assessment "Competitive positioning").

> _Author's note: why pull `conform` forward into V1 instead of holding it for V2?_

---

## Phase 6 — Hardening

After the first release, the project added engineering rigor without changing
scope (git log): a `tsc --noEmit` typecheck + `bun test` + CI gates (`843cd9a`),
schema typing via `openapi-types` while keeping the parse boundary `any`
(`1978805`), three verified behavioral bug fixes (`1b9f759`), and a P0 test suite +
fixture corpus (`f0a8eb6`). The pinned `typescript` and `@types/bun` in
`package.json` are part of the same hardening.

See [ADR 0007](./decisions/0007-stack-bun-typescript.md) for the typecheck/test
gating rationale.

---

## Phase 7 — The forward edges (still being decided)

Three threads are deliberately *not* in the core, and each has its own ADR:

- **hey-api is a sibling, not a feature.** Both consume the same spec; `rac`
  verifies, hey-api generates the client. Codegen stays a non-goal. A `rac sdk`
  subcommand wrapping hey-api was considered and rejected for purity
  ([ADR 0008](./decisions/0008-heyapi-sibling-not-feature.md)).
- **MCP is the remote transport — and it's fastmcp, not ours to build.** MCP earns
  its place *only* for exposing the API over the internet to remote agents; locally
  the `rac` CLI already wins, so there's nothing to add. And fastmcp already does
  the remote job directly — `OpenAPIProvider` + `CodeMode` + HTTP + OAuth turn a
  spec into a curated MCP surface — so a custom `rac`-wrapping companion would be a
  thin wrapper over it. An earlier idea (an inverted `fire_and_conform` primitive,
  execute + reconcile) was explored and **set aside**: a remote surface is a *call*
  surface, and verification is a local concern the CLI already serves. The decision
  is to **route to fastmcp directly** (a partner, like hey-api), reserving a
  custom wrap only for a future "verified agent gateway"
  ([ADR 0009](./decisions/0009-mcp-codemode-inversion.md)).
- **Two add-on shapes keep the core pure.** An inward npm peer (hey-api, TS) vs an
  outward wrapper (fastmcp, Python). The core gains zero runtime deps either way
  ([ADR 0010](./decisions/0010-optional-addons-two-shapes.md)).

And one in-flight improvement:

- **Search scoring.** The assessment names search ranking as the *most impactful
  gap* on large specs. The current `src/commands/search.ts` is the naive scorer
  (substring field boosts, no IDF, no deterministic tie-break). The decided
  direction is a hand-rolled field-aware lexical scorer (IDF + field boosts +
  deterministic tie-break) — explicitly **not** MiniSearch and **not** literal
  BM25. **Status: in progress** — direction decided, not yet landed
  ([ADR 0011](./decisions/0011-search-scoring.md)).

> _Author's note: of the open threads, which one are you most excited to build,
> and which are you least sure about?_

---

## Through-lines

A few principles recur across every phase and are worth naming on their own:

- **Always-fresh by construction** — re-read the live spec every invocation; no
  daemon, no cache, structurally cannot go stale (PRD §3;
  [ADR 0001](./decisions/0001-always-fresh-spec-reread.md)).
- **Deterministic mechanics vs. semantic judgment** — the line nothing bleeds
  across ([ADR 0004](./decisions/0004-division-of-labor.md)).
- **The CLI + JSON envelope is the only public integration surface** — what keeps
  the core language- and framework-neutral, so a Python or TS tool can wrap it
  without the core taking on a runtime ([ADR 0006](./decisions/0006-language-neutral-core.md)).
- **Probe over docs** — verify empirically before committing (the parser spike;
  the MCP-refresh correction).
- **Safe by default** — config-level fencing, not an embedded sandbox
  ([ADR 0012](./decisions/0012-safety-model-config-not-sandbox.md)).
