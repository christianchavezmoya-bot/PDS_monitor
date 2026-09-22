import { describe, expect, it } from "vitest";
import { SessionEngine } from "../core/engine";
import { summarize } from "../core/summary";
import { dayKey } from "../core/padState";
import type { RawMqttMessage } from "../core/types";
import fixture from "../fixtures/site-visit-22-sept.json";

let seq = 0;
function m(topic: string, payload: string, at: number): RawMqttMessage {
  seq += 1;
  return { id: seq, receivedAtMs: at, topic, payload, qos: 0, retain: false };
}

describe("event engine", () => {
  it("does not count repeated warning packets as new events", () => {
    const engine = new SessionEngine();
    const topic = "strata/v1/proximity/3/311933";
    const pad = (state: number, at: number) =>
      m(topic, `[3,${at},${311933},2147512536,"1.3.198",${state},0,0,0,0,0,4.10,0,0,0,0,0,6]`, at);
    engine.ingest(pad(1, 1_000));
    engine.ingest(pad(4, 2_000));
    engine.ingest(pad(4, 3_000));
    engine.ingest(pad(4, 8_000));
    engine.ingest(pad(1, 10_000));
    const snap = engine.snapshot();
    expect(snap.transitions).toHaveLength(2);
    expect(snap.events).toHaveLength(1);
    expect(snap.events[0]?.kind).toBe("warning");
    expect(snap.events[0]?.journeyLabel).toBe("MONITOR → WARNING → MONITOR");
    expect(snap.events[0]?.durationMs).toBe(8_000);
    expect(snap.events[0]?.sequenceTags).toContain("monitor-warning-monitor");
    expect(snap.events[0]?.open).toBe(false);
  });

  it("keeps monitor to warning to hazard as one hazard interaction", () => {
    const engine = new SessionEngine();
    const topic = "strata/v1/proximity/3/311933";
    const pad = (state: number, at: number) =>
      m(topic, `[3,${at},311933,2147512536,"1.3.198",${state},0,0,0,0,0,4.1,0,0,0,0,0,1]`, at);
    engine.ingest(pad(1, 0));
    engine.ingest(pad(4, 1_000));
    engine.ingest(pad(5, 4_000));
    engine.ingest(pad(1, 9_000));
    const snap = engine.snapshot();
    expect(snap.events).toHaveLength(1);
    expect(snap.events[0]?.kind).toBe("hazard");
    expect(snap.events[0]?.journey).toEqual(["MONITOR", "WARNING", "HAZARD", "MONITOR"]);
    expect(snap.events[0]?.sequenceTags).toContain("monitor-warning-hazard");
    const summary = summarize(snap, dayKey(0));
    expect(summary.warningEvents).toBe(0);
    expect(summary.hazardEvents).toBe(1);
    expect(summary.padsEnteringWarning).toBe(1);
    expect(summary.padsEnteringHazard).toBe(1);
    expect(summary.totalWarningMs).toBe(3_000);
    expect(summary.totalHazardMs).toBe(5_000);
  });

  it("tracks silent to warning to hazard separately from other pads", () => {
    const engine = new SessionEngine();
    const one = (state: number, at: number) =>
      m("strata/v1/proximity/3/1", `[3,${at},1,2147512536,"1.3.198",${state},0,0,0,0,0,4.1,0,0,0,0,0,1]`, at);
    const two = (state: number, at: number) =>
      m("strata/v1/proximity/3/1", `[3,${at},1,2147512547,"1.3.198",${state},0,0,0,0,0,4.1,0,0,0,0,0,1]`, at);
    engine.ingest(one(2, 0));
    engine.ingest(one(4, 2_000));
    engine.ingest(one(5, 5_000));
    engine.ingest(two(1, 6_000));
    engine.ingest(two(1, 7_000));
    const snap = engine.snapshot(5_000);
    expect(snap.events).toHaveLength(1);
    expect(snap.events[0]?.sequenceTags).toContain("silent-warning-hazard");
    expect(snap.pads.find((pad) => pad.displayId === 28899)?.stateCode).toBe(1);
    const summary = summarize(snap, dayKey(0));
    expect(summary.silentToWarningToHazard).toBe(1);
    expect(summary.uniquePads).toEqual([28888]);
  });
});

describe("site visit fixture", () => {
  it("replays the captured session through the same pipeline", () => {
    const engine = new SessionEngine();
    engine.ingestAll(fixture);
    const snap = engine.snapshot();
    expect(snap.rawCount).toBe(fixture.length);
    expect(snap.pads.map((pad) => pad.displayId).sort()).toEqual(expect.arrayContaining([28888, 28899]));
    const gens = snap.generators.map((g) => g.generatorId);
    expect(gens).toEqual(expect.arrayContaining([312860, 312864, 312847, 312853]));
    expect(snap.generators.every((g) => g.health === "unvalidated")).toBe(true);
    expect(snap.controllers.find((c) => c.controllerId === 311933)?.firmware).toBe("2.6.9");
    expect(snap.events.length).toBeGreaterThan(0);
    expect(snap.events.length).toBeLessThan(snap.rawCount);
    const repeatedSilent = snap.transitions.filter((t) => t.fromState === 2 && t.toState === 2);
    expect(repeatedSilent).toHaveLength(0);
    expect(JSON.stringify(snap.generators)).not.toMatch(/LOW VOLTAGE|COMM ERROR/);
    expect(snap.asOfMs).toBeGreaterThan(1_700_000_000_000);
    expect(Math.max(...snap.events.map((event) => event.durationMs))).toBeLessThan(2 * 60 * 60 * 1000);
  });
});
