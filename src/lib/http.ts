import { fail } from "../envelope.ts";
import { HINTS } from "../doctrine.ts";
import type { Operation } from "../spec.ts";

export interface Input {
  path?: Record<string, any>;
  query?: Record<string, any>;
  body?: any;
  headers?: Record<string, string>;
}

export type FireSuccess = {
  ok: true;
  status: number;
  response_ok: boolean;
  headers: Record<string, string>;
  body: any;
};

export type FireFailure = {
  ok: false;
  status: 0;
  error: string;
  message: string;
  hint?: string;
};

export type FireResult = FireSuccess | FireFailure;

export async function readStdin(): Promise<string | null> {
  if (process.stdin.isTTY) return null;
  if (typeof Bun !== "undefined") return (await Bun.stdin.text()) || null;
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return chunks.length ? Buffer.concat(chunks).toString("utf8") : null;
}

export function parseJson(text: string, where: string): any {
  try {
    return JSON.parse(text);
  } catch (e) {
    // Callers that want die() should call die() themselves after this throws.
    throw new Error(`Input from ${where} is not valid JSON: ${(e as Error).message}`);
  }
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/$/, "") + path;
}

export function buildRequest(op: Operation, input: Input, base_url: string): string {
  let path = op.path;
  for (const p of op.params) {
    if (p.in !== "path") continue;
    const v = input.path?.[p.name];
    if (v === undefined) throw new Error(`missing required path param '${p.name}'`);
    path = path.replace(`{${p.name}}`, encodeURIComponent(String(v)));
  }
  const url = new URL(joinUrl(base_url, path));
  for (const [k, v] of Object.entries(input.query ?? {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

export interface FireOptions {
  op: Operation;
  input: Input;
  base_url: string;
  cfgHeaders: Record<string, string>;
  redactKeys: Set<string>;
  dryRun: boolean;
}

export interface DryRunResult {
  ok: true;
  dry_run: true;
  request: { method: string; url: string; headers: Record<string, string>; body?: any };
}

export async function fire(opts: FireOptions): Promise<FireResult | DryRunResult> {
  const { op, input, base_url, cfgHeaders, redactKeys, dryRun } = opts;

  let url: string;
  try {
    url = buildRequest(op, input, base_url);
  } catch (e) {
    return fail("BAD_REQUEST", (e as Error).message, HINTS.useInspect) as FireFailure;
  }

  const headers: Record<string, string> = { ...cfgHeaders, ...(input.headers ?? {}) };
  const hasBody = input.body !== undefined;
  if (hasBody && !Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }
  const method = op.method.toUpperCase();

  if (dryRun) {
    const redacted: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) redacted[k] = redactKeys.has(k) ? "***" : v;
    return {
      ok: true,
      dry_run: true,
      request: { method, url, headers: redacted, ...(hasBody ? { body: input.body } : {}) },
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
