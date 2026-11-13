// smoke: the sidecar binary is ready and building — boot it against a
// live stub target, watch the verdict go down → up → down ON THE WIRE,
// through the verdict file (the poller and the face share nothing else).
import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HealthVerdict } from "../../src/schemas/health.verdict.zod.ts";

const ROOT = new URL("../..", import.meta.url).pathname;

test("sidecar: down → up → down, served from the verdict file", async () => {
  // 1. a stub target we can flip
  let up = false;
  const target = Bun.serve({
    port: 0,
    fetch: () =>
      up ? Response.json({ ok: true, status: "up" }) : new Response("boom", { status: 500 }),
  });

  // 2. sidecar settings: fast probes, miss_limit 2, own port, tmp verdict file
  const dir = mkdtempSync(join(tmpdir(), "fh-smoke-"));
  const verdictFile = join(dir, "verdict.json");
  const settingsPath = join(dir, "sidecar.settings.json5");
  let sidecarPort: number | null = null;
  writeFileSync(
    settingsPath,
    JSON.stringify({
      probe: {
        target: `http://127.0.0.1:${target.port}/healthz`,
        every_ms: 150,
        timeout_ms: 500,
        miss_limit: 2,
        ring: 8,
      },
      serve: { port: 0, bind: "127.0.0.1", verdict_file: verdictFile },
    }),
  );

  // 3. boot the binary — dead target first: verdict settles DOWN
  const sidecar = spawn("bun", ["src/main/health.main.ts", "--settings", settingsPath], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  sidecar.stdout?.on("data", (d: Buffer) => {
    const output = d.toString();
    const match = /sidecar http:\/\/127\.0\.0\.1:(\d+)/.exec(output);
    if (match?.[1]) sidecarPort = Number(match[1]);
    console.log("sidecar>", output.trim());
  });
  sidecar.stderr?.on("data", (d: Buffer) => console.log("sidecar!>", d.toString().trim()));
  sidecar.on("error", (e: Error) => console.log("sidecar spawn error:", e.message));
  sidecar.on("exit", (code, sig) => console.log("sidecar exit:", code, sig));
  // expect.poll does not catch throws — the poll fn must be total
  const state = async (): Promise<string> => {
    if (sidecarPort === null) return "connecting";
    try {
      const r = await fetch(`http://127.0.0.1:${sidecarPort}/status`);
      return HealthVerdict.parse(await r.json()).state;
    } catch {
      return "connecting";
    }
  };

  await expect.poll(state, { timeout: 15_000 }).toBe("down");

  // 4. target comes up: verdict recovers to up (face reads the file)
  up = true;
  await expect.poll(state, { timeout: 15_000 }).toBe("up");
  if (sidecarPort === null) throw new Error("sidecar did not report its bound port");
  const r = await fetch(`http://127.0.0.1:${sidecarPort}/status`);
  const healthy = HealthVerdict.parse(await r.json());
  expect(healthy.ok).toBe(true);
  expect(healthy.recent.at(-1)?.trace_id).toMatch(/^[0-9a-f]{32}$/);

  // 5. target breaks again: degrading → confirming re-probe → down
  up = false;
  await expect.poll(state, { timeout: 15_000 }).toBe("down");

  sidecar.kill();
  target.stop(true);
});
