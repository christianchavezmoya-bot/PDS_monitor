import { dayBounds, formatDuration, padStateName } from "./padState";
import type { EngineSnapshot, InteractionEvent, StateInterval, StateTransition } from "./types";

export interface DailySummary {
  day: string;
  controllerId: number | null;
  warningEvents: number;
  hazardEvents: number;
  uniquePads: number[];
  padsEnteringWarning: number;
  padsEnteringHazard: number;
  silentToWarning: number;
  silentToWarningToHazard: number;
  monitorToWarning: number;
  monitorToWarningToHazard: number;
  monitorToWarningToMonitor: number;
  totalWarningMs: number;
  totalHazardMs: number;
  longestWarningMs: number;
  longestHazardMs: number;
  totalWarningLabel: string;
  totalHazardLabel: string;
  longestWarningLabel: string;
  longestHazardLabel: string;
}

function inDay(ms: number, start: number, end: number): boolean {
  return ms >= start && ms < end;
}

function overlapMs(interval: StateInterval, start: number, end: number, asOf: number): number {
  const intervalEnd = interval.endMs ?? asOf;
  const from = Math.max(interval.startMs, start);
  const to = Math.min(intervalEnd, end);
  return Math.max(0, to - from);
}

export function summarize(
  snap: EngineSnapshot,
  day: string,
  controllerId: number | null = null,
): DailySummary {
  const { start, end } = dayBounds(day);
  const matchController = (id: number) => controllerId === null || id === controllerId;
  const events = snap.events.filter(
    (event) => matchController(event.controllerId) && inDay(event.startMs, start, end),
  );
  const transitions = snap.transitions.filter(
    (transition) => matchController(transition.controllerId) && inDay(transition.atMs, start, end),
  );
  const intervals = snap.intervals.filter((interval) => matchController(interval.controllerId));

  const warningDurations = durationsFor(intervals, 4, start, end, snap.asOfMs);
  const hazardDurations = durationsFor(intervals, 5, start, end, snap.asOfMs);

  return {
    day,
    controllerId,
    warningEvents: events.filter((event) => event.kind === "warning").length,
    hazardEvents: events.filter((event) => event.kind === "hazard").length,
    uniquePads: [...new Set(events.map((event) => event.padDisplayId))].sort((a, b) => a - b),
    padsEnteringWarning: transitions.filter((transition) => transition.toState === 4).length,
    padsEnteringHazard: transitions.filter((transition) => transition.toState === 5).length,
    silentToWarning: events.filter((event) => event.sequenceTags.includes("silent-warning")).length,
    silentToWarningToHazard: events.filter((event) => event.sequenceTags.includes("silent-warning-hazard")).length,
    monitorToWarning: events.filter((event) => event.sequenceTags.includes("monitor-warning")).length,
    monitorToWarningToHazard: events.filter((event) => event.sequenceTags.includes("monitor-warning-hazard")).length,
    monitorToWarningToMonitor: events.filter((event) => event.sequenceTags.includes("monitor-warning-monitor")).length,
    totalWarningMs: sum(warningDurations),
    totalHazardMs: sum(hazardDurations),
    longestWarningMs: warningDurations.length ? Math.max(...warningDurations) : 0,
    longestHazardMs: hazardDurations.length ? Math.max(...hazardDurations) : 0,
    totalWarningLabel: formatDuration(sum(warningDurations)),
    totalHazardLabel: formatDuration(sum(hazardDurations)),
    longestWarningLabel: formatDuration(warningDurations.length ? Math.max(...warningDurations) : 0),
    longestHazardLabel: formatDuration(hazardDurations.length ? Math.max(...hazardDurations) : 0),
  };
}

function durationsFor(intervals: StateInterval[], state: number, start: number, end: number, asOf: number): number[] {
  return intervals
    .filter((interval) => interval.stateCode === state)
    .map((interval) => overlapMs(interval, start, end, asOf))
    .filter((ms) => ms > 0);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function filterEvents(
  events: InteractionEvent[],
  filter: { day?: string; controllerId?: number | null; padId?: number | null; kind?: "all" | "warning" | "hazard" },
): InteractionEvent[] {
  return events
    .filter((event) => {
      if (filter.day) {
        const { start, end } = dayBounds(filter.day);
        if (event.startMs < start || event.startMs >= end) return false;
      }
      if (filter.controllerId) {
        if (event.controllerId !== filter.controllerId) return false;
      }
      if (filter.padId) {
        if (event.padDisplayId !== filter.padId) return false;
      }
      if (filter.kind && filter.kind !== "all" && event.kind !== filter.kind) return false;
      return true;
    })
    .sort((a, b) => a.startMs - b.startMs || a.padDisplayId - b.padDisplayId);
}

export function transitionLabel(transition: StateTransition): string {
  return `${padStateName(transition.fromState)} → ${padStateName(transition.toState)}`;
}
