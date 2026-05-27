import { emit, ok } from "../envelope.ts";
import { getCatalog } from "../lib/load.ts";
import type { Operation } from "../spec.ts";

// Lightweight relevance scoring (operationId/summary/path weighted). BM25 is the
// eventual upgrade; this keeps discovery flat + token-cheap on large specs.
function score(op: Operation, terms: string[]): number {
  const id = op.operationId.toLowerCase();
  const summary = (op.summary ?? "").toLowerCase();
  const path = op.path.toLowerCase();
  const tags = op.tags.join(" ").toLowerCase();
  let s = 0;
  for (const t of terms) {
    if (id.includes(t)) s += 3;
    if (summary.includes(t)) s += 2;
    if (path.includes(t)) s += 2;
    if (tags.includes(t)) s += 1;
  }
  return s;
}

export async function search(query: string | undefined, opts: { limit?: string }) {
  const { catalog } = await getCatalog();
  const limit = opts.limit ? Number(opts.limit) : 10;
  const terms = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);

  let ranked: Operation[];
  if (terms.length === 0) {
    ranked = catalog.operations;
  } else {
    ranked = catalog.operations
      .map((op) => ({ op, s: score(op, terms) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.op);
  }

  const results = ranked.slice(0, limit).map((op) => ({
    operationId: op.operationId,
    method: op.method.toUpperCase(),
    path: op.path,
    ...(op.summary ? { summary: op.summary } : {}),
  }));

  emit(
    ok({
      query: query ?? null,
      total_operations: catalog.operations.length,
      matched: ranked.length,
      showing: results.length,
      results,
      next: "runtime-agent-cli inspect <operationId>",
    }),
  );
}
