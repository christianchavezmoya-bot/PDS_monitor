import { formatMachineLabel, formatPadLabel, loadMachineAssignments, loadPadAssignments } from "../core/assignments";
import { formatClock } from "../core/padState";
import { filterEvents, summarize } from "../core/summary";
import { useMonitor } from "../state/monitor";

function Stat({ label, value, note, tone }: { label: string; value: string | number; note?: string; tone?: "warning" | "hazard" | "silent" | "monitor"; }) {
  return <article className={`stat ${tone ?? ""}`}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</article>;
}

export function SummaryPage() {
  const { snap, selectedDay, setSelectedDay, selectedController, setSelectedController } = useMonitor();
  const summary = summarize(snap, selectedDay, selectedController);
  const padAssignments = loadPadAssignments();
  const machineAssignments = loadMachineAssignments();
  const events = filterEvents(snap.events, { day: selectedDay, controllerId: selectedController, kind: "all" });
  const proximityHazards = events.filter(event => event.kind === "hazard" && event.fromState !== "SILENT" && event.fromState !== "WARNING");
  const reactionLags = proximityHazards.map(event => event.hazardReactionLagMs).filter((ms): ms is number => ms != null);
  const avgReactionLag = reactionLags.length ? reactionLags.reduce((a,b)=>a+b,0)/reactionLags.length : null;
  const rank = (kind: "warning" | "hazard") => {
    const counts = new Map<number, number>();
    events.filter((event) => event.kind === kind).forEach((event) => counts.set(event.padDisplayId, (counts.get(event.padDisplayId) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 10);
  };
  return (
    <main className="page">
      <section className="toolbar">
        <label>Day<input type="date" value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} /></label>
        <label>Controller<select value={selectedController ?? ""} onChange={(e) => setSelectedController(e.target.value ? Number(e.target.value) : null)}>
          <option value="">All controllers</option>
          {snap.controllers.map((controller) => <option key={controller.controllerId} value={controller.controllerId}>{formatMachineLabel(controller.controllerId, machineAssignments[controller.controllerId], "both")}</option>)}
        </select></label>
      </section>
      <p className="hint">Warning and Hazard counts are state-entry interactions, not repeated MQTT packets. Time totals are the time spent in each state.</p>
      <section className="stats">
        <Stat label="Warning events" value={summary.warningEvents} tone="warning" />
        <Stat label="Hazard events" value={summary.hazardEvents} tone="hazard" />
        <Stat label="Unique PADs" value={summary.uniquePads.length} note={summary.uniquePads.map((id) => formatPadLabel(id, padAssignments[id], "both")).join(", ") || "none"} />
        <Stat label="Entries to Warning" value={summary.padsEnteringWarning} tone="warning" />
        <Stat label="Entries to Hazard" value={summary.padsEnteringHazard} tone="hazard" />
        <Stat label="Entries to Proximity Hazard" value={summary.proximityHazardEntries} note="Direct Hazard entry from ID, Monitor, Unknown, or another non-Silent/non-Warning state" tone="hazard" />
        <Stat label="Avg Proximity Hazard reaction" value={avgReactionLag == null ? "—" : `${(avgReactionLag/1000).toFixed(2)} s`} note={`${reactionLags.length} correlated brake-release → Hazard event${reactionLags.length===1?"":"s"}`} tone="hazard" />
        <Stat label="Silent → Warning" value={summary.silentToWarning} tone="silent" />
        <Stat label="Silent → Warning → Hazard" value={summary.silentToWarningToHazard} tone="hazard" />
        <Stat label="Time in Warning" value={summary.totalWarningLabel} tone="warning" />
        <Stat label="Time in Hazard" value={summary.totalHazardLabel} tone="hazard" />
        <Stat label="Longest Warning" value={summary.longestWarningLabel} tone="warning" />
        <Stat label="Longest Hazard" value={summary.longestHazardLabel} tone="hazard" />
      </section>
      <section className="event-panels">
        <article className="panel"><h3>Warning events</h3>{events.filter(e => e.kind === "warning").map(e => <div className="summary-event warning-event" key={e.id}><b>{formatPadLabel(e.padDisplayId, padAssignments[e.padDisplayId], "both")}</b><span>{formatMachineLabel(e.controllerId, machineAssignments[e.controllerId], "both")}</span><time>{formatClock(e.startMs)}</time></div>)}{!events.some(e => e.kind === "warning") && <p>No Warning events.</p>}</article>
        <article className="panel"><h3>Hazard events</h3>{events.filter(e => e.kind === "hazard").map(e => <div className="summary-event hazard-event" key={e.id}><b>{formatPadLabel(e.padDisplayId, padAssignments[e.padDisplayId], "both")}</b><span>{formatMachineLabel(e.controllerId, machineAssignments[e.controllerId], "both")}</span><time>{formatClock(e.startMs)}{e.hazardReactionLagMs != null && <small> · reaction {(e.hazardReactionLagMs/1000).toFixed(2)} s</small>}</time></div>)}{!events.some(e => e.kind === "hazard") && <p>No Hazard events.</p>}</article>
      </section>
      <section className="leaderboards">
        {(["warning", "hazard"] as const).map(kind => <article className={`panel leaderboard ${kind}`} key={kind}><h3>Top 10 PADs — {kind === "warning" ? "Warning" : "Hazard"} events</h3>{rank(kind).map(([id,count],i) => <div className="rank-row" key={id}><strong>{i+1}</strong><span>{formatPadLabel(id,padAssignments[id],"both")}</span><b>{count} {count === 1 ? "event" : "events"}</b></div>)}{rank(kind).length === 0 && <p>No events for this day/filter.</p>}</article>)}
      </section>
    </main>
  );
}