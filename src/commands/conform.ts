import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { emit, ok, die } from "../envelope.ts";
import { getCatalog, requireOp } from "../lib/load.ts";
import { selectEnv, resolveHeaders } from "../config.ts";
import { HINTS } from "../doctrine.ts";
import { fire, readStdin, parseJson, type Input } from "../lib/http.ts";
import { diffResponse } from "../lib/diff.ts";

interface ConformOpts {
  input?: string;
  batch?: string;
  env?: string;
  dryRun?: boolean;
  allowWrites?: boolean;
}

async function resolveInput(opts: ConformOpts): Promise<Input | Input[]> {
  if (opts.batch) {
    let text: string;
    try {
      text = readFileSync(resolve(process.cwd(), opts.batch), "utf8");
    } catch (e) {
      die("BAD_BATCH", `Cannot read batch file: ${(e as Error).message}`);
    }
    let parsed: any;
    try {
      parsed = parseJson(text!, opts.batch);
    } catch (e) {
      die("BAD_INPUT", (e as Error).message, HINTS.writeInput);
    }
    if (!Array.isArray(parsed)) {
      die("BAD_BATCH", "--batch expects the file to contain a JSON array of inputs.", HINTS.writeInput);
    }
    return parsed as Input[];
  }

  if (opts.input) {
    let text: string;
    try {
      text = readFileSync(resolve(process.cwd(), opts.input), "utf8");
    } catch (e) {
      die("BAD_INPUT", `Cannot read input file: ${(e as Error).message}`);
    }
    try {
      return parseJson(text!, opts.input) as Input;
    } catch (e) {
      die("BAD_INPUT", (e as Error).message, HINTS.writeInput);
    }
  }

  const stdin = await readStdin();
  if (stdin) {
    try {
      return parseJson(stdin, "stdin") as Input;
    } catch (e) {
      die("BAD_INPUT", (e as Error).message, HINTS.writeInput);
    }
  }

  return {};
}

async function conformOne(
  input: Input,
  op: ReturnType<typeof requireOp>,
  base_url: string,
  cfgHeaders: Record<string, string>,
  redactKeys: Set<string>,
  dryRun: boolean,
): Promise<object> {
  const result = await fire({ op, input, base_url, cfgHeaders, redactKeys, dryRun });

  if ((result as any).dry_run) return result;

  if (!(result as any).ok) {
    return { ok: false, ...(result as object) };
  }

  const { status, body } = result as { ok: true; status: number; body: any };
  const diff = diffResponse(status, body, op);

  return {
    ok: true,
    status,
    contract: {
      status_declared: diff.status_declared,
      ...(diff.matched_status ? { matched_status: diff.matched_status } : {}),
      schema_declared: diff.schema_declared,
    },
    mismatches: diff.mismatches,
    verdict: diff.verdict,
  };
}

export async function conform(opId: string, opts: ConformOpts) {
  const { loaded, catalog } = await getCatalog();
  const op = requireOp(catalog, opId);

  const isWrite = !["get", "head"].includes(op.method);
  if (isWrite && !opts.allowWrites) {
    die(
      "WRITE_BLOCKED",
      `${op.method.toUpperCase()} ${op.path} is a write/destructive call and is blocked by the read-only default.`,
      HINTS.readOnly,
    );
  }

  const { name: envName, env, base_url } = selectEnv(loaded, opts.env);
  const { headers: cfgHeaders, redactKeys } = resolveHeaders(env);
  const dryRun = Boolean(opts.dryRun);
  const inputs = await resolveInput(opts);

  if (opts.batch) {
    const results: object[] = [];
    for (const single of inputs as Input[]) {
      results.push(await conformOne(single ?? {}, op, base_url, cfgHeaders, redactKeys, dryRun));
    }
    const anyFail = results.some((r) => (r as any).verdict === "FAIL");
    emit(
      ok({
        operation: op.operationId,
        env: envName,
        batch: true,
        count: results.length,
        results,
        verdict: anyFail ? "FAIL" : "PASS",
      }),
    );
    if (anyFail) process.exit(1);
    return;
  }

  const result = await conformOne(inputs as Input, op, base_url, cfgHeaders, redactKeys, dryRun);
  emit({ ok: true, operation: op.operationId, env: envName, ...result });
  if ((result as any).verdict === "FAIL" || (result as any).ok === false) process.exit(1);
}
