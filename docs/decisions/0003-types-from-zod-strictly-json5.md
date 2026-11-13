# 0003 — types from zod, config strictly JSON5

Every type is z.output<typeof Schema> — no hand-written interfaces or
object aliases anywhere (CI checks). Settings are *.settings.json5,
strict() parsed, unknown fields fail loud. Compose files are wiring
only (image/ports/mounts/env). Same repo laws as fleet-buckle.
