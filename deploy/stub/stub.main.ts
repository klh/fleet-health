// stub.main.ts — the generic HTTP fixture target: one 200 face, one
// 403 face. A good HTTP citizen: 2xx is alive, 4xx is a failure even
// though the server IS responding — that distinction is what a health
// prover exists to make.
const server = Bun.serve({
  hostname: "0.0.0.0",
  port: 8080,
  fetch: (req) => {
    const { pathname } = new URL(req.url);
    if (pathname === "/ok") return new Response("fine", { status: 200 });
    if (pathname === "/forbidden") return new Response("no", { status: 403 });
    if (pathname === "/healthz")
      return Response.json({ ok: true, status: "up" });
    return new Response("not found", { status: 404 });
  },
});
console.log(`http stub on ${server.url.href} (/ok=200, /forbidden=403)`);
