// Every command prints exactly one JSON object through here.
// Deterministic, machine-readable, even on crash. (§7 of the PRD.)

export interface Err {
  ok: false;
  error: string; // stable machine code, e.g. "OP_NOT_FOUND"
  message: string; // human/agent-readable
  hint?: string; // pedagogical: doctrine + the correct shape (§6b mechanism 2)
}

export function emit(payload: object): void {
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
