import { formatClock, formatDuration, parkingBrakeLabel } from "./padState";
import type { InteractionEvent, RawMqttMessage } from "./types";
import type { MachineAssignment, PadAssignment } from "./assignments";

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function rawToJsonl(messages: RawMqttMessage[]): string {
  return messages
    .map((message) =>
      JSON.stringify({
        receivedAtMs: message.receivedAtMs,
        topic: message.topic,
        payload: message.payload,
        qos: message.qos,
        retain: message.retain,
      }),
    )
    .join("\n");
}

export function rawToCsv(messages: RawMqttMessage[]): string {
  const header = ["id", "receivedAtMs", "receivedAtLocal", "topic", "qos", "retain", "payload"];
  const rows = messages.map((message) =>
    [
      message.id ?? "",
      message.receivedAtMs,
      formatClock(message.receivedAtMs),
      message.topic,
      message.qos,
      message.retain ? 1 : 0,
      message.payload,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export function eventsToCsv(events: InteractionEvent[], padAssignments: Record<number, PadAssignment> = {}, machineAssignments: Record<number, MachineAssignment> = {}): string {
  const header = [
    "id",
    "controllerId",
    "controllerName",
    "padId",
    "padName",
    "kind",
    "start",
    "end",
    "duration",
    "journey",
    "parkingBrakeRelease",
    "input1",
    "derivedPdsAtStart",
    "generators",
    "rawMessageIds",
    "open",
    "sequenceTags",
  ];
  const rows = events.map((event) =>
    [
      event.id,
      event.controllerId,
      machineAssignments[event.controllerId]?.machineName ?? machineAssignments[event.controllerId]?.machineId ?? "",
      event.padDisplayId,
      padAssignments[event.padDisplayId]?.name ?? "",
      event.kind,
      formatClock(event.startMs),
      event.endMs === null ? "" : formatClock(event.endMs),
      formatDuration(event.durationMs),
      event.journeyLabel,
      parkingBrakeLabel(event.parkingBrakeRelease),
      event.input1 ?? "",
      event.derivedPdsAtStart,
      event.generatorSnapshot.map((g) => `${g.id}${g.firmware ? ` fw ${g.firmware}` : ""}`).join("; "),
      event.rawMessageIds.join(" "),
      event.open ? "yes" : "no",
      event.sequenceTags.join(" "),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export function parseJsonl(text: string): RawMqttMessage[] {
  const messages: RawMqttMessage[] = [];
  let last = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("strata/")) {
      if (trimmed.startsWith("strata/")) {
        const space = trimmed.indexOf(" ");
        if (space > 0) {
          const topic = trimmed.slice(0, space);
          const payload = trimmed.slice(space + 1).trim();
          let receivedAtMs = last + 1;
          try {
            const arr = JSON.parse(payload) as unknown[];
            if (typeof arr[1] === "number" && arr[1] > 1_000_000_000) receivedAtMs = arr[1] * 1000;
          } catch {
            receivedAtMs = last + 1;
          }
          if (receivedAtMs <= last) receivedAtMs = last + 1;
          last = receivedAtMs;
          messages.push({ receivedAtMs, topic, payload, qos: 0, retain: false });
        }
      }
      continue;
    }
    const row = JSON.parse(trimmed) as Partial<RawMqttMessage>;
    if (!row.topic || typeof row.payload !== "string") continue;
    let receivedAtMs = typeof row.receivedAtMs === "number" ? row.receivedAtMs : last + 1;
    if (receivedAtMs <= last) receivedAtMs = last + 1;
    last = receivedAtMs;
    messages.push({
      receivedAtMs,
      topic: row.topic,
      payload: row.payload,
      qos: typeof row.qos === "number" ? row.qos : 0,
      retain: Boolean(row.retain),
    });
  }
  return messages;
}

export function downloadText(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
