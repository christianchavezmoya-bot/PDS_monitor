import { describe, expect, it } from "vitest";
import { openBundledVisit, replayDelayMs } from "./replay";

describe("replay", () => {
  it("opens the bundled site visit only when the desktop recorder is empty", () => {
    expect(openBundledVisit(0, true)).toBe(true);
    expect(openBundledVisit(12, true)).toBe(false);
    expect(openBundledVisit(0, false)).toBe(false);
  });

  it("keeps original spacing at 1x and drops the wait at maximum", () => {
    expect(replayDelayMs(1_000, 4_000, 1)).toBe(3_000);
    expect(replayDelayMs(1_000, 4_000, "max")).toBe(0);
  });
});
