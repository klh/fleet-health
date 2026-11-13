// health.probe.verdict.file.ts — THE DECOUPLING: the poll loop writes
// the verdict to a JSON file (atomic: tmp + rename); the face serves
// that file. Request waves against /healthz are file reads — they can
// never starve, block, or DDoS the probe loop. Read is parse-only:
// freshness belongs to the FACE at serve time (a dead writer must not
// ride a stale file as 200); missing/unreadable file = no verdict.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { HealthVerdict } from "../schemas/health.verdict.zod.ts";

export function writeVerdictAtomic(path: string, verdict: HealthVerdict): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(verdict), { mode: 0o644 });
  renameSync(tmp, path);
}

export function readVerdictRaw(path: string): HealthVerdict | null {
  try {
    return HealthVerdict.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}
