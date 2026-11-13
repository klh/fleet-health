# @fleet/health

The outside-process health verdict sidecar (owner law 2026-10-05): a
server can never paint itself healthy. fleet-health polls the real
target over the network and serves the verdict on its own port —
compose health checks hit THIS sidecar, never the served process.

**The verdict-file law**: the poll loop WRITES the verdict to a JSON
file (atomic); the HTTP face SERVES that file. Request waves against
`/healthz` are file reads — they can never starve the probe loop.

Verdict machine: `up` → `degrading` after a missed poll (still healthy
below `miss_limit`) → ACTIVE confirming re-probe at the limit → `down`
if confirmation fails. Any success recovers. The JSON verdict and both
HTTP faces include a timestamp. The HTTP face checks the stored poll
time and write time on every request, so an old success becomes a 502
with `stale: true` even if the poller stops. Fail-closed on
declared-but-unset credentials.

- **Config**: strictly JSON5 — one generic example; the consuming stack owns instances.
- **Types**: every type is `z.output<typeof Schema>` — never hand-written.
- **Faces**: `GET /healthz` (compact, 200/502) · `GET /status` (full).
- **Tests**: colocated `*.test.ts` on bun test; `/test` smoke on
  @playwright/test boots the binary and watches verdicts flip on the wire.

## Setup

    npm install
    bun test                    # units
    bun run smoke               # binary smoke
    bun run check               # laws + openapi drift
    bun src/main/health.main.ts --settings deploy/settings/example.settings.json5

## The stale-verdict law (consumer contract)

A dead WRITER would leave the last file serving as 200 forever — so the
verdict carries `every_ms` next to `checked_at`, the face recomputes
freshness at SERVE time, and `/healthz` answers 200 / 502 (target
down) / **503 STALE VERDICT** (writer stopped writing; `checked_at`,
`every_ms`, `missed_updates` still visible). Consumers count missed
writes and deem the sidecar unhealthy after their own x.
