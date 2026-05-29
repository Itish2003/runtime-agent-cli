import { dereference } from "@readme/openapi-parser";
import { parse as parseYaml } from "yaml";
import type { OpenAPIV3 } from "openapi-types";
// @readme/openapi-parser officially supports OpenAPI 3.1 and exposes
// dereference()/validate() as named exports (no default export).

const METHODS = ["get", "put", "post", "delete", "patch", "options", "head", "trace"] as const;
export type Method = (typeof METHODS)[number];

/**
 * A dereferenced schema as this tool handles it across OpenAPI 2.0 / 3.0 / 3.1.
 * Anchored on openapi-types' 3.0 SchemaObject (gives nullable/enum/example/format/…),
 * then reconciled with reality: `type` widened to allow 3.1 arrays, `examples` added
 * (3.1), and nested $ref removed since `dereference()` resolves them away — so every
 * nested position is a plain JsonSchema, not `ReferenceObject | SchemaObject`.
 */
export type JsonSchema = Omit<
  OpenAPIV3.NonArraySchemaObject,
  "type" | "properties" | "items" | "allOf" | "oneOf" | "anyOf" | "additionalProperties" | "not"
> & {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  allOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
  not?: JsonSchema;
  examples?: unknown[];
};

export interface Param {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  schema: JsonSchema;
  description?: string;
}

export interface Operation {
  operationId: string;
  method: Method;
  path: string;
  summary?: string;
  description?: string;
  tags: string[];
  params: Param[];
  requestBody?: { required: boolean; schema: JsonSchema };
  responses: Record<string, { description?: string; schema?: JsonSchema }>;
}

export interface Catalog {
  raw: any;
  operations: Operation[];
  byId: Map<string, Operation>;
}

function synthId(method: string, path: string): string {
  // Fallback when operationId is absent: get__users_{id} -> getUsersId-ish, but
  // keep it deterministic and human-scannable.
  const parts = path.split("/").filter(Boolean).map((s) => s.replace(/[{}]/g, ""));
  return [method.toLowerCase(), ...parts].join("_");
}

function jsonSchema(content: any): JsonSchema | undefined {
  if (!content) return undefined;
  const ct = content["application/json"] ?? content[Object.keys(content)[0]];
  return ct?.schema as JsonSchema | undefined;
}

export async function loadCatalog(source: string): Promise<Catalog> {
  // For URL sources we fetch ourselves (Bun's fetch is reliable; the parser's
  // internal HTTP resolver is not, under Bun) and hand the parser an object to
  // dereference. File paths pass straight through (keeps YAML-file support).
  let input: any = source;
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${source}`);
    const text = await res.text();
    // Specs are served as JSON or YAML; try JSON first, fall back to YAML.
    try {
      input = JSON.parse(text);
    } catch {
      input = parseYaml(text);
    }
  }
  const raw = await dereference(input);
  const operations: Operation[] = [];
  const paths = raw?.paths ?? {};
  for (const [path, item] of Object.entries<any>(paths)) {
    const sharedParams = item.parameters ?? [];
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;
      const rawParams = [...sharedParams, ...(op.parameters ?? [])];
      // Swagger 2.0 models the request body as a parameter with `in: body`;
      // lift it to a 3.x-style requestBody so inspect/run see it.
      const bodyParam = rawParams.find((p: any) => p.in === "body");
      const params: Param[] = rawParams
        .filter((p: any) => p.in !== "body")
        .map((p: any) => ({
          name: p.name,
          in: p.in,
          required: p.in === "path" ? true : Boolean(p.required),
          schema: p.schema ?? {},
          description: p.description,
        }));
      const bodySchema = jsonSchema(op.requestBody?.content) ?? bodyParam?.schema;
      const bodyRequired = op.requestBody?.required ?? bodyParam?.required ?? false;
      const responses: Operation["responses"] = {};
      for (const [code, res] of Object.entries<any>(op.responses ?? {})) {
        responses[code] = { description: res?.description, schema: jsonSchema(res?.content) };
      }
      operations.push({
        operationId: op.operationId ?? synthId(method, path),
        method,
        path,
        summary: op.summary,
        description: op.description,
        tags: op.tags ?? [],
        params,
        requestBody: bodySchema ? { required: Boolean(bodyRequired), schema: bodySchema } : undefined,
        responses,
      });
    }
  }
  const byId = new Map(operations.map((o) => [o.operationId, o]));
  return { raw, operations, byId };
}
