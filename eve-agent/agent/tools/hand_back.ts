import { randomUUID } from "node:crypto";
import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  AgentCard,
  Role,
  SendMessageRequest,
  SendMessageResponse,
} from "@a2a-js/sdk";
import {
  HANDBACK_CAP_PER_SESSION,
  HANDBACK_SENTINEL,
  handbackGuard,
} from "../lib/handback";
import { TERMINAL_REPLAY_MEDIA_TYPE } from "../lib/a2a-media";

// Hand a question this agent has no business answering back UP to the
// portfolio's root agent, which owns routing between projects.
//
// Why a tool and not prose: this agent knows runtime-agent-cli and nothing
// else. Answering "how does fable-2.0 work?" from general knowledge is the
// exact failure the one-agent-per-project architecture exists to prevent —
// so the honest move is to ask the agent that can route the question to the
// project that owns it, and relay what comes back.
//
// Loop safety lives in agent/lib/handback.ts + agent/hooks/handback-guard.ts.

/**
 * Where to look for the portfolio's agent card. The JSONRPC URL itself is
 * NEVER hardcoded — it is read from the card at call time, the same courtesy
 * the portfolio extends to project agents (it discovers us from our card
 * rather than pinning our endpoint).
 */
const PORTFOLIO_BASE_URL =
  process.env.PORTFOLIO_BASE_URL ?? "http://localhost:3000";

const CARD_PATH = "/.well-known/agent-card.json";

/**
 * Budget arithmetic: the visitor's browser gives up at 360s
 * (LeafPane.tsx's AbortSignal.timeout(360_000)), and this agent still needs
 * its own model turn to relay the answer afterwards. 210s for the nested
 * call — itself at least two model turns on the portfolio side — leaves that
 * final turn room inside the visitor's window instead of hanging past it.
 */
const HANDBACK_TIMEOUT_MS = 210_000;
const CARD_TIMEOUT_MS = 8_000;

/** Fresh remote conversation per handback: no state to leak, easy to trace. */
function handbackContextId(): string {
  return `rac-hb-${randomUUID()}`;
}

async function portfolioJsonRpcUrl(): Promise<{ url: string; name: string }> {
  const res = await fetch(new URL(CARD_PATH, PORTFOLIO_BASE_URL), {
    signal: AbortSignal.timeout(CARD_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`portfolio agent card: HTTP ${res.status}`);
  const card = AgentCard.fromJSON(await res.json());
  const iface = card.supportedInterfaces.find(
    (i) => i.protocolBinding?.toUpperCase() === "JSONRPC",
  );
  if (!iface?.url) throw new Error(`${card.name}: no JSONRPC interface in card`);
  return { url: iface.url, name: card.name };
}

export default defineTool({
  description:
    "Ask the portfolio's ROOT agent — the agent one level up, which routes between all of Itish's projects. Use this whenever the visitor asks about a DIFFERENT project, asks what else Itish has built, or wants a comparison you cannot ground in the runtime-agent-cli repo. You own runtime-agent-cli and nothing else: never answer from general knowledge about a project you do not own, even if you think you know it — hand the question up instead and relay the answer you get back. Returns the root agent's answer, or a refusal explaining what to tell the visitor instead.",
  inputSchema: z.object({
    question: z
      .string()
      .describe(
        "The visitor's question, phrased for the root agent (name the project they asked about).",
      ),
  }),
  async execute({ question }) {
    const state = handbackGuard.get();

    // The cut that breaks the cycle: this turn came FROM the portfolio, so
    // handing back would ask the caller its own question.
    if (state.origin === "portfolio") {
      return {
        ok: false,
        error: "HANDBACK_REFUSED_LOOP",
        message:
          "This question arrived from the portfolio's root agent, so handing it back would be a loop.",
        say_instead:
          "Answer only what runtime-agent-cli grounds, and state plainly that the rest is outside this project — the root agent already has the routing.",
      };
    }
    if (state.spent >= HANDBACK_CAP_PER_SESSION) {
      return {
        ok: false,
        error: "HANDBACK_CAP",
        message: `Already handed back ${state.spent} time(s) this conversation (cap ${HANDBACK_CAP_PER_SESSION}).`,
        say_instead:
          "Tell the visitor to ask the root agent above directly for other projects — each hop is a full model turn and this conversation has spent its budget.",
      };
    }
    // Spend the budget BEFORE the call: a hung or failed handback must still
    // count, or a failing portfolio becomes an unbounded retry loop.
    handbackGuard.update((s) => ({ ...s, spent: s.spent + 1 }));

    let target: { url: string; name: string };
    try {
      target = await portfolioJsonRpcUrl();
    } catch (e) {
      return {
        ok: false,
        error: "PORTFOLIO_UNREACHABLE",
        message: `Could not discover the portfolio agent: ${(e as Error).message?.slice(0, 300)}`,
        say_instead:
          "Tell the visitor this project agent only covers runtime-agent-cli and to ask the root agent above about other projects.",
      };
    }

    // The sentinel makes the hop visible to whoever receives it — including
    // us, if the portfolio ever relays this text straight back down.
    const text = [
      `${HANDBACK_SENTINEL} hop=1 from=runtime-agent-cli]`,
      "The visitor is currently talking to the runtime-agent-cli project agent, which owns only that project — do not route this back to runtime-agent-cli.",
      "",
      `Visitor's question: ${question}`,
    ].join("\n");

    const params = SendMessageRequest.toJSON({
      tenant: "",
      configuration: undefined,
      metadata: undefined,
      message: {
        messageId: randomUUID(),
        contextId: handbackContextId(),
        taskId: "",
        role: Role.ROLE_USER,
        parts: [
          {
            content: { $case: "text", value: text },
            metadata: undefined,
            filename: "",
            mediaType: "",
          },
        ],
        metadata: undefined,
        extensions: [],
        referenceTaskIds: [],
      },
    });

    try {
      const res = await fetch(target.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "SendMessage",
          params,
        }),
        signal: AbortSignal.timeout(HANDBACK_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        result?: unknown;
        error?: { code: number; message: string };
      };
      if (json.error) {
        throw new Error(`JSON-RPC ${json.error.code} ${json.error.message}`);
      }
      const response = SendMessageResponse.fromJSON(json.result);
      if (response.payload?.$case !== "message") {
        // A Task payload means long-running work with no answer yet; this
        // agent has no polling loop, so treat it as unavailable.
        throw new Error("root agent returned a task, not an answer");
      }
      const answer = response.payload.value.parts
        .map((p) =>
          p.content?.$case === "text" && p.mediaType !== TERMINAL_REPLAY_MEDIA_TYPE
            ? p.content.value
            : "",
        )
        .filter(Boolean)
        .join("\n");
      return {
        ok: true,
        asked: target.name,
        answer,
        relay:
          "Relay this answer and credit it to the root agent — it came from a different agent, not from you.",
      };
    } catch (e) {
      return {
        ok: false,
        error: "HANDBACK_FAILED",
        message: `${target.name}: ${(e as Error).message?.slice(0, 300)}`,
        say_instead:
          "Tell the visitor the root agent above is the one to ask about other projects — this agent speaks for runtime-agent-cli only.",
      };
    }
  },
});
