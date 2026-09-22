import { Activity, AlertTriangle, BarChart3, Database, Map, Pause, Play, Square } from "lucide-react";
import { MapPage } from "./ui/MapPage";
import { RawPage } from "./ui/RawPage";
import { ReportPage } from "./ui/ReportPage";
import { SummaryPage } from "./ui/SummaryPage";
import { MonitorProvider, useMonitor, type PageId } from "./state/monitor";
import type { ReplaySpeed } from "./core/replay";

const NAV: { id: PageId; label: string; icon: typeof Database }[] = [
  { id: "raw", label: "Raw Data", icon: Database },
  { id: "live", label: "Live Map", icon: Map },
  { id: "summary", label: "Daily Summary", icon: BarChart3 },
  { id: "report", label: "Warning & Hazard Report", icon: AlertTriangle },
];

function Shell() {
  const monitor = useMonitor();
  const speeds: ReplaySpeed[] = [1, 2, 5, 10, "max"];
  return (
    <div className="app">
      <header>
        <div className="brand">
          <b>SHR</b>
          <span>PDS MONITOR</span>
        </div>
        <nav>
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={monitor.page === item.id ? "active" : ""}
              onClick={() => monitor.setPage(item.id)}
            >
              <item.icon />
              {item.label}
            </button>
          ))}
        </nav>
        <div className={`live ${monitor.status.state}`}>
          <Activity />
          {monitor.mode === "replay" ? `Replay ${monitor.replay.label}` : `MQTT ${monitor.status.state}`}
        </div>
      </header>
      <div className="replaybar">
        <button type="button" onClick={monitor.playFixture}>
          Replay site visit
        </button>
        <button type="button" onClick={monitor.togglePlayback} disabled={monitor.mode !== "replay"}>
          {monitor.replay.playing ? <Pause /> : <Play />}
          {monitor.replay.playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={monitor.stopReplay}>
          <Square />
          Live
        </button>
        <label>
          Speed
          <select
            value={String(monitor.replay.speed)}
            onChange={(e) => monitor.setSpeed(e.target.value === "max" ? "max" : (Number(e.target.value) as ReplaySpeed))}
          >
            {speeds.map((speed) => (
              <option key={speed} value={speed}>
                {speed === "max" ? "Maximum" : `${speed}x`}
              </option>
            ))}
          </select>
        </label>
        <progress value={monitor.replay.index} max={Math.max(monitor.replay.total, 1)} />
        <span>
          {monitor.replay.index}/{monitor.replay.total}
        </span>
      </div>
      {monitor.page === "raw" && <RawPage />}
      {monitor.page === "live" && <MapPage />}
      {monitor.page === "summary" && <SummaryPage />}
      {monitor.page === "report" && <ReportPage />}
    </div>
  );
}

export default function App() {
  return (
    <MonitorProvider>
      <Shell />
    </MonitorProvider>
  );
}
