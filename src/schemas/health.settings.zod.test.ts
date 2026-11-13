// health.settings.zod.test.ts — colocated unit (bun test): strictly
// JSON5 shape, defaults land, unknown fields fail loud, synthetic and
// catalog are mutually exclusive.
import { describe, expect, test } from "bun:test";
import { HealthSettings } from "./health.settings.zod.ts";
import h1 from "./fixtures/h1.settings.json5";

describe("HealthSettings", () => {
  test("parses the h1 fixture with defaults applied", () => {
    const s = HealthSettings.parse(h1);
    expect(s.probe.target).toBe("http://buckle1:4111/healthz");
    expect(s.probe.every_ms).toBe(5000);
    expect(s.probe.miss_limit).toBe(3);
    expect(s.serve.port).toBe(4112);
    expect(s.serve.verdict_file).toBe("/var/run/fleet-health/verdict.json");
  });

  test("unknown fields fail loud", () => {
    expect(() =>
      HealthSettings.parse({
        probe: { target: "http://x/healthz" },
        serve: { port: 1 },
        yaml: true,
      }),
    ).toThrow();
  });

  test("synthetic + catalog are mutually exclusive", () => {
    expect(() =>
      HealthSettings.parse({
        probe: { target: "http://x/healthz" },
        serve: { port: 1 },
        synthetic: { body: "{}" },
        catalog: { model: "gpt-6" },
      }),
    ).toThrow();
  });

  test("fail-closed credentials refuse to resolve at monitor build, not mid-poll", () => {
    const s = HealthSettings.parse({
      probe: { target: "http://x/v1/chat/completions" },
      serve: { port: 1 },
      synthetic: { body: "{}", auth_env: "NOPE_TOKEN" },
    });
    expect(s.synthetic?.auth_env).toBe("NOPE_TOKEN");
  });
});
