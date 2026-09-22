export interface RawMqttMessage {
  id?: number;
  receivedAtMs: number;
  topic: string;
  payload: string;
  qos: number;
  retain: boolean;
}

export type Confidence = "validated" | "reported";

export interface NamedField {
  name: string;
  value: unknown;
  confidence: Confidence;
  /** Where the value was read, for example proximity/3[5]. */
  source: string;
}

export interface IndexedValue {
  index: number;
  value: unknown;
}

export interface DecodedPad {
  controllerId: number;
  encodedId: number;
  displayId: number;
  firmware: string | null;
  stateCode: number;
  batteryV: number | null;
  deviceTimestamp: number | null;
}

export interface DecodedControllerStatus {
  controllerId: number;
  deviceTimestamp: number | null;
  input1: number | null;
  /** Input 2. Validated as Parking Brake Release: 0 = OFF, 1 = ON. */
  parkingBrakeRelease: number | null;
}

export interface DecodedGenerator {
  controllerId: number;
  generatorId: number;
  firmware: string | null;
  deviceTimestamp: number | null;
}

export interface DecodedControllerInfo {
  controllerId: number;
  firmware: string | null;
  deviceTimestamp: number | null;
  generatorIds: number[];
}

export interface DecodedMessage {
  raw: RawMqttMessage;
  topicKind: string;
  controllerId: number | null;
  deviceTimestamp: number | null;
  parseError: string | null;
  fields: NamedField[];
  unmapped: IndexedValue[];
  pad?: DecodedPad;
  controllerStatus?: DecodedControllerStatus;
  generator?: DecodedGenerator;
  controllerInfo?: DecodedControllerInfo;
}

export interface PadLive {
  controllerId: number;
  displayId: number;
  encodedId: number;
  firmware: string | null;
  batteryV: number | null;
  stateCode: number;
  previousStateCode: number | null;
  stateSinceMs: number;
  lastSeenMs: number;
  lastDeviceTimestamp: number | null;
  unmapped: IndexedValue[];
  rawMessageId?: number;
}

export interface ControllerLive {
  controllerId: number;
  firmware: string | null;
  input1: number | null;
  parkingBrakeRelease: number | null;
  lastSeenMs: number;
  lastDeviceTimestamp: number | null;
  /** Latest unmapped arrays keyed by topic kind. Preserved, not interpreted. */
  unmappedByTopic: Record<string, IndexedValue[]>;
  rawMessageId?: number;
}

export interface GeneratorLive {
  controllerId: number;
  generatorId: number;
  firmware: string | null;
  lastSeenMs: number;
  unmapped: IndexedValue[];
  /** Explicitly unvalidated. Low Voltage / Communications Error are not mapped. */
  health: "unvalidated";
}

export interface StateTransition {
  id: string;
  controllerId: number;
  padDisplayId: number;
  fromState: number | null;
  toState: number;
  atMs: number;
  rawMessageId?: number;
  parkingBrakeRelease: number | null;
}

export interface StateInterval {
  controllerId: number;
  padDisplayId: number;
  stateCode: number;
  startMs: number;
  endMs: number | null;
}

export interface InteractionEvent {
  id: string;
  controllerId: number;
  padDisplayId: number;
  kind: "warning" | "hazard";
  startMs: number;
  endMs: number | null;
  durationMs: number;
  journey: string[];
  journeyLabel: string;
  fromState: string;
  toState: string;
  parkingBrakeRelease: number | null;
  input1: number | null;
  derivedPdsAtStart: string;
  generatorSnapshot: { id: number; firmware: string | null }[];
  rawMessageIds: number[];
  open: boolean;
  sequenceTags: string[];
}

export interface EngineSnapshot {
  asOfMs: number;
  rawCount: number;
  decodeErrors: number;
  unknownTopics: number;
  pads: PadLive[];
  controllers: ControllerLive[];
  generators: GeneratorLive[];
  transitions: StateTransition[];
  intervals: StateInterval[];
  events: InteractionEvent[];
}
