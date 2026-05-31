# Changelog

All notable changes to this project are documented here. Versions follow
[semantic versioning](https://semver.org/) (pre-1.0: minor = features/notable
changes, patch = fixes).

## [0.2.2] — 2026-05-31

### Fixed
- **Deep-but-acyclic schemas are no longer mislabeled "recursive."** `conform`'s
  schema cloner conflated two truncation triggers — a genuine object cycle
  (`seen.has`) and mere nesting depth — under one `SCHEMA_VIOLATION` message, so a
  legitimate 17-deep schema (paginated envelope → items → nested `anyOf` settings,
  e.g. `list_jobs`) hard-FAILed as "recursive references." The triggers are now
  separate with honest, distinct messages, and `MAX_SCHEMA_DEPTH` is raised
  12 → 64 so real-world deep schemas clone fully and validate correctly. Genuine
  cycles still FAIL (fail-closed: the checker never lies). Found in a field test.

## [0.2.1] — 2026-05-30

### Changed
- **Teaching stubs now trigger on the *build* moment** (from a real field test).
  `init`'s `AGENTS.md`/`SKILL.md` advertise "building or implementing an endpoint —
  verify each against the running server as you build," not just verifying/consuming
  an existing API. A lazy "build an API" prompt wasn't pulling the tool in.
- **Default config is local-no-auth by default.** The scaffolded
  `Authorization: ${env:API_TOKEN}` header is commented out, so a local API without
  auth no longer trips `MISSING_ENV_VAR`.

### Fixed
- **`--version` reports the real version**, read from `package.json` (works in both
  the `bunx`/source path and the compiled binary). It was hardcoded and stuck at
  `0.1.0`.

## [0.2.0] — 2026-05-30

### Changed
- **Search is now field-aware and deterministic.** `search` ranks with per-field
  IDF weighting (operationId > path > tags > summary > description), camelCase +
  path-segment tokenization, and exact/prefix/all-terms bonuses — replacing the
  flat substring scorer. It now also searches the `description` field.
- **Doctrine expanded.** `guide` now leads with a `WHY` (the self-confirming-loop
  failure mode the tool exists to break) and adds a `PARTNERS` section routing to
  hey-api (build the client from the same spec) and MCP/CodeMode (expose via a
  transport) — principle-first, tools as examples. The "observe" tenet now names
  the bias explicitly.
- **Agent teaching stubs sharpened.** `init`'s scaffolded `AGENTS.md`/`SKILL.md`
  pointers now show the full `search → inspect → run → conform` loop and trigger
  on more of the right moments (incl. consuming an unfamiliar/third-party API).

### Fixed
- **Search ranking is now deterministic.** Equal-scoring operations previously
  resolved by input order (unstable); a total-order tie-break
  (score → operationId → method → path) makes ranking reproducible.

### Documentation
- New `docs/` design record: a design journal + 12 ADRs (Context/Decision/
  Rationale/Alternatives/Status) capturing the package's decisions and rationale.
- README accuracy + positioning refresh; `conform` mismatch-code list completed
  (added `SCHEMA_NOT_DECLARED`) and aligned across the README and `guide` hints.

## [0.1.1] — 2026-05-29

### Fixed
- `search --limit`: guard against `NaN`/invalid values (previously returned zero
  results silently).
- `inspect`: surface `cookie` parameters (were parsed then dropped from output).
- `init`: report `created` for newly-written files (was always `updated`).

### Changed
- Enforced the `Envelope` output type on `emit()`; typed schemas via
  `openapi-types` through the schema-handling core.

### Added
- `tsc --noEmit` typecheck + `bun test` suite, both gating publish in CI;
  pinned TypeScript.

## [0.1.0] — 2026-05-28

- Initial release: a dev-time CLI that projects a live OpenAPI spec as a
  discoverable, executable surface for AI coding agents
  (`init`/`guide`/`search`/`inspect`/`run`/`doctor`/`conform`).
