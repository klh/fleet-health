# @fleet/health

The outside-process health verdict sidecar (owner law 2026-10-05): a
server can never paint itself healthy. fleet-health polls the real
target over the network and serves the verdict on its own port —
compose health checks hit THIS sidecar, never the served process.

**The verdict-file law**: the poll loop WRITES the verdict to a JSON
file (atomic); the HTTP face SERVES that file. Request waves against
`/healthz` are file reads — they can never starve the probe loop.

Verdict machine: `up` → `degrading` (misses ≥ limit, ACTIVE confirming
re-probe before the flip) → `down`; any success recovers; stale samples
never vouch. Fail-closed on declared-but-unset credentials.

- **Config**: strictly JSON5 (`deploy/settings/*.settings.json5`).
- **Types**: every type is `z.output<typeof Schema>` — never hand-written.
- **Faces**: `GET /healthz` (compact, 200/502) · `GET /status` (full).
- **Tests**: colocated `*.test.ts` on bun test; `/test` smoke on
  @playwright/test boots the binary and watches verdicts flip on the wire.

## Setup

    npm install
    bun test                    # units
    bun run smoke               # binary smoke
    bun run check               # laws + openapi drift
    bun src/main/health.main.ts --settings src/schemas/fixtures/h1.settings.json5
