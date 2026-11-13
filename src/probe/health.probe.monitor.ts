// health.probe.monitor.ts — the verdict state machine, lifted from the
// fleet probe: up → degrading (misses ≥ miss_limit) → ACTIVE confirming
// re-probe → down; any success recovers to up; one probe on the wire at
// a time; a bounded ring; freshness gating (a stale sample never
// vouches). Snapshot is HealthVerdict-shaped (parsed through the schema
// by the verdict-file writer).
import type { HealthSettings } from "../schemas/health.settings.zod.ts";
import type { HealthSample, HealthVerdict } from "../schemas/health.verdict.zod.ts";
import { newTraceId, probeOnce } from "./health.probe.once.ts";
import type { HealthProbeRequest } from "../schemas/health.probe.request.zod.ts";

export function probeUrl(settings: HealthSettings): string {
  const url = new URL(settings.probe.target);
  if (settings.probe.path !== undefined) url.pathname = settings.probe.path;
  return url.toString();
}

/** The wire request: liveness GET, synthetic POST (fail-closed on the
 *  declared-but-unset credential), or catalog GET. Throws on config
 *  errors — never probes bare with a declared credential. */
export function wireRequest(settings: HealthSettings): HealthProbeRequest {
  if (settings.synthetic) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-klh-traffic": "readiness",
    };
    if (settings.synthetic.auth_env !== undefined) {
      const token = process.env[settings.synthetic.auth_env];
      if (token === undefined || token.trim().length === 0)
        throw new Error(
          `auth_env "${settings.synthetic.auth_env}" is not set — refusing to probe without the credential`,
        );
      headers.authorization = `Bearer ${token}`;
    }
    return {
      method: "POST",
      headers,
      body: settings.synthetic.body,
      expect_path: settings.synthetic.expect_path,
    };
  }
  if (settings.catalog) {
    const headers: Record<string, string> = {};
    if (settings.catalog.auth_env !== undefined) {
      const token = process.env[settings.catalog.auth_env];
      if (token === undefined || token.trim().length === 0)
        throw new Error(
          `auth_env "${settings.catalog.auth_env}" is not set — refusing to probe without the credential`,
        );
      headers.authorization = `Bearer ${token}`;
    }
    return { method: "GET", headers, catalog_model: settings.catalog.model };
  }
  return {};
}

export function createMonitor(settings: HealthSettings) {
  const url = probeUrl(settings);
  let wire: HealthProbeRequest | null = null;
  let wireError: string | null = null;
  try {
    wire = wireRequest(settings);
  } catch (e) {
    wireError = e instanceof Error ? e.message : String(e);
  }
  const ring: HealthSample[] = [];
  let state: "up" | "degrading" | "down" = "down";
  let misses = 0;
  let lastOk: string | null = null;
  let total = 0;
  let okTotal = 0;
  let inFlight = false;

  function apply(s: HealthSample): void {
    ring.push(s);
    if (ring.length > settings.probe.ring) ring.shift();
    total++;
    if (s.ok) {
      okTotal++;
      misses = 0;
      state = "up";
      lastOk = s.at;
      return;
    }
    misses++;
  }

  async function poll(): Promise<void> {
    if (inFlight) return;
    inFlight = true;
    try {
      const s =
        wireError !== null
          ? {
              ok: false,
              status: 0,
              ms: 0,
              at: new Date().toISOString(),
              trace_id: newTraceId(),
            }
          : await probeOnce(url, settings.probe.timeout_ms, wire ?? undefined);
      apply(s);
      // past the miss limit and not yet down: an ACTIVE confirming
      // re-probe earns the down flip. Any success anywhere recovers.
      if (!s.ok && misses >= settings.probe.miss_limit && state !== "down") {
        state = "degrading";
        const confirm =
          wireError === null
            ? await probeOnce(url, settings.probe.timeout_ms, wire ?? undefined)
            : {
                ok: false,
                status: 0,
                ms: 0,
                at: new Date().toISOString(),
                trace_id: newTraceId(),
              };
        apply(confirm);
        if (!confirm.ok) state = "down";
      }
    } finally {
      inFlight = false;
    }
  }

  function snapshot(): HealthVerdict {
    const last = ring.at(-1);
    const fresh =
      last !== undefined &&
      Date.now() - Date.parse(last.at) <=
        settings.probe.every_ms + settings.probe.timeout_ms * 2;
    const reported = !fresh
      ? "down"
      : last?.ok !== true && state === "up"
        ? "degrading"
        : state;
    return {
      target: url,
      mode:
        settings.synthetic !== undefined
          ? "synthetic"
          : settings.catalog !== undefined
            ? "catalog"
            : "liveness",
      check:
        settings.synthetic !== undefined
          ? "inference-route"
          : settings.catalog !== undefined
            ? "route-catalog"
            : "http-liveness",
      state: reported,
      ok:
        fresh &&
        (reported === "up" ||
          (reported === "degrading" && misses < settings.probe.miss_limit && lastOk !== null)),
      stale: !fresh,
      misses,
      miss_limit: settings.probe.miss_limit,
      last_ok: lastOk,
      latency_ms: last?.ms ?? null,
      checked_at: last?.at ?? null,
      timestamp: new Date().toISOString(),
      error: wireError,
      probes: { total, ok: okTotal, failed: total - okTotal },
      recent: [...ring],
    };
  }

  return { poll, snapshot };
}
