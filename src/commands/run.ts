import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { emit, ok, die } from "../envelope.ts";
import { getCatalog, requireOp } from "../lib/load.ts";
import { selectEnv, resolveHeaders, redact } from "../config.ts";
import { HINTS } from "../doctrine.ts";
import { fire, readStdin, parseJson, type Input } from "../lib/http.ts";

interface RunOpts {
  input?: string;
  batch?: string;
  env?: string;
  dryRun?: boolean;
  allowWrites?: boolean;
}

export async function run(opId: string, opts: RunOpts) {
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

  let raw: any = {};
  if (opts.batch) {
    let text: string;
    try {
      text = readFileSync(resolve(process.cwd(), opts.batch), "utf8");
    } catch (e) {
      die("BAD_BATCH", `Cannot read batch file: ${(e as Error).message}`);
    }
    try {
      raw = parseJson(text!, opts.batch);
    } catch (e) {
      die("BAD_INPUT", (e as Error).message, HINTS.writeInput);
    }
    if (!Array.isArray(raw)) {
      die("BAD_BATCH", "--batch expects the file to contain a JSON array of inputs.", HINTS.writeInput);
    }
  } else if (opts.input) {
    let text: string;
    try {
      text = readFileSync(resolve(process.cwd(), opts.input), "utf8");
    } catch (e) {
      die("BAD_INPUT", `Cannot read input file: ${(e as Error).message}`);
    }
    try {
      raw = parseJson(text!, opts.input);
    } catch (e) {
      die("BAD_INPUT", (e as Error).message, HINTS.writeInput);
    }
  } else {
    const stdin = await readStdin();
    if (stdin) {
      try {
        raw = parseJson(stdin, "stdin");
      } catch (e) {
        die("BAD_INPUT", (e as Error).message, HINTS.writeInput);
      }
    }
  }

  const dryRun = Boolean(opts.dryRun);

  if (opts.batch) {
    const results: object[] = [];
    for (const single of raw as Input[]) {
      results.push(await fire({ op, input: single ?? {}, base_url, cfgHeaders, redactKeys, dryRun }));
    }
    emit(
      ok({
        operation: op.operationId,
        env: envName,
        dry_run: dryRun,
        batch: true,
        count: results.length,
        results,
      }),
    );
    return;
  }

  const result = await fire({ op, input: raw as Input, base_url, cfgHeaders, redactKeys, dryRun });
  emit({ operation: op.operationId, env: envName, ...result });
  if ((result as any).ok === false) process.exit(1);
}
