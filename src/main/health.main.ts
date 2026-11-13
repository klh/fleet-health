// health.main.ts — the sidecar entry: load JSON5 settings, poll BEFORE
// serving (never vouch from ignorance), write the verdict file on every
// poll (atomic), then serve the file. Settings resolution: --settings
// flag > HEALTH_SETTINGS env; no file = refuse to start. The file keeps
// its .json5 name end-to-end (Bun parses JSON5 modules natively).
import { serveFace } from "../face/health.face.serve.ts";
import { createMonitor } from "../probe/health.probe.monitor.ts";
import { writeVerdictAtomic } from "../probe/health.probe.verdict.file.ts";
import { HealthSettings } from "../schemas/health.settings.zod.ts";

async function loadSettings(): Promise<ReturnType<typeof HealthSettings.parse>> {
  const argv = process.argv.slice(2);
  const flagAt = argv.indexOf("--settings");
  const path =
    flagAt >= 0 ? argv[flagAt + 1] : process.env.HEALTH_SETTINGS;
  if (path === undefined || path.length === 0)
    throw new Error("no settings: pass --settings <file> or set HEALTH_SETTINGS");
  const mod = (await import(Bun.pathToFileURL(path).href)) as {
    default: unknown;
  };
  return HealthSettings.parse(mod.default);
}

const settings = await loadSettings();
const monitor = createMonitor(settings);
let pollInFlight = false;

async function pollAndWrite(): Promise<void> {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    await monitor.poll();
    writeVerdictAtomic(settings.serve.verdict_file, monitor.snapshot());
  } finally {
    pollInFlight = false;
  }
}

// probe once BEFORE serving — the sidecar never vouches from ignorance
await pollAndWrite();
const timer = setInterval(() => {
  void pollAndWrite().catch((error: unknown) => {
    console.error("fleet-health: probe write failed", error);
  });
}, settings.probe.every_ms);
timer.unref?.();

const server = serveFace(settings);
console.log(
  `fleet-health: sidecar ${server.url.href} -> ${monitor.snapshot().target} (verdict: ${settings.serve.verdict_file})`,
);
