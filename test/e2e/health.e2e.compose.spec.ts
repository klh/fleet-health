// e2e — the two compose scenarios, self-contained in Docker: the stub
// container presents a 200 face and a 403 face; fleet-health watches
// one per compose file and must report the RIGHT verdict. Scenario 1:
// /ok → up. Scenario 2: /forbidden → down — the server responds, but
// a good HTTP citizen counts 4xx as failure (status recorded on the
// sample, judged not-ok on the verdict).
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { HealthFace, HealthVerdict } from "../../src/schemas/health.verdict.zod.ts";

const ROOT = new URL("../..", import.meta.url).pathname;

function compose(file: string, project: string, ...args: string[]): void {
  execFileSync("docker", ["compose", "-f", `deploy/${file}`, "-p", project, ...args], {
    cwd: ROOT,
    stdio: "pipe",
  });
}

async function face(port: number): Promise<string> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/healthz`);
    return HealthFace.parse(await r.json()).state;
  } catch {
    return "connecting";
  }
}

/** total verdict read — a reset/refused moment is "not yet", not a fail */
async function verdict(port: number): Promise<HealthVerdict | null> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/status`);
    return HealthVerdict.parse(await r.json());
  } catch {
    return null;
  }
}

test.describe.serial("the two compose scenarios", () => {
  test("scenario 1 — compose.ok: the 200 face → UP", async () => {
    compose("compose.ok.yaml", "fleet-health-ok", "up", "-d", "--build");
    try {
      expect.poll(() => face(4821), { timeout: 30_000 }).toBe("up");
      await expect
        .poll(async () => (await verdict(4821))?.ok ?? null, { timeout: 10_000 })
        .toBe(true);
      const ok = await verdict(4821);
      expect(ok?.probes.ok ?? 0).toBeGreaterThan(0);
    } finally {
      compose("compose.ok.yaml", "fleet-health-ok", "down", "-v", "--remove-orphans");
    }
  });

  test("scenario 2 — compose.forbidden: the 403 face → DOWN", async () => {
    compose("compose.forbidden.yaml", "fleet-health-forbidden", "up", "-d", "--build");
    try {
      expect.poll(() => face(4822), { timeout: 30_000 }).toBe("down");
      await expect
        .poll(async () => (await verdict(4822))?.ok ?? null, { timeout: 10_000 })
        .toBe(false);
      const bad = await verdict(4822);
      // the 403 was SEEN and recorded — judged, not swallowed
      const last = bad?.recent.at(-1);
      expect(last?.status).toBe(403);
      expect(last?.ok).toBe(false);
    } finally {
      compose("compose.forbidden.yaml", "fleet-health-forbidden", "down", "-v", "--remove-orphans");
    }
  });
});
