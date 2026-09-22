import { padDisplayId } from "./padState";
import type {
  DecodedControllerInfo,
  DecodedControllerStatus,
  DecodedGenerator,
  DecodedMessage,
  DecodedPad,
  IndexedValue,
  NamedField,
  RawMqttMessage,
} from "./types";

const PROXIMITY = /^strata\/v1\/proximity\/(\d+)\/(\d+)$/;
const WIFI = /^strata\/v1\/wifi\/(\d+)\/(\d+)$/;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function field(name: string, value: unknown, confidence: NamedField["confidence"], source: string): NamedField {
  return { name, value, confidence, source };
}

function unmappedExcept(arr: unknown[], known: Set<number>): IndexedValue[] {
  const out: IndexedValue[] = [];
  arr.forEach((value, index) => {
    if (!known.has(index)) out.push({ index, value });
  });
  return out;
}

function topicController(topic: string): number | null {
  const parts = topic.split("/");
  const last = parts[parts.length - 1];
  if (!last || !/^\d+$/.test(last)) return null;
  return Number(last);
}

export function decodeMqtt(raw: RawMqttMessage): DecodedMessage {
  const base: DecodedMessage = {
    raw,
    topicKind: "unknown",
    controllerId: topicController(raw.topic),
    deviceTimestamp: null,
    parseError: null,
    fields: [],
    unmapped: [],
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.payload);
  } catch (err) {
    base.parseError = err instanceof Error ? err.message : "Payload is not JSON";
    base.unmapped = [{ index: 0, value: raw.payload }];
    return base;
  }

  if (!Array.isArray(parsed)) {
    base.parseError = "Payload JSON is not an array";
    base.unmapped = [{ index: 0, value: parsed }];
    return base;
  }

  const proximity = raw.topic.match(PROXIMITY);
  if (proximity) {
    const family = proximity[1];
    base.topicKind = `proximity/${family}`;
    base.deviceTimestamp = num(parsed[1]);
    const fromPayload = num(parsed[2]);
    if (fromPayload !== null) base.controllerId = fromPayload;
    if (family === "3") return decodePad(base, parsed);
    if (family === "1") return decodeControllerStatus(base, parsed);
    if (family === "0") return decodeGenerator(base, parsed);
    if (family === "21") return decodeControllerInfo(base, parsed);
    base.fields.push(field("recordType", parsed[0], "reported", `${base.topicKind}[0]`));
    if (base.deviceTimestamp !== null) {
      base.fields.push(field("deviceTimestamp", base.deviceTimestamp, "validated", `${base.topicKind}[1]`));
    }
    if (base.controllerId !== null) {
      base.fields.push(field("controllerId", base.controllerId, "validated", `${base.topicKind}[2]`));
    }
    base.unmapped = unmappedExcept(parsed, new Set([0, 1, 2]));
    return base;
  }

  const wifi = raw.topic.match(WIFI);
  if (wifi) {
    base.topicKind = `wifi/${wifi[1]}`;
    base.fields.push(field("recordType", wifi[1], "reported", "topic"));
    if (base.controllerId !== null) {
      base.fields.push(field("controllerId", base.controllerId, "validated", "topic"));
    }
    parsed.forEach((value, index) => base.unmapped.push({ index, value }));
    return base;
  }

  if (Array.isArray(parsed)) {
    parsed.forEach((value, index) => base.unmapped.push({ index, value }));
  }
  return base;
}

function decodePad(base: DecodedMessage, arr: unknown[]): DecodedMessage {
  const known = new Set([0, 1, 2, 3, 4, 5, 11]);
  const encodedId = num(arr[3]);
  const stateCode = num(arr[5]);
  const controllerId = base.controllerId;
  const pad: DecodedPad | undefined =
    encodedId !== null && stateCode !== null && controllerId !== null
      ? {
          controllerId,
          encodedId,
          displayId: padDisplayId(encodedId),
          firmware: str(arr[4]),
          stateCode,
          batteryV: num(arr[11]),
          deviceTimestamp: base.deviceTimestamp,
        }
      : undefined;

  base.fields.push(
    field("recordType", arr[0], "reported", "proximity/3[0]"),
    field("deviceTimestamp", base.deviceTimestamp, "validated", "proximity/3[1]"),
    field("controllerId", controllerId, "validated", "proximity/3[2]"),
    field("encodedId", encodedId, "validated", "proximity/3[3]"),
    field("displayId", pad?.displayId ?? null, "validated", "proximity/3[3] lower 16 bits"),
    field("firmware", str(arr[4]), "validated", "proximity/3[4]"),
    field("stateCode", stateCode, "validated", "proximity/3[5]"),
    field("batteryV", num(arr[11]), "validated", "proximity/3[11]"),
  );
  base.unmapped = unmappedExcept(arr, known);
  base.pad = pad;
  return base;
}

function decodeControllerStatus(base: DecodedMessage, arr: unknown[]): DecodedMessage {
  const known = new Set([0, 1, 2, 5, 6]);
  const input1 = num(arr[5]);
  const input2 = num(arr[6]);
  const status: DecodedControllerStatus | undefined =
    base.controllerId !== null
      ? {
          controllerId: base.controllerId,
          deviceTimestamp: base.deviceTimestamp,
          input1,
          parkingBrakeRelease: input2,
        }
      : undefined;
  base.fields.push(
    field("recordType", arr[0], "reported", "proximity/1[0]"),
    field("deviceTimestamp", base.deviceTimestamp, "validated", "proximity/1[1]"),
    field("controllerId", base.controllerId, "validated", "proximity/1[2]"),
    field("input1", input1, "validated", "proximity/1[5]"),
    field("parkingBrakeRelease", input2, "validated", "proximity/1[6]"),
  );
  base.unmapped = unmappedExcept(arr, known);
  base.controllerStatus = status;
  return base;
}

function decodeGenerator(base: DecodedMessage, arr: unknown[]): DecodedMessage {
  const known = new Set([0, 1, 2, 3, 4]);
  const generatorId = num(arr[3]);
  const generator: DecodedGenerator | undefined =
    generatorId !== null && base.controllerId !== null
      ? {
          controllerId: base.controllerId,
          generatorId,
          firmware: str(arr[4]),
          deviceTimestamp: base.deviceTimestamp,
        }
      : undefined;
  base.fields.push(
    field("recordType", arr[0], "reported", "proximity/0[0]"),
    field("deviceTimestamp", base.deviceTimestamp, "validated", "proximity/0[1]"),
    field("controllerId", base.controllerId, "validated", "proximity/0[2]"),
    field("generatorId", generatorId, "validated", "proximity/0[3]"),
    field("firmware", str(arr[4]), "validated", "proximity/0[4]"),
  );
  base.unmapped = unmappedExcept(arr, known);
  base.generator = generator;
  return base;
}

function decodeControllerInfo(base: DecodedMessage, arr: unknown[]): DecodedMessage {
  const known = new Set([0, 1, 2, 3]);
  const info: DecodedControllerInfo | undefined =
    base.controllerId !== null
      ? {
          controllerId: base.controllerId,
          firmware: str(arr[3]),
          deviceTimestamp: base.deviceTimestamp,
          generatorIds: [],
        }
      : undefined;
  base.fields.push(
    field("recordType", arr[0], "reported", "proximity/21[0]"),
    field("deviceTimestamp", base.deviceTimestamp, "validated", "proximity/21[1]"),
    field("controllerId", base.controllerId, "validated", "proximity/21[2]"),
    field("firmware", str(arr[3]), "validated", "proximity/21[3]"),
  );
  base.unmapped = unmappedExcept(arr, known);
  base.controllerInfo = info;
  return base;
}

export function describeDecode(decoded: DecodedMessage): string {
  if (decoded.parseError) return `Parse error: ${decoded.parseError}`;
  if (decoded.pad) {
    return `PAD ${decoded.pad.displayId} state ${decoded.pad.stateCode} battery ${decoded.pad.batteryV ?? "—"}`;
  }
  if (decoded.controllerStatus) {
    const s = decoded.controllerStatus;
    return `Controller ${s.controllerId} in1=${s.input1 ?? "—"} brake=${s.parkingBrakeRelease ?? "—"}`;
  }
  if (decoded.generator) {
    return `Generator ${decoded.generator.generatorId} fw ${decoded.generator.firmware ?? "—"}`;
  }
  if (decoded.controllerInfo) {
    return `Controller fw ${decoded.controllerInfo.firmware ?? "—"} gens ${decoded.controllerInfo.generatorIds.join(",")}`;
  }
  if (decoded.topicKind === "unknown") return "Unknown topic — raw preserved";
  return `${decoded.topicKind} — ${decoded.unmapped.length} unmapped values preserved`;
}
