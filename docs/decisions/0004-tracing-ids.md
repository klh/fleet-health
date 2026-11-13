# 0004 — tracing ids through everything (simply)

Full OTel/Jaeger is the fleet law, but fleet-health stays simple in its
ways of working: no OTel SDK. Every poll generates a W3C `traceparent`
(00-<trace>-<span>-01) and sends it with the probe request — the target
sees the trace id in its own telemetry; each sample records its 32-hex
trace id in the verdict, so a dashboard can jump from a red verdict to
the exact trace. The traced services (full OTel citizens) continue
these traces into their own backends via OTLP.
