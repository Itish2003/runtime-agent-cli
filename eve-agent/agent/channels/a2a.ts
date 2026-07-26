import { randomUUID } from "node:crypto";
import { defineChannel, GET, POST } from "eve/channels";
import {
  AgentCard,
  type Message,
  type Part,
  Role,
  SendMessageRequest,
  SendMessageResponse,
  StreamResponse,
} from "@a2a-js/sdk";
import { checkSpend, clientIp } from "../lib/spend-guard";
import { CHAT_PAGE_HTML } from "../lib/chat-page";
import {
  CHUNK_DELTA,
  CHUNK_FINAL,
  CHUNK_METADATA_KEY,
  REASONING_MEDIA_TYPE,
  TERMINAL_REPLAY_MEDIA_TYPE,
} from "../lib/a2a-media";

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
    // SendStreamingMessage is implemented below (JSON-RPC over SSE). The flag
    // is only ever as true as the deployment: if the host ahead of this
    // process buffers response bodies, flip it back rather than lie — a
    // client that trusts it and gets one big frame is worse off than a
    // client that knew to block.
    streaming: true,
    pushNotifications: false,
    extensions: [
      {
        // Streaming convention: reasoning arrives as its own text part typed
        // REASONING_MEDIA_TYPE, and every frame carries
        // message.metadata.portfolioChunk = "delta" | "final". See
        // agent/lib/a2a-media.ts.
        uri: "urn:x-portfolio:reasoning-stream",
        description:
          "SendStreamingMessage frames tag reasoning parts by media type and mark the final frame in message metadata.",
        required: false,
        params: {},
      },
      {
        // Portfolio convention: replies carry a text part with mediaType
        // TERMINAL_REPLAY_MEDIA_TYPE holding the turn's real CLI calls
        // (command + JSON output) so the embedder can render them as a
        // terminal session. The demo IS the tool actually running.
        uri: "urn:x-portfolio:terminal-replay",
        description:
          "Replies include the agent's actual runtime-agent-cli invocations as structured frames.",
        required: false,
        params: {},
      },
    ],
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

// One real CLI invocation from this turn, for the terminal-replay demo.
export type ReplayFrame = {
  cmd: string;
  output: string;
  status: string;
};

// Re-exported for callers that already import it from the channel.
export { TERMINAL_REPLAY_MEDIA_TYPE };

function racCmd(input: Record<string, unknown>): string {
  const parts = ["rac", String(input.action ?? "")];
  if (input.query) parts.push(String(input.query));
  if (input.operationId) parts.push(String(input.operationId));
  if (input.dryRun) parts.push("--dry-run");
  return parts.filter(Boolean).join(" ");
}

/**
 * What one harness event means for OUR turn. Both methods read the same
 * session event stream and must scope it identically — `SendMessage` waits
 * for `done`, `SendStreamingMessage` forwards every increment on the way
 * there — so the classification lives here once.
 */
type TurnUpdate =
  | { kind: "none" }
  /** A rac invocation started or finished; the frame list changed. */
  | { kind: "frames" }
  | { kind: "text"; delta: string }
  | { kind: "reasoning"; delta: string }
  /** The turn's visible answer is final. */
  | { kind: "message"; reply: string }
  /** The turn (or the session) came to rest. */
  | { kind: "done" }
  | { kind: "failed"; detail: string };

/**
 * A resumed session's stream replays history first. Our turn is the LAST
 * `message.received` whose text matches what we just sent; its turnId keys
 * every event we may act on. Anything before that — and anything from
 * another turn — is somebody else's answer, so it is dropped: without this,
 * a visitor's second message would stream the first answer's tokens back.
 */
function createTurnTracker(sentText: string) {
  let turnId: string | undefined;
  // callId -> frame, insertion-ordered; scoped to OUR turnId so a resumed
  // session's replayed history never leaks old invocations into this reply.
  const frames = new Map<string, ReplayFrame>();

  function apply(event: StreamEvent): TurnUpdate {
    const data = (event.data ?? {}) as Record<string, unknown>;
    if (event.type === "message.received" && data.message === sentText) {
      turnId = data.turnId as string;
      frames.clear();
      return { kind: "none" };
    }
    // session-level failures are not turn-scoped
    if (event.type === "turn.failed" || event.type === "session.failed") {
      return { kind: "failed", detail: JSON.stringify(data).slice(0, 300) };
    }
    if (turnId === undefined) return { kind: "none" };
    if (event.type === "session.waiting") return { kind: "done" };
    if (data.turnId !== turnId) return { kind: "none" };

    switch (event.type) {
      case "actions.requested": {
        type Req = {
          kind: string;
          callId: string;
          toolName?: string;
          input?: Record<string, unknown>;
        };
        let added = false;
        for (const a of (data.actions ?? []) as Req[]) {
          if (a.kind === "tool-call" && a.toolName === "rac") {
            frames.set(a.callId, {
              cmd: racCmd(a.input ?? {}),
              output: "",
              status: "running",
            });
            added = true;
          }
        }
        return added ? { kind: "frames" } : { kind: "none" };
      }
      case "action.result": {
        const result = (data.result ?? {}) as { callId?: string; output?: unknown };
        const frame = result.callId ? frames.get(result.callId) : undefined;
        if (!frame) return { kind: "none" };
        frame.status = String(data.status ?? "completed");
        frame.output = JSON.stringify(result.output ?? null, null, 2).slice(0, 4000);
        return { kind: "frames" };
      }
      case "reasoning.appended":
        return { kind: "reasoning", delta: String(data.reasoningDelta ?? "") };
      case "message.appended":
        return { kind: "text", delta: String(data.messageDelta ?? "") };
      case "message.completed":
        return { kind: "message", reply: String(data.message ?? "") };
      case "turn.completed":
        return { kind: "done" };
      default:
        return { kind: "none" };
    }
  }

  return { apply, list: () => [...frames.values()] };
}

// Observed live: the local gemma4:12b box (behind the Cloudflare quick
// tunnel) replies in ~40-80s normally but spiked past 180s once under
// contention, tripping this timeout for a request that would have otherwise
// succeeded. Matches the portfolio's 540s convention for the same model
// chain rather than inventing a smaller number.
const TURN_TIMEOUT_MS = 540_000;

async function awaitTurnReply(
  stream: ReadableStream<StreamEvent>,
  sentText: string,
  timeoutMs = TURN_TIMEOUT_MS,
): Promise<{ reply: string; frames: ReplayFrame[] }> {
  const reader = stream.getReader();
  const timer = setTimeout(() => void reader.cancel().catch(() => {}), timeoutMs);
  const tracker = createTurnTracker(sentText);
  let reply: string | undefined;

  try {
    for (;;) {
      const { done, value: event } = await reader.read();
      if (done) break;
      const update = tracker.apply(event);
      if (update.kind === "message") reply = update.reply;
      else if (update.kind === "done" && reply !== undefined) {
        return { reply, frames: tracker.list() };
      } else if (update.kind === "failed") {
        throw new Error(`agent turn failed: ${update.detail}`);
      }
    }
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => {});
  }
  if (reply !== undefined) return { reply, frames: tracker.list() };
  throw new Error("timed out waiting for agent reply");
}

// h3's handleCors() (invoked by the generated wrapper around this channel's
// routes, per cors: true below) appends access-control-* headers onto the
// H3Event before this handler ever runs — but that only survives into the
// final HTTP response when nitro converts a plain 200 Response. A raw
// Response.json(..., { status: 403 }) returned from here (the spend-guard
// block) loses the event-level headers somewhere in that conversion —
// confirmed live: the OPTIONS preflight carries them, a 403 body doesn't,
// and a browser can't read a CORS-less response body at all (shows up as a
// bare "Failed to fetch" to the caller, not the actual budget message).
// Attaching the two headers cors:true actually resolves to
// (access-control-allow-origin: *, access-control-expose-headers: *)
// directly on every response this file builds sidesteps that, regardless
// of which framework layer is dropping them.
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-expose-headers": "*",
};

function rpcError(id: unknown, code: number, message: string, status = 200) {
  return Response.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { status, headers: CORS_HEADERS },
  );
}

function textPart(value: string, mediaType = ""): Part {
  return {
    content: { $case: "text", value },
    metadata: undefined,
    filename: "",
    mediaType,
  };
}

// Terminal-replay frames (card extension urn:x-portfolio:terminal-replay):
// a text part typed by mediaType so plain A2A clients see harmless JSON and
// the portfolio renders a terminal.
function replayParts(frames: ReplayFrame[]): Part[] {
  return frames.length > 0
    ? [textPart(JSON.stringify(frames), TERMINAL_REPLAY_MEDIA_TYPE)]
    : [];
}

function agentMessage(
  contextId: string,
  parts: Part[],
  chunk?: typeof CHUNK_DELTA | typeof CHUNK_FINAL,
): Message {
  return {
    messageId: randomUUID(),
    contextId,
    taskId: "",
    role: Role.ROLE_AGENT,
    parts,
    metadata: chunk ? { [CHUNK_METADATA_KEY]: chunk } : undefined,
    extensions: [],
    referenceTaskIds: [],
  };
}

/**
 * JSON-RPC over SSE, A2A 1.0: one `data:` frame per response envelope whose
 * `result` is a StreamResponse. Message mode, not task mode — this agent
 * answers within one turn, so there is no Task to report status on, and
 * inventing one with an empty taskId would be off-spec noise. Completion is
 * therefore an explicit final message frame (metadata portfolioChunk =
 * "final") rather than a status update or a closed socket.
 */
function sseStream(
  events: ReadableStream<StreamEvent>,
  sentText: string,
  contextId: string,
  rpcId: unknown,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const reader = events.getReader();
  const tracker = createTurnTracker(sentText);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk));
      };
      const frame = (payload: unknown) =>
        write(`data: ${JSON.stringify(payload)}\n\n`);
      const send = (parts: Part[], chunk: typeof CHUNK_DELTA | typeof CHUNK_FINAL) =>
        frame({
          jsonrpc: "2.0",
          id: rpcId ?? null,
          result: StreamResponse.toJSON({
            payload: {
              $case: "message",
              value: agentMessage(contextId, parts, chunk),
            },
          }),
        });
      const fail = (message: string) =>
        frame({
          jsonrpc: "2.0",
          id: rpcId ?? null,
          error: { code: -32000, message },
        });

      // The first token can be a minute out on the local model box, and an
      // idle connection is what proxies reap. SSE comments keep it warm and
      // are ignored by every conformant client.
      const heartbeat = setInterval(() => write(": ping\n\n"), 15_000);
      const timer = setTimeout(
        () => void reader.cancel().catch(() => {}),
        TURN_TIMEOUT_MS,
      );
      let reply: string | undefined;

      try {
        for (;;) {
          const { done, value: event } = await reader.read();
          if (done) break;
          const update = tracker.apply(event);
          if (update.kind === "text") {
            if (update.delta) send([textPart(update.delta)], CHUNK_DELTA);
          } else if (update.kind === "reasoning") {
            if (update.delta) {
              send([textPart(update.delta, REASONING_MEDIA_TYPE)], CHUNK_DELTA);
            }
          } else if (update.kind === "frames") {
            // Whole list each time, last-one-wins: the visitor watches the
            // terminal fill in while the answer is still being written.
            send(replayParts(tracker.list()), CHUNK_DELTA);
          } else if (update.kind === "message") {
            reply = update.reply;
          } else if (update.kind === "failed") {
            fail(`agent turn failed: ${update.detail}`);
            return;
          } else if (update.kind === "done" && reply !== undefined) {
            // Authoritative complete message: a client that streamed the
            // deltas replaces its accumulation with this (same text), and a
            // client that ignored them still gets the whole answer plus the
            // extension parts.
            send(
              [textPart(reply), ...replayParts(tracker.list())],
              CHUNK_FINAL,
            );
            return;
          }
        }
        if (reply !== undefined) {
          send([textPart(reply), ...replayParts(tracker.list())], CHUNK_FINAL);
        } else {
          fail("timed out waiting for agent reply");
        }
      } catch (err) {
        fail(`stream error: ${(err as Error).message?.slice(0, 300)}`);
      } finally {
        clearInterval(heartbeat);
        clearTimeout(timer);
        await reader.cancel().catch(() => {});
        closed = true;
        controller.close();
      }
    },
    async cancel() {
      // Visitor navigated away: stop draining the session's events.
      await reader.cancel().catch(() => {});
    },
  });
}

export default defineChannel({
  cors: true,
  routes: [
    // Human-facing surface at the agent's own origin. Static HTML, vanilla
    // JS, no build step (agent/lib/chat-page.ts); it talks to /a2a and the
    // agent card below, both already public on this channel.
    //
    // NOT mounted at literal "/": eve's nitro host unconditionally registers
    // its own framework landing page at GET "/" before any channel routes
    // are registered (registerApplicationRoutes in
    // eve/dist/src/internal/nitro/host/configure-nitro-routes.js calls
    // addFrameworkVirtualHandler for "/" first, then
    // registerChannelVirtualHandlers) — confirmed empirically: a GET("/")
    // route here, and even a public/index.html static file, both lost to
    // eve's built-in "eve" page. No documented config disables it. "/chat"
    // is the closest available root-level path.
    GET("/chat", async () =>
      new Response(CHAT_PAGE_HTML, {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    ),

    // The spec path is /.well-known/agent-card.json, but a literal route
    // ending in ".json" breaks eve's build (nitro/rolldown parses the
    // generated route module as JSON because of the extension). Matching the
    // filename as a param keeps the extension out of the route pattern.
    GET("/.well-known/:file", async (_req, { params }) => {
      if (params.file !== "agent-card.json") {
        return new Response("not found", { status: 404, headers: CORS_HEADERS });
      }
      return Response.json(AgentCard.toJSON(card), { headers: CORS_HEADERS });
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
      // Both methods take SendMessageRequest params and share every
      // precondition below; only the response shape differs.
      const streaming = rpc.method === "SendStreamingMessage";
      if (rpc.method !== "SendMessage" && !streaming) {
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

      // Spend guard (ported from the portfolio's agent/lib/spend-guard.ts):
      // this channel is defineChannel, not eveChannel, so it has no auth
      // walk to hook into — the ceiling check runs directly in the handler,
      // same Neon ledger, same per-IP/global session and token caps.
      // NOTE: contextId is caller-supplied, not server-assigned, so a
      // hostile caller can send a fresh one every request and never accrue
      // against the per-IP session cap. The token ceilings still bound
      // total spend regardless. Left as-is (matches the portfolio's session
      // semantics for legitimate multi-turn callers); tighten if the
      // per-IP session cap needs to be un-bypassable.
      const newSession = !params.message?.contextId;
      try {
        const verdict = await checkSpend(clientIp(req.headers), newSession);
        if (!verdict.allowed) {
          return rpcError(
            rpc.id,
            -32000,
            `Over today's budget (${verdict.reason}). Come back tomorrow.`,
            403,
          );
        }
      } catch (err) {
        // Ledger unreachable ≠ policy violation: fail OPEN on infra errors.
        console.warn("spend-guard: ledger unavailable, letting request pass", err);
      }

      // Same contextId semantics for both methods: caller-supplied ids
      // continue the eve session behind them (the portfolio derives one
      // remote conversation per portfolio-session × project), and a first
      // turn without one gets a fresh id echoed back on every frame.
      const contextId = params.message?.contextId || randomUUID();
      const session = await send(text, {
        auth: null,
        continuationToken: contextId,
      });
      const events = await session.getEventStream();

      if (streaming) {
        return new Response(sseStream(events, text, contextId, rpc.id), {
          headers: {
            ...CORS_HEADERS,
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache, no-transform",
            connection: "keep-alive",
            // Nginx-family proxies buffer text/event-stream by default;
            // this is the header they all agree to turn it off with.
            "x-accel-buffering": "no",
          },
        });
      }

      const { reply: replyText, frames } = await awaitTurnReply(events, text);
      const reply = agentMessage(contextId, [
        textPart(replyText),
        ...replayParts(frames),
      ]);
      return Response.json(
        {
          jsonrpc: "2.0",
          id: rpc.id ?? null,
          result: SendMessageResponse.toJSON({
            payload: { $case: "message", value: reply },
          }),
        },
        { headers: CORS_HEADERS },
      );
    }),
  ],
});
