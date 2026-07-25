import { defineAgent } from "eve";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// Model selection (MODEL_PRESET):
//   local    — friend's Ollama box first, DeepSeek on infra failure (the
//              graceful-degradation chain; needs DEEPSEEK_API_KEY to arm)
//   deepseek — DeepSeek directly (deployed default; the box is LAN-only
//              until the tunnel exists)
// Explicit MODEL_BASE_URL/MODEL_ID/MODEL_API_KEY bypass presets AND the
// chain — an explicit override means "exactly this endpoint".
// LOCAL_MODEL_BASE_URL/LOCAL_MODEL_ID retarget just the local preset
// (IP changes, future tunnel URL) without disarming the fallback.
const PRESETS = {
  local: {
    baseURL: process.env.LOCAL_MODEL_BASE_URL ?? "http://192.168.1.12:11434/v1",
    modelId: process.env.LOCAL_MODEL_ID ?? "gemma4:12b",
    apiKey: () => undefined as string | undefined,
    contextTokens: 262_144,
  },
  deepseek: {
    baseURL: "https://api.deepseek.com/v1",
    modelId: "deepseek-v4-flash",
    apiKey: () => process.env.DEEPSEEK_API_KEY,
    contextTokens: 131_072,
  },
} as const;

const presetName = (process.env.MODEL_PRESET ?? "local") as keyof typeof PRESETS;
const preset = PRESETS[presetName] ?? PRESETS.local;

function makeModel(
  p: (typeof PRESETS)[keyof typeof PRESETS],
  // The fallback leg of the chain must not inherit MODEL_* overrides —
  // an override names ONE endpoint, and it applies to the primary.
  envOverrides = true,
) {
  return createOpenAICompatible({
    name: "project-model",
    baseURL: (envOverrides ? process.env.MODEL_BASE_URL : undefined) ?? p.baseURL,
    apiKey: (envOverrides ? process.env.MODEL_API_KEY : undefined) ?? p.apiKey(),
    // Without this, stream_options.include_usage is never sent, so a
    // streamed chat completion has no final usage chunk — step.completed
    // fires with usage undefined and the spend-meter hook silently no-ops
    // (its own `if (input === 0 && output === 0) return`). Confirmed via
    // @ai-sdk/openai-compatible source: includeUsage gates that request
    // param per-provider: the OpenAI-compat spec makes it opt-in, so a
    // self-hosted Ollama endpoint honors "don't ask, don't tell" and omits
    // it by default.
    includeUsage: true,
  })((envOverrides ? process.env.MODEL_ID : undefined) ?? p.modelId);
}

type LM = ReturnType<typeof makeModel>;

/** Infra-class failure (unreachable, timeout, 5xx) — not a request bug. */
function isInfraError(err: unknown): boolean {
  const e = err as { statusCode?: number; message?: string; cause?: unknown };
  if (typeof e?.statusCode === "number") return e.statusCode >= 500;
  return true; // no HTTP status ⇒ the call never reached the provider
}

/**
 * Per-request degradation: try primary, fall back on infra errors only.
 * Stream failures fall back only when the stream fails to OPEN — a stream
 * that dies midway already delivered tokens and cannot be restarted cleanly.
 */
function withFallback(primary: LM, secondary: LM): LM {
  const via = async <T>(fn: (m: LM) => PromiseLike<T>): Promise<T> => {
    try {
      return await fn(primary);
    } catch (err) {
      if (!isInfraError(err)) throw err;
      console.warn(
        `model chain: ${primary.modelId} unreachable, degrading to ${secondary.modelId}`,
      );
      return await fn(secondary);
    }
  };
  return new Proxy(primary, {
    get(target, prop, receiver) {
      if (prop === "doGenerate" || prop === "doStream") {
        return (options: unknown) =>
          via((m) =>
            (m[prop] as (o: unknown) => PromiseLike<never>).call(m, options),
          );
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

const chainArmed =
  presetName === "local" &&
  !process.env.MODEL_BASE_URL &&
  Boolean(process.env.DEEPSEEK_API_KEY);

const model = chainArmed
  ? withFallback(makeModel(PRESETS.local), makeModel(PRESETS.deepseek, false))
  : makeModel(preset);

export default defineAgent({
  model,
  modelContextWindowTokens: Number(
    process.env.MODEL_CONTEXT_TOKENS ?? preset.contextTokens,
  ),
  // Both axes explicit per notes/architecture.md §5 — the defaults are
  // effectively uncapped.
  limits: {
    maxInputTokensPerSession: 1_000_000,
    maxOutputTokensPerSession: 100_000,
  },
});
