// health.probe.verdict.file.test.ts — colocated unit (bun test): the
// decoupling artifact — atomic write, verbatim parse-only read-back,
// fail-closed on missing/garbage files. Serve-time freshness lives in
// the face (health.face.freshness) — a dead writer is the FACE's call.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readVerdictRaw, writeVerdictAtomic } from "./health.probe.verdict.file.ts";
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
  every_ms: 5000,
  last_ok: null,
  latency_ms: null,
  checked_at: new Date().toISOString(),
  timestamp: new Date().toISOString(),
  error: null,
  probes: { total: 4, ok: 0, failed: 4 },
  recent: [],
});

describe("verdict file", () => {
  test("atomic write then verbatim read-back (every_ms rides next to checked_at)", () => {
    const dir = mkdtempSync(join(tmpdir(), "fh-"));
    const path = join(dir, "verdict.json");
    writeVerdictAtomic(path, verdict);
    const read = readVerdictRaw(path);
    expect(read).toEqual(verdict);
  });

  test("missing file → null (fail-closed; the face reports no verdict)", () => {
    expect(readVerdictRaw("/nonexistent/verdict.json")).toBeNull();
  });

  test("garbage file → null (schema drift never vouches)", () => {
    const path = join(mkdtempSync(join(tmpdir(), "fh-")), "verdict.json");
    writeFileSync(path, "{not json", "utf8");
    expect(readVerdictRaw(path)).toBeNull();
  });
});
