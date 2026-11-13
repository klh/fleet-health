// health.face.freshness.test.ts — the stale-verdict law as a pure
// function: consumers count missed writes from checked_at + every_ms.
import { describe, expect, test } from "bun:test";
import { STALE_MISSES, verdictFreshness } from "./health.face.freshness.ts";

describe("verdict freshness (serve-time)", () => {
  const every = 5000;
  const now = Date.parse("2026-11-13T16:00:00.000Z");

  test("fresh write: zero missed", () => {
    const f = verdictFreshness("2026-11-13T15:59:58.000Z", every, now);
    expect(f).toEqual({ age_ms: 2000, missed_updates: 0, stale: false });
  });

  test("one missed write is GRACE (a slow poll, not a dead writer)", () => {
    const f = verdictFreshness("2026-11-13T15:59:52.000Z", every, now);
    expect(f.missed_updates).toBe(1);
    expect(f.stale).toBe(false);
  });

  test(`>= ${STALE_MISSES} missed writes = STALE (the writer died; the file is frozen evidence)`, () => {
    const f = verdictFreshness("2026-11-13T15:59:45.000Z", every, now);
    expect(f.missed_updates).toBeGreaterThanOrEqual(STALE_MISSES);
    expect(f.stale).toBe(true);
  });

  test("a long-dead writer shows the full count (consumers apply their own x)", () => {
    const f = verdictFreshness("2026-11-13T15:00:00.000Z", every, now);
    expect(f.missed_updates).toBe(720);
    expect(f.stale).toBe(true);
  });

  test("no checked_at (no file at all) = stale, count null", () => {
    expect(verdictFreshness(null, every, now)).toEqual({
      age_ms: null,
      missed_updates: null,
      stale: true,
    });
  });

  test("clock skew (future timestamp) never flips stale", () => {
    const f = verdictFreshness("2026-11-13T16:00:05.000Z", every, now);
    expect(f.missed_updates).toBe(0);
    expect(f.stale).toBe(false);
  });
});
