import { useMemo, useRef, useState, type WheelEvent } from "react";
import { Eye, EyeOff, Minus, Plus, RotateCcw } from "lucide-react";
import { formatMachineLabel, formatPadLabel, loadMachineAssignments, loadPadAssignments } from "../core/assignments";
import { dayBounds, dayKey, formatClock, formatDuration, padStateName } from "../core/padState";
import type { StateInterval } from "../core/types";
import { useMonitor } from "../state/monitor";

const MIN_WINDOW = 60_000;
const MAX_WINDOW = 86_400_000;
const DEFAULT_WINDOW = 30 * 60_000;
const PRESETS = [
  ["1m", 60_000], ["5m", 300_000], ["15m", 900_000], ["30m", DEFAULT_WINDOW],
  ["1h", 3_600_000], ["4h", 14_400_000], ["12h", 43_200_000], ["24h", MAX_WINDOW],
] as const;
type Layer = "parkingBrake" | "silent" | "warning" | "hazard" | "generator";
const STATE_LAYER: Record<number, Exclude<Layer, "generator" | "parkingBrake"> | undefined> = { 2: "silent", 4: "warning", 5: "hazard" };

function clampWindow(ms: number) { return Math.min(MAX_WINDOW, Math.max(MIN_WINDOW, ms)); }
function overlaps(item: StateInterval, start: number, end: number, now: number) {
  const itemEnd = item.endMs ?? now;
  return item.startMs < end && itemEnd > start;
}
function pct(ms: number, start: number, span: number) { return ((ms - start) / span) * 100; }

export function TrendingPage() {
  const { snap, selectedDay, setSelectedDay, mode } = useMonitor();
  const machines = loadMachineAssignments();
  const pads = loadPadAssignments();
  const [windowMs, setWindowMs] = useState(DEFAULT_WINDOW);
  const initialEnd = mode === "live" ? snap.asOfMs : dayBounds(selectedDay).end;
  const [endMs, setEndMs] = useState(initialEnd);
  const [followNow, setFollowNow] = useState(mode === "live");
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ parkingBrake: true, silent: true, warning: true, hazard: true, generator: true });
  const [showPeople, setShowPeople] = useState(true);
  const [selectedMachines, setSelectedMachines] = useState<number[]>([]);
  const [hover, setHover] = useState<{ x: number; at: number } | null>(null);
  const [selected, setSelected] = useState<StateInterval | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const drag = useRef<{ x: number; end: number } | null>(null);

  const controllerIds = useMemo(() => [...new Set([
    ...snap.controllers.map(c => c.controllerId),
    ...snap.intervals.map(i => i.controllerId),
  ])].sort((a,b)=>a-b), [snap.controllers, snap.intervals]);
  const activeIds = (selectedMachines.length ? selectedMachines : controllerIds).slice(0, 10);
  const effectiveEnd = followNow && mode === "live" ? snap.asOfMs : endMs;
  const startMs = effectiveEnd - windowMs;
  const visible = snap.intervals.filter(i => activeIds.includes(i.controllerId) && overlaps(i, startMs, effectiveEnd, snap.asOfMs));
  const proximityHazards = snap.events.filter(e => e.kind === "hazard" && e.fromState !== "SILENT" && e.fromState !== "WARNING" && e.hazardReactionLagMs != null);
  const silentHazards = snap.events.filter(e => e.kind === "hazard" && e.fromState === "SILENT" && e.silentHazardReactionLagMs != null);
  const ticks = Array.from({length: 7}, (_,i) => startMs + (windowMs * i / 6));

  const zoom = (factor: number, anchor = 0.5) => {
    const next = clampWindow(windowMs * factor);
    const anchorMs = startMs + windowMs * anchor;
    setWindowMs(next);
    setEndMs(anchorMs + next * (1-anchor));
    setFollowNow(false);
  };
  const pan = (delta: number) => { setEndMs(effectiveEnd + delta); setFollowNow(false); };
  const goNow = () => { setEndMs(snap.asOfMs); setFollowNow(mode === "live"); };
  const endDrag = () => { drag.current=null; };
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect=e.currentTarget.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoom(e.deltaY > 0 ? 1.18 : 0.84, Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)));
    else pan((e.deltaX || e.deltaY) / 700 * windowMs);
  };
  const setDay = (value: string) => {
    setSelectedDay(value);
    const bounds=dayBounds(value);
    setEndMs(Math.min(bounds.end, bounds.start + windowMs));
    setFollowNow(false);
  };
  const setLayerPreset = (preset: "all" | "safety" | "clear") => {
    if (preset === "all") setLayers({ parkingBrake:true, silent:true, warning:true, hazard:true, generator:true });
    else if (preset === "safety") setLayers({ parkingBrake:true, silent:false, warning:true, hazard:true, generator:true });
    else setLayers({ parkingBrake:false, silent:false, warning:false, hazard:false, generator:false });
  };
  const day = dayBounds(selectedDay);
  const overviewLeft = Math.max(0, Math.min(100, pct(startMs, day.start, day.end-day.start)));
  const overviewRight = Math.max(overviewLeft, Math.min(100, pct(effectiveEnd, day.start, day.end-day.start)));
  const overviewWidth = Math.max(.5, overviewRight-overviewLeft);
  const toggleMachine = (id:number) => {
    const base=selectedMachines.length ? selectedMachines : controllerIds.slice(0,10);
    setSelectedMachines(base.includes(id) ? base.filter(x=>x!==id) : [...base,id].slice(0,10));
  };

  return <main className="page trending-page">
    <section className="trending-toolbar">
      <div><h1>PDS Trending</h1><small>Machine/controller state duration over time</small></div>
      <label>Date<input type="date" value={selectedDay} onChange={e=>setDay(e.target.value)} /></label>
      <div className="trend-presets">{PRESETS.map(([label,ms])=><button key={label} className={windowMs===ms?"active":""} onClick={()=>{setWindowMs(ms);setFollowNow(false);}}>{label}</button>)}</div>
      <button onClick={()=>zoom(0.75)} title="Zoom in"><Plus /></button>
      <button onClick={()=>zoom(1.33)} title="Zoom out"><Minus /></button>
      <button onClick={goNow}><RotateCcw />Now</button>
      <span className={followNow?"trend-follow active":"trend-follow"}>{followNow?"LIVE FOLLOW":"HISTORICAL"}</span>
    </section>

    <section className="trend-options panel">
      <div><b>Event layers</b>
        {(["parkingBrake","silent","warning","hazard","generator"] as Layer[]).map(layer=><label key={layer}><input type="checkbox" checked={layers[layer]} onChange={()=>setLayers(v=>({...v,[layer]:!v[layer]}))}/>{layer==="generator"?"Generator events*":layer==="parkingBrake"?"PARKING BRAKE RELEASED":layer.toUpperCase()}</label>)}
        <label><input type="checkbox" checked={showPeople} onChange={()=>setShowPeople(v=>!v)}/>{showPeople?<Eye/>:<EyeOff/>}PAD / person</label>
        <label><input type="checkbox" checked={showLabels} onChange={()=>setShowLabels(v=>!v)}/>Event labels</label>
        <span className="trend-layer-presets"><button onClick={()=>setLayerPreset("all")}>Show All</button><button onClick={()=>setLayerPreset("safety")}>Safety Only</button><button onClick={()=>setLayerPreset("clear")}>Clear</button></span>
        <small>* Generator Low Voltage / Communication Error remain unvalidated and are not synthesized.</small>
      </div>
      <div className="trend-machines"><b>Machines ({activeIds.length}/10)</b>{controllerIds.map(id=><label key={id}><input type="checkbox" checked={activeIds.includes(id)} onChange={()=>toggleMachine(id)} />{formatMachineLabel(id,machines[id],"both")}</label>)}</div>
    </section>

    <section className="trend-shell">
      <div className="trend-axis-corner">MACHINE / CONTROLLER</div>
      <div className="trend-axis">{ticks.map(t=><span key={t} style={{left:`${pct(t,startMs,windowMs)}%`}}>{new Date(t).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:windowMs<=300000?"2-digit":undefined})}</span>)}</div>
      <div className="trend-labels">{activeIds.map(id=><div className="trend-machine-label" key={id}><b>{machines[id]?.machineName || machines[id]?.machineId || `Controller ${id}`}</b><small>Controller {id}</small></div>)}</div>
      <div className="trend-viewport" onWheel={onWheel}
        onMouseDown={e=>{drag.current={x:e.clientX,end:effectiveEnd};}}
        onMouseMove={e=>{
          const rect=e.currentTarget.getBoundingClientRect();
          if(drag.current){setEndMs(drag.current.end-(e.clientX-drag.current.x)/rect.width*windowMs);setFollowNow(false);}
          setHover({x:Math.max(0,Math.min(rect.width,e.clientX-rect.left)),at:startMs+Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*windowMs});
        }}
        onMouseUp={endDrag} onMouseLeave={()=>{endDrag();setHover(null);}}>
        {ticks.map(t=><i className="trend-gridline" key={t} style={{left:`${pct(t,startMs,windowMs)}%`}} />)}
        {activeIds.map(id=><div className="trend-lane" key={id}>
          {layers.parkingBrake && snap.parkingBrakeIntervals.filter(v=>v.controllerId===id && v.released && v.startMs < effectiveEnd && (v.endMs??snap.asOfMs)>startMs).map((item,index)=>{
            const left=Math.max(0,pct(item.startMs,startMs,windowMs));
            const right=Math.min(100,pct(item.endMs??snap.asOfMs,startMs,windowMs));
            return <div key={`brake-${id}-${item.startMs}-${index}`} className="trend-brake-release" style={{left:`${left}%`,width:`${Math.max(.25,right-left)}%`}} title={`Parking Brake Released · ${formatDuration((item.endMs??snap.asOfMs)-item.startMs)}`}><span>PARKING BRAKE RELEASED</span></div>;
          })}
          {visible.filter(v=>v.controllerId===id).map((item,index)=>{
            const layer=STATE_LAYER[item.stateCode]; if(!layer || !layers[layer]) return null;
            const left=Math.max(0,pct(item.startMs,startMs,windowMs));
            const right=Math.min(100,pct(item.endMs??snap.asOfMs,startMs,windowMs));
            const width=Math.max(.25,right-left);
            const label=padStateName(item.stateCode);
            return <button key={`${id}-${item.padDisplayId}-${item.startMs}-${index}`} className={`trend-event trend-${layer}`} style={{left:`${left}%`,width:`${width}%`}} onClick={e=>{e.stopPropagation();setSelected(item);}} onDoubleClick={e=>{e.stopPropagation();setEndMs((item.endMs??snap.asOfMs)+15000);setWindowMs(clampWindow(Math.max(60000,(item.endMs??snap.asOfMs)-item.startMs+30000)));setFollowNow(false);}} title={`${label} · ${formatDuration((item.endMs??snap.asOfMs)-item.startMs)}`}>
              {showLabels && <span>{label}</span>}{showPeople && width>7 && <small>{formatPadLabel(item.padDisplayId,pads[item.padDisplayId],"both")}</small>}
            </button>;
          })}
        </div>)}
        {proximityHazards.filter(e=>activeIds.includes(e.controllerId) && e.startMs>=startMs && e.startMs<=effectiveEnd).map(e=><div key={`lag-${e.id}`} className="trend-lag-marker" style={{left:`${pct(e.startMs,startMs,windowMs)}%`}} title={`${e.padNameSnapshot ?? `PAD ${e.padDisplayId}`} · ${e.controllerNameSnapshot ?? `Controller ${e.controllerId}`} · Proximity Hazard reaction: ${((e.hazardReactionLagMs??0)/1000).toFixed(2)} s`}><span>{((e.hazardReactionLagMs??0)/1000).toFixed(2)}s</span></div>)}
        {silentHazards.filter(e=>activeIds.includes(e.controllerId) && e.startMs>=startMs && e.startMs<=effectiveEnd).map(e=><div key={`silent-lag-${e.id}`} className="trend-lag-marker silent-hazard-lag" style={{left:`${pct(e.startMs,startMs,windowMs)}%`}} title={`${e.padNameSnapshot ?? `PAD ${e.padDisplayId}`} · ${e.controllerNameSnapshot ?? `Controller ${e.controllerId}`} · Silent → Hazard reaction: ${((e.silentHazardReactionLagMs??0)/1000).toFixed(2)} s`}><span>S→H {((e.silentHazardReactionLagMs??0)/1000).toFixed(2)}s</span></div>)}
        {hover && <div className="trend-crosshair" style={{left:hover.x}}><span>{formatClock(hover.at)}</span></div>}
      </div>
    </section>

    <div className="trend-overview" title="24-hour navigator">
      <span>00:00</span><button type="button" className="trend-overview-track" aria-label="24-hour time navigator" onClick={e=>{e.stopPropagation();const rect=e.currentTarget.getBoundingClientRect();const at=day.start+((e.clientX-rect.left)/rect.width)*(day.end-day.start);setEndMs(at+windowMs/2);setFollowNow(false);}}><i style={{left:`${overviewLeft}%`,width:`${overviewWidth}%`}} /></button><span>24:00</span>
    </div>
    <div className="trend-footer">
      <button onClick={()=>pan(-windowMs*.8)}>◀ Earlier</button>
      <div className="trend-range"><b>{formatClock(startMs)}</b><span> — {Math.round(windowMs/60000)} minute window — </span><b>{formatClock(effectiveEnd)}</b></div>
      <button onClick={()=>pan(windowMs*.8)}>Later ▶</button>
    </div>

    {selected && <section className="panel trend-detail"><button className="trend-close" onClick={()=>setSelected(null)}>×</button><h3>{padStateName(selected.stateCode)} event</h3><p>Machine <b>{formatMachineLabel(selected.controllerId,machines[selected.controllerId],"both")}</b></p><p>PAD / person <b>{formatPadLabel(selected.padDisplayId,pads[selected.padDisplayId],"both")}</b></p><p>Start <b>{formatClock(selected.startMs)}</b></p><p>End <b>{selected.endMs?formatClock(selected.endMs):"Open / current"}</b></p><p>Duration <b>{formatDuration((selected.endMs??snap.asOfMs)-selected.startMs)}</b></p><p>Tip <b>Double-click a bar to zoom to that event</b></p></section>}
  </main>;
}
