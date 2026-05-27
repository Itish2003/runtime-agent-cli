import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { emit, ok, die, fail } from "../envelope.ts";
import { getCatalog, requireOp } from "../lib/load.ts";
import { selectEnv, resolveHeaders, redact } from "../config.ts";
import { HINTS } from "../doctrine.ts";
import type { Operation } from "../spec.ts";

interface Input {
  path?: Record<string, any>;
  query?: Record<string, any>;
  body?: any;
  headers?: Record<string, string>;
}

interface RunOpts {
  input?: string;
  batch?: string;
  env?: string;
  dryRun?: boolean;
  allowWrites?: boolean;
}

async function readStdin(): Promise<string | null> {
  if (process.stdin.isTTY) return null;
  if (typeof Bun !== "undefined") return (await Bun.stdin.text()) || null;
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return chunks.length ? Buffer.concat(chunks).toString("utf8") : null;
}

function parseJson(text: string, where: string): any {
  try {
    return JSON.parse(text);
  } catch (e) {
    die("BAD_INPUT", `Input from ${where} is not valid JSON: ${(e as Error).message}`, HINTS.writeInput);
  }
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/$/, "") + path;
}

function buildRequest(op: Operation, input: Input, base_url: string) {
  // Path params — substitute {name}; missing required path param is a hard error.
  let path = op.path;
  for (const p of op.params) {
    if (p.in !== "path") continue;
    const v = input.path?.[p.name];
    if (v === undefined) {
      throw new Error(`missing required path param '${p.name}'`);
    }
    path = path.replace(`{${p.name}}`, encodeURIComponent(String(v)));
  }
  const url = new URL(joinUrl(base_url, path));
  for (const [k, v] of Object.entries(input.query ?? {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function fire(
  op: Operation,
  input: Input,
  base_url: string,
  cfgHeaders: Record<string, string>,
  redactKeys: Set<string>,
  dryRun: boolean,
): Promise<object> {
  let url: string;
  try {
    url = buildRequest(op, input, base_url);
  } catch (e) {
    return fail("BAD_REQUEST", (e as Error).message, HINTS.useInspect);
  }

  const headers: Record<string, string> = { ...cfgHeaders, ...(input.headers ?? {}) };
  const hasBody = input.body !== undefined;
  if (hasBody && !Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }
  const method = op.method.toUpperCase();

  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      request: {
        method,
        url,
        headers: redact(headers, redactKeys),
        ...(hasBody ? { body: input.body } : {}),
      },
    };
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      ...(hasBody ? { body: JSON.stringify(input.body) } : {}),
    });
    const text = await res.text();
    let body: any = text;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("json") && text) {
      try {
        body = JSON.parse(text);
      } catch {
        /* leave as text */
      }
    }
    return {
      ok: true,
      status: res.status,
      response_ok: res.ok,
      headers: Object.fromEntries(res.headers.entries()),
      body,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: "NETWORK",
      message: (e as Error).message,
      hint: "Connection failed — is the server up at the configured base_url?",
    };
  }
}

export async function run(opId: string, opts: RunOpts) {
  const { loaded, catalog } = await getCatalog();
  const op = requireOp(catalog, opId);

  // Safety: read-only by default. Writes/destructive verbs need an explicit unlock.
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

  // Resolve input source.
  let raw: any = {};
  if (opts.batch) {
    raw = parseJson(readFileSync(resolve(process.cwd(), opts.batch), "utf8"), opts.batch);
    if (!Array.isArray(raw)) {
      die("BAD_BATCH", "--batch expects the file to contain a JSON array of inputs.", HINTS.writeInput);
    }
  } else if (opts.input) {
    raw = parseJson(readFileSync(resolve(process.cwd(), opts.input), "utf8"), opts.input);
  } else {
    const stdin = await readStdin();
    if (stdin) raw = parseJson(stdin, "stdin");
  }

  const dryRun = Boolean(opts.dryRun);

  if (opts.batch) {
    const results: object[] = [];
    for (const single of raw as Input[]) {
      results.push(await fire(op, single ?? {}, base_url, cfgHeaders, redactKeys, dryRun));
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

  const result = await fire(op, raw as Input, base_url, cfgHeaders, redactKeys, dryRun);
  emit({ operation: op.operationId, env: envName, ...result });
  if ((result as any).ok === false) process.exit(1);
}
