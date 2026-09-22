import { summarize } from "../core/summary";
import { useMonitor } from "../state/monitor";

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string | number;
  note?: string;
  tone?: "warning" | "hazard" | "silent" | "monitor";
}) {
  return (
    <article className={`stat ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </article>
  );
}

export function SummaryPage() {
  const { snap, selectedDay, setSelectedDay, selectedController, setSelectedController } = useMonitor();
  const summary = summarize(snap, selectedDay, selectedController);
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
            <option value="">All controllers</option>
            {snap.controllers.map((controller) => (
              <option key={controller.controllerId} value={controller.controllerId}>
                {controller.controllerId}
              </option>
            ))}
          </select>
        </label>
      </section>
      <p className="hint">
        Warning and Hazard counts are interactions. A PAD that stays in Warning across repeated MQTT packets is one
        event. Time totals are the time spent in each state.
      </p>
      <section className="stats">
        <Stat label="Warning events" value={summary.warningEvents} tone="warning" />
        <Stat label="Hazard events" value={summary.hazardEvents} tone="hazard" />
        <Stat label="Unique PADs" value={summary.uniquePads.length} note={summary.uniquePads.join(", ") || "none"} />
        <Stat label="Entries to Warning" value={summary.padsEnteringWarning} tone="warning" />
        <Stat label="Entries to Hazard" value={summary.padsEnteringHazard} tone="hazard" />
        <Stat label="Silent → Warning" value={summary.silentToWarning} tone="silent" />
        <Stat label="Silent → Warning → Hazard" value={summary.silentToWarningToHazard} tone="hazard" />
        <Stat label="Monitor → Warning" value={summary.monitorToWarning} tone="monitor" />
        <Stat label="Monitor → Warning → Hazard" value={summary.monitorToWarningToHazard} tone="hazard" />
        <Stat label="Monitor → Warning → Monitor" value={summary.monitorToWarningToMonitor} tone="monitor" />
        <Stat label="Time in Warning" value={summary.totalWarningLabel} tone="warning" />
        <Stat label="Time in Hazard" value={summary.totalHazardLabel} tone="hazard" />
        <Stat label="Longest Warning" value={summary.longestWarningLabel} tone="warning" />
        <Stat label="Longest Hazard" value={summary.longestHazardLabel} tone="hazard" />
      </section>
    </main>
  );
}
