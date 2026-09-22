import { useEffect, useState } from "react";
import { derivedPds } from "../core/engine";
import { formatClock, formatDuration, padStateName, parkingBrakeLabel } from "../core/padState";
import { useMonitor } from "../state/monitor";
import type { PadLive } from "../core/types";

function MachineArt({ src, className }: { src: string; className: string }) {
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
  if (!svg) return <div className={className}>Machine asset missing</div>;
  return <div className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
}

function markerStyle(stateCode: number, index: number, count: number): { left: string; top: string } {
  const t = count <= 1 ? 0.5 : index / Math.max(1, count - 1);
  if (stateCode === 5) return { left: `${28 + t * 36}%`, top: "34%" };
  if (stateCode === 4) return { left: `${16 + t * 58}%`, top: "22%" };
  if (stateCode === 1) return { left: `${8 + t * 54}%`, top: "12%" };
  if (stateCode === 2) {
    if (index === 0) return { left: "40%", top: "58%" };
    return index % 2 === 1 ? { left: "68%", top: "76%" } : { left: "78%", top: "88%" };
  }
  return { left: `${12 + (index % 4) * 12}%`, top: "4%" };
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
          <div className="zone zone-monitor"><span>Monitor</span></div>
          <div className="zone zone-warning"><span>Warning</span></div>
          <div className="zone zone-hazard"><span>Hazard</span></div>
          <div className="zone zone-silent"><span>Silent</span></div>
          <MachineArt src="/machines/shuttle-car.svg" className={`machine-art shuttle ${brakeClass}`} />
          {silent.length > 0 && (
            <>
              <div className="zone zone-cm-a"><span>Silent</span></div>
              <div className="zone zone-cm-b"><span>Silent</span></div>
              <MachineArt src="/machines/continuous-miner.svg" className="machine-art miner" />
            </>
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
          Logical zones only. PAD markers are placed in the zone reported by MQTT. They are not surveyed X/Y positions.
          The Continuous Miner is shown while any PAD is Silent, with its tail toward the Shuttle Car.
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
