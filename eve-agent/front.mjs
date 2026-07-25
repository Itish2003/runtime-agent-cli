// Public-port front process. eve's Nitro host unconditionally claims GET "/"
// for its own framework landing page (see agent/channels/a2a.ts) — no
// channel route can win that path. This proxy rewrites "/" to "/chat"
// before forwarding, so the chat UI is what visitors land on, while eve
// itself keeps listening only on the internal port.
import http from "node:http";

const PUBLIC_PORT = Number(process.env.PORT ?? 3000);
const EVE_PORT = Number(process.env.EVE_INTERNAL_PORT ?? 2002);

http
  .createServer((req, res) => {
    const path = req.url === "/" ? "/chat" : req.url;
    const upstream = http.request(
      { host: "127.0.0.1", port: EVE_PORT, path, method: req.method, headers: req.headers },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("upstream eve process unreachable");
    });
    req.pipe(upstream);
  })
  .listen(PUBLIC_PORT, "0.0.0.0", () => {
    console.log(`front: ${PUBLIC_PORT} -> eve:${EVE_PORT} (/ rewritten to /chat)`);
  });
