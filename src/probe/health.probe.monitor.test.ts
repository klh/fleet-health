// health.probe.monitor.test.ts — colocated unit (bun test): the verdict
// state machine against REAL wire targets (Bun.serve stubs): up on
// success, degrading → confirming re-probe → down, recovery, staleness.
import { describe, expect, test } from "bun:test";
import { createMonitor } from "./health.probe.monitor.ts";
import { HealthSettings } from "../schemas/health.settings.zod.ts";

function settingsFor(port: number): ReturnType<typeof HealthSettings.parse> {
  return HealthSettings.parse({
    probe: {
      target: `http://127.0.0.1:${port}/healthz`,
      every_ms: 5000,
      timeout_ms: 500,
      miss_limit: 2,
      ring: 8,
    },
    serve: { port: 0 },
  });
}

function stub(port: number, ok: boolean): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port,
    fetch: () =>
      ok
        ? Response.json({ ok: true, status: "up" })
        : new Response("boom", { status: 500 }),
  });
}

async function freePort(): Promise<number> {
  const s = Bun.serve({ port: 0, fetch: () => new Response("gone") });
  const port = s.port ?? 0;
  s.stop(true);
  return port;
}

describe("health verdict state machine", () => {
  test("every poll carries a W3C trace id through to the sample", async () => {
    const port = await freePort();
    const target = stub(port, true);
    const monitor = createMonitor(settingsFor(port));
    await monitor.poll();
    const snap = monitor.snapshot();
    expect(snap.state).toBe("up");
    expect(snap.recent.at(-1)?.trace_id).toMatch(/^[0-9a-f]{32}$/);
    target.stop(true);
  });

  test("target up → verdict up, ok true", async () => {
    const port = await freePort();
    const target = stub(port, true);
    const monitor = createMonitor(settingsFor(port));
    await monitor.poll();
    const snap = monitor.snapshot();
    expect(snap.state).toBe("up");
    expect(snap.ok).toBe(true);
    expect(snap.stale).toBe(false);
    target.stop(true);
  });

  test("target dead → down (connection refused is a miss; confirming re-probe earns the flip)", async () => {
    const port = await freePort(); // nothing listens
    const monitor = createMonitor(settingsFor(port));
    await monitor.poll();
    const snap = monitor.snapshot();
    expect(snap.state).toBe("down");
    expect(snap.ok).toBe(false);
    expect(snap.probes.failed).toBeGreaterThan(0);
  });

  test("healthy → target breaks → degrading past miss_limit → down; recovery → up", async () => {
    const port = await freePort();
    let ok = true;
    const target = Bun.serve({
      port,
      fetch: () =>
        ok ? Response.json({ ok: true }) : new Response("boom", { status: 500 }),
    });
    const monitor = createMonitor(settingsFor(port));
    await monitor.poll();
    expect(monitor.snapshot().state).toBe("up");

    ok = false;
    await monitor.poll(); // miss 1
    await monitor.poll(); // miss 2 ≥ limit → degrading + confirming re-probe → down
    expect(monitor.snapshot().state).toBe("down");

    ok = true;
    await monitor.poll(); // any success recovers
    expect(monitor.snapshot().state).toBe("up");
    target.stop(true);
  });

  test("a body that says ok:false is NOT up (the wire answer is the truth)", async () => {
    const port = await freePort();
    const target = Bun.serve({
      port,
      fetch: () => Response.json({ ok: false, status: "degraded" }, { status: 200 }),
    });
    const monitor = createMonitor(settingsFor(port));
    await monitor.poll();
    expect(monitor.snapshot().ok).toBe(false);
    target.stop(true);
  });
});
