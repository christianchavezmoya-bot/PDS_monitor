import { summarize } from "../core/summary";
import { useMonitor } from "../state/monitor";

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <article className="stat">
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
        <Stat label="Warning events" value={summary.warningEvents} />
        <Stat label="Hazard events" value={summary.hazardEvents} />
        <Stat label="Unique PADs" value={summary.uniquePads.length} note={summary.uniquePads.join(", ") || "none"} />
        <Stat label="Entries to Warning" value={summary.padsEnteringWarning} />
        <Stat label="Entries to Hazard" value={summary.padsEnteringHazard} />
        <Stat label="Silent → Warning" value={summary.silentToWarning} />
        <Stat label="Silent → Warning → Hazard" value={summary.silentToWarningToHazard} />
        <Stat label="Monitor → Warning" value={summary.monitorToWarning} />
        <Stat label="Monitor → Warning → Hazard" value={summary.monitorToWarningToHazard} />
        <Stat label="Monitor → Warning → Monitor" value={summary.monitorToWarningToMonitor} />
        <Stat label="Time in Warning" value={summary.totalWarningLabel} />
        <Stat label="Time in Hazard" value={summary.totalHazardLabel} />
        <Stat label="Longest Warning" value={summary.longestWarningLabel} />
        <Stat label="Longest Hazard" value={summary.longestHazardLabel} />
      </section>
    </main>
  );
}
