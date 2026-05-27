# runtime-agent-cli

**A dev-time CLI that reflects your live API for AI coding agents.** It turns your OpenAPI spec into a discoverable, executable surface so an agent can verify backend work against **what the server actually does** — not what the code assumes.

Think `vite dev` / `tsc --watch`, but for your API: stateless, on-demand, always-fresh. It re-reads the live spec on every call, so it can never go stale the way an MCP tool catalog does.

> Requires [Bun](https://bun.sh). All output is deterministic JSON, even on error.

---

## Why

When an AI agent builds or touches a backend, it verifies badly: it writes confirmation-bias tests from what it *assumes* the code does, or hand-builds fragile `curl` calls. This tool is the deterministic substrate the agent leans on — it owns the mechanics (parse, dereference, construct the request, redact secrets), the agent owns the judgment (what to test, is the response right).

It also stays flat in token cost. On large specs that's the whole game:

| Spec | Operations | Full spec | Tokens the agent actually spends | Efficiency |
|---|---|---|---|---|
| GitHub REST API | 1,186 | ~3.1M tok | ~554 tok (`search` + `inspect`) | **5,656×** |
| Stripe | 587 | ~1.96M tok | ~612 tok | **3,200×** |
| Kubernetes | 1,123 | ~1.03M tok | ~459 tok | **2,243×** |

The output stays ~500 tokens regardless of spec size — so the bigger the API, the more it wins.

---

## Install & quickstart

```bash
# zero-install, always-latest
bunx runtime-agent-cli init        # scaffold config + agent teaching files
# edit .runtime-agent-cli.yaml  →  point openapi_source at your running dev server

bunx runtime-agent-cli guide                    # the doctrine + workflow, tailored to your spec
bunx runtime-agent-cli search invoice           # find an operation
bunx runtime-agent-cli inspect createInvoice    # resolved schema + a ready-to-fill payload
bunx runtime-agent-cli run createInvoice --input payload.json --dry-run   # see the exact request
bunx runtime-agent-cli run getInvoice --input payload.json                # execute, observe the real response
```

`init` writes an `AGENTS.md` pointer plus per-harness shims (Claude `CLAUDE.md` + skill, Cursor `.cursor/rules`) so your agent discovers the tool automatically.

---

## Commands

| Command | What it does |
|---|---|
| `init` | Scaffold config + agent teaching files (`AGENTS.md`, skill stub, harness shims). |
| `guide` | Print the doctrine + workflow, tailored to the current spec. Agents read this first. |
| `search [query]` | Find operations by keyword (operationId / path / summary / tags). |
| `inspect <op> [--detail brief\|detailed\|full]` | Resolved schema + a ready-to-fill `run` payload for one operation. |
| `run <op> --input <file> [--dry-run] [--allow-writes] [--env <name>]` | Execute; observe the real response. JSON in, JSON out. |
| `run <op> --batch <file>` | Fire an array of inputs in one shot (stress, don't confirm). |

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

## Notes & limits

- Parser: [`@readme/openapi-parser`](https://www.npmjs.com/package/@readme/openapi-parser) — officially supports OpenAPI **3.0 / 3.1** (and 2.0). FastAPI's 3.1 output works out of the box.
- Swagger **2.0** is best-effort: it loads and `in: body` request bodies are lifted into the modern shape, but exotic 2.0 constructs aren't guaranteed.
- Multi-file specs split across external `$ref`s to other URLs/files aren't fully resolved yet (single-document specs only).

## License

MIT © Itish Srivastava
