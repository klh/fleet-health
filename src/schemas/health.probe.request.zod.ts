// health.probe.request.zod.ts — the wire request a probe carries.
// Liveness is a bare GET; synthetic readiness POSTs the declared body
// with its credential header; catalog checks a model id in /v1/models.
import { z } from "zod";

export const HealthProbeRequest = z
  .object({
    method: z.string().min(1).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.string().optional(),
    expect_path: z.string().min(1).optional(),
    catalog_model: z.string().min(1).optional(),
  })
  .strict();
export type HealthProbeRequest = z.output<typeof HealthProbeRequest>;
