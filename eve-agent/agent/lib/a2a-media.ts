// Portfolio A2A part conventions, in one place so the channel, the tools and
// the chat page cannot drift apart. Mirrors the portfolio repo's
// agent/lib/a2a-constants.ts — that repo is the naming authority.

/**
 * A text part typed with this media type holds the turn's real CLI calls as
 * JSON `[{cmd, output, status}]`. Card extension:
 * urn:x-portfolio:terminal-replay.
 */
export const TERMINAL_REPLAY_MEDIA_TYPE =
  "application/x-portfolio-terminal-replay+json";

/**
 * Streaming only: a text part typed with this media type is the model's
 * reasoning, NOT part of the answer. Clients render it separately (the
 * portfolio's leaf collapses it into a 「thinking」 block); a client that
 * does not understand it must drop it rather than concatenate it into the
 * reply. Card extension: urn:x-portfolio:reasoning-stream.
 */
export const REASONING_MEDIA_TYPE = "text/x-portfolio-reasoning";

/**
 * Streaming only: `message.metadata.portfolioChunk` on every frame.
 * `"delta"` — an increment; append it (or, for typed extension parts,
 * last-one-wins). `"final"` — the authoritative complete message; REPLACE
 * accumulated text with it and stop reading. The final frame is explicit so
 * a client never has to infer completion from a closed connection.
 */
export const CHUNK_METADATA_KEY = "portfolioChunk";
export const CHUNK_DELTA = "delta";
export const CHUNK_FINAL = "final";
