/** Validated PAD zone codes from the 22 Sept Centurion capture and the project spec. */
export const PAD_STATE = {
  ID: 0,
  MONITOR: 1,
  SILENT: 2,
  WARNING: 4,
  HAZARD: 5,
} as const;

export type PadStateCode = (typeof PAD_STATE)[keyof typeof PAD_STATE] | number;

const NAMES: Record<number, string> = {
  0: "ID",
  1: "MONITOR",
  2: "SILENT",
  4: "WARNING",
  5: "HAZARD",
};

export function padStateName(code: number | null | undefined): string {
  if (code === null || code === undefined) return "UNKNOWN";
  return NAMES[code] ?? `UNMAPPED_${code}`;
}

export function isAlertState(code: number | null | undefined): boolean {
  return code === PAD_STATE.WARNING || code === PAD_STATE.HAZARD;
}

/** Human-readable PAD id is the lower 16 bits of the encoded MQTT device id. */
export function padDisplayId(encodedId: number): number {
  return encodedId % 65536;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "—";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function formatClock(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function dayKey(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dayBounds(key: string): { start: number; end: number } {
  const [y, m, d] = key.split("-").map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1).getTime();
  return { start, end: start + 86_400_000 };
}

export function parkingBrakeLabel(value: number | null): string {
  if (value === 0) return "OFF";
  if (value === 1) return "ON";
  return "UNKNOWN";
}
