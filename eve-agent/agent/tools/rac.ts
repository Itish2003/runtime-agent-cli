import { defineTool } from "eve/tools";
import { z } from "zod";
import { loadCatalog, type Catalog, type Operation } from "../lib/rac-core/spec";
import { skeleton, summarize } from "../lib/rac-core/schema";
import { rankOperations } from "../lib/rac-core/rank";
import { fire } from "../lib/rac-core/http";

// The demo modality for this project (portfolio notes/projects.md): the
// agent runs the REAL CLI logic and returns real JSON, not a mock or a
// canned transcript. On Vercel there's no child-process/Bun/CLI-binary
// available (the previous version of this tool shelled out to `node
// src/cli.ts` and died with spawn ENOENT in production) — this version
// calls the CLI's own core functions in-process instead: loadCatalog,
// rankOperations, skeleton/summarize, and fire/buildRequest are vendored
// verbatim from the sibling package (see agent/lib/rac-core/*.ts headers
// for why they're copied rather than imported live). What runs here is
// the actual product code, minus the terminal-only layer (config-file
// loading, stdin, process.exit) that a hosted demo has no use for.
//
// Safety: 'run' can NEVER execute a write verb — there is no
// --allow-writes equivalent exposed here at all. A write verb always
// returns WRITE_BLOCKED, which is not a failure: it IS the product's
// enforced-safe-by-default behavior, demonstrated live.

const DEFAULT_TARGET = "https://petstore3.swagger.io/api/v3/openapi.json";
const TARGET_URL = process.env.RAC_DEMO_TARGET_URL ?? DEFAULT_TARGET;

// The spec re-reads on every call (matches the CLI's own "stateless,
// on-demand" pitch) — no catalog caching here, deliberately.
async function getCatalog(): Promise<Catalog> {
  return loadCatalog(TARGET_URL);
}

function nearMatches(catalog: Catalog, id: string): string[] {
  return [...catalog.byId.keys()]
    .filter((k) => k.toLowerCase().includes(id.toLowerCase()))
    .slice(0, 5);
}

// The OpenAPI `servers[0].url` is often relative (e.g. "/api/v3"); resolve
// it against the spec source's own origin, same as a browser would.
function resolveBaseUrl(catalog: Catalog): string {
  const serverUrl = catalog.raw?.servers?.[0]?.url as string | undefined;
  if (!serverUrl) return new URL(TARGET_URL).origin;
  if (/^https?:\/\//.test(serverUrl)) return serverUrl;
  return new URL(serverUrl, TARGET_URL).toString();
}

function paramSkeleton(op: Operation, where: "path" | "query") {
  const out: Record<string, any> = {};
  for (const p of op.params) {
    if (p.in === where && (where === "path" || p.required)) out[p.name] = skeleton(p.schema);
  }
  return out;
}

async function doSearch(query: string | undefined) {
  const catalog = await getCatalog();
  const ranked = rankOperations(catalog.operations, query);
  const results = ranked.slice(0, 10).map((op) => ({
    operationId: op.operationId,
    method: op.method.toUpperCase(),
    path: op.path,
    ...(op.summary ? { summary: op.summary } : {}),
  }));
  return {
    ok: true,
    query: query ?? null,
    total_operations: catalog.operations.length,
    matched: ranked.length,
    showing: results.length,
    results,
    next: "inspect <operationId>",
  };
}

async function doInspect(operationId: string | undefined) {
  if (!operationId) return { ok: false, error: "BAD_INPUT", message: "inspect requires an operationId" };
  const catalog = await getCatalog();
  const op = catalog.byId.get(operationId);
  if (!op) {
    const near = nearMatches(catalog, operationId);
    return {
      ok: false,
      error: "OP_NOT_FOUND",
      message: `No operation '${operationId}' in this spec.`,
      hint: near.length ? `Did you mean: ${near.join(", ")}?` : "Run 'search' to discover operations.",
    };
  }

  const parameters: Record<string, any[]> = { path: [], query: [], header: [], cookie: [] };
  for (const p of op.params) {
    (parameters[p.in] ??= []).push({
      name: p.name,
      required: p.required,
      schema: summarize(p.schema),
      ...(p.description ? { description: p.description } : {}),
    });
  }

  const example: Record<string, any> = {};
  const pathSkel = paramSkeleton(op, "path");
  const querySkel = paramSkeleton(op, "query");
  if (Object.keys(pathSkel).length) example.path = pathSkel;
  if (Object.keys(querySkel).length) example.query = querySkel;
  if (op.requestBody) example.body = skeleton(op.requestBody.schema);

  return {
    ok: true,
    operation: {
      operationId: op.operationId,
      method: op.method.toUpperCase(),
      path: op.path,
      ...(op.summary ? { summary: op.summary } : {}),
      ...(op.tags.length ? { tags: op.tags } : {}),
    },
    parameters: {
      path: parameters.path,
      query: parameters.query,
      ...(parameters.header.length ? { header: parameters.header } : {}),
      ...(parameters.cookie.length ? { cookie: parameters.cookie } : {}),
    },
    body: op.requestBody
      ? { required: op.requestBody.required, schema: summarize(op.requestBody.schema) }
      : null,
    example_payload: example,
    call: `run ${op.operationId}`,
  };
}

async function doRun(operationId: string | undefined, dryRun: boolean) {
  if (!operationId) return { ok: false, error: "BAD_INPUT", message: "run requires an operationId" };
  const catalog = await getCatalog();
  const op = catalog.byId.get(operationId);
  if (!op) {
    const near = nearMatches(catalog, operationId);
    return {
      ok: false,
      error: "OP_NOT_FOUND",
      message: `No operation '${operationId}' in this spec.`,
      hint: near.length ? `Did you mean: ${near.join(", ")}?` : "Run 'search' to discover operations.",
    };
  }

  const isWrite = !["get", "head"].includes(op.method);
  if (isWrite) {
    return {
      ok: false,
      error: "WRITE_BLOCKED",
      message: `${op.method.toUpperCase()} ${op.path} is a write/destructive call and is blocked by the read-only default.`,
      hint: "Doctrine: safe by default. The hosted demo never enables --allow-writes.",
    };
  }

  const base_url = resolveBaseUrl(catalog);
  const example: Record<string, any> = {};
  const pathSkel = paramSkeleton(op, "path");
  if (Object.keys(pathSkel).length) example.path = pathSkel;
  const result = await fire({
    op,
    input: example,
    base_url,
    cfgHeaders: {},
    redactKeys: new Set(),
    dryRun,
  });
  return { operation: op.operationId, base_url, dry_run: dryRun, ...result };
}

export default defineTool({
  description:
    "Run the real runtime-agent-cli core against a live OpenAPI target and return real JSON output — the same search/inspect/run logic the published CLI uses, called in-process (no shelling out, which doesn't work on Vercel). Actions: 'search' finds operations by keyword; 'inspect' resolves one operation's schema plus a ready example payload; 'run' executes a read-only (GET/HEAD) operation for real — write verbs always return WRITE_BLOCKED, which is the enforced-safety demo, not a failure. Use this whenever a visitor wants to see the tool actually work.",
  inputSchema: z.object({
    action: z.enum(["search", "inspect", "run"]),
    query: z.string().optional().describe("Keyword for 'search' (e.g. 'pet')."),
    operationId: z.string().optional().describe("Required for 'inspect' and 'run'."),
    dryRun: z
      .boolean()
      .optional()
      .describe("For 'run': resolve and show the request (no secrets to redact here) without sending it."),
  }),
  async execute({ action, query, operationId, dryRun }) {
    try {
      if (action === "search") return await doSearch(query);
      if (action === "inspect") return await doInspect(operationId);
      return await doRun(operationId, Boolean(dryRun));
    } catch (e) {
      return { ok: false, error: "TOOL_ERROR", message: (e as Error).message?.slice(0, 500) ?? "unknown error" };
    }
  },
});
