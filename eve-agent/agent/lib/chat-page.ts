// Human-facing surface for this agent's own origin (GET /chat — eve's own
// nitro host unconditionally owns literal "/", see the comment in
// agent/channels/a2a.ts). Vanilla JS,
// zero dependencies, no build step — a single static HTML string served
// directly by the /a2a channel (agent/channels/a2a.ts owns raw routes).
// Visual vocabulary cribbed from the portfolio (app/globals.css, LeafPane):
// terminal preset, mono, uppercase pane labels, ❯ prompt glyph, accent
// green, statusline at the bottom. Talks straight to this agent's own /a2a
// — nothing routes through the portfolio.
export const CHAT_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>runtime-agent-cli-agent</title>
<style>
:root {
  --bg: #0a0a0a;
  --panel: #0f0f0f;
  --panel-2: #131313;
  --fg: #e5e5e5;
  --dim: #8a8a8a;
  --trace: #5a5a5a;
  --line: #222;
  --accent: #00ff88;
  --accent-dim: #00ff8833;
  --warn: #ffb454;
  --err: #ff5f56;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --track: 0.14em;
  --fs-label: 0.6875rem;
  --fs-small: 0.75rem;
  --pad: 0.75rem;
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  background: var(--bg); color: var(--fg);
  font-family: var(--mono); font-size: 0.875rem; line-height: 1.55;
}
a { color: var(--accent); }
::selection { background: var(--accent); color: #000; }
:focus-visible { outline: 1px solid var(--accent); outline-offset: 2px; }
.shell {
  max-width: 48rem; margin: 0 auto;
  padding: clamp(1.25rem, 2.5vw, 1.75rem) clamp(0.875rem, 2.5vw, 1.25rem) clamp(3rem, 6vw, 3.75rem);
  min-height: 100dvh; display: flex; flex-direction: column; gap: 1.25rem;
}
.masthead .path { color: var(--trace); font-size: var(--fs-small); }
.masthead .path::before { content: "❯ "; color: var(--accent); }
.pitch { display: flex; flex-direction: column; gap: 0.875rem; }
.pitch h1 { font-size: 1.25rem; font-weight: 400; margin: 0; letter-spacing: 0.06em; }
.pitch .tagline { color: var(--fg); max-width: 70ch; margin: 0; line-height: 1.6; }
.install { border: 1px solid var(--line); background: var(--panel); }
.install-head { padding: 0.5rem var(--pad); border-bottom: 1px solid var(--line); color: var(--trace); font-size: var(--fs-label); letter-spacing: var(--track); text-transform: uppercase; }
.install-row { display: flex; align-items: stretch; }
.install-row code { flex: 1; padding: 0.75rem; color: var(--accent); font-family: var(--mono); font-size: 0.8125rem; overflow-x: auto; white-space: pre; }
.install-row button { font-family: var(--mono); font-size: var(--fs-small); color: var(--dim); background: transparent; border: 0; border-left: 1px solid var(--line); padding: 0 1rem; cursor: pointer; white-space: nowrap; }
.install-row button:hover { color: var(--accent); }
.install-alt { padding: 0 var(--pad) 0.625rem; color: var(--trace); font-size: var(--fs-small); }
.capabilities { display: flex; flex-direction: column; gap: 0.375rem; }
.cap { color: var(--dim); font-size: var(--fs-small); max-width: 80ch; }
.cap .glyph { color: var(--accent); }
.pitch-link { margin: 0; font-size: var(--fs-small); }
.section-head { color: var(--trace); font-size: var(--fs-label); letter-spacing: var(--track); text-transform: uppercase; border-bottom: 1px dashed var(--line); padding-bottom: 0.5rem; }
.chat { border: 1px solid var(--line); background: var(--panel); display: flex; flex-direction: column; min-height: min(33.75rem, 70dvh); }
.chat-head {
  padding: 0.625rem var(--pad); border-bottom: 1px solid var(--line);
  color: var(--trace); font-size: var(--fs-label); letter-spacing: var(--track);
  text-transform: uppercase; display: flex; justify-content: space-between; gap: var(--pad);
}
.chat-head .live { color: var(--accent); white-space: nowrap; }
.chat-log { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.875rem; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
.msg { animation: rise 0.25s ease-out; max-width: 72ch; }
@media (prefers-reduced-motion: reduce) { .msg { animation: none; } }
.msg .speaker { font-size: var(--fs-label); letter-spacing: 0.12em; color: var(--trace); margin-bottom: 0.25rem; }
.msg.user .speaker { color: var(--dim); }
.msg.agent .speaker { color: var(--accent); }
.msg .text { white-space: pre-wrap; word-wrap: break-word; }
.msg.user .text { color: var(--dim); }
.term { margin-block: 0.5rem; border: 1px solid var(--line); background: var(--bg); font-size: var(--fs-small); }
.term-head { padding: 0.375em var(--pad); border-bottom: 1px solid var(--line); color: var(--trace); font-size: var(--fs-label); letter-spacing: var(--track); text-transform: uppercase; }
.term-frame { padding: 0.5em var(--pad); }
.term-frame + .term-frame { border-top: 1px solid var(--line); }
.term-cmd { color: var(--accent); }
.term-cmd .prompt-glyph { color: var(--dim); margin-inline-end: 0.5ch; }
.term-status { color: var(--warn); }
.term-out { margin: 0.375em 0 0; max-height: 16em; overflow: auto; white-space: pre; color: var(--dim); }
.delegation { display: inline-flex; align-items: center; gap: 0.5rem; border: 1px solid var(--line); background: var(--panel-2); padding: 0.3125rem 0.625rem; margin: 0.25rem 0; font-size: var(--fs-small); color: var(--dim); }
.delegation .glyph { color: var(--accent); }
.delegation.busy .glyph { animation: blink 0.8s steps(1) infinite; }
@media (prefers-reduced-motion: reduce) { .delegation.busy .glyph { animation: none; } }
.starters { padding: 0 1rem 0.75rem; display: flex; flex-wrap: wrap; gap: 0.5rem; }
.starters button { font-family: var(--mono); font-size: var(--fs-small); color: var(--dim); background: transparent; border: 1px solid var(--line); padding: 0.375rem 0.625rem; cursor: pointer; text-align: left; }
.starters button:hover { color: var(--accent); border-color: var(--accent-dim); }
.composer { display: flex; border-top: 1px solid var(--line); }
.composer .prompt-glyph { padding: 0.75rem 0 0.75rem 0.875rem; color: var(--accent); }
.composer input { flex: 1; font-family: var(--mono); font-size: 0.875rem; color: var(--fg); background: transparent; border: 0; outline: none; padding: 0.75rem; min-width: 0; }
.composer input::placeholder { color: var(--trace); }
.composer button { font-family: var(--mono); font-size: var(--fs-small); color: var(--accent); background: transparent; border: 0; border-left: 1px solid var(--line); padding: 0 1rem; cursor: pointer; }
.composer button:disabled { color: var(--trace); cursor: default; }
.statusline { padding: 0.375rem var(--pad); border-top: 1px solid var(--line); color: var(--trace); font-size: var(--fs-label); display: flex; justify-content: space-between; gap: var(--pad); }
.statusline .err { color: var(--err); }
@keyframes blink { 50% { opacity: 0; } }
@keyframes rise { from { opacity: 0; transform: translateY(0.25rem); } }
</style>
</head>
<body>
<div class="shell">
  <div class="masthead">
    <div class="path">runtime-agent-cli-agent</div>
  </div>
  <div class="pitch">
    <h1>runtime-agent-cli</h1>
    <p class="tagline">
      A dev-time CLI that reflects a <b>live API's OpenAPI spec</b> into a discoverable,
      executable surface for AI coding agents. It breaks the self-confirming loop where a
      coding agent writes the backend <i>and</i> the tests from the same assumptions —
      the tool owns the mechanics (parse, dereference, construct, redact); the agent owns
      the judgment (what to test, is the response right).
    </p>
    <div class="install">
      <div class="install-head">INSTALL</div>
      <div class="install-row">
        <code id="install-cmd">bun add -g runtime-agent-cli</code>
        <button type="button" id="copy-btn">COPY</button>
      </div>
      <div class="install-alt">requires Bun — or zero-install: bunx runtime-agent-cli</div>
    </div>
    <div class="capabilities">
      <div class="cap"><span class="glyph">[init]</span> writes .runtime-agent-cli.yaml pointing at your spec</div>
      <div class="cap"><span class="glyph">[search]</span> finds operations by keyword across the live spec</div>
      <div class="cap"><span class="glyph">[inspect]</span> resolves an operation's schema + a ready example payload</div>
      <div class="cap"><span class="glyph">[run]</span> executes against the live server</div>
      <div class="cap"><span class="glyph">[safe]</span> write verbs return WRITE_BLOCKED by default — enforced in the tool, not a UI toggle</div>
      <div class="cap"><span class="glyph">[json]</span> deterministic output, even on error</div>
    </div>
    <p class="pitch-link"><a id="docs-link" href="https://github.com/Itish2003/runtime-agent-cli" target="_blank" rel="noopener">github.com/Itish2003/runtime-agent-cli</a></p>
  </div>
  <div class="section-head">ask the project's own agent</div>
  <div class="chat">
    <div class="chat-head">
      <span id="chat-title">DIRECT LINE — RUNTIME-AGENT-CLI-AGENT</span>
      <span class="live" id="live-state">● loading</span>
    </div>
    <div class="chat-log" id="log" role="log" aria-label="conversation"></div>
    <div class="starters" id="starters"></div>
    <form class="composer" id="composer">
      <span class="prompt-glyph" aria-hidden="true">❯</span>
      <input id="draft" placeholder="ask about this project" autocomplete="off" />
      <button type="submit" id="send-btn">SEND</button>
    </form>
    <div class="statusline">
      <span id="ctx-line">no context yet</span>
      <span id="status-line">ready</span>
    </div>
  </div>
</div>
<script>
(function () {
  "use strict";
  var TERMINAL_REPLAY_MEDIA_TYPE = "application/x-portfolio-terminal-replay+json";
  var logEl = document.getElementById("log");
  var startersEl = document.getElementById("starters");
  var composerEl = document.getElementById("composer");
  var draftEl = document.getElementById("draft");
  var sendBtn = document.getElementById("send-btn");
  var ctxLine = document.getElementById("ctx-line");
  var statusLine = document.getElementById("status-line");
  var liveState = document.getElementById("live-state");
  var contextId = "";
  var busy = false;
  var agentName = "agent";

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function parseFrames(raw) {
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function renderReplay(frames) {
    var wrap = el("div", "term");
    wrap.setAttribute("aria-label", "CLI calls this answer is based on");
    var head = el("div", "term-head", "the agent ran these against the live target");
    wrap.appendChild(head);
    frames.forEach(function (f) {
      var frame = el("div", "term-frame");
      var cmd = el("div", "term-cmd");
      var glyph = el("span", "prompt-glyph", "$");
      glyph.setAttribute("aria-hidden", "true");
      cmd.appendChild(glyph);
      cmd.appendChild(document.createTextNode(" " + f.cmd));
      if (f.status !== "completed") {
        cmd.appendChild(el("span", "term-status", " [" + f.status + "]"));
      }
      frame.appendChild(cmd);
      frame.appendChild(el("pre", "term-out", f.output || ""));
      wrap.appendChild(frame);
    });
    return wrap;
  }

  function appendMsg(role, text, frames) {
    var msg = el("div", "msg " + role);
    msg.appendChild(el("div", "speaker", role === "user" ? "VISITOR" : agentName.toUpperCase()));
    if (frames && frames.length > 0) msg.appendChild(renderReplay(frames));
    msg.appendChild(el("div", "text", text));
    logEl.appendChild(msg);
    logEl.scrollTop = logEl.scrollHeight;
    return msg;
  }

  // statusLine's text is owned by whichever of these last touched it, not by
  // setBusy — setBusy only toggles the disabled/live-state chrome. Without
  // this split, the finally-block's setBusy(false) after a failed turn
  // stomped the error message right back to "ready" before anyone saw it.
  function setBusy(b) {
    busy = b;
    sendBtn.disabled = b || draftEl.value.trim().length === 0;
    draftEl.disabled = b;
    liveState.textContent = b ? "● working" : "● live";
  }

  function showError(message) {
    statusLine.textContent = message.slice(0, 120);
    statusLine.className = "err";
  }

  function showReady() {
    statusLine.textContent = "ready";
    statusLine.className = "";
  }

  function showWaiting() {
    statusLine.textContent = "waiting";
    statusLine.className = "";
  }

  var busyRow = null;
  function showBusyRow() {
    busyRow = el("div", "delegation busy");
    busyRow.setAttribute("role", "status");
    var glyph = el("span", "glyph", "[→]");
    glyph.setAttribute("aria-hidden", "true");
    busyRow.appendChild(glyph);
    busyRow.appendChild(document.createTextNode(" " + agentName + " is thinking…"));
    logEl.appendChild(busyRow);
    logEl.scrollTop = logEl.scrollHeight;
  }
  function clearBusyRow() {
    if (busyRow && busyRow.parentNode) busyRow.parentNode.removeChild(busyRow);
    busyRow = null;
  }

  async function sendA2A(text) {
    var res = await fetch("/a2a", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "SendMessage",
        params: {
          message: Object.assign(
            {
              messageId:
                (crypto.randomUUID && crypto.randomUUID()) ||
                String(Date.now()) + Math.random(),
              role: "ROLE_USER",
              parts: [{ text: text }],
            },
            contextId ? { contextId: contextId } : {},
          ),
        },
      }),
    });
    var json = await res.json();
    if (!res.ok || json.error) {
      throw new Error(
        json && json.error
          ? "JSON-RPC " + json.error.code + ": " + json.error.message
          : "HTTP " + res.status,
      );
    }
    var message = (json.result && json.result.message) || {};
    var parts = message.parts || [];
    var replyText = parts
      .filter(function (p) { return p.mediaType !== TERMINAL_REPLAY_MEDIA_TYPE; })
      .map(function (p) { return p.text || ""; })
      .filter(Boolean)
      .join("\\n");
    var frames = parts
      .filter(function (p) { return p.mediaType === TERMINAL_REPLAY_MEDIA_TYPE; })
      .reduce(function (acc, p) { return acc.concat(parseFrames(p.text || "")); }, []);
    return { text: replyText, contextId: message.contextId || contextId, frames: frames };
  }

  async function submit(text) {
    var q = (text || "").trim();
    if (!q || busy) return;
    draftEl.value = "";
    appendMsg("user", q);
    setBusy(true);
    showWaiting();
    showBusyRow();
    try {
      var r = await sendA2A(q);
      contextId = r.contextId;
      ctxLine.textContent = contextId ? "a2a context " + contextId.slice(0, 8) : "no context yet";
      clearBusyRow();
      appendMsg("agent", r.text, r.frames);
      showReady();
    } catch (e) {
      clearBusyRow();
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  var copyBtn = document.getElementById("copy-btn");
  copyBtn.addEventListener("click", function () {
    var text = document.getElementById("install-cmd").textContent;
    var done = function () {
      copyBtn.textContent = "COPIED";
      setTimeout(function () { copyBtn.textContent = "COPY"; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, done);
    } else {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e) { /* best effort */ }
      document.body.removeChild(ta);
      done();
    }
  });

  composerEl.addEventListener("submit", function (e) {
    e.preventDefault();
    submit(draftEl.value);
  });
  draftEl.addEventListener("input", function () {
    sendBtn.disabled = busy || draftEl.value.trim().length === 0;
  });

  fetch("/.well-known/agent-card.json")
    .then(function (r) { return r.json(); })
    .then(function (card) {
      agentName = card.name || "agent";
      document.getElementById("chat-title").textContent =
        "DIRECT LINE — " + (card.name || "agent").toUpperCase() + "-AGENT";
      liveState.textContent = "● live";
      appendMsg(
        "agent",
        "You're talking to " + (card.name || "this agent") + "'s own agent. Ask me anything about this project, or try one of the tool calls below — the replies show the CLI's real search/inspect/run output.",
      );
      if (card.documentationUrl) {
        var docsLink = document.getElementById("docs-link");
        docsLink.href = card.documentationUrl;
        docsLink.textContent = card.documentationUrl.replace("https://", "");
      }
      var examples = (card.skills || [])
        .flatMap(function (s) { return s.examples || []; })
        .slice(0, 4);
      examples.forEach(function (ex) {
        var btn = el("button", null, "❯ " + ex);
        btn.type = "button";
        btn.addEventListener("click", function () { submit(ex); });
        startersEl.appendChild(btn);
      });
      setBusy(false);
    })
    .catch(function (e) {
      liveState.textContent = "● error";
      showError("failed to load agent card: " + (e instanceof Error ? e.message : String(e)));
    });
})();
</script>
</body>
</html>
`;
