# Roadmap

Implementation status mapped against the PRD. Items without a checkbox are complete.

---

## V1 — shipped

| Phase | Feature | Notes |
|---|---|---|
| P0 | Scaffold, JSON envelope, pedagogical errors | |
| P1 | Spec load (URL + file), `@readme/openapi-parser`, `inspect` | OpenAPI 3.0 + 3.1, Swagger 2.0 best-effort |
| P2 | `search` | Custom scorer — BM25 is the PRD spec, see below |
| P3 | Request construction, `--dry-run`, secret resolution | |
| P4 | Live `run`, read-only default, `--allow-writes`, env fencing | |
| P5 | `--batch` | |
| P6 | `init`, `guide`, AGENTS.md, Claude + Cursor shims | |

## Post-V1 — shipped ahead of schedule

| Feature | Notes |
|---|---|
| `doctor` | Spec health: version, op count, missing operationIds, reachability, format, base_url |
| `conform` | ajv-backed diff: `MISSING_REQUIRED_FIELD`, `TYPE_MISMATCH`, `EXTRA_FIELD`, `UNDECLARED_STATUS`, `SCHEMA_VIOLATION`. Handles `oneOf`/`anyOf`/`allOf`, OpenAPI 3.0 `nullable`, recursive schemas (explicit FAIL, no silent false-negative PASS) |

---

## Open — tracked in issues

### [#2](https://github.com/Itish2003/runtime-agent-cli/issues/2) — auth vault, multi-file `$ref`

- [ ] **auth vault / login-token capture** — run login endpoint, capture returned token, reuse for subsequent calls. Beyond today's static `${env:VAR}` headers.
- [ ] **multi-file / external `$ref`** — resolve specs split across multiple files or remote URLs. Currently single-document only.

### [#3](https://github.com/Itish2003/runtime-agent-cli/issues/3) — PRD gaps: search quality, inspect, Windsurf, pre_sync_command, MCP

- [ ] **BM25 search** — replace custom scorer with BM25 over operationId/summary/path/tags. Matters on large specs (Stripe 587 ops, GitHub 1,186 ops) where wrong ranking sends the agent to the wrong operation.
- [ ] **`inspect` observed examples** — optionally fire the endpoint and embed the real observed response alongside the schema skeleton. Tenet #1: the running server is the fact.
- [ ] **Windsurf shim in `init`** — add `.windsurfrules` pointer alongside the existing Claude and Cursor shims.
- [ ] **`pre_sync_command` hook** — run a build command before loading the spec, for projects that generate `openapi.json` via a build step.
- [ ] **MCP projection** — expose `search`, `inspect`, `run`, `conform` as MCP tools for agents in MCP-native hosts.

---

## Non-goals

- Spec generation or codegen/SDKs
- Being a test framework (doctrine lives in the skill, not the binary)
- API gateway or production traffic proxy
