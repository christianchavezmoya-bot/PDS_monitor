import { useEffect, useState, type CSSProperties } from "react";
import {
  CM_SILENT_ZONES,
  FIELD_FRAME,
  MINER_BOX,
  SHUTTLE_BOX,
  ZONE_ELLIPSES,
  padSlot,
} from "../config/shuttleField";
import { derivedPds } from "../core/engine";
import { formatClock, formatDuration, padStateName, parkingBrakeLabel } from "../core/padState";
import { useMonitor } from "../state/monitor";
import type { PadLive } from "../core/types";

function meterBox(box: { x: number; y: number; w: number; h: number }): CSSProperties {
  return {
    left: `${((box.x - FIELD_FRAME.x) / FIELD_FRAME.w) * 100}%`,
    top: `${((box.y - FIELD_FRAME.y) / FIELD_FRAME.h) * 100}%`,
    width: `${(box.w / FIELD_FRAME.w) * 100}%`,
    height: `${(box.h / FIELD_FRAME.h) * 100}%`,
  };
}

function meterPct(x: number, y: number): { left: string; top: string } {
  return {
    left: `${((x - FIELD_FRAME.x) / FIELD_FRAME.w) * 100}%`,
    top: `${((y - FIELD_FRAME.y) / FIELD_FRAME.h) * 100}%`,
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

function markerStyle(stateCode: number, index: number): { left: string; top: string } {
  const [x, y] = padSlot(stateCode, index);
  return meterPct(x, y);
}

function ZoneLayer({ showMiner }: { showMiner: boolean }) {
  return (
    <svg className="zone-layer" viewBox={`${FIELD_FRAME.x} ${FIELD_FRAME.y} ${FIELD_FRAME.w} ${FIELD_FRAME.h}`} preserveAspectRatio="none" aria-hidden="true">
      <ellipse cx="0" cy="0" rx={ZONE_ELLIPSES.monitor.rx} ry={ZONE_ELLIPSES.monitor.ry} fill="#3aaa4728" stroke="#56cf61" strokeWidth="0.12" />
      <ellipse cx="0" cy="0" rx={ZONE_ELLIPSES.warning.rx} ry={ZONE_ELLIPSES.warning.ry} fill="#f2a51d30" stroke="#f2a51d" strokeWidth="0.12" />
      <ellipse cx="0" cy="0" rx={ZONE_ELLIPSES.hazard.rx} ry={ZONE_ELLIPSES.hazard.ry} fill="#d9414138" stroke="#e34b4b" strokeWidth="0.12" />
      {showMiner &&
        CM_SILENT_ZONES.map((zone) => (
          <ellipse
            key={`${zone.cx}-${zone.cy}`}
            cx={zone.cx}
            cy={zone.cy}
            rx={zone.rx}
            ry={zone.ry}
            fill="#1f9d4a40"
            stroke="#7df0b0"
            strokeWidth="0.06"
            strokeDasharray="0.22 0.14"
          />
        ))}
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
        <div className="scene" style={{ aspectRatio: `${FIELD_FRAME.w} / ${FIELD_FRAME.h}` }}>
          <ZoneLayer showMiner={silent.length > 0} />
          <MachineArt src="/machines/shuttle-car.svg?plan=1" className={`machine-art shuttle ${brakeClass}`} style={meterBox(SHUTTLE_BOX)} />
          {silent.length > 0 && (
            <MachineArt src="/machines/continuous-miner.svg" className="machine-art miner" style={meterBox(MINER_BOX)} />
          )}
          {[...grouped.entries()].flatMap(([state, list]) =>
            list.map((pad, index) => (
              <div
                key={`${pad.controllerId}-${pad.displayId}`}
                className={`marker state ${padStateName(state).toLowerCase()}`}
                style={markerStyle(state, index)}
              >
                PAD {pad.displayId}
                <small>{padStateName(state)}</small>
              </div>
            )),
          )}
        </div>
        <p className="notice">
          Three ovals wrap the shuttle car. The ends reach farther than the sides. PAD markers sit in the reported zone and are not surveyed positions.
          The shuttle car stays visible. The Continuous Miner appears only while a PAD is Silent, tail toward the shuttle car.
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
          {pads.length === 0 && <p>No live PAD messages yet. Replay site visit plays the 22 Sept recording.</p>}
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
