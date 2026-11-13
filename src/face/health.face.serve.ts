// health.face.serve.ts — the HTTP face. It ONLY reads the verdict file:
// the poller and the server share nothing but that file. /healthz is
// the compact face compose health hits (200 up / 502 otherwise);
// /status is the full verdict. no-store always; HEAD/OPTIONS honored.
import type { HealthSettings } from "../schemas/health.settings.zod.ts";
import type { HealthFace, HealthVerdict } from "../schemas/health.verdict.zod.ts";
import { readVerdict } from "../probe/health.probe.verdict.file.ts";

export function serveFace(settings: HealthSettings): ReturnType<typeof Bun.serve> {
  const { port, bind, verdict_file } = settings.serve;
  return Bun.serve({
    hostname: bind,
    port,
    fetch: (req) => {
      const { pathname } = new URL(req.url);
      if (pathname !== "/healthz" && pathname !== "/status")
        return new Response("not found", {
          status: 404,
          headers: { "allow": "GET, HEAD, OPTIONS", "cache-control": "no-store" },
        });
      const headers = {
        "allow": "GET, HEAD, OPTIONS",
        "cache-control": "no-store",
      };
      if (req.method === "OPTIONS")
        return new Response(null, { status: 204, headers });
      if (req.method !== "GET" && req.method !== "HEAD")
        return new Response("method not allowed", { status: 405, headers });
      const verdict = readVerdict(
        verdict_file,
        settings.probe.every_ms + settings.probe.timeout_ms * 2,
      );
      const healthy = verdict !== null && verdict.ok && !verdict.stale;
      if (req.method === "HEAD")
        return new Response(null, { status: healthy ? 200 : 502, headers });
      if (pathname === "/healthz") {
        const face: HealthFace = {
          ok: healthy,
          state: verdict?.state ?? "down",
          check: verdict?.check ?? "http-liveness",
          target: verdict?.target ?? settings.probe.target,
          interval_ms: settings.probe.every_ms,
          checked_at: verdict?.checked_at ?? null,
          timestamp: verdict?.timestamp ?? null,
          stale: verdict?.stale ?? true,
        };
        return Response.json(face, { status: healthy ? 200 : 502, headers });
      }
      const missing: HealthVerdict = {
        target: settings.probe.target,
        mode: settings.synthetic ? "synthetic" : settings.catalog ? "catalog" : "liveness",
        check: settings.synthetic ? "inference-route" : settings.catalog ? "route-catalog" : "http-liveness",
        state: "down",
        ok: false,
        stale: true,
        misses: 0,
        miss_limit: settings.probe.miss_limit,
        last_ok: null,
        latency_ms: null,
        checked_at: null,
        timestamp: null,
        error: "verdict file unavailable",
        probes: { total: 0, ok: 0, failed: 0 },
        recent: [],
      };
      return Response.json(verdict ?? missing, {
        status: healthy ? 200 : 502,
        headers,
      });
    },
  });
}
