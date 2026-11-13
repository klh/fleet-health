// health.openapi.ts — openapi.json is GENERATED from the wire schemas,
// committed, CI-diffed. Two faces only: /healthz (compose health) and
// /status (the full verdict).
import { z } from "zod";
import { HealthFace, HealthVerdict } from "./health.verdict.zod.ts";

const json = (schema: z.ZodType): unknown =>
  z.toJSONSchema(schema, { io: "output", target: "draft-2020-12" });

export function buildOpenApi(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "@fleet/health",
      version: "0.1.0",
      description:
        "The outside-process health verdict sidecar: poll the real " +
        "target over the network, write the verdict file, serve it.",
    },
    paths: {
      "/healthz": {
        get: {
          summary: "Compact verdict (compose health hits this)",
          responses: {
            200: { content: { "application/json": { schema: json(HealthFace) } } },
            502: { content: { "application/json": { schema: json(HealthFace) } } },
          },
        },
      },
      "/status": {
        get: {
          summary: "Full verdict: state machine, ring, freshness",
          responses: {
            200: { content: { "application/json": { schema: json(HealthVerdict) } } },
            502: { content: { "application/json": { schema: json(HealthVerdict) } } },
          },
        },
      },
    },
  };
}
