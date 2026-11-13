// health.probe.once.ts — one poll of the real target, over the network.
// Lifted from the fleet probe (deploy/healthcheck/probe.ts): body
// semantics (ok/healthy/status denylist), expect-path dot-walk, catalog
// model check, 64 KiB read cap, status 0 on any transport failure.
import type { HealthProbeRequest } from "../schemas/health.probe.request.zod.ts";
import type { HealthSample } from "../schemas/health.verdict.zod.ts";

/** W3C trace id (32 hex) — the law: tracing ids through everything. */
export function newTraceId(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("hex");
}

function newTraceparent(): string {
  const span = Buffer.from(crypto.getRandomValues(new Uint8Array(8))).toString("hex");
  return `00-${newTraceId()}-${span}-01`;
}

const BAD_STATUS = [
  "down",
  "unhealthy",
  "error",
  "failed",
  "unavailable",
  "dead",
  "stopped",
  "degraded",
] as const;

function dotPath(body: unknown, path: string): unknown {
  let cur: unknown = body;
  for (const seg of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export async function probeOnce(
  url: string,
  timeoutMs: number,
  req: HealthProbeRequest = {},
): Promise<HealthSample> {
  const t0 = Date.now();
  const traceparent = newTraceparent();
  try {
    const init: RequestInit = {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "manual",
      headers: { traceparent, ...req.headers },
    };
    if (req.method !== undefined) init.method = req.method;
    if (req.body !== undefined) init.body = req.body;
    const r = await fetch(url, init);
    let ok = r.ok;
    const wantsBody =
      r.headers.get("content-type")?.includes("json") ||
      req.expect_path !== undefined ||
      req.catalog_model !== undefined;
    if (ok && wantsBody) {
      const reader = r.body?.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      if (reader) {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value!.byteLength;
            if (size > 65536) throw new Error("probe response exceeds 64 KiB");
            chunks.push(value!);
          }
        } finally {
          await reader.cancel();
        }
      }
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      ok =
        body !== null &&
        typeof body === "object" &&
        !Array.isArray(body) &&
        (body as Record<string, unknown>).ok !== false &&
        (body as Record<string, unknown>).healthy !== false &&
        !BAD_STATUS.includes(
          (body as Record<string, unknown>).status as (typeof BAD_STATUS)[number],
        );
      if (ok && req.expect_path !== undefined)
        ok = dotPath(body, req.expect_path) !== undefined;
      if (ok && req.catalog_model !== undefined)
        ok =
          Array.isArray((body as Record<string, unknown>).data) &&
          ((body as Record<string, unknown>).data as unknown[]).some(
            (row) =>
              row !== null &&
              typeof row === "object" &&
              (row as Record<string, unknown>).id === req.catalog_model,
          );
    } else {
      await r.body?.cancel();
    }
    return {
      ok,
      status: r.status,
      ms: Date.now() - t0,
      at: new Date().toISOString(),
      trace_id: traceparent.split("-")[1]!,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - t0,
      at: new Date().toISOString(),
      trace_id: traceparent.split("-")[1]!,
    };
  }
}
