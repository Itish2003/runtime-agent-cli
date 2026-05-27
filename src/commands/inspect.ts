import { emit, ok } from "../envelope.ts";
import { getCatalog, requireOp } from "../lib/load.ts";
import { skeleton, summarize } from "../lib/schema.ts";
import type { Operation } from "../spec.ts";

function paramSkeleton(op: Operation, where: "path" | "query") {
  const out: Record<string, any> = {};
  for (const p of op.params) {
    if (p.in === where && (where === "path" || p.required)) out[p.name] = skeleton(p.schema);
  }
  return out;
}

export async function inspect(opId: string, opts: { detail?: string }) {
  const detail = opts.detail ?? "detailed";
  const { catalog } = await getCatalog();
  const op = requireOp(catalog, opId);

  const parameters: Record<string, any[]> = { path: [], query: [], header: [] };
  for (const p of op.params) {
    (parameters[p.in] ??= []).push({
      name: p.name,
      required: p.required,
      schema: summarize(p.schema),
      ...(p.description ? { description: p.description } : {}),
    });
  }

  // The ready-to-fill payload: tool supplies the SHAPE, agent fills the VALUES.
  const example: Record<string, any> = {};
  const pathSkel = paramSkeleton(op, "path");
  const querySkel = paramSkeleton(op, "query");
  if (Object.keys(pathSkel).length) example.path = pathSkel;
  if (Object.keys(querySkel).length) example.query = querySkel;
  if (op.requestBody) example.body = skeleton(op.requestBody.schema);

  emit(
    ok({
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
      },
      body: op.requestBody
        ? { required: op.requestBody.required, schema: summarize(op.requestBody.schema) }
        : null,
      // §6b mechanism 3: discovery emits its own invocation.
      example_payload: example,
      call: `runtime-agent-cli run ${op.operationId} --input payload.json`,
      ...(detail === "full"
        ? { responses: Object.fromEntries(Object.entries(op.responses).map(([c, r]) => [c, { description: r.description, schema: r.schema ? summarize(r.schema) : null }])) }
        : {}),
    }),
  );
}
