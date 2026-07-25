// Vendored from the sibling runtime-agent-cli package (repo root
// src/commands/search.ts) — just the pure, already-exported rankOperations
// function, not the CLI-wrapper search() (which pulls in getCatalog/emit).
// Same reason as the other files in this directory: see spec.ts's header.
// Keep in sync by hand if src/commands/search.ts's ranking logic changes.

import type { Operation } from "./spec";

const FIELD_WEIGHTS = { operationId: 5, path: 4, tags: 3, summary: 2, description: 1 } as const;
type Field = keyof typeof FIELD_WEIGHTS;

function splitCamel(s: string): string[] {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/\s+/).filter(Boolean);
}
function fold(t: string): string {
  return t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t;
}
function tokenize(text: string): string[] {
  return text
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .flatMap(splitCamel)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 2)
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
  if (terms.length > 1 && matched.size === terms.length) score *= 1.5;
  if (allInId) score *= 1.5;
  return score;
}

export function rankOperations(operations: Operation[], query: string | undefined): Operation[] {
  const terms = tokenize(query ?? "");
  if (terms.length === 0) return operations;

  const fielded = operations.map(fieldsOf);
  const N = fielded.length;
  const idf = new Map<string, number>();
  for (const term of terms) {
    const df = fielded.filter((f) => f.all.has(term)).length;
    idf.set(term, Math.log(1 + N / (1 + df)));
  }

  return fielded
    .map((f) => ({ f, s: scoreOp(f, terms, idf) }))
    .filter((x) => x.s > 0)
    .sort(
      (a, b) =>
        b.s - a.s ||
        a.f.op.operationId.localeCompare(b.f.op.operationId) ||
        a.f.op.method.localeCompare(b.f.op.method) ||
        a.f.op.path.localeCompare(b.f.op.path),
    )
    .map((x) => x.f.op);
}
