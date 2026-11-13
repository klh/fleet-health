// health.verdict.zod.ts — the verdict the sidecar swears to, on both
// faces. Types are z.output; the poller writes this shape to the verdict
// file, the face serves it verbatim.
import { z } from "zod";

export const HealthVerdictState = z.enum(["up", "degrading", "down"]);
export type HealthVerdictState = z.output<typeof HealthVerdictState>;

export const HealthSample = z
  .object({
    ok: z.boolean(),
    status: z.number().int().min(0),
    ms: z.number().int().min(0),
    at: z.iso.datetime(),
    // W3C trace id (32 hex) of THIS poll — tracing ids through everything
    trace_id: z.string().regex(/^[0-9a-f]{32}$/),
  })
  .strict();
export type HealthSample = z.output<typeof HealthSample>;

// the full verdict — GET /status, and the verdict file's content
export const HealthVerdict = z
  .object({
    target: z.string().min(1),
    mode: z.enum(["liveness", "synthetic", "catalog"]),
    check: z.enum(["http-liveness", "inference-route", "route-catalog"]),
    state: HealthVerdictState,
    ok: z.boolean(),
    stale: z.boolean(),
    misses: z.number().int().min(0),
    miss_limit: z.number().int().min(1),
    last_ok: z.iso.datetime().nullable(),
    latency_ms: z.number().int().min(0).nullable(),
    checked_at: z.iso.datetime().nullable(),
    error: z.string().nullable(),
    probes: z
      .object({
        total: z.number().int().min(0),
        ok: z.number().int().min(0),
        failed: z.number().int().min(0),
      })
      .strict(),
    recent: z.array(HealthSample),
  })
  .strict();
export type HealthVerdict = z.output<typeof HealthVerdict>;

// the compact verdict — GET /healthz (what compose health hits)
export const HealthFace = z
  .object({
    ok: z.boolean(),
    state: HealthVerdictState,
    check: z.enum(["http-liveness", "inference-route", "route-catalog"]),
    target: z.string().min(1),
    interval_ms: z.number().int().min(100),
  })
  .strict();
export type HealthFace = z.output<typeof HealthFace>;
