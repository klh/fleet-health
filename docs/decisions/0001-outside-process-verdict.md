# 0001 — the verdict is outside the process

A healthcheck is only valid when it does NOT run in the served process
(owner law 2026-10-05). The sidecar polls the real target over the
network and serves the verdict on its own port; compose health hits the
SIDECAR, never the server, so a wedged runtime cannot paint itself
healthy. Lifted from the fleet probe (deploy/healthcheck/probe.ts).
