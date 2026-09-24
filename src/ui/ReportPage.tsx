import { useMemo, useState } from "react";
import { downloadText, eventsToCsv } from "../core/export";
import { formatClock, formatDuration, parkingBrakeLabel } from "../core/padState";
import { filterEvents } from "../core/summary";
import { useMonitor } from "../state/monitor";
import { formatMachineLabel, formatPadLabel, loadMachineAssignments, loadPadAssignments } from "../core/assignments";

export function ReportPage() {
  const { snap, engine, selectedDay, setSelectedDay, selectedController, setSelectedController } = useMonitor();
  const [padId, setPadId] = useState("");
  const [kind, setKind] = useState<"all" | "warning" | "hazard">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const padAssignments = loadPadAssignments();
  const machineAssignments = loadMachineAssignments();
  const pads = [...new Set(snap.events.map((event) => event.padDisplayId))].sort((a, b) => a - b);
  const events = useMemo(
    () =>
      filterEvents(snap.events, {
        day: selectedDay,
        controllerId: selectedController,
        padId: padId ? Number(padId) : null,
        kind,
      }),
    [snap, selectedDay, selectedController, padId, kind],
  );
  const selected = events.find((event) => event.id === openId) ?? null;

  return (
    <main className="page">
      <section className="toolbar">
        <label>
          Day
          <input type="date" value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} />
        </label>
        <label>
          Controller
          <select
            value={selectedController ?? ""}
            onChange={(e) => setSelectedController(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">All</option>
            {snap.controllers.map((controller) => (
              <option key={formatMachineLabel(controller.controllerId, machineAssignments[controller.controllerId], "both")} value={controller.controllerId}>
                {controller.controllerId}
              </option>
            ))}
          </select>
        </label>
        <label>
          PAD
          <select value={padId} onChange={(e) => setPadId(e.target.value)}>
            <option value="">All</option>
            {pads.map((id) => (
              <option key={id} value={id}>
                {formatPadLabel(id, padAssignments[id], "both")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Event
          <select value={kind} onChange={(e) => setKind(e.target.value as "all" | "warning" | "hazard")}>
            <option value="all">All</option>
            <option value="warning">Warning</option>
            <option value="hazard">Hazard</option>
          </select>
        </label>
        <button type="button" onClick={() => downloadText(`pds-events-${selectedDay}.csv`, eventsToCsv(events, padAssignments, machineAssignments), "text/csv")}>
          Export CSV
        </button>
      </section>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>PAD</th>
              <th>Controller</th>
              <th>Type</th>
              <th>Start</th>
              <th>End</th>
              <th>Duration</th>
              <th>State journey</th>
              <th>Parking brake</th>
              <th>Derived PDS</th>
              <th>Generators</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} onClick={() => setOpenId(event.id)} className={openId === event.id ? "selected" : ""}>
                <td>{formatPadLabel(event.padDisplayId, padAssignments[event.padDisplayId], "both")}</td>
                <td>{formatMachineLabel(event.controllerId, machineAssignments[event.controllerId], "both")}</td>
                <td className={event.kind}>{event.kind}{event.open ? " (open)" : ""}</td>
                <td>{formatClock(event.startMs)}</td>
                <td>{event.endMs === null ? "open" : formatClock(event.endMs)}</td>
                <td>{formatDuration(event.durationMs)}</td>
                <td>{event.journeyLabel}</td>
                <td>{parkingBrakeLabel(event.parkingBrakeRelease)}</td>
                <td>{event.derivedPdsAtStart}</td>
                <td>{event.generatorSnapshot.map((item) => item.id).join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {events.length === 0 && <p className="hint">No warning or hazard interactions for this filter.</p>}
      </div>
      {selected && (
        <section className="drill">
          <h3>Raw MQTT evidence for {selected.id}</h3>
          <p>
            Generators at start:{" "}
            {selected.generatorSnapshot.map((item) => `${item.id} fw ${item.firmware ?? "—"}`).join("; ") || "none recorded yet"}
          </p>
          {selected.rawMessageIds.map((id) => {
            const raw = engine.findRaw(id);
            return (
              <pre key={id}>
                {raw ? `${raw.topic}\n${raw.payload}` : `Message ${id} is not in the current session memory.`}
              </pre>
            );
          })}
        </section>
      )}
    </main>
  );
}
