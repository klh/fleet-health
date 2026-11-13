// e2e — PROJECT 2 (docker-only, runs after smoke): the sidecar AS A
// CONTAINER. Builds the real image, mounts a settings.json5 from the
// HOST (the mount is the proof — config-over-code, no env secrets),
// points it at a stub target on the host, and proves on the WIRE:
// down (miss_limit) → up on ANY 2xx (even a plain text body) → down
// again when the target dies. Both faces: /healthz compact, /status full.
import { test, expect } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HealthFace, HealthVerdict } from "../../src/schemas/health.verdict.zod.ts";

const ROOT = new URL("../..", import.meta.url).pathname;
const IMAGE = "fleet-health-e2e:latest";
const HOST_PORT = 4812;

test.describe.serial("fleet-health in Docker — mounts, runs, reports", () => {
  test("build the image (the Dockerfile is the contract)", () => {
    execFileSync("docker", ["build", "-t", IMAGE, ROOT], { stdio: "pipe" });
  });

  test("container: mount settings → poll the configured surface → serve verdicts", async () => {
    // 1. a stub target on the HOST the container will poll — flipping
    //    its body/shape proves "healthy when ANYTHING responds 2xx"
    const mode = { state: "fail" as "fail" | "json" | "plain" };
    const target = Bun.serve({
      port: 0,
      fetch: () => {
        if (mode.state === "fail") return new Response("boom", { status: 500 });
        if (mode.state === "plain") return new Response("any response counts", { status: 200 });
        return Response.json({ ok: true, status: "up" });
      },
    });

    // 2. settings MOUNTED from the host (temp file → /etc/health/…): the
    //    container reads config only through this mount — nothing baked in
    const dir = mkdtempSync(join(tmpdir(), "fh-e2e-"));
    const settingsPath = join(dir, "settings.json5");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        probe: {
          target: `http://host.docker.internal:${target.port}/healthz`,
          every_ms: 200,
          timeout_ms: 1500,
          miss_limit: 2,
          ring: 8,
        },
        serve: { port: 4112, bind: "0.0.0.0", verdict_file: "/tmp/verdict.json" },
      }),
    );

    // 3. run the real image with the mount + mapped port
    execFileSync(
      "docker",
      [
        "run", "-d", "--rm",
        "--name", "fleet-health-e2e",
        "-p", `${HOST_PORT}:4112`,
        "-v", `${settingsPath}:/etc/health/settings.json5:ro`,
        IMAGE,
      ],
      { stdio: "pipe" },
    );
    try {
      // total poll fns — expect.poll does not catch throws
      const face = async (): Promise<string> => {
        try {
          const r = await fetch(`http://127.0.0.1:${HOST_PORT}/healthz`);
          return HealthFace.parse(await r.json()).state;
        } catch {
          return "connecting";
        }
      };
      const status = async (): Promise<HealthVerdict> => {
        const r = await fetch(`http://127.0.0.1:${HOST_PORT}/status`);
        return HealthVerdict.parse(await r.json());
      };

      // 4. target failing from cold boot → down (initial state is down;
      //    the confirming re-probe path guards up→down, proven in step 6)
      await expect.poll(face, { timeout: 15_000 }).toBe("down");
      const down = await status();
      expect(down.ok).toBe(false);
      expect(down.misses).toBeGreaterThanOrEqual(1);
      expect(down.last_ok).toBeNull();
      expect(down.recent.every((s) => s.trace_id.length === 32)).toBe(true);

      // 5. target up with a JSON body → healthy; then ANY plain 2xx → still
      //    healthy (the sidecar judges the SURFACE, not the payload)
      mode.state = "json";
      await expect.poll(face, { timeout: 15_000 }).toBe("up");
      const jsonUp = await status();
      expect(jsonUp.ok).toBe(true);
      expect(jsonUp.last_ok).not.toBeNull();

      mode.state = "plain";
      await expect.poll(face, { timeout: 5_000 }).toBe("up");
      const plainUp = await status();
      expect(plainUp.ok).toBe(true);
      expect(plainUp.probes.ok).toBeGreaterThan(0);

      // 6. target dies → down again (verdict is LIVE, not latched)
      mode.state = "fail";
      await expect.poll(face, { timeout: 15_000 }).toBe("down");
      const downAgain = await status();
      expect(downAgain.state).toBe("down");
      // up→down rides the miss-limit + CONFIRMING re-probe (the law:
      // one blip degrades, a confirmed second failure is down)
      expect(downAgain.misses).toBeGreaterThanOrEqual(downAgain.miss_limit);
      expect(downAgain.last_ok).not.toBeNull(); // it WAS up
    } finally {
      execFileSync("docker", ["rm", "-f", "fleet-health-e2e"], { stdio: "pipe" });
      target.stop(true);
    }
  });
});
