# 0005 — the stale-verdict law (a dead writer must never ride as 200)

The poller writes the verdict FILE; the face serves it. If the WRITER
dies (wedged loop, full disk, frozen event loop), the last file would
serve as 200 forever — a dead probe vouching for a target nobody is
checking. Fixes, in contract form:

- The verdict file carries `every_ms` STAMPED NEXT TO `checked_at` —
  the write cadence travels with the timestamp.
- The face recomputes freshness AT SERVE TIME (never the writer's last
  word): `missed_updates = (now - checked_at) / every_ms`, exported as
  the pure helper `verdictFreshness` for consumers to import.
- One missed write is GRACE (a slow poll). >= STALE_MISSES (2) missed
  writes = STALE: the file is frozen evidence, not a verdict.
- Status codes tell three truths: 200 fresh+ok · 502 fresh verdict,
  TARGET down · 503 STALE VERDICT (writer died) or no file. A stale
  response has `ok: false`, `state: down`, and `stale: true`; it retains
  `checked_at`, `timestamp`, `last_ok`, and the recent samples as evidence.
- Consumer law: anything checking fleet-health ALSO checks the
  timestamp — count missed writes, deem the SIDECAR unhealthy after x.
