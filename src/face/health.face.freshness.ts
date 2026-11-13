// health.face.freshness.ts — the STALE-VERDICT law, as a pure function
// the face runs AT SERVE TIME (never the writer's last word): the
// verdict file carries `checked_at` + `every_ms` side by side, so any
// consumer can count missed writes and deem the sidecar unhealthy
// after more than STALE_MISSES. Import this helper — do not re-derive.
export const STALE_MISSES = 2;

/** missed_updates = how many write cadences have passed since
 *  checked_at. One missed write is GRACE (a slow poll); two+ means the
 *  writer is not writing — the file is frozen evidence, not a verdict. */
export function verdictFreshness(
  checkedAt: string | null,
  everyMs: number,
  nowMs = Date.now(),
) {
  if (checkedAt === null) return { age_ms: null, missed_updates: null, stale: true };
  const age = nowMs - Date.parse(checkedAt);
  const missed = Math.floor(Math.max(age, 0) / everyMs);
  return { age_ms: age, missed_updates: missed, stale: missed >= STALE_MISSES };
}
