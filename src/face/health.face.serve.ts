// health.face.serve.ts — the HTTP face. It ONLY reads the verdict file:
// the poller and the server share nothing but that file. /healthz is
// the compact face compose health hits; /status is the full verdict.
// no-store always; HEAD/OPTIONS honored.
//
// THE STALE-VERDICT LAW (serve-time, never the writer's last word): a
// dead WRITER would leave the last file serving as 200 forever — so the
// face recomputes freshness from `checked_at` + `every_ms` on EVERY
// request and answers honestly:
//   200 = fresh verdict, target ok        502 = fresh verdict, target down
//   503 = STALE VERDICT (>= STALE_MISSES missed writes) or no file —
//         the sidecar itself is not trustworthy; the last checked_at
//         and the cadence are still shown so consumers can count.
import type { HealthSettings } from "../schemas/health.settings.zod.ts";
import type { HealthFace, HealthVerdict } from "../schemas/health.verdict.zod.ts";
import { readVerdictRaw } from "../probe/health.probe.verdict.file.ts";
import { verdictFreshness } from "./health.face.freshness.ts";

const HEADERS = {
  "allow": "GET, HEAD, OPTIONS",
  "cache-control": "no-store",
} as const;

export function serveFace(settings: HealthSettings): ReturnType<typeof Bun.serve> {
  const { port, bind, verdict_file } = settings.serve;
  return Bun.serve({
    hostname: bind,
    port,
    fetch: (req) => {
      const { pathname } = new URL(req.url);
      if (pathname !== "/healthz" && pathname !== "/status")
        return new Response("not found", { status: 404, headers: HEADERS });
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
      if (req.method !== "GET" && req.method !== "HEAD")
        return new Response("method not allowed", { status: 405, headers: HEADERS });

      const verdict = readVerdictRaw(verdict_file);
      // the cadence is ALWAYS declared — even with no file, the consumer
      // learns how often this sidecar promised to write
      const everyMs = verdict?.every_ms ?? settings.probe.every_ms;
      const freshness = verdictFreshness(verdict?.checked_at ?? null, everyMs);
      const writeFreshness = verdictFreshness(verdict?.timestamp ?? null, everyMs);
      const stale = freshness.stale || writeFreshness.stale || (verdict?.stale ?? true);
      const healthy = verdict !== null && verdict.ok && !stale;
      const status = stale ? 503 : healthy ? 200 : 502;
      const current: HealthVerdict | null = verdict === null ? null : stale
        ? { ...verdict, ok: false, state: "down", stale: true }
        : verdict;

      if (req.method === "HEAD")
        return new Response(null, { status, headers: HEADERS });
      if (pathname === "/healthz") {
        const face: HealthFace = {
          ok: healthy,
          state: current?.state ?? "down",
          check: verdict?.check ?? "http-liveness",
          target: verdict?.target ?? settings.probe.target,
          every_ms: everyMs,
          checked_at: verdict?.checked_at ?? null,
          timestamp: verdict?.timestamp ?? null,
          missed_updates: freshness.missed_updates,
          stale,
        };
        return Response.json(face, { status, headers: HEADERS });
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
        every_ms: everyMs,
        last_ok: null,
        latency_ms: null,
        checked_at: null,
        timestamp: null,
        error: "verdict file unavailable",
        probes: { total: 0, ok: 0, failed: 0 },
        recent: [],
      };
      return Response.json(current ?? missing, { status, headers: HEADERS });
    },
  });
}
