import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { emit, ok } from "../envelope.ts";
import { CONFIG_NAME } from "../config.ts";

const MARKER = "<!-- runtime-agent-cli -->";

const DEFAULT_CONFIG = `# runtime-agent-cli — point at your live API and pick an environment.
openapi_source: "http://localhost:8000/openapi.json"   # live URL (always-fresh) or ./openapi.json
environment: local
environments:
  local:
    base_url: "http://localhost:8000"
    headers:
      Authorization: "Bearer \${env:API_TOKEN}"   # resolved at runtime; never written here
`;

const POINTER = `${MARKER}
## API testing — runtime-agent-cli

This repo has \`runtime-agent-cli\`: a live, always-fresh view of the API for verifying backend work.
Reach for it when you write a test for an endpoint, verify a route works, check what the API actually
returns/accepts, or call an API you didn't write or don't know.

**Doctrine: the running server is the fact; the source is a hypothesis.** Don't write a test from what
the code *should* return — hit the endpoint and encode what it *does*. Read the full workflow with:
\`runtime-agent-cli guide\`

Loop: \`search <query>\` → \`inspect <operationId>\` → \`run <op> --input payload.json [--dry-run]\` → \`conform <op> --input payload.json\` (diff observed vs declared).
${MARKER}`;

const SKILL = `---
name: runtime-agent-cli
description: >-
  Live API verification for AI agents. Use when writing a test for an endpoint, verifying a route
  works, checking what an API actually returns/accepts, debugging an endpoint, or calling an API you
  didn't write or don't know. Triggers: "test this endpoint", "verify the API", "does this route
  work", "what does /x return", "check the backend", consuming an unfamiliar/third-party API. Prefer
  this over curl or reading the route source.
---

# runtime-agent-cli

This is a discovery stub (a doorbell, not the manual). Load the live, version-matched, repo-aware
guide before use:

\`\`\`bash
runtime-agent-cli guide
\`\`\`

Then: \`search <query>\` → \`inspect <operationId>\` → \`run <op> --input payload.json [--dry-run]\` → \`conform <op> --input payload.json\`.
All output is JSON. Doctrine: the running server is the fact, the source is a hypothesis — observe before you assert, reconcile observed vs declared, stress don't confirm.
`;

function writeIfAbsent(results: any[], path: string, content: string) {
  if (existsSync(path)) {
    results.push({ path, status: "skipped (exists)" });
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  results.push({ path, status: "created" });
}

function appendPointer(results: any[], path: string) {
  if (existsSync(path)) {
    const cur = readFileSync(path, "utf8");
    if (cur.includes(MARKER)) {
      results.push({ path, status: "skipped (already pointed)" });
      return;
    }
    writeFileSync(path, cur.trimEnd() + "\n\n" + POINTER + "\n");
    results.push({ path, status: "appended pointer" });
  } else {
    writeFileSync(path, POINTER + "\n");
    results.push({ path, status: "created" });
  }
}

function ensureLine(results: any[], path: string, line: string) {
  const existed = existsSync(path);
  const cur = existed ? readFileSync(path, "utf8") : "";
  if (cur.split("\n").includes(line)) {
    results.push({ path, status: "skipped (present)" });
    return;
  }
  writeFileSync(path, cur && !cur.endsWith("\n") ? cur + "\n" + line + "\n" : cur + line + "\n");
  results.push({ path, status: existed ? "updated" : "created" });
}

export async function init() {
  const cwd = process.cwd();
  const results: any[] = [];

  writeIfAbsent(results, join(cwd, CONFIG_NAME), DEFAULT_CONFIG);
  // Cross-harness teaching artifacts (§11.3): AGENTS.md canonical + per-harness shims.
  appendPointer(results, join(cwd, "AGENTS.md"));
  appendPointer(results, join(cwd, "CLAUDE.md"));
  writeIfAbsent(results, join(cwd, ".claude", "skills", "runtime-agent-cli", "SKILL.md"), SKILL);
  writeIfAbsent(results, join(cwd, ".cursor", "rules", "runtime-agent-cli.mdc"), POINTER + "\n");
  ensureLine(results, join(cwd, ".gitignore"), ".runtime-agent-cli.state.json");

  emit(
    ok({
      initialized: true,
      files: results,
      next: "Edit `.runtime-agent-cli.yaml` (openapi_source, base_url), then run `runtime-agent-cli guide`.",
    }),
  );
}
