# Test suite sketch — runtime-agent-cli

> Status: **sketch**. Corpus design + traceability table + representative stubs.
> Not the full suite. Runner: **`bun test`** (built-in, zero new dependency).

## 0. The core discipline: one test = one thought

A test is a **one-to-one mapping from an intention to an assertion**. The test
*name* is the thought; the body is the proof. We do not test "function X returns
Y" for its own sake — we test *claims the product makes about itself*. For this
codebase those claims are written down: the **three tenets** (PRD §3) and the
**§7 envelope contract** + **§6b doctrine**. So the suite is near-literally a
projection of the PRD onto assertions. If a test doesn't trace to a doctrine
claim or a contract, it's probably pinning an implementation detail — cut it.

## 1. Two levels of "type / age / quality" — they do different jobs

The phrase cuts two ways, and we use each deliberately:

| Level | What varies | What it drives |
|---|---|---|
| **rac itself** | young (v0.1.0), unproven, flagship still V2, some `any`, no prior tests | **Test *strategy*** |
| **rac's inputs** | the *codebases it ingests* — specs across version, age/freshness, quality | **Fixture *corpus* + degradation assertions** |

### 1a. rac-itself (young + unproven) → strategy
Young, churning code rewards **breadth over depth** and **boundaries over internals**:
- **Lock the stable boundary** — the §7 JSON envelope + the CLI surface — with
  black-box tests. They survive refactors of the (still-moving) internals.
- **Go deep only on the correctness core** — `spec.ts`, `schema.ts`, `diff.ts` —
  because that's where *silent wrongness* lives and our confidence is lowest.
- **Skip, for now**, exhaustive unit tests of churning glue (command wiring,
  `http` header-merge minutiae). A mature codebase would warrant those + mutation
  testing + coverage gates; an infant one shouldn't pay that tax yet.
- Shape is an **hourglass**, not a pyramid: fat on (a) pure-function core and
  (b) black-box CLI contract; thin on mid-layer mocking.

### 1b. rac-inputs (the spec spectrum) → corpus
PRD line 127: **value ∝ spec quality × freshness**; line 131: low-quality specs
must **degrade gracefully**. So the tool's central correctness claim *is*
"behaves correctly across the full spectrum of input codebases." The corpus must
span that spectrum, and each fixture exists to stress **specific** claims — not
a full cross-product.

## 2. Fixture corpus (`test/fixtures/specs/`)

Sparse and curated. Each fixture is one coordinate in (version × age × quality):

| Fixture | Coordinate (type / age / quality) | Exists to stress |
|---|---|---|
| `clean-3.1.json` (FastAPI-style: operationIds, summaries, examples, `$ref`s) | modern / fresh / high | happy-path PASS; 3.1 regression (the dropped parser-31 spike, PRD 148); inspect skeleton from `example`s |
| `clean-3.0.json` | modern / fresh / high | 3.0 coverage; `nullable` handling |
| `swagger-2.0.json` (`in: body` param) | legacy / old / mixed | best-effort 2.0; body-param → `requestBody` lift |
| `low-quality-3.0.json` (no operationIds, no summaries) | any / legacy / **low** | **graceful degradation** (the centerpiece) |
| `partial-broken-3.1.json` (one malformed op among valid ones) | any / any / degraded | lenient parse — good ops survive, no whole-spec discard |
| `cyclic-3.1.json` (self-referential schema) | modern / fresh / high | `diff` cyclePaths soundness; `skeleton`/`summarize` termination |
| *(generated in-test)* | — | **freshness**: mutate between two reads (see TS-08) |

## 3. Traceability table — the thought ↔ test ↔ coordinate map

This table **is** the "one-to-one thought mapping." Every row: one doctrine
claim, the input coordinate where it discriminates, the assertion, priority.

| # | Thought (doctrine claim) | Source | Fixture (coordinate) | Assertion | Layer · Pri |
|---|---|---|---|---|---|
| TS-01 | Observed response matching the declared contract → trustworthy | Tenet 3 / §7 | clean-3.1 | `diffResponse(200, validBody, op).verdict === "PASS"` | diff · **P0** |
| TS-02 | A mismatch is *surfaced as a bug*, with path + code | Tenet 3 | clean-3.1 | missing required field → `verdict "FAIL"`, mismatch `code SCHEMA_VIOLATION`, `path` set | diff · **P0** |
| TS-03 | The checker never *lies*: a schema it had to truncate can't yield a false PASS | diff.ts:216 soundness | cyclic-3.1 | truncated (cyclePaths set) → `verdict "FAIL"`, never silent PASS | diff · **P0** |
| TS-04 | Reconcile handles status resolution: exact → 2XX range → default | diff `findDeclaredResponse` | clean-3.0 | 201 matches a declared `2XX`; undeclared status → `STATUS_NOT_DECLARED` | diff · P1 |
| TS-05 | Parse leniently: one bad field never discards the whole spec | PRD §6 "degrade gracefully" | partial-broken-3.1 | `loadCatalog` returns the valid ops; does not throw | spec · **P0** |
| TS-06 | **Graceful degradation by quality**: low-quality spec → inspect works structurally, search weakens | **PRD 131** (quality axis) | low-quality-3.0 | ops exist via `synthId`; `inspect` yields a payload; `search "<summary-word>"` returns fewer/empty but **does not crash** | spec+cmd · **P0 (centerpiece)** |
| TS-07 | Version coverage: 2.0 `in: body` lifts to 3.x `requestBody` | PRD 148 (type axis) | swagger-2.0 | `op.requestBody` is present + has schema | spec · P1 |
| TS-08 | **Structurally cannot go stale**: a spec edited between calls is reflected | assessment line 20 (age axis) | generated tmp | write ops `[alpha]` → read sees alpha; rewrite `[beta]` → second read sees **beta, not alpha** | spec · **P0** |
| TS-09 | 3.1 regression (resurrected spike): exotic 3.1 dereferences cleanly | PRD 148 | clean-3.1 | `loadCatalog` resolves all `$ref`s (none remain in catalog) | spec · P1 |
| TS-10 | §7: every command emits exactly one valid envelope | §7 | fixture-project | stdout parses as one JSON; has `ok:boolean`; if `ok:false` then `error`+`message` present | cmd · **P0** |
| TS-11 | §6b mech.2: a wrong call returns the doctrine + correct shape (a `hint`) | §6b | fixture-project | error envelope carries non-empty `hint` | cmd · **P0** |
| TS-12 | Safety default: non-GET/HEAD blocked without `--allow-writes` | §8 | fixture-project | `run <writeOp>` → `error WRITE_BLOCKED`, **exit code 1** | cmd · **P0** |
| TS-13 | Secret fencing: `--dry-run` redacts `${env:}` values, sends nothing | §6b/§8 | fixture-project + env | dry-run header value === `"***"`; no network call made | http/cfg · P1 |
| TS-14 | `skeleton` terminates + never throws on a cyclic schema | schema.ts guards | cyclic-3.1 | returns within depth bound; no stack overflow / throw | schema · P1 |

P0 = write first (the correctness core + the contract that defends the thesis).

## 4. Representative stubs (real APIs — `loadCatalog`, `diffResponse`, the CLI)

### TS-06 — graceful degradation (centerpiece; the *quality* axis)
```ts
import { test, expect } from "bun:test";
import { loadCatalog } from "../src/spec.ts";

test("TS-06 low-quality spec: inspect-path survives, search degrades, nothing crashes", async () => {
  const cat = await loadCatalog("test/fixtures/specs/low-quality-3.0.json");

  // Structural capability is preserved: ops exist (via synthId), so inspect/run still work.
  expect(cat.operations.length).toBeGreaterThan(0);
  expect(cat.operations[0].operationId).toMatch(/^(get|post|put|delete|patch)_/); // synthId shape

  // Relevance degrades — but does not error. (search over absent summaries just matches less.)
  // Asserted at the command layer in the black-box suite; here we pin the parse precondition.
});
```

### TS-08 — "structurally cannot go stale" (the *age/freshness* axis)
```ts
import { test, expect } from "bun:test";
import { loadCatalog } from "../src/spec.ts";

const spec = (ids: string[]) => JSON.stringify({
  openapi: "3.1.0", info: { title: "t", version: "1" },
  paths: Object.fromEntries(ids.map((id) => [`/${id}`, { get: { operationId: id, responses: { "200": { description: "ok" } } } }])),
});

test("TS-08 re-read on every call reflects a spec edited between invocations", async () => {
  const p = "test/fixtures/.tmp-stale.json";
  await Bun.write(p, spec(["alpha"]));
  expect((await loadCatalog(p)).byId.has("alpha")).toBe(true);

  await Bun.write(p, spec(["beta"]));          // the API changed under us
  const second = await loadCatalog(p);
  expect(second.byId.has("beta")).toBe(true);  // fresh truth
  expect(second.byId.has("alpha")).toBe(false); // no stale cache — the competitive thesis
  await Bun.file(p).unlink();
});
```

### TS-12 — §7 envelope + safety default (black-box; rac-itself *strategy*)
```ts
import { test, expect } from "bun:test";

async function rac(args: string[], cwd: string) {
  const proc = Bun.spawn(["bun", "run", `${import.meta.dir}/../src/cli.ts`, ...args], { cwd, stdout: "pipe" });
  const json = JSON.parse(await new Response(proc.stdout).text());
  return { json, code: await proc.exited };
}

test("TS-12 write op without --allow-writes → WRITE_BLOCKED envelope + exit 1 + a hint", async () => {
  const { json, code } = await rac(["run", "createUser"], "test/fixtures/project");
  expect(json.ok).toBe(false);
  expect(json.error).toBe("WRITE_BLOCKED");
  expect(json.hint).toBeTruthy();   // §6b mechanism 2: errors teach
  expect(code).toBe(1);
});
```

## 5. Explicitly NOT in scope yet (young-codebase discipline)
Deliberate omissions, to revisit when the API stabilizes / flagship ships:
- Exhaustive unit tests of command wiring and `http` header-merge edge cases.
- Mutation testing, coverage gates, perf regression budget (assessment cites a
  <100ms ceiling — a *future* benchmark test, once behavior is locked).
- Live-network integration (kept out; `fire()` is exercised via fakes + dry-run).

## 6. Next step
Scaffold `test/fixtures/specs/*` + `test/fixtures/project/` and implement the P0
rows (TS-01/02/03/05/06/08/10/11/12) — the correctness core + the contract that
defends the product thesis. Wire `"test": "bun test"` into package.json and add a
`test` job to `publish.yml` alongside `typecheck`.
