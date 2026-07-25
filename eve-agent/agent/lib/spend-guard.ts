import { Pool } from "pg";

// Anti-abuse spend controls, ported from the portfolio's agent/lib/spend-guard.ts
// (same MEMORY_DATABASE_URL Neon instance). The /a2a channel here (agent/channels/a2a.ts)
// doesn't use eveChannel's auth walk, so the guard is invoked directly inside the
// POST /a2a handler rather than as an AuthFn — same ledger, same ceilings.
//   meter — agent/hooks/spend-meter.ts records step.completed usage into the
//           daily Postgres ledger (hooks can observe, never block);
//   gate  — checkSpend() below is called at the top of the /a2a handler and
//           returns a verdict the handler turns into a 403 when a ceiling is hit.

const pool = new Pool({
  connectionString:
    process.env.MEMORY_DATABASE_URL ??
    "postgres://postgres@localhost:5432/portfolio_memory",
  max: 2,
});

let ready: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  ready ??= pool
    .query(
      `CREATE TABLE IF NOT EXISTS spend_ledger (
         day DATE NOT NULL,
         ip TEXT NOT NULL,
         sessions INT NOT NULL DEFAULT 0,
         input_tokens BIGINT NOT NULL DEFAULT 0,
         output_tokens BIGINT NOT NULL DEFAULT 0,
         PRIMARY KEY (day, ip)
       )`,
    )
    .then(() => undefined);
  return ready;
}

// All ceilings are per UTC day and env-tunable; defaults sized for a small
// public project agent on a metered flash-tier model.
const CEILINGS = {
  sessionsPerIp: Number(process.env.SPEND_MAX_SESSIONS_PER_IP ?? 20),
  sessionsGlobal: Number(process.env.SPEND_MAX_SESSIONS ?? 300),
  inputTokensGlobal: Number(process.env.SPEND_MAX_INPUT_TOKENS ?? 20_000_000),
  outputTokensGlobal: Number(process.env.SPEND_MAX_OUTPUT_TOKENS ?? 2_000_000),
};

// x-forwarded-for is trusted here because Vercel sits in front as a proxy
// and overwrites it; locally it is absent and everything aggregates under "local".
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "local";
}

// Hooks receive no request headers, so token usage cannot be attributed to
// a visitor — it lands on one synthetic row. The global ceilings SUM over
// all rows, so attribution doesn't matter for enforcement.
export async function recordUsage(
  inputTokens: number,
  outputTokens: number,
  ip = "_usage",
): Promise<void> {
  await ensureSchema();
  await pool.query(
    `INSERT INTO spend_ledger (day, ip, input_tokens, output_tokens)
     VALUES (CURRENT_DATE, $1, $2, $3)
     ON CONFLICT (day, ip) DO UPDATE SET
       input_tokens = spend_ledger.input_tokens + EXCLUDED.input_tokens,
       output_tokens = spend_ledger.output_tokens + EXCLUDED.output_tokens`,
    [ip, inputTokens, outputTokens],
  );
}

export type SpendVerdict =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Gate a request. `newSession: true` also counts the session against the
 * per-IP and global session caps; resumes only check the token ceilings
 * (their spend is already metered per step).
 */
export async function checkSpend(
  ip: string,
  newSession: boolean,
): Promise<SpendVerdict> {
  await ensureSchema();
  const totals = await pool.query<{
    input_tokens: string;
    output_tokens: string;
    sessions: string;
    ip_sessions: string;
  }>(
    `SELECT
       COALESCE(SUM(input_tokens), 0)::text AS input_tokens,
       COALESCE(SUM(output_tokens), 0)::text AS output_tokens,
       COALESCE(SUM(sessions), 0)::text AS sessions,
       COALESCE(SUM(sessions) FILTER (WHERE ip = $1), 0)::text AS ip_sessions
     FROM spend_ledger WHERE day = CURRENT_DATE`,
    [ip],
  );
  const t = totals.rows[0];
  if (Number(t.input_tokens) >= CEILINGS.inputTokensGlobal) {
    return { allowed: false, reason: "daily input-token ceiling reached" };
  }
  if (Number(t.output_tokens) >= CEILINGS.outputTokensGlobal) {
    return { allowed: false, reason: "daily output-token ceiling reached" };
  }
  if (newSession) {
    if (Number(t.sessions) >= CEILINGS.sessionsGlobal) {
      return { allowed: false, reason: "daily session ceiling reached" };
    }
    if (Number(t.ip_sessions) >= CEILINGS.sessionsPerIp) {
      return { allowed: false, reason: "daily per-visitor session cap reached" };
    }
    await pool.query(
      `INSERT INTO spend_ledger (day, ip, sessions) VALUES (CURRENT_DATE, $1, 1)
       ON CONFLICT (day, ip) DO UPDATE SET sessions = spend_ledger.sessions + 1`,
      [ip],
    );
  }
  return { allowed: true };
}
