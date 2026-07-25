import { randomUUID } from "node:crypto";
import { defineChannel, GET, POST } from "eve/channels";
import {
  AgentCard,
  type Message,
  Role,
  SendMessageRequest,
  SendMessageResponse,
} from "@a2a-js/sdk";

// A2A spec 1.0 inbound surface. Same reference implementation as
// fable2.0/eve-agent — serialization through @a2a-js/sdk's generated codecs
// (proto3 JSON mapping) so any SDK client round-trips exactly.

const BASE_URL = process.env.A2A_BASE_URL ?? "http://localhost:2002";

const card: AgentCard = {
  name: "runtime-agent-cli",
  description:
    "Project agent for runtime-agent-cli: a dev-time CLI (npm: runtime-agent-cli) that reflects a live API's OpenAPI spec into a discoverable, executable surface for AI coding agents. It breaks the self-confirming loop where an agent writes the backend and the tests from the same assumptions — the tool owns the mechanics (parse, dereference, construct, redact), the agent owns the judgment. Ask about the token-efficiency numbers, the enforced read-only default, or what a live call reveals that the spec never declared.",
  version: "0.2.2",
  supportedInterfaces: [
    {
      url: `${BASE_URL}/a2a`,
      protocolBinding: "JSONRPC",
      protocolVersion: "1.0",
      tenant: "",
    },
  ],
  provider: undefined,
  documentationUrl: "https://github.com/Itish2003/runtime-agent-cli",
  capabilities: {
    streaming: false,
    pushNotifications: false,
    extensions: [],
    extendedAgentCard: false,
  },
  securitySchemes: {},
  securityRequirements: [],
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [
    {
      id: "explain-thesis",
      name: "Why green tests prove nothing",
      description:
        "Explain the self-confirming loop: a coding agent writes the backend and the tests from the same assumptions, so a passing suite is the agent grading its own homework. The CLI is the outside signal — it verifies against what the live server actually returns.",
      tags: ["testing", "verification", "ai-agents", "reliability"],
      examples: [
        "Why can't the agent just write its own tests?",
        "What problem does runtime-agent-cli solve?",
      ],
      inputModes: [],
      outputModes: [],
      securityRequirements: [],
    },
    {
      id: "token-efficiency",
      name: "Token-efficiency numbers",
      description:
        "Quote the measured compression: GitHub REST (1,186 ops, ~3.1M tokens) costs the agent ~554 tokens via search + inspect — 5,656×. Stripe 3,200×, Kubernetes 2,243×. Output stays ~500 tokens regardless of spec size, so bigger APIs win more.",
      tags: ["tokens", "openapi", "efficiency", "benchmarks"],
      examples: ["How much cheaper is it than reading the spec?"],
      inputModes: [],
      outputModes: [],
      securityRequirements: [],
    },
    {
      id: "safety-model",
      name: "Enforced read-only default",
      description:
        "Explain that `rac run` refuses write verbs with WRITE_BLOCKED unless --allow-writes is passed — enforced in the tool, not the UI. Two funded browser vendors (Steel, Browserbase) ship 'read-only' live views enforced only client-side; this CLI enforces safe-by-default where they don't.",
      tags: ["safety", "read-only", "defaults"],
      examples: ["What stops an agent from mutating my API?"],
      inputModes: [],
      outputModes: [],
      securityRequirements: [],
    },
    {
      id: "spec-vs-reality",
      name: "What the spec never tells you",
      description:
        "Describe the measured finding: fable-2.0's OpenAPI declared an empty response schema for list_stories, while the live call returned eight fields — including last_update typed as a string. FastAPI emits empty response schemas unless response_model is declared, so this generalizes. The live call is the ground truth; the spec is a rumor.",
      tags: ["openapi", "fastapi", "ground-truth"],
      examples: ["What does a live call reveal that the spec doesn't?"],
      inputModes: [],
      outputModes: [],
      securityRequirements: [],
    },
    {
      id: "try-it",
      name: "Install and try it",
      description:
        "Point visitors at the published package: npm install -g runtime-agent-cli (or bunx runtime-agent-cli), then rac init / rac search / rac inspect / rac run against any OpenAPI URL. Requires Bun; all output is deterministic JSON, even on error.",
      tags: ["install", "npm", "quickstart"],
      examples: ["How do I try it?"],
      inputModes: [],
      outputModes: [],
      securityRequirements: [],
    },
  ],
  signatures: [],
};

// eve continuation token ↔ A2A contextId: both name a resumable conversation.

type StreamEvent = { type: string; data?: Record<string, unknown> };

async function awaitTurnReply(
  stream: ReadableStream<StreamEvent>,
  sentText: string,
  timeoutMs = 180_000,
): Promise<string> {
  const reader = stream.getReader();
  const timer = setTimeout(() => void reader.cancel().catch(() => {}), timeoutMs);
  // A resumed session's stream replays history first. Our turn is the LAST
  // message.received whose text matches what we just sent; its turnId keys
  // the completion events we wait for.
  let turnId: string | undefined;
  let reply: string | undefined;

  try {
    for (;;) {
      const { done, value: event } = await reader.read();
      if (done) break;
      const data = (event.data ?? {}) as Record<string, unknown>;
      if (event.type === "message.received" && data.message === sentText) {
        turnId = data.turnId as string;
      } else if (
        event.type === "message.completed" &&
        turnId !== undefined &&
        data.turnId === turnId
      ) {
        reply = data.message as string;
      } else if (
        (event.type === "turn.completed" && data.turnId === turnId) ||
        event.type === "session.waiting"
      ) {
        if (reply !== undefined) return reply;
      } else if (event.type === "turn.failed" || event.type === "session.failed") {
        throw new Error(`agent turn failed: ${JSON.stringify(data).slice(0, 300)}`);
      }
    }
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => {});
  }
  if (reply !== undefined) return reply;
  throw new Error("timed out waiting for agent reply");
}

function rpcError(id: unknown, code: number, message: string, status = 200) {
  return Response.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { status },
  );
}

export default defineChannel({
  cors: true,
  routes: [
    // The spec path is /.well-known/agent-card.json, but a literal route
    // ending in ".json" breaks eve's build (nitro/rolldown parses the
    // generated route module as JSON because of the extension). Matching the
    // filename as a param keeps the extension out of the route pattern.
    GET("/.well-known/:file", async (_req, { params }) => {
      if (params.file !== "agent-card.json") {
        return new Response("not found", { status: 404 });
      }
      return Response.json(AgentCard.toJSON(card));
    }),

    POST("/a2a", async (req, { send }) => {
      let rpc: { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };
      try {
        rpc = await req.json();
      } catch {
        return rpcError(null, -32700, "Parse error");
      }
      if (rpc.jsonrpc !== "2.0") {
        return rpcError(rpc.id, -32600, "Invalid Request: jsonrpc must be '2.0'");
      }
      if (rpc.method !== "SendMessage") {
        return rpcError(rpc.id, -32601, `Method not found: ${rpc.method}`);
      }

      let params: SendMessageRequest;
      try {
        params = SendMessageRequest.fromJSON(rpc.params);
      } catch {
        return rpcError(rpc.id, -32602, "Invalid params");
      }
      const text = (params.message?.parts ?? [])
        .map((p) => (p.content?.$case === "text" ? p.content.value : ""))
        .filter(Boolean)
        .join("\n");
      if (!text) {
        return rpcError(rpc.id, -32602, "Invalid params: no text parts in message");
      }

      const contextId = params.message?.contextId || randomUUID();
      const session = await send(text, {
        auth: null,
        continuationToken: contextId,
      });
      const replyText = await awaitTurnReply(await session.getEventStream(), text);

      const reply: Message = {
        messageId: randomUUID(),
        contextId,
        taskId: "",
        role: Role.ROLE_AGENT,
        parts: [
          {
            content: { $case: "text", value: replyText },
            metadata: undefined,
            filename: "",
            mediaType: "",
          },
        ],
        metadata: undefined,
        extensions: [],
        referenceTaskIds: [],
      };
      return Response.json({
        jsonrpc: "2.0",
        id: rpc.id ?? null,
        result: SendMessageResponse.toJSON({
          payload: { $case: "message", value: reply },
        }),
      });
    }),
  ],
});
