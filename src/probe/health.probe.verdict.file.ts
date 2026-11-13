// health.probe.verdict.file.ts — THE DECOUPLING: the poll loop writes
// the verdict to a JSON file (atomic: tmp + rename); the face serves
// that file. Request waves against /healthz are file reads — they can
// never starve, block, or DDoS the probe loop. Missing/unreadable file
// reports down (fail-closed).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { HealthVerdict } from "../schemas/health.verdict.zod.ts";

export function writeVerdictAtomic(path: string, verdict: HealthVerdict): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(verdict), { mode: 0o644 });
  renameSync(tmp, path);
}

export function readVerdict(
  path: string,
  maxAgeMs: number,
  now = Date.now(),
): HealthVerdict | null {
  try {
    const verdict = HealthVerdict.parse(JSON.parse(readFileSync(path, "utf8")));
    const ageOf = (time: string | null): number =>
      time === null ? Infinity : now - Date.parse(time);
    const fresh =
      ageOf(verdict.timestamp) >= 0 &&
      ageOf(verdict.timestamp) <= maxAgeMs &&
      ageOf(verdict.checked_at) >= 0 &&
      ageOf(verdict.checked_at) <= maxAgeMs;
    return fresh
      ? verdict
      : { ...verdict, ok: false, state: "down", stale: true };
  } catch {
    return null;
  }
}
