import Ajv, { type ErrorObject, type AnySchema } from "ajv";
import addFormats from "ajv-formats";
import type { Operation, JsonSchema } from "../spec.ts";

const ajv = new Ajv({ allErrors: true, strict: false, verbose: true });
addFormats(ajv);

export type MismatchCode =
  | "UNDECLARED_STATUS"
  | "SCHEMA_NOT_DECLARED"
  | "MISSING_REQUIRED_FIELD"
  | "TYPE_MISMATCH"
  | "EXTRA_FIELD"
  | "SCHEMA_VIOLATION";

export interface Mismatch {
  code: MismatchCode;
  path: string;
  expected?: string;
  observed?: string;
  message: string;
}

// Convert a JSON Pointer (/foo/bar/0/baz) to our dollar-path ($.foo.bar[0].baz).
function toPath(instancePath: string): string {
  if (!instancePath) return "$";
  return (
    "$" +
    instancePath
      .split("/")
      .slice(1)
      .map((seg) => (/^\d+$/.test(seg) ? `[${seg}]` : `.${seg}`))
      .join("")
  );
}

// Deep-clone a schema object with two distinct truncation guards — ajv cannot
// handle circular references, which dereference() produces for recursive spec
// schemas. Truncated nodes are replaced with `true` (accept anything at that
// node) and recorded so the caller can surface an explicit FAIL rather than a
// silent false-negative PASS.
//
// The two guards are kept separate on purpose:
//   • cyclePaths — a node recurring on its own ancestry (seen.has) = a genuine
//     cycle. Fires at any depth; the only sound response is to truncate.
//   • depthPaths — acyclic nesting that exceeds MAX_SCHEMA_DEPTH. Real-world
//     specs (paginated envelopes + nested anyOf settings) routinely reach the
//     high teens, so the cap is generous; only pathological depth trips it.
// Conflating them mislabels a deep-but-valid schema as "recursive" (see the
// list_jobs false alarm). seen.has does all cycle protection independent of the
// cap, so this bound only fences off runaway acyclic nesting.
const MAX_SCHEMA_DEPTH = 64;

interface Truncation {
  cyclePaths: string[]; // JSON-Pointer-style paths where a genuine cycle was cut
  depthPaths: string[]; // paths where acyclic nesting exceeded MAX_SCHEMA_DEPTH
}

interface CloneResult extends Truncation {
  schema: unknown;
}

function cloneSchemaInner(
  schema: unknown,
  depth: number,
  seen: Set<object>,
  path: string,
  trunc: Truncation,
): unknown {
  if (!schema || typeof schema !== "object") return schema;
  if (seen.has(schema as object)) {
    trunc.cyclePaths.push(path);
    return true; // accept anything at truncation point — mismatch is reported separately
  }
  if (depth > MAX_SCHEMA_DEPTH) {
    trunc.depthPaths.push(path);
    return true;
  }
  const next = new Set(seen).add(schema as object);
  if (Array.isArray(schema)) {
    return (schema as unknown[]).map((item, i) =>
      cloneSchemaInner(item, depth + 1, next, `${path}/${i}`, trunc),
    );
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    out[k] = cloneSchemaInner(v, depth + 1, next, `${path}/${k}`, trunc);
  }
  // OpenAPI 3.0 nullable: true → convert to type array so ajv understands it.
  if (out.nullable === true && typeof out.type === "string") {
    out.type = [out.type, "null"];
    delete out.nullable;
  }
  return out;
}

function cloneSchema(schema: unknown): CloneResult {
  const trunc: Truncation = { cyclePaths: [], depthPaths: [] };
  const cloned = cloneSchemaInner(schema, 0, new Set(), "#", trunc);
  return { schema: cloned, ...trunc };
}

function mapError(err: ErrorObject): Mismatch {
  const path = toPath(err.instancePath);
  switch (err.keyword) {
    case "required": {
      const prop = (err.params as { missingProperty: string }).missingProperty;
      const full = path === "$" ? `$.${prop}` : `${path}.${prop}`;
      return {
        code: "MISSING_REQUIRED_FIELD",
        path: full,
        expected: "present",
        observed: "absent",
        message: `${full}: required field is missing`,
      };
    }
    case "type": {
      const observed = (err as any).data !== undefined ? typeof (err as any).data : undefined;
      return {
        code: "TYPE_MISMATCH",
        path,
        expected: (err.params as { type: string | string[] }).type.toString(),
        ...(observed !== undefined ? { observed } : {}),
        message: err.message ?? `${path}: type mismatch`,
      };
    }
    case "additionalProperties": {
      const extra = (err.params as { additionalProperty: string }).additionalProperty;
      const full = path === "$" ? `$.${extra}` : `${path}.${extra}`;
      return {
        code: "EXTRA_FIELD",
        path: full,
        message: `${full}: field not declared (additionalProperties: false)`,
      };
    }
    default: {
      return {
        code: "SCHEMA_VIOLATION",
        path,
        expected: err.schemaPath,
        message: err.message ?? `${path}: ${err.keyword} constraint violated`,
      };
    }
  }
}

function findDeclaredResponse(
  op: Operation,
  status: number,
): { declared: boolean; schema?: JsonSchema; matchedStatus?: string } {
  const exact = String(status);
  if (op.responses[exact]) return { declared: true, schema: op.responses[exact].schema, matchedStatus: exact };

  // Range patterns: OpenAPI requires uppercase (2XX) but real-world specs use lowercase too.
  const rangeUpper = status.toString()[0] + "XX";
  const rangeLower = status.toString()[0] + "xx";
  const rangeKey = op.responses[rangeUpper] ? rangeUpper : op.responses[rangeLower] ? rangeLower : undefined;
  if (rangeKey) return { declared: true, schema: op.responses[rangeKey].schema, matchedStatus: rangeKey };

  if (op.responses["default"])
    return { declared: true, schema: op.responses["default"].schema, matchedStatus: "default" };

  return { declared: false };
}

export interface DiffResult {
  status_declared: boolean;
  matched_status?: string;
  schema_declared: boolean;
  mismatches: Mismatch[];
  verdict: "PASS" | "FAIL";
}

export function diffResponse(status: number, body: unknown, op: Operation): DiffResult {
  const found = findDeclaredResponse(op, status);

  if (!found.declared) {
    return {
      status_declared: false,
      schema_declared: false,
      mismatches: [
        {
          code: "UNDECLARED_STATUS",
          path: "$",
          observed: String(status),
          message: `Status ${status} is not declared in the spec for this operation`,
        },
      ],
      verdict: "FAIL",
    };
  }

  if (!found.schema) {
    return {
      status_declared: true,
      matched_status: found.matchedStatus,
      schema_declared: false,
      mismatches: [
        {
          code: "SCHEMA_NOT_DECLARED",
          path: "$",
          message: `Status ${status} is declared but has no response schema — cannot validate body`,
        },
      ],
      verdict: "PASS", // no schema = no contract to violate
    };
  }

  const { schema: safeSchema, cyclePaths, depthPaths } = cloneSchema(found.schema);
  let validate: ReturnType<typeof ajv.compile>;
  try {
    validate = ajv.compile(safeSchema as AnySchema);
  } catch (e) {
    return {
      status_declared: true,
      matched_status: found.matchedStatus,
      schema_declared: true,
      mismatches: [
        {
          code: "SCHEMA_VIOLATION",
          path: "$",
          message: `Could not compile response schema: ${(e as Error).message}`,
        },
      ],
      verdict: "FAIL",
    };
  }

  const valid = validate(body);
  const mismatches: Mismatch[] = valid ? [] : (validate.errors ?? []).map(mapError);

  // A truncated node was validated as `true` (accept anything), so validation is
  // incomplete there. Surface it as an explicit FAIL so agents don't act on a
  // false-positive PASS — but name the cause honestly: a genuine cycle and mere
  // over-depth are different problems and read differently to whoever's debugging.
  if (cyclePaths.length > 0) {
    mismatches.push({
      code: "SCHEMA_VIOLATION",
      path: "$",
      message: `Schema contains recursive references — validation was truncated at: ${cyclePaths.join(", ")}. Conformance cannot be fully guaranteed; inspect the spec manually.`,
    });
  }
  if (depthPaths.length > 0) {
    mismatches.push({
      code: "SCHEMA_VIOLATION",
      path: "$",
      message: `Schema nesting exceeds the maximum validation depth of ${MAX_SCHEMA_DEPTH} — validation was truncated at: ${depthPaths.join(", ")}. This is not a cycle; the schema is just deeper than the checker validates. Conformance below those paths cannot be guaranteed.`,
    });
  }

  return {
    status_declared: true,
    matched_status: found.matchedStatus,
    schema_declared: true,
    mismatches,
    verdict: mismatches.length === 0 ? "PASS" : "FAIL",
  };
}
