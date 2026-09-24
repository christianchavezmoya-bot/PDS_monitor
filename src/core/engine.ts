import { decodeMqtt } from "./decoder";
import { isAlertState, padStateName } from "./padState";
import type {
  ControllerLive,
  EngineSnapshot,
  GeneratorLive,
  InteractionEvent,
  PadLive,
  ParkingBrakeInterval,
  RawMqttMessage,
  StateInterval,
  StateTransition,
} from "./types";

function padKey(controllerId: number, displayId: number): string {
  return `${controllerId}:${displayId}`;
}

export function sequenceTags(journey: string[]): string[] {
  const tags: string[] = [];
  const joined = journey.join(">");
  if (joined.startsWith("MONITOR>WARNING>HAZARD")) tags.push("monitor-warning-hazard");
  else if (joined.startsWith("MONITOR>WARNING>MONITOR")) tags.push("monitor-warning-monitor");
  else if (joined.startsWith("MONITOR>WARNING")) tags.push("monitor-warning");
  if (joined.startsWith("SILENT>WARNING>HAZARD")) tags.push("silent-warning-hazard");
  else if (joined.startsWith("SILENT>WARNING")) tags.push("silent-warning");
  return tags;
}

export function derivedPds(pads: Iterable<PadLive>): string {
  const list = [...pads];
  if (list.some((p) => p.stateCode === 5)) return "HAZARD";
  if (list.some((p) => p.stateCode === 4)) return "WARNING";
  if (list.some((p) => p.stateCode === 2)) return "SILENT";
  if (list.some((p) => p.stateCode === 1)) return "MONITOR";
  if (list.length === 0) return "NO PADS";
  return "ID";
}

function journeyLabel(journey: string[]): string {
  return journey.join(" → ");
}

export class SessionEngine {
  private nextId = 1;
  private rawCount = 0;
  private decodeErrors = 0;
  private unknownTopics = 0;
  private lastReceivedAtMs = 0;
  private rawById = new Map<number, RawMqttMessage>();
  private pads = new Map<string, PadLive>();
  private controllers = new Map<number, ControllerLive>();
  private generators = new Map<string, GeneratorLive>();
  private transitions: StateTransition[] = [];
  private intervals: StateInterval[] = [];
  private parkingBrakeIntervals: ParkingBrakeInterval[] = [];
  private events: InteractionEvent[] = [];
  private openEvents = new Map<string, InteractionEvent>();

  reset(): void {
    this.nextId = 1;
    this.rawCount = 0;
    this.decodeErrors = 0;
    this.unknownTopics = 0;
    this.lastReceivedAtMs = 0;
    this.rawById.clear();
    this.pads.clear();
    this.controllers.clear();
    this.generators.clear();
    this.transitions = [];
    this.intervals = [];
    this.parkingBrakeIntervals = [];
    this.events = [];
    this.openEvents.clear();
  }

  ingest(message: RawMqttMessage): void {
    const id = message.id ?? this.nextId++;
    if (message.id !== undefined && message.id >= this.nextId) this.nextId = message.id + 1;
    const raw: RawMqttMessage = { ...message, id };
    this.rawById.set(id, raw);
    this.rawCount += 1;
    this.lastReceivedAtMs = Math.max(this.lastReceivedAtMs, raw.receivedAtMs);

    let decoded;
    try {
      decoded = decodeMqtt(raw);
    } catch {
      this.decodeErrors += 1;
      return;
    }
    if (decoded.parseError) this.decodeErrors += 1;
    if (decoded.topicKind === "unknown") this.unknownTopics += 1;

    const controllerId = decoded.controllerId;
    if (controllerId !== null) this.touchController(controllerId, raw.receivedAtMs, decoded.deviceTimestamp, raw.id);

    if (decoded.controllerStatus) {
      const c = this.controllers.get(decoded.controllerStatus.controllerId)!;
      c.input1 = decoded.controllerStatus.input1;
      this.applyParkingBrake(decoded.controllerStatus.controllerId, decoded.controllerStatus.parkingBrakeRelease, raw);
      c.parkingBrakeRelease = decoded.controllerStatus.parkingBrakeRelease;
      c.unmappedByTopic["proximity/1"] = decoded.unmapped;
      c.rawMessageId = raw.id;
    }

    if (decoded.controllerInfo) {
      const c = this.controllers.get(decoded.controllerInfo.controllerId)!;
      c.firmware = decoded.controllerInfo.firmware;
      c.unmappedByTopic["proximity/21"] = decoded.unmapped;
      c.rawMessageId = raw.id;
    }

    if (decoded.generator) {
      const g = this.touchGenerator(decoded.generator.controllerId, decoded.generator.generatorId, raw.receivedAtMs);
      g.firmware = decoded.generator.firmware;
      g.unmapped = decoded.unmapped;
    }

    if (decoded.topicKind.startsWith("wifi/") && controllerId !== null) {
      this.controllers.get(controllerId)!.unmappedByTopic[decoded.topicKind] = decoded.unmapped;
    }
    if (
      (decoded.topicKind === "proximity/15" || decoded.topicKind === "proximity/22") &&
      controllerId !== null
    ) {
      this.controllers.get(controllerId)!.unmappedByTopic[decoded.topicKind] = decoded.unmapped;
    }

    if (decoded.pad) this.applyPad(decoded.pad, decoded.unmapped, raw);
  }

  ingestAll(messages: RawMqttMessage[]): void {
    for (const message of messages) this.ingest(message);
  }

  findRaw(id: number | undefined): RawMqttMessage | undefined {
    if (id === undefined) return undefined;
    return this.rawById.get(id);
  }

  rawMessages(): RawMqttMessage[] {
    return [...this.rawById.values()].sort((a, b) => a.receivedAtMs - b.receivedAtMs || (a.id ?? 0) - (b.id ?? 0));
  }

  snapshot(asOfMs?: number): EngineSnapshot {
    const asOf = asOfMs ?? this.lastReceivedAtMs;
    const events = this.events.map((event) => materializeEvent(event, asOf));
    return {
      asOfMs: asOf,
      rawCount: this.rawCount,
      decodeErrors: this.decodeErrors,
      unknownTopics: this.unknownTopics,
      pads: [...this.pads.values()].sort((a, b) => a.displayId - b.displayId),
      controllers: [...this.controllers.values()].sort((a, b) => a.controllerId - b.controllerId),
      generators: [...this.generators.values()].sort((a, b) => a.generatorId - b.generatorId),
      transitions: this.transitions,
      intervals: this.intervals,
      parkingBrakeIntervals: this.parkingBrakeIntervals,
      events,
    };
  }

  private touchController(
    controllerId: number,
    seenMs: number,
    deviceTimestamp: number | null,
    rawId?: number,
  ): ControllerLive {
    let c = this.controllers.get(controllerId);
    if (!c) {
      c = {
        controllerId,
        firmware: null,
        input1: null,
        parkingBrakeRelease: null,
        lastSeenMs: seenMs,
        lastDeviceTimestamp: deviceTimestamp,
        unmappedByTopic: {},
        rawMessageId: rawId,
      };
      this.controllers.set(controllerId, c);
    }
    c.lastSeenMs = seenMs;
    if (deviceTimestamp !== null) c.lastDeviceTimestamp = deviceTimestamp;
    return c;
  }

  private applyParkingBrake(controllerId: number, value: number | null, raw: RawMqttMessage): void {
    if (value !== 0 && value !== 1) return;
    const released = value === 1;
    const current = [...this.parkingBrakeIntervals].reverse().find(
      (item) => item.controllerId === controllerId && item.endMs === null,
    );
    if (current?.released === released) return;
    if (current) current.endMs = raw.receivedAtMs;
    this.parkingBrakeIntervals.push({
      controllerId,
      released,
      startMs: raw.receivedAtMs,
      endMs: null,
      rawMessageId: raw.id,
    });
  }

  private touchGenerator(controllerId: number, generatorId: number, seenMs: number): GeneratorLive {
    const key = `${controllerId}:${generatorId}`;
    let g = this.generators.get(key);
    if (!g) {
      g = {
        controllerId,
        generatorId,
        firmware: null,
        lastSeenMs: seenMs,
        unmapped: [],
        health: "unvalidated",
      };
      this.generators.set(key, g);
    }
    g.lastSeenMs = seenMs;
    return g;
  }

  private applyPad(
    pad: NonNullable<ReturnType<typeof decodeMqtt>["pad"]>,
    unmapped: { index: number; value: unknown }[],
    raw: RawMqttMessage,
  ): void {
    const key = padKey(pad.controllerId, pad.displayId);
    const existing = this.pads.get(key);
    if (!existing) {
      const live: PadLive = {
        controllerId: pad.controllerId,
        displayId: pad.displayId,
        encodedId: pad.encodedId,
        firmware: pad.firmware,
        batteryV: pad.batteryV,
        stateCode: pad.stateCode,
        previousStateCode: null,
        stateSinceMs: raw.receivedAtMs,
        lastSeenMs: raw.receivedAtMs,
        lastDeviceTimestamp: pad.deviceTimestamp,
        unmapped,
        rawMessageId: raw.id,
      };
      this.pads.set(key, live);
      this.intervals.push({
        controllerId: pad.controllerId,
        padDisplayId: pad.displayId,
        stateCode: pad.stateCode,
        startMs: raw.receivedAtMs,
        endMs: null,
      });
      if (isAlertState(pad.stateCode)) {
        this.transitions.push({
          id: `tr-${raw.id ?? this.transitions.length}`,
          controllerId: pad.controllerId,
          padDisplayId: pad.displayId,
          fromState: null,
          toState: pad.stateCode,
          atMs: raw.receivedAtMs,
          rawMessageId: raw.id,
          parkingBrakeRelease: this.controllers.get(pad.controllerId)?.parkingBrakeRelease ?? null,
        });
        this.openInteraction(live, "UNKNOWN", raw);
      }
      return;
    }

    existing.encodedId = pad.encodedId;
    existing.firmware = pad.firmware ?? existing.firmware;
    existing.batteryV = pad.batteryV;
    existing.lastSeenMs = raw.receivedAtMs;
    existing.lastDeviceTimestamp = pad.deviceTimestamp;
    existing.unmapped = unmapped;
    existing.rawMessageId = raw.id;

    if (existing.stateCode === pad.stateCode) return;

    const from = existing.stateCode;
    this.closeInterval(key, raw.receivedAtMs);
    existing.previousStateCode = from;
    existing.stateCode = pad.stateCode;
    existing.stateSinceMs = raw.receivedAtMs;
    this.intervals.push({
      controllerId: pad.controllerId,
      padDisplayId: pad.displayId,
      stateCode: pad.stateCode,
      startMs: raw.receivedAtMs,
      endMs: null,
    });
    const transition: StateTransition = {
      id: `tr-${raw.id ?? this.transitions.length}`,
      controllerId: pad.controllerId,
      padDisplayId: pad.displayId,
      fromState: from,
      toState: pad.stateCode,
      atMs: raw.receivedAtMs,
      rawMessageId: raw.id,
      parkingBrakeRelease: this.controllers.get(pad.controllerId)?.parkingBrakeRelease ?? null,
    };
    this.transitions.push(transition);
    this.onTransition(existing, from, raw);
  }

  private closeInterval(key: string, atMs: number): void {
    const [controllerId, displayId] = key.split(":").map(Number);
    for (let i = this.intervals.length - 1; i >= 0; i -= 1) {
      const interval = this.intervals[i];
      if (
        interval.controllerId === controllerId &&
        interval.padDisplayId === displayId &&
        interval.endMs === null
      ) {
        interval.endMs = atMs;
        return;
      }
    }
  }

  private onTransition(pad: PadLive, from: number, raw: RawMqttMessage): void {
    const key = padKey(pad.controllerId, pad.displayId);
    const open = this.openEvents.get(key);
    const toAlert = isAlertState(pad.stateCode);
    const fromAlert = isAlertState(from);

    if (!open && toAlert) {
      this.openInteraction(pad, padStateName(from), raw);
      return;
    }
    if (open && toAlert) {
      open.journey.push(padStateName(pad.stateCode));
      open.kind = open.journey.includes("HAZARD") ? "hazard" : "warning";
      open.toState = padStateName(pad.stateCode);
      open.sequenceTags = sequenceTags(open.journey);
      open.journeyLabel = journeyLabel(open.journey);
      if (raw.id !== undefined) open.rawMessageIds.push(raw.id);
      return;
    }
    if (open && !toAlert) {
      open.journey.push(padStateName(pad.stateCode));
      open.endMs = raw.receivedAtMs;
      open.open = false;
      open.toState = padStateName(pad.stateCode);
      open.kind = open.journey.includes("HAZARD") ? "hazard" : "warning";
      open.sequenceTags = sequenceTags(open.journey);
      open.journeyLabel = journeyLabel(open.journey);
      if (raw.id !== undefined) open.rawMessageIds.push(raw.id);
      this.openEvents.delete(key);
    }
  }

  private openInteraction(pad: PadLive, fromName: string, raw: RawMqttMessage): void {
    const controller = this.controllers.get(pad.controllerId);
    const gens = [...this.generators.values()]
      .filter((g) => g.controllerId === pad.controllerId)
      .map((g) => ({ id: g.generatorId, firmware: g.firmware }));
    const journey = [fromName, padStateName(pad.stateCode)];
    const event: InteractionEvent = {
      id: `evt-${pad.controllerId}-${pad.displayId}-${raw.receivedAtMs}`,
      controllerId: pad.controllerId,
      padDisplayId: pad.displayId,
      kind: pad.stateCode === 5 ? "hazard" : "warning",
      startMs: raw.receivedAtMs,
      endMs: null,
      durationMs: 0,
      journey,
      journeyLabel: journeyLabel(journey),
      fromState: fromName,
      toState: padStateName(pad.stateCode),
      parkingBrakeRelease: controller?.parkingBrakeRelease ?? null,
      input1: controller?.input1 ?? null,
      derivedPdsAtStart: derivedPds(this.pads.values()),
      generatorSnapshot: gens,
      rawMessageIds: raw.id !== undefined ? [raw.id] : [],
      open: true,
      sequenceTags: sequenceTags(journey),
    };
    this.events.push(event);
    this.openEvents.set(padKey(pad.controllerId, pad.displayId), event);
  }
}

function materializeEvent(event: InteractionEvent, asOfMs: number): InteractionEvent {
  const end = event.endMs ?? asOfMs;
  return {
    ...event,
    durationMs: Math.max(0, end - event.startMs),
    sequenceTags: sequenceTags(event.journey),
    journeyLabel: journeyLabel(event.journey),
  };
}
