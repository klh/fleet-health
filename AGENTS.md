# fleet-health — the laws

The OUTSIDE-PROCESS health verdict (owner law 2026-10-05): a server can
never paint itself healthy. fleet-health is the sidecar that polls the
real target over the network and serves the verdict on its own port.
Compose health checks hit THIS sidecar, never the served process.

## The verdict

- `up` — last poll succeeded on the wire.
- `degrading` — a missed poll below `miss_limit` keeps the verdict
  healthy. At the limit an ACTIVE confirming re-probe runs before the
  down flip (a single blip must not drop a service).
- `down` — the confirming re-probe also failed. Stays down until any
  poll succeeds again.
- Probe BEFORE serving: the sidecar never vouches from ignorance.
- One probe on the wire at a time; a bounded ring of recent samples.
- Fail-closed: a declared-but-unset credential is a config error, never
  an "up"; a missing or stale verdict file reports down.
- The JSON file and both HTTP faces carry a timestamp. The face checks
  both the stored poll time and write time on every read, so a stopped
  poller cannot leave an old success healthy.

## The verdict-file law

The poll loop WRITES the verdict to a JSON file (atomic write); the HTTP
face SERVES that file. Request waves against /healthz can never starve,
block, or DDoS the probe loop — serving is a file read, polling is a
loop. They share nothing.

## Tracing

W3C trace ids through everything — simply: every probe request carries a
fresh `traceparent`; every sample in the verdict records its trace id.
No OTel SDK here (simplicity law); the traced target services continue
these traces in their own backends.

## Repo laws (same as the fleet stack)

- **Types come from zod, ALWAYS**: every type is `z.output<typeof X>` —
  no hand-written interfaces or object type aliases anywhere. CI checks.
- **Strictly JSON5 config**: settings are `*.settings.json5`; secrets
  are PATHS, never values. No yaml is authored by us. Compose files are
  wiring only (image/ports/mounts/env).
- **One job per file**: `health.<thing>.<role>.ts` (roles `.zod.ts`,
  `.once.ts`, `.file.ts`, `.serve.ts`, `.main.ts`, `.test.ts`).
  Capability folders (`probe/`, `face/`, `main/`) are the review/test
  unit; barrels only; no god-files. Warn at 400 lines, stop at 1200.
- **Tests**: colocated `*.test.ts` on bun test; `/test` runs
  @playwright/test. One framework per surface, never mixed.
- **npm installs, Bun runs**; exact versions; lockfile committed.
- **openapi.json is generated** from the wire schemas, committed,
  CI-diffed (`bun tools/src/health.gen-openapi.ts --check`).
- **qlty is THE quality tool**: the pre-commit hook runs
  `qlty fmt` + `qlty check` on staged files and ABORTS on any error.
