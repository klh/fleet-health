// health.probe.verdict.file.test.ts — colocated unit (bun test): the
// decoupling artifact — atomic write, verbatim read-back through the
// schema, fail-closed on a missing file.
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readVerdict, writeVerdictAtomic } from "./health.probe.verdict.file.ts";
import { HealthVerdict } from "../schemas/health.verdict.zod.ts";

const verdict: HealthVerdict = HealthVerdict.parse({
  target: "http://my-service:8080/healthz",
  mode: "liveness",
  check: "http-liveness",
  state: "down",
  ok: false,
  stale: false,
  misses: 4,
  miss_limit: 3,
  last_ok: null,
  latency_ms: null,
  checked_at: new Date().toISOString(),
  timestamp: new Date().toISOString(),
  error: null,
  probes: { total: 4, ok: 0, failed: 4 },
  recent: [],
});

describe("verdict file", () => {
  test("atomic write then schema-clean read-back", () => {
    const dir = mkdtempSync(join(tmpdir(), "fh-"));
    const path = join(dir, "verdict.json");
    writeVerdictAtomic(path, verdict);
    const read = readVerdict(path, 9000);
    expect(read?.state).toBe("down");
    expect(read?.ok).toBe(false);
  });

  test("missing file → null (fail-closed; the face reports down)", () => {
    expect(readVerdict("/nonexistent/verdict.json", 9000)).toBeNull();
  });

  test("an old successful file becomes down when read", () => {
    const now = Date.now();
    const path = join(mkdtempSync(join(tmpdir(), "fh-stale-")), "verdict.json");
    writeVerdictAtomic(path, {
      ...verdict,
      ok: true,
      state: "up",
      checked_at: new Date(now - 10_000).toISOString(),
      timestamp: new Date(now - 10_000).toISOString(),
    });
    const read = readVerdict(path, 9000, now);
    expect(read?.ok).toBe(false);
    expect(read?.state).toBe("down");
    expect(read?.stale).toBe(true);
    expect(read?.timestamp).toBe(new Date(now - 10_000).toISOString());
  });

  test("a new file cannot refresh an old wire observation", () => {
    const now = Date.now();
    const path = join(mkdtempSync(join(tmpdir(), "fh-stale-")), "verdict.json");
    writeVerdictAtomic(path, {
      ...verdict,
      ok: true,
      state: "up",
      checked_at: new Date(now - 10_000).toISOString(),
      timestamp: new Date(now).toISOString(),
    });
    expect(readVerdict(path, 9000, now)?.ok).toBe(false);
  });
});
