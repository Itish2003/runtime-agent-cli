// Turn a (dereferenced) JSON Schema into a type-correct *example skeleton*.
// The tool emits the correct SHAPE; the LLM fills meaningful VALUES (§6b).
// Dereferenced specs can be circular/recursive — guard with depth + seen set.

import type { JsonSchema } from "../spec.ts";

const MAX_DEPTH = 8;

function pickType(schema: JsonSchema): string | undefined {
  let t = schema.type;
  if (Array.isArray(t)) t = t.find((x) => x !== "null") ?? t[0]; // 3.1 nullable
  return t;
}

export function skeleton(schema: JsonSchema, depth = 0, seen = new Set<JsonSchema>()): unknown {
  if (!schema || typeof schema !== "object") return null;
  if (depth > MAX_DEPTH || seen.has(schema)) return null;

  // Honor explicit examples/defaults/enums first — closest to "real" values.
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];

  // Composition: just descend into the first branch for a usable shape.
  const branch = schema.allOf?.[0] ?? schema.oneOf?.[0] ?? schema.anyOf?.[0];
  if (branch) return skeleton(branch, depth + 1, seen);

  const type = pickType(schema);
  switch (type) {
    case "object": {
      const next = new Set(seen).add(schema);
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries<JsonSchema>(schema.properties ?? {})) {
        out[k] = skeleton(v, depth + 1, next);
      }
      return out;
    }
    case "array": {
      const next = new Set(seen).add(schema);
      return [skeleton(schema.items ?? {}, depth + 1, next)];
    }
    case "string":
      return schema.format ? `<${schema.format}>` : "string";
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return false;
    case "null":
      return null;
    default:
      // Untyped object with properties is common in loose specs.
      if (schema.properties) return skeleton({ ...schema, type: "object" }, depth, seen);
      return null;
  }
}

// Compact, circular-safe description of a schema for inspect output.
export function summarize(schema: JsonSchema, depth = 0, seen = new Set<JsonSchema>()): unknown {
  if (!schema || typeof schema !== "object") return schema ?? null;
  if (depth > MAX_DEPTH || seen.has(schema)) return "<...>";
  const type = schema.type ?? (schema.properties ? "object" : undefined);
  const base: any = {};
  if (type) base.type = type;
  if (schema.format) base.format = schema.format;
  if (schema.enum) base.enum = schema.enum;
  if (schema.description) base.description = schema.description;
  const next = new Set(seen).add(schema);
  if (schema.properties) {
    base.properties = {};
    for (const [k, v] of Object.entries<JsonSchema>(schema.properties)) {
      base.properties[k] = summarize(v, depth + 1, next);
    }
    if (schema.required) base.required = schema.required;
  }
  if (schema.items) base.items = summarize(schema.items, depth + 1, next);
  return base;
}
