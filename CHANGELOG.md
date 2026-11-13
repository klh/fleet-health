# Changelog

## 1.0.0 — 2026-11-13

First stable release. `@fleet/health` — the generalist outside-process
health verdict sidecar: one binary that polls a configured HTTP surface
over the network, decides the verdict itself, and serves it on its own
port. A server never paints itself healthy.

### The verdict machine
- **Outside-process by construction** — the poller shares nothing with
  the target but the network. Poll cadence, timeout, miss limit, ring
  size: all settings (`JSON5`), never code.
- **Good HTTP citizen** — any 2xx on the configured surface is healthy
  (body payload is not judged beyond an explicit down-marker denylist:
  `ok:false`, `healthy:false`, `status: down/unhealthy/…`); 4xx/5xx and
  transport failures are misses. Optional `expect_path` / `catalog_model`
  body checks.
- **Three-state verdict** — `up` / `degrading` / `down`: cold boot is
  down (never-seen-up is down); up→down rides the miss limit plus an
  ACTIVE confirming re-probe (one blip degrades, a confirmed second
  failure is down); any success anywhere recovers.
- **Stale-verdict law** — a dead writer must never ride as 200: the
  verdict carries `every_ms` next to `checked_at`; the face degrades
  itself when the verdict file goes stale (missed writes), preserving
  the last evidence. Serve-time freshness maps to 200 / 502 / 503.
- **Tracing ids through everything** — a W3C trace id (32-hex) per
  poll, stamped on every sample; no OTel SDK, per ADR 0004.

### The faces
- `GET /healthz` — compact face (`HealthFace`): what compose health hits.
- `GET /status` — full verdict (`HealthVerdict`): state, misses,
  `last_ok`, latency, ring of recent samples with their trace ids.

### Runs nearly by itself in Docker
- One Bun image (`oven/bun:1.4.4`), settings mounted at
  `/etc/health/settings.json5`, port 4112 — no other runtime.
- **Two self-contained compose demos** (`deploy/compose.ok.yaml`,
  `deploy/compose.forbidden.yaml`): a generic stub presents a 200 face
  and a 403 face; fleet-health watches one per stack and reports UP and
  DOWN respectively — the 403 is recorded on the sample and judged
  not-ok.

### Proven by tests
- 23 bun tests (verdict machine, freshness, face serve, settings).
- Playwright, docker-only beyond the binary smoke:
  - `smoke` — the binary loop on the wire: down → up → down.
  - `e2e` (docker) — the image builds, mounts settings from the host,
    polls the configured surface, and reports on both faces.
  - `e2e` (compose) — both compose scenarios: 200 face → UP,
    403 face → DOWN with the status recorded.

### Generalist law
fleet-health knows nothing of any consumer — no consumer names, ports,
or settings appear anywhere in the repo (ADR 0005). Configuration names
only its own probe target and serve surface.

## 0.1.0 — 2026-11-13

Initial scaffold: schemas, probe, verdict file, face, Dockerfile, laws
guard, OpenAPI generation.
