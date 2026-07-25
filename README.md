# runtime-agent-cli

**A dev-time CLI that reflects your live API for AI coding agents.** It turns your OpenAPI spec into a discoverable, executable surface so an agent can verify backend work against **what the server actually does** — not what the code assumes.

Think `vite dev` / `tsc --watch`, but for your API: stateless, on-demand, always-fresh. It re-reads the live spec on every call, so it can never go stale the way an MCP tool catalog does.

> Requires [Bun](https://bun.sh). All output is deterministic JSON, even on error.

---

## Why

A coding agent writes the backend *and* the tests from the same set of assumptions, and never gets an outside signal — so when those assumptions are wrong, it's confidently wrong, and the green test suite says nothing. That's the self-confirming loop this tool breaks: it forces the agent to reconcile its assumptions against **what the live server actually returns** instead of grading its own homework.

So when an AI agent builds or touches a backend, it stops verifying badly — no confirmation-bias tests written from what it *assumes* the code does, no fragile hand-built `curl` calls. This tool is the deterministic substrate the agent leans on — it owns the mechanics (parse, dereference, construct the request, redact secrets), the agent owns the judgment (what to test, is the response right).

It also stays flat in token cost. On large specs that's the whole game:

| Spec | Operations | Full spec | Tokens the agent actually spends | Efficiency |
|---|---|---|---|---|
| GitHub REST API | 1,186 | ~3.1M tok | ~554 tok (`search` + `inspect`) | **5,656×** |
| Stripe | 587 | ~1.96M tok | ~612 tok | **3,200×** |
| Kubernetes | 1,123 | ~1.03M tok | ~459 tok | **2,243×** |

The output stays ~500 tokens regardless of spec size — so the bigger the API, the more it wins.

---

## Install & quickstart

Requires [Bun](https://bun.sh) — the CLI's bin entry runs directly as TypeScript via Bun's runtime, no Node/npm execution path.

```bash
# Option A — global install (recommended for repeated use)
bun add -g runtime-agent-cli
rac init                           # short alias, same as runtime-agent-cli init

# Option B — zero-install, always-latest
bunx runtime-agent-cli init
```

```bash
# edit .runtime-agent-cli.yaml  →  point openapi_source at your running dev server

rac doctor                                              # spec health check first
rac guide                                               # the doctrine + workflow, tailored to your spec
rac search invoice                                      # find an operation
rac inspect createInvoice                               # resolved schema + a ready-to-fill payload
rac run createInvoice --input payload.json --dry-run    # see the exact request
rac run getInvoice --input payload.json                 # execute, observe the real response
rac conform getInvoice --input payload.json             # diff observed vs declared contract
```

`init` writes an `AGENTS.md` pointer plus per-harness shims (Claude `CLAUDE.md` + skill, Cursor `.cursor/rules`) so your agent discovers the tool automatically.

---

## Commands

| Command | What it does |
|---|---|
| `init` | Scaffold config + agent teaching files (`AGENTS.md`, skill stub, harness shims). |
| `guide` | Print the doctrine + workflow, tailored to the current spec. Agents read this first. |
| `doctor` | Report spec health: version, op count, missing operationIds, reachability, base_url. |
| `search [query]` | Find operations by keyword (operationId / path / summary / tags). |
| `inspect <op> [--detail brief\|detailed\|full]` | Resolved schema + a ready-to-fill `run` payload for one operation. |
| `run <op> --input <file> [--dry-run] [--allow-writes] [--env <name>]` | Execute; observe the real response. JSON in, JSON out. |
| `run <op> --batch <file>` | Fire an array of inputs in one shot (stress, don't confirm). |
| `conform <op> --input <file> [--dry-run] [--allow-writes] [--env <name>]` | Fire a request and diff the observed response against the declared OpenAPI contract. Mismatches are bugs. |
| `conform <op> --batch <file>` | Conform many inputs in one shot. |

### `conform` output

```jsonc
{
  "ok": true,
  "operation": "getPetById",
  "env": "local",
  "status": 200,
  "contract": {
    "status_declared": true,
    "matched_status": "200",
    "schema_declared": true
  },
  "mismatches": [
    {
      "code": "TYPE_MISMATCH",       // MISSING_REQUIRED_FIELD | TYPE_MISMATCH | EXTRA_FIELD
      "path": "$.data.score",        //   | UNDECLARED_STATUS | SCHEMA_NOT_DECLARED | SCHEMA_VIOLATION
      "expected": "integer",
      "observed": "string",
      "message": "$.data.score: expected integer, got string"
    }
  ],
  "verdict": "PASS"                  // FAIL when any mismatch is present
}
```

Schema validation uses [ajv](https://ajv.js.org) — handles `oneOf`/`anyOf`/`allOf`, format constraints, `additionalProperties`, OpenAPI 3.0 `nullable`, and recursive schemas (recursive schemas produce an explicit `FAIL` with truncation paths rather than a silent false-negative `PASS`).

### Config (`.runtime-agent-cli.yaml`)

```yaml
openapi_source: "http://localhost:8000/openapi.json"   # live URL (always-fresh) or ./openapi.json
environment: local
environments:
  local:
    base_url: "http://localhost:8000"
    headers:
      Authorization: "Bearer ${env:API_TOKEN}"          # resolved at runtime; never written to disk
```

---

## Safety

Built for autonomous use, so blast radius is contained by default:

- **Read-only by default** — `GET`/`HEAD` only; writes/destructive verbs need `--allow-writes`.
- **Environment fencing** — refuses to fire unless an environment is named.
- **`--dry-run`** — prints the fully-resolved request (secrets redacted), sends nothing.
- **Secrets** resolved at runtime from env/`${env:VAR}`; the agent never sees them, and they're redacted in all output.

---

## The doctrine

Shipped to agents via `guide` and the skill stub:

1. The running server is the fact; the source is a hypothesis.
2. Observe before you assert — encode what the endpoint *does*, not what you assume.
3. Reconcile the two truths — a spec/runtime mismatch is a bug to surface, not a behavior to enshrine.
4. Stress, don't confirm — the happy path is the least informative input.
5. Safe by default.

---

## Partners

`rac` does one thing — verify the live server against its spec — and composes with the rest of the spec-driven ecosystem instead of absorbing it. Two relationships matter, stated principle-first:

- **The spec is the shared contract; codegen is a sibling, not a feature.** One OpenAPI spec feeds two consumers: a codegen tool produces the typed client, `rac` verifies the live server behind it. Feed the same spec to [hey-api](https://heyapi.dev) (e.g.) for the typed client; `rac` confirms the server it talks to actually behaves that way. `rac` does **not** generate code — codegen is a deliberate non-goal, not a gap.
- **Exposing `rac` to third parties is an optional transport, not a core dependency.** When you want dynamic discovery plus transport-native OAuth for an external integration, wrap `rac`'s stable CLI/JSON contract in an MCP / CodeMode layer (e.g. [fastmcp](https://github.com/jlowin/fastmcp)). That's an EXPOSE transport sitting *outside* the tool — `rac` ships no built-in MCP server and needs none to do its job.

---

## Hosted demo

Live product page and agent chat: https://runtime-agent-cli-agent.vercel.app/chat

The agent behind that page runs the CLI's own search/inspect/run logic in-process against a live OpenAPI target, read-only. It's also reachable programmatically:

- A2A endpoint (JSON-RPC `SendMessage`): `/a2a`
- Agent card: `/.well-known/agent-card.json`

## Development

```bash
bun install
bun test          # the suite pins the doctrine: §7 envelope, graceful degradation, diff soundness
bun run typecheck # the package ships raw .ts, so tsc is the only type guard
```

CI gates publishing on both `typecheck` and `test` (see `.github/workflows/publish.yml`).

## Notes & limits

- Parser: [`@readme/openapi-parser`](https://www.npmjs.com/package/@readme/openapi-parser) — officially supports OpenAPI **3.0 / 3.1** (and 2.0). FastAPI's 3.1 output works out of the box.
- Swagger **2.0** is best-effort: it loads and `in: body` request bodies are lifted into the modern shape, but exotic 2.0 constructs aren't guaranteed.
- Multi-file specs split across external `$ref`s to other URLs/files aren't fully resolved yet (single-document specs only).
- `conform` schema diff covers the full JSON Schema feature set via ajv. Recursive schemas are validated up to a depth limit; truncation is surfaced as an explicit `FAIL` rather than a silent pass.

## License

MIT © Itish Srivastava
