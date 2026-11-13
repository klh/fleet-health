# 0002 — the poller writes, the face serves the file

The poll loop writes the verdict JSON atomically (tmp + rename); the
HTTP face reads that file per request. Polling and serving share
nothing but the file: massive request waves against /healthz are file
reads and can never DDoS, starve, or block the probe loop. A missing or
unparseable file reports down — fail-closed.
