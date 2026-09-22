import { describe, expect, it } from "vitest";
import { PAD_SLOTS, SHUTTLE_LENGTH_M, SHUTTLE_WIDTH_M, ZONE_ELLIPSES, ZONE_OFFSETS, insideEllipse } from "./shuttleField";

describe("shuttle oval fields", () => {
  it("uses a 9 m by 2.4 m shuttle car", () => {
    expect(SHUTTLE_LENGTH_M).toBe(9);
    expect(SHUTTLE_WIDTH_M).toBe(2.4);
  });

  it("offsets the ovals from the machine edge", () => {
    expect(ZONE_OFFSETS.hazard).toEqual({ end: 4, side: 2 });
    expect(ZONE_OFFSETS.warning).toEqual({ end: 8, side: 5 });
    expect(ZONE_OFFSETS.monitor).toEqual({ end: 12, side: 9 });
    expect(ZONE_ELLIPSES.hazard.ry).toBe(4.5 + 4);
    expect(ZONE_ELLIPSES.hazard.rx).toBe(1.2 + 2);
    expect(ZONE_ELLIPSES.warning.ry).toBe(4.5 + 8);
    expect(ZONE_ELLIPSES.warning.rx).toBe(1.2 + 5);
    expect(ZONE_ELLIPSES.monitor.ry).toBe(4.5 + 12);
    expect(ZONE_ELLIPSES.monitor.rx).toBe(1.2 + 9);
  });

  it("places logical PAD slots in the matching oval", () => {
    for (const [x, y] of PAD_SLOTS.hazard) {
      expect(insideEllipse(x, y, ZONE_ELLIPSES.hazard.rx, ZONE_ELLIPSES.hazard.ry)).toBe(true);
    }
    for (const [x, y] of PAD_SLOTS.warning) {
      expect(insideEllipse(x, y, ZONE_ELLIPSES.warning.rx, ZONE_ELLIPSES.warning.ry)).toBe(true);
      expect(insideEllipse(x, y, ZONE_ELLIPSES.hazard.rx, ZONE_ELLIPSES.hazard.ry)).toBe(false);
    }
    for (const [x, y] of PAD_SLOTS.monitor) {
      expect(insideEllipse(x, y, ZONE_ELLIPSES.monitor.rx, ZONE_ELLIPSES.monitor.ry)).toBe(true);
      expect(insideEllipse(x, y, ZONE_ELLIPSES.warning.rx, ZONE_ELLIPSES.warning.ry)).toBe(false);
    }
  });
});
