// Every command prints exactly one JSON object through here.
// Deterministic, machine-readable, even on crash. (§7 of the PRD.)

export interface Err {
  ok: false;
  error: string; // stable machine code, e.g. "OP_NOT_FOUND"
  message: string; // human/agent-readable
  hint?: string; // pedagogical: doctrine + the correct shape (§6b mechanism 2)
  [k: string]: unknown; // commands enrich the error (run adds status/operation/env)
}

// Shapes vary per command (run enriches with status/headers/body; commands add
// operation/env) — so the only fixed guarantees are `ok` plus, on failure, error+message.
// Both sides stay open to extra fields; the union is the actual §7 contract.
export type Ok = { ok: true; [k: string]: unknown };
export type Envelope = Ok | Err;

export function emit(payload: Envelope): void {
  process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
}

export function ok<T extends object>(data: T): { ok: true } & T {
  return { ok: true, ...data };
}

export function fail(error: string, message: string, hint?: string): Err {
  return { ok: false, error, message, ...(hint ? { hint } : {}) };
}

// Emit an error envelope and exit non-zero. Errors teach (pass a hint).
export function die(error: string, message: string, hint?: string): never {
  emit(fail(error, message, hint));
  process.exit(1);
}
