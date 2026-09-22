export type ReplaySpeed = 1 | 2 | 5 | 10 | "max";

export function replayDelayMs(previousMs: number, nextMs: number, speed: ReplaySpeed): number {
  if (speed === "max") return 0;
  const delta = Math.max(0, nextMs - previousMs);
  return delta / speed;
}

/** Cold desktop start with an empty recorder. Live MQTT stays available from the Live button. */
export function openBundledVisit(recordedCount: number, desktop: boolean): boolean {
  return desktop && recordedCount === 0;
}
