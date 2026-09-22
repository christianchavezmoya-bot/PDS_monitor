/**
 * Shuttle-car live-map geometry.
 * Ovals are measured from the machine edge:
 * ends  hazard 0–4 m, warning 4–8 m, monitor 8–12 m
 * sides hazard 0–2 m, warning 2–5 m, monitor 5–9 m
 * Car length 9 m, width 2.4 m. Origin is the car centre, +y toward the loading end.
 */

export const SHUTTLE_LENGTH_M = 9;
export const SHUTTLE_WIDTH_M = 2.4;
const HALF_L = SHUTTLE_LENGTH_M / 2;
const HALF_W = SHUTTLE_WIDTH_M / 2;

export const ZONE_OFFSETS = {
  hazard: { end: 4, side: 2 },
  warning: { end: 8, side: 5 },
  monitor: { end: 12, side: 9 },
} as const;

export type ZoneName = keyof typeof ZONE_OFFSETS;

export function zoneEllipse(zone: ZoneName): { rx: number; ry: number } {
  const offset = ZONE_OFFSETS[zone];
  return { rx: HALF_W + offset.side, ry: HALF_L + offset.end };
}

export const ZONE_ELLIPSES = {
  monitor: zoneEllipse("monitor"),
  warning: zoneEllipse("warning"),
  hazard: zoneEllipse("hazard"),
} as const;

const MONITOR = ZONE_ELLIPSES.monitor;

export const FIELD_FRAME = {
  x: -(MONITOR.rx + 0.7),
  y: -(MONITOR.ry + 0.8),
  w: (MONITOR.rx + 0.7) * 2,
  h: (MONITOR.ry + 0.8) * 2,
};

export const SHUTTLE_BOX = { x: -HALF_W, y: -HALF_L, w: SHUTTLE_WIDTH_M, h: SHUTTLE_LENGTH_M };
export const MINER_BOX = { x: -1.2, y: 13.4, w: 2.4, h: 2.8 };

export const CM_SILENT_ZONES = [
  { cx: -3.4, cy: 14.6, rx: 1.05, ry: 0.55 },
  { cx: 3.4, cy: 14.6, rx: 1.05, ry: 0.55 },
];

export function insideEllipse(x: number, y: number, rx: number, ry: number): boolean {
  return (x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1;
}

export const PAD_SLOTS = {
  hazard: [
    [2.2, 0],
    [-2.2, 0.8],
    [0, 6.4],
    [0, -6.4],
    [1.7, 3.2],
    [-1.7, -3.2],
  ],
  warning: [
    [4.6, 0],
    [-4.6, 1],
    [0, 10.4],
    [0, -10.4],
    [3.4, 6],
    [-3.4, -6],
  ],
  monitor: [
    [8, 0],
    [-8, 0],
    [0, 14.4],
    [0, -14.4],
    [6, 9],
    [-6, -9],
  ],
  silent: [
    [-3.4, 14.6],
    [3.4, 14.6],
    [-3.4, 15.3],
    [3.4, 15.3],
  ],
} as const;

export function padSlot(stateCode: number, index: number): readonly [number, number] {
  const slots =
    stateCode === 5 ? PAD_SLOTS.hazard : stateCode === 4 ? PAD_SLOTS.warning : stateCode === 1 ? PAD_SLOTS.monitor : stateCode === 2 ? PAD_SLOTS.silent : PAD_SLOTS.monitor;
  return slots[index % slots.length];
}
