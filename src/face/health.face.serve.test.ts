// health.face.serve.test.ts — the WRITER-DIED scenario, end to end on
// the wire: a sidecar whose poll loop stopped must never keep serving
// the last file as 200. The face recomputes freshness AT SERVE TIME and
// answers 503 with the evidence (checked_at + every_ms + missed_updates)
// so consumers can count missed writes themselves and apply their own x.
// (Aligned to the landed serve-time contract; replaces the earlier
// windowed-read expectations.)
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeVerdictAtomic } from "../probe/health.probe.verdict.file.ts";
import { HealthSettings } from "../schemas/health.settings.zod.ts";
import { HealthFace, HealthVerdict } from "../schemas/health.verdict.zod.ts";
import { serveFace } from "./health.face.serve.ts";

function verdictFixture(everyMs: number, checkedAt: string): HealthVerdict {
  return HealthVerdict.parse({
    target: "http://my-service:8080/healthz",
    mode: "liveness",
    check: "http-liveness",
    state: "up",
    ok: true,
    stale: false,
    misses: 0,
    miss_limit: 3,
    every_ms: everyMs,
    last_ok: checkedAt,
    latency_ms: 3,
    checked_at: checkedAt,
    timestamp: checkedAt,
    error: null,
    probes: { total: 10, ok: 10, failed: 0 },
    recent: [],
  });
}

describe("health face — the writer-died scenario", () => {
  const dir = () => join(mkdtempSync(join(tmpdir(), "fh-face-")), "verdict.json");

  test("writer died: frozen up-verdict serves 503 STALE, evidence visible", async () => {
    const path = dir();
    const every = 1000;
    const dead = new Date(Date.now() - 10 * every).toISOString();
    const settings = HealthSettings.parse({
      probe: { target: "http://my-service:8080/healthz", every_ms: every, timeout_ms: 100 },
      serve: { port: 0, verdict_file: path },
    });
    writeVerdictAtomic(path, verdictFixture(every, dead));
    const server = serveFace(settings);
    try {
      const r = await fetch(`http://127.0.0.1:${server.port}/healthz`);
      expect(r.status).toBe(503);
      const face = HealthFace.parse(await r.json());
      expect(face.ok).toBe(false);
      expect(face.stale).toBe(true);
      // the writer's last sworn state is PRESERVED (evidence, not rewritten)
      expect(face.state).toBe("up");
      // the consumer contract: checked_at + every_ms + the count, visible
      expect(face.checked_at).toBe(dead);
      expect(face.every_ms).toBe(every);
      expect(face.missed_updates).toBeGreaterThanOrEqual(10);
    } finally {
      server.stop(true);
    }
  });

  test("no verdict file at all: 503, cadence still declared, count null", async () => {
    const path = dir(); // never written
    const settings = HealthSettings.parse({
      probe: { target: "http://my-service:8080/healthz", every_ms: 1500, timeout_ms: 100 },
      serve: { port: 0, verdict_file: path },
    });
    const server = serveFace(settings);
    try {
      const r = await fetch(`http://127.0.0.1:${server.port}/healthz`);
      expect(r.status).toBe(503);
      const face = HealthFace.parse(await r.json());
      expect(face.stale).toBe(true);
      expect(face.missed_updates).toBeNull();
      expect(face.every_ms).toBe(1500); // the promised cadence, declared anyway
    } finally {
      server.stop(true);
    }
  });

  test("fresh up-verdict: 200; recovered writer counts zero missed", async () => {
    const path = dir();
    const every = 1000;
    const now = new Date().toISOString();
    const settings = HealthSettings.parse({
      probe: { target: "http://my-service:8080/healthz", every_ms: every, timeout_ms: 100 },
      serve: { port: 0, verdict_file: path },
    });
    writeVerdictAtomic(path, verdictFixture(every, now));
    const server = serveFace(settings);
    try {
      const r = await fetch(`http://127.0.0.1:${server.port}/healthz`);
      expect(r.status).toBe(200);
      const face = HealthFace.parse(await r.json());
      expect(face.ok).toBe(true);
      expect(face.stale).toBe(false);
      expect(face.missed_updates).toBe(0);
      // /status serves the file verbatim (the writer's sworn evidence)
      const full = await fetch(`http://127.0.0.1:${server.port}/status`);
      expect(full.status).toBe(200);
      expect(HealthVerdict.parse(await full.json()).every_ms).toBe(every);
    } finally {
      server.stop(true);
    }
  });

  test("fresh down-verdict: 502 (the TARGET is down — not the sidecar)", async () => {
    const path = dir();
    const every = 1000;
    const now = new Date().toISOString();
    const settings = HealthSettings.parse({
      probe: { target: "http://my-service:8080/healthz", every_ms: every, timeout_ms: 100 },
      serve: { port: 0, verdict_file: path },
    });
    writeVerdictAtomic(path, { ...verdictFixture(every, now), ok: false, state: "down" });
    const server = serveFace(settings);
    try {
      const r = await fetch(`http://127.0.0.1:${server.port}/healthz`);
      expect(r.status).toBe(502);
      const face = HealthFace.parse(await r.json());
      expect(face.state).toBe("down");
      expect(face.stale).toBe(false); // fresh file — honest target-down
    } finally {
      server.stop(true);
    }
  });
});
