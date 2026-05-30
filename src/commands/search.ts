import { emit, ok } from "../envelope.ts";
import { getCatalog } from "../lib/load.ts";
import type { Operation } from "../spec.ts";

// Field-aware lexical search over the operation catalog. Hand-rolled (no index,
// no extra dependency) on purpose: the spec is re-read on every invocation, so an
// inverted index would be built and thrown away each call — pure waste. This gives
// BM25-style relevance via IDF weighting + per-field boosts, with a deterministic
// total-order tie-break (the old scorer sorted on score alone → unstable ties).

const FIELD_WEIGHTS = { operationId: 5, path: 4, tags: 3, summary: 2, description: 1 } as const;
type Field = keyof typeof FIELD_WEIGHTS;

function splitCamel(s: string): string[] {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/\s+/).filter(Boolean);
}
// Conservative plural fold (NOT a stemmer): applied to both query and field tokens,
// so consistency — not linguistic correctness — is what makes matches line up.
function fold(t: string): string {
  return t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t;
}
function tokenize(text: string): string[] {
  return text
    .split(/[^A-Za-z0-9]+/) // splits on /, _, -, {}, whitespace, etc.
    .filter(Boolean)
    .flatMap(splitCamel) // listUsers → list, Users
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 2) // drop 1-char noise
    .map(fold);
}

interface Fielded {
  op: Operation;
  fields: { name: Field; tokens: string[] }[];
  all: Set<string>;
}

function fieldsOf(op: Operation): Fielded {
  const fields: { name: Field; tokens: string[] }[] = [
    { name: "operationId", tokens: tokenize(op.operationId) },
    { name: "path", tokens: tokenize(op.path) },
    { name: "tags", tokens: tokenize(op.tags.join(" ")) },
    { name: "summary", tokens: tokenize(op.summary ?? "") },
    { name: "description", tokens: tokenize(op.description ?? "") },
  ];
  return { op, fields, all: new Set(fields.flatMap((f) => f.tokens)) };
}

// exact token → 2, prefix → 1.3, none → 0.
function termMatch(tokens: string[], term: string): number {
  if (tokens.includes(term)) return 2;
  if (tokens.some((t) => t.startsWith(term))) return 1.3;
  return 0;
}

function scoreOp(f: Fielded, terms: string[], idf: Map<string, number>): number {
  let score = 0;
  const matched = new Set<string>();
  let allInId = terms.length > 0;
  for (const term of terms) {
    let idHit = false;
    for (const field of f.fields) {
      const m = termMatch(field.tokens, term);
      if (m > 0) {
        score += FIELD_WEIGHTS[field.name] * (idf.get(term) ?? 1) * m;
        matched.add(term);
        if (field.name === "operationId") idHit = true;
      }
    }
    if (!idHit) allInId = false;
  }
  if (score === 0) return 0;
  if (terms.length > 1 && matched.size === terms.length) score *= 1.5; // all query terms present
  if (allInId) score *= 1.5; // every term hit the operationId — strongest relevance signal
  return score;
}

/**
 * Rank operations against a query. Exported (and pure) so ranking + determinism
 * are unit-testable without spawning the CLI. Returns the full ranked list
 * (no limit applied); an empty query returns catalog order unchanged.
 */
export function rankOperations(operations: Operation[], query: string | undefined): Operation[] {
  const terms = tokenize(query ?? "");
  if (terms.length === 0) return operations;

  const fielded = operations.map(fieldsOf);
  const N = fielded.length;
  const idf = new Map<string, number>();
  for (const term of terms) {
    const df = fielded.filter((f) => f.all.has(term)).length;
    idf.set(term, Math.log(1 + N / (1 + df))); // rarer term → higher weight
  }

  return fielded
    .map((f) => ({ f, s: scoreOp(f, terms, idf) }))
    .filter((x) => x.s > 0)
    .sort(
      (a, b) =>
        b.s - a.s ||
        a.f.op.operationId.localeCompare(b.f.op.operationId) || // unique key ⇒ total order
        a.f.op.method.localeCompare(b.f.op.method) ||
        a.f.op.path.localeCompare(b.f.op.path),
    )
    .map((x) => x.f.op);
}

export async function search(query: string | undefined, opts: { limit?: string }) {
  const { catalog } = await getCatalog();
  const parsedLimit = Number(opts.limit);
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;

  const ranked = rankOperations(catalog.operations, query);
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
