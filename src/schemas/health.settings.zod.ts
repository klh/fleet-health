// health.settings.zod.ts — one sidecar, one target, one verdict file.
// Strictly JSON5 on disk; strict() parse — unknown fields fail loud.
import { z } from "zod";

export const HealthSettings = z
  .object({
    probe: z
      .object({
        target: z.url(),
        path: z.string().min(1).optional(),
        every_ms: z.number().int().min(100).default(5000),
        timeout_ms: z.number().int().min(100).default(2000),
        miss_limit: z.number().int().min(1).default(3),
        ring: z.number().int().min(1).max(1000).default(20),
      })
      .strict(),
    serve: z
      .object({
        port: z.number().int().min(0).max(65535), // 0 = kernel-assigned when serving
        bind: z.ipv4().or(z.ipv6()).default("127.0.0.1"),
        verdict_file: z.string().min(1).default("/var/run/fleet-health/verdict.json"),
      })
      .strict(),
    synthetic: z
      .object({
        body: z.string().min(1),
        auth_env: z.string().min(1).optional(),
        expect_path: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    catalog: z
      .object({
        model: z.string().min(1),
        auth_env: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((s) => !(s.synthetic && s.catalog), {
    message: "synthetic and catalog probes are mutually exclusive",
  });
export type HealthSettings = z.output<typeof HealthSettings>;
