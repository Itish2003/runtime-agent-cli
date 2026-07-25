import { defineHook } from "eve/hooks";
import { recordUsage } from "../lib/spend-guard";

// Meter half of the spend control, ported from the portfolio: usage lives on
// step.completed (provider-reported). Hooks are observe-only — enforcement is
// the checkSpend() call in agent/channels/a2a.ts reading the same ledger.
export default defineHook({
  events: {
    async "step.completed"(event) {
      const usage = (
        event.data as {
          usage?: { inputTokens?: number; outputTokens?: number };
        }
      ).usage;
      const input = usage?.inputTokens ?? 0;
      const output = usage?.outputTokens ?? 0;
      if (input === 0 && output === 0) return;
      // Never let ledger trouble break a turn — the gate fails closed at
      // the ceiling; the meter fails open and logs.
      await recordUsage(input, output).catch((err) =>
        console.warn("spend-meter: ledger write failed", err),
      );
    },
  },
});
