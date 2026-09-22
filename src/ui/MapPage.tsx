import { useEffect, useState, type CSSProperties } from "react";
import { derivedPds } from "../core/engine";
import { formatClock, formatDuration, padStateName, parkingBrakeLabel } from "../core/padState";
import { useMonitor } from "../state/monitor";
import type { PadLive } from "../core/types";

const VIEW = { w: 1000, h: 700 };
const CAR = { x: 424, y: 108, w: 176, h: 318 };
const MINER = { x: 410, y: 545, w: 180, h: 140 };
const ZONE_CENTER = { x: 508, y: 262 };
const CAB_SVG = { x: 6, y: 124, w: 68, h: 108 };
const CAR_SVG = { w: 220, h: 460 };

function boxStyle(box: { x: number; y: number; w: number; h: number }): CSSProperties {
  return {
    left: `${(box.x / VIEW.w) * 100}%`,
    top: `${(box.y / VIEW.h) * 100}%`,
    width: `${(box.w / VIEW.w) * 100}%`,
    height: `${(box.h / VIEW.h) * 100}%`,
  };
}

function pct(x: number, y: number): { left: string; top: string } {
  return { left: `${(x / VIEW.w) * 100}%`, top: `${(y / VIEW.h) * 100}%` };
}

const ZONE_OUTLINE: Array<[number, number]> = [
  [508, 22],
  [630, 46],
  [700, 108],
  [688, 178],
  [636, 228],
  [742, 305],
  [768, 372],
  [674, 452],
  [508, 498],
  [330, 454],
  [236, 376],
  [268, 292],
  [318, 214],
  [348, 128],
  [392, 52],
];

function smoothClosed(points: Array<[number, number]>): string {
  const count = points.length;
  let path = `M ${points[0][0]} ${points[0][1]}`;
  for (let index = 0; index < count; index++) {
    const prev = points[(index - 1 + count) % count];
    const current = points[index];
    const next = points[(index + 1) % count];
    const after = points[(index + 2) % count];
    const c1x = current[0] + (next[0] - prev[0]) / 6;
    const c1y = current[1] + (next[1] - prev[1]) / 6;
    const c2x = next[0] - (after[0] - current[0]) / 6;
    const c2y = next[1] - (after[1] - current[1]) / 6;
    path += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${next[0].toFixed(1)} ${next[1].toFixed(1)}`;
  }
  return `${path} Z`;
}

function zonePath(scale: number): string {
  const { x: cx, y: cy } = ZONE_CENTER;
  return smoothClosed(ZONE_OUTLINE.map(([x, y]) => [cx + (x - cx) * scale, cy + (y - cy) * scale]));
}

function cabBox() {
  return {
    x: CAR.x + (CAB_SVG.x / CAR_SVG.w) * CAR.w,
    y: CAR.y + (CAB_SVG.y / CAR_SVG.h) * CAR.h,
    w: (CAB_SVG.w / CAR_SVG.w) * CAR.w,
    h: (CAB_SVG.h / CAR_SVG.h) * CAR.h,
  };
}

function MachineArt({ src, className, style }: { src: string; className: string; style?: CSSProperties }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then((response) => response.text())
      .then((text) => {
        if (!cancelled && text.includes("<svg")) setSvg(text);
      })
      .catch(() => setSvg(""));
    return () => {
      cancelled = true;
    };
  }, [src]);
  if (!svg) return <div className={className} style={style}>Machine asset missing</div>;
  return <div className={className} style={style} dangerouslySetInnerHTML={{ __html: svg }} />;
}

function markerStyle(stateCode: number, index: number, count: number): { left: string; top: string } {
  const t = count <= 1 ? 0.5 : index / Math.max(1, count - 1);
  const lane = index % 2 === 0;
  if (stateCode === 5) return pct(lane ? 390 : 640, 240 + t * 70);
  if (stateCode === 4) return pct(lane ? 300 : 720, 175 + t * 80);
  if (stateCode === 1) return pct(lane ? 200 : 800, 120 + t * 80);
  if (stateCode === 2) {
    const cab = cabBox();
    if (index === 0) return pct(cab.x - 78, cab.y + cab.h / 2);
    return index % 2 === 1 ? pct(280, 610) : pct(720, 610);
  }
  return pct(90 + (index % 5) * 78, 28);
}

function ZoneLayer({ showMiner }: { showMiner: boolean }) {
  return (
    <svg className="zone-layer" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={zonePath(1)} fill="#3aaa472e" stroke="#56cf61" strokeWidth="3" />
      <path d={zonePath(0.86)} fill="#f2a51d30" stroke="#f2a51d" strokeWidth="3" />
      <path d={zonePath(0.72)} fill="#d9414136" stroke="#e34b4b" strokeWidth="3" />
      {showMiner && (
        <>
          <ellipse cx="280" cy="612" rx="72" ry="46" fill="#1f9d4a40" stroke="#7df0b0" strokeWidth="3" strokeDasharray="8 6" />
          <ellipse cx="720" cy="612" rx="72" ry="46" fill="#1f9d4a40" stroke="#7df0b0" strokeWidth="3" strokeDasharray="8 6" />
          <text x="280" y="558" textAnchor="middle" fontSize="14">SILENT</text>
          <text x="720" y="558" textAnchor="middle" fontSize="14">SILENT</text>
        </>
      )}
      <text x="250" y="95" fontSize="16" letterSpacing="1">MONITOR</text>
      <text x="250" y="113" fontSize="12">&gt; 8 m</text>
      <text x="330" y="160" fontSize="16" letterSpacing="1">WARNING</text>
      <text x="330" y="178" fontSize="12">5 – 8 m</text>
      <text x="640" y="250" fontSize="16" letterSpacing="1">HAZARD</text>
      <text x="640" y="268" fontSize="12">0 – 5 m</text>
    </svg>
  );
}

export function MapPage() {
  const { snap, selectedController, setSelectedController } = useMonitor();
  const controller =
    snap.controllers.find((item) => item.controllerId === selectedController) ?? snap.controllers[0] ?? null;
  const pads = snap.pads.filter((pad) => !controller || pad.controllerId === controller.controllerId);
  const generators = snap.generators.filter((item) => !controller || item.controllerId === controller.controllerId);
  const silent = pads.filter((pad) => pad.stateCode === 2);
  const brake = controller?.parkingBrakeRelease ?? null;
  const brakeClass = brake === 1 ? "brake-on" : brake === 0 ? "brake-off" : "brake-unknown";
  const grouped = new Map<number, PadLive[]>();
  for (const pad of pads) {
    const list = grouped.get(pad.stateCode) ?? [];
    list.push(pad);
    grouped.set(pad.stateCode, list);
  }

  return (
    <main className="dashboard">
      <aside>
        <div className="panel">
          <h3>Controller</h3>
          {snap.controllers.length > 1 && (
            <select
              value={controller?.controllerId ?? ""}
              onChange={(e) => setSelectedController(Number(e.target.value))}
            >
              {snap.controllers.map((item) => (
                <option key={item.controllerId} value={item.controllerId}>
                  {item.controllerId}
                </option>
              ))}
            </select>
          )}
          <p>
            Controller ID <b>{controller?.controllerId ?? "—"}</b>
          </p>
          <p>
            Firmware <b>{controller?.firmware ?? "—"}</b>
          </p>
          <p>
            Last MQTT <b>{formatClock(controller?.lastSeenMs)}</b>
          </p>
          <small>Firmware is decoded from proximity/21. Other controller arrays stay unmapped.</small>
        </div>
        <div className="panel">
          <h3>Machine status</h3>
          <div className={`badge ${brake === 1 ? "blue" : brake === 0 ? "green" : "grey"}`}>
            PARKING BRAKE RELEASE {parkingBrakeLabel(brake)}
          </div>
          <p>
            Input 1 <b>{controller?.input1 ?? "—"}</b>
          </p>
          <p>
            Input 2 <b>{controller?.parkingBrakeRelease ?? "—"}</b>
          </p>
          <p>
            Feedback Stop <b>Not validated</b>
          </p>
          <small>Input 2 is the validated Parking Brake Release bit. 0 is OFF (green), 1 is ON (blue).</small>
        </div>
        <div className="panel">
          <h3>Generators</h3>
          {generators.length === 0 && <p>No generator identity yet.</p>}
          {generators.map((generator, index) => (
            <p key={generator.generatorId}>
              <i>{index + 1}</i> ID <b>{generator.generatorId}</b> <span className="muted">Unvalidated</span>
              <small>FW {generator.firmware ?? "—"} · raw {generator.unmapped.map((item) => item.value).join(", ") || "—"}</small>
            </p>
          ))}
          <small>Low Voltage and Communications Error are not mapped. Raw generator numbers are preserved.</small>
        </div>
      </aside>
      <section className="map">
        <h1>Live PDS monitor</h1>
        <h2>Shuttle Car and Continuous Miner</h2>
        <div className="scene">
          <ZoneLayer showMiner={silent.length > 0} />
          <MachineArt src="/machines/shuttle-car.svg?cab=1" className={`machine-art shuttle ${brakeClass}`} style={boxStyle(CAR)} />
          {silent.length > 0 && (
            <MachineArt src="/machines/continuous-miner.svg" className="machine-art miner" style={boxStyle(MINER)} />
          )}
          {[...grouped.entries()].flatMap(([state, list]) =>
            list.map((pad, index) => (
              <div
                key={`${pad.controllerId}-${pad.displayId}`}
                className={`marker state ${padStateName(state).toLowerCase()}`}
                style={markerStyle(state, index, list.length)}
              >
                PAD {pad.displayId}
                <small>{padStateName(state)}</small>
              </div>
            )),
          )}
        </div>
        <p className="notice">
          Detection zones follow the shuttle-car peanut outline. The green Silent zone is the operator cab only and does not extend past it.
          PAD markers sit in the MQTT-reported zone and are not surveyed X/Y positions. The Continuous Miner appears while any PAD is Silent, tail toward the Shuttle Car, with its two Silent bubbles.
        </p>
      </section>
      <aside>
        <div className="panel pads">
          <h3>Detected PADs ({pads.length})</h3>
          {pads.map((pad) => (
            <div className="pad" key={pad.displayId}>
              <b>PAD {pad.displayId}</b>
              <span className={`state ${padStateName(pad.stateCode).toLowerCase()}`}>{padStateName(pad.stateCode)}</span>
              <small>
                Battery {pad.batteryV?.toFixed(2) ?? "—"} V · in state {formatDuration(snap.asOfMs - pad.stateSinceMs)}
              </small>
              <small>
                Previous {padStateName(pad.previousStateCode)} · last {formatClock(pad.lastSeenMs)} · encoded {pad.encodedId}
              </small>
            </div>
          ))}
          {pads.length === 0 && <p>Waiting for proximity/3 messages.</p>}
        </div>
        <div className="panel">
          <h3>Derived PDS summary</h3>
          <h2 className="warningText">{derivedPds(pads)}</h2>
          <small>Derived from current PAD states. This is not a separate MQTT field.</small>
        </div>
      </aside>
    </main>
  );
}
