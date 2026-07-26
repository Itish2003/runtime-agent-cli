import { defineHook } from "eve/hooks";
import { classifyOrigin, handbackGuard } from "../lib/handback";

// Stamps the caller's identity onto durable session state at the start of
// every turn, so agent/tools/hand_back.ts can refuse a portfolio-originated
// turn without trusting the model to notice. `message.received` fires before
// any model step, and HookContext is the only authored surface that exposes
// `channel.continuationToken` — the A2A contextId. See agent/lib/handback.ts
// for what the guard does and does not bound.
export default defineHook({
  events: {
    async "message.received"(event, ctx) {
      const origin = classifyOrigin(
        ctx.channel.continuationToken,
        event.data.message ?? undefined,
      );
      handbackGuard.update((s) => ({ ...s, origin }));
    },
  },
});
