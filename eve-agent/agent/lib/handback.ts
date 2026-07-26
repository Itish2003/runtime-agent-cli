import { defineState } from "eve/context";

// Loop safety for the handback tool (agent/tools/hand_back.ts).
//
// The cycle to break: visitor → rac → portfolio root agent → rac → …
// Every hop is a full model turn, so a cycle burns the visitor's patience
// and Itish's token budget at the same time. Two facts make the guard
// deterministic — no model judgment in the loop:
//
//  1. The portfolio names its remote conversations `pf-<its session id>`
//     (portfolioContextId() in the portfolio repo's
//     agent/lib/a2a-constants.ts), and that contextId arrives as this
//     channel's continuation token. A `pf-` token therefore means "the
//     caller on this session is the portfolio's root agent, not a browser".
//  2. Anything we hand back carries HANDBACK_SENTINEL in its text. If the
//     portfolio relays the question back down to us verbatim, we recognize
//     our own marker even when the token convention above ever changes.
//
// The hook (agent/hooks/handback-guard.ts) reads both at `message.received`
// — before the model runs — and writes the verdict into durable session
// state; the tool refuses on it. The tool cannot read the continuation
// token itself (tool ctx is SessionContext, which has no channel field),
// which is exactly why the hook exists.
//
// What this bounds and what it does not: refusing on a portfolio-originated
// turn is the cut that actually breaks the cycle. HANDBACK_CAP_PER_SESSION
// is a cost bound on ONE visitor conversation — it cannot see a cycle,
// because each portfolio hop opens a different rac session with its own
// state.

/** Prefix the portfolio's root agent uses for contextIds it opens. */
export const PORTFOLIO_CONTEXT_PREFIX = "pf-";

/** Marker embedded in every message we hand back to the portfolio. */
export const HANDBACK_SENTINEL = "[x-portfolio-handback";

/** Handbacks allowed per visitor conversation (cost bound, not loop bound). */
export const HANDBACK_CAP_PER_SESSION = 2;

export type HandbackOrigin = "portfolio" | "visitor" | "unknown";

export type HandbackGuardState = {
  /** Who is on the other end of THIS session's inbound requests. */
  origin: HandbackOrigin;
  /** Handbacks already spent on this session. */
  spent: number;
};

export const handbackGuard = defineState<HandbackGuardState>(
  "rac.handback-guard",
  () => ({ origin: "unknown", spent: 0 }),
);

/**
 * eve namespaces a channel's continuation token by channel name before it
 * reaches HookContext — a contextId of `pf-abc` arrives as `a2a:pf-abc`
 * (observed in dev, eve 0.27.5). Matching after a `:` boundary as well as at
 * the start survives that without depending on the channel's name.
 */
const PORTFOLIO_TOKEN_RE = new RegExp(`(?:^|:)${PORTFOLIO_CONTEXT_PREFIX}`);

/**
 * Classify the caller. `unknown` (no channel token — a non-A2A entry point)
 * stays allowed and relies on the per-session cap: failing closed there
 * would break the local chat page, and the cap still bounds the cost.
 */
export function classifyOrigin(
  continuationToken: string | undefined,
  inboundText: string | undefined,
): HandbackOrigin {
  if (continuationToken && PORTFOLIO_TOKEN_RE.test(continuationToken)) {
    return "portfolio";
  }
  if (inboundText?.includes(HANDBACK_SENTINEL)) return "portfolio";
  if (continuationToken) return "visitor";
  return "unknown";
}
