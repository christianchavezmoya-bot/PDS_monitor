import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import fixture from "../fixtures/site-visit-22-sept.json";
import { SessionEngine } from "../core/engine";
import { parseJsonl } from "../core/export";
import { dayKey } from "../core/padState";
import { openBundledVisit, replayDelayMs, type ReplaySpeed } from "../core/replay";
import type { EngineSnapshot, RawMqttMessage } from "../core/types";
import { hydrateAssignmentsFromSqlite } from "../core/assignments";
import { isTauri, loadRecordedMessages, persistRaw, saveDerived, startMqtt, type MqttSettings, type MqttStatus } from "../data/tauriBridge";

export type PageId = "raw" | "live" | "summary" | "report";

interface MonitorContextValue {
  page: PageId;
  setPage: (page: PageId) => void;
  snap: EngineSnapshot;
  mode: "live" | "replay";
  replay: { playing: boolean; speed: ReplaySpeed; index: number; total: number; label: string };
  setSpeed: (speed: ReplaySpeed) => void;
  settings: MqttSettings;
  setSettings: (settings: MqttSettings) => void;
  status: MqttStatus;
  selectedController: number | null;
  setSelectedController: (id: number | null) => void;
  selectedDay: string;
  setSelectedDay: (day: string) => void;
  playFixture: () => void;
  importText: (text: string, label: string) => Promise<void>;
  togglePlayback: () => void;
  stopReplay: () => void;
  engine: SessionEngine;
  tauri: boolean;
  telemetry: { state: "live" | "stale" | "waiting"; lastMessageMs: number | null; ageMs: number | null };
}

const MonitorContext = createContext<MonitorContextValue | null>(null);

const DEFAULT_SETTINGS: MqttSettings = {
  host: "127.0.0.1",
  port: 1884,
  topic: "#",
  jsonlLog: true,
};

function readSettings(): MqttSettings {
  try {
    const stored = localStorage.getItem("shr-pds-settings");
    if (!stored) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function initialPage(): PageId {
  const page = new URLSearchParams(window.location.search).get("page");
  if (page === "raw" || page === "live" || page === "summary" || page === "report") return page;
  return "live";
}

export function MonitorProvider({ children }: { children: ReactNode }) {
  const engineRef = useRef(new SessionEngine());
  const liveLog = useRef<RawMqttMessage[]>([]);
  const playList = useRef<RawMqttMessage[]>([]);
  const playIndex = useRef(0);
  const timer = useRef<number | null>(null);
  const replayGeneration = useRef(0);
  const modeRef = useRef<"live" | "replay">("live");
  const controllerPinned = useRef(false);
  const speedRef = useRef<ReplaySpeed>(10);
  const [page, setPage] = useState<PageId>(initialPage);
  const [snap, setSnap] = useState<EngineSnapshot>(() => engineRef.current.snapshot());
  const [mode, setMode] = useState<"live" | "replay">("live");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState<ReplaySpeed>(10);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [label, setLabel] = useState("");
  const [settings, setSettingsState] = useState<MqttSettings>(readSettings);
  const [status, setStatus] = useState<MqttStatus>({ state: "disconnected" });
  const [selectedController, setSelectedController] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState(dayKey(Date.now()));
  const tauri = isTauri();
  const latestTelemetryMs = mode === "live" ? (snap.controllers.length ? Math.max(...snap.controllers.map((item) => item.lastSeenMs)) : null) : null;
  const telemetryAgeMs = latestTelemetryMs === null ? null : Math.max(0, snap.asOfMs - latestTelemetryMs);
  const telemetry = { state: (latestTelemetryMs === null ? "waiting" : telemetryAgeMs! > 30_000 ? "stale" : "live") as "live" | "stale" | "waiting", lastMessageMs: latestTelemetryMs, ageMs: telemetryAgeMs };

  const publish = useCallback(() => {
    const asOf = modeRef.current === "live" ? Date.now() : undefined;
    const next = engineRef.current.snapshot(asOf);
    setSnap(next);
    if (next.events.length) setSelectedDay((current) => current || dayKey(next.events[next.events.length - 1].startMs));
    const latest = [...next.controllers].sort((a, b) => b.lastSeenMs - a.lastSeenMs)[0];
    if (!controllerPinned.current && latest) setSelectedController(latest.controllerId);
    if (tauri && modeRef.current === "live") void saveDerived(next);
  }, [tauri]);

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const finishPlayback = useCallback(() => {
    clearTimer();
    setPlaying(false);
    publish();
  }, [publish]);

  const step = useCallback((generation?: number) => {
    if (generation !== undefined && generation !== replayGeneration.current) return;
    const messages = playList.current;
    const cursor = playIndex.current;
    if (modeRef.current !== "replay" || cursor >= messages.length) {
      finishPlayback();
      return;
    }
    const speedNow = speedRef.current;
    if (speedNow === "max") {
      const end = Math.min(messages.length, cursor + 30);
      for (let i = cursor; i < end; i += 1) engineRef.current.ingest(messages[i]);
      playIndex.current = end;
      setIndex(end);
      publish();
      if (end >= messages.length) finishPlayback();
      else timer.current = window.setTimeout(() => step(replayGeneration.current), 0);
      return;
    }
    engineRef.current.ingest(messages[cursor]);
    const next = cursor + 1;
    playIndex.current = next;
    setIndex(next);
    publish();
    if (next >= messages.length) {
      finishPlayback();
      return;
    }
    const delay = replayDelayMs(messages[cursor].receivedAtMs, messages[next].receivedAtMs, speedNow);
    timer.current = window.setTimeout(() => step(replayGeneration.current), delay);
  }, [finishPlayback, publish]);

  const beginReplay = useCallback(
    (messages: RawMqttMessage[], replayLabel: string) => {
      clearTimer();
      replayGeneration.current += 1;
      const generation = replayGeneration.current;
      modeRef.current = "replay";
      setMode("replay");
      engineRef.current.reset();
      playList.current = messages;
      playIndex.current = 0;
      setIndex(0);
      setTotal(messages.length);
      setLabel(replayLabel);
      if (messages[0]) setSelectedDay(dayKey(messages[0].receivedAtMs));
      setPlaying(true);
      publish();
      timer.current = window.setTimeout(() => step(generation), 0);
    },
    [publish, step],
  );

  const stopReplay = useCallback(() => {
    replayGeneration.current += 1;
    clearTimer();
    modeRef.current = "live";
    setMode("live");
    setPlaying(false);
    playList.current = [];
    playIndex.current = 0;
    setIndex(0);
    setTotal(0);
    setLabel("");
    engineRef.current.reset();
    engineRef.current.ingestAll(liveLog.current);
    publish();
  }, [publish]);

  const togglePlayback = useCallback(() => {
    if (modeRef.current !== "replay") return;
    if (playing) {
      clearTimer();
      setPlaying(false);
      return;
    }
    if (playIndex.current >= playList.current.length) playIndex.current = 0;
    setPlaying(true);
    const generation = replayGeneration.current;
    timer.current = window.setTimeout(() => step(generation), 0);
  }, [playing, step]);

  const setSpeed = useCallback((next: ReplaySpeed) => {
    speedRef.current = next;
    setSpeedState(next);
  }, []);

  const setSettings = useCallback((next: MqttSettings) => {
    setSettingsState(next);
    localStorage.setItem("shr-pds-settings", JSON.stringify(next));
    if (tauri) void startMqtt(next, setStatus);
  }, [tauri]);

  useEffect(() => {
    const clock = window.setInterval(() => {
      if (modeRef.current === "live") setSnap(engineRef.current.snapshot(Date.now()));
    }, 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      if (!isTauri()) return;
      await hydrateAssignmentsFromSqlite();
      const recorded = await loadRecordedMessages();
      if (cancelled) return;
      liveLog.current = recorded;
      if (openBundledVisit(recorded.length, true)) {
        speedRef.current = "max";
        setSpeedState("max");
        beginReplay(fixture as RawMqttMessage[], "Site visit 22 Sept");
      } else {
        engineRef.current.ingestAll(recorded);
        publish();
      }
      unlisten = await startMqtt(readSettings(), setStatus, (message) => {
        liveLog.current.push(message);
        if (modeRef.current === "live") {
          engineRef.current.ingest(message);
          publish();
        }
      });
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [beginReplay, publish]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("demo") !== "1") return;
    speedRef.current = "max";
    setSpeedState("max");
    beginReplay(fixture as RawMqttMessage[], "Site visit 22 Sept");
    return () => clearTimer();
  }, [beginReplay]);

  const playFixture = useCallback(() => {
    beginReplay(fixture as RawMqttMessage[], "Site visit 22 Sept");
  }, [beginReplay]);

  const importText = useCallback(
    async (text: string, name: string) => {
      const messages = parseJsonl(text).map((message, index) => ({ ...message, id: index + 1 }));
      for (const message of messages) {
        const stored = await persistRaw(message);
        liveLog.current.push(stored);
      }
      beginReplay(messages, name);
    },
    [beginReplay],
  );

  const value = useMemo<MonitorContextValue>(
    () => ({
      page,
      setPage,
      snap,
      mode,
      replay: { playing, speed, index, total, label },
      setSpeed,
      settings,
      setSettings,
      status,
      selectedController,
      setSelectedController: (id: number | null) => {
        controllerPinned.current = true;
        setSelectedController(id);
      },
      selectedDay,
      setSelectedDay,
      playFixture,
      importText,
      togglePlayback,
      stopReplay,
      engine: engineRef.current,
      tauri,
      telemetry,
    }),
    [
      page,
      snap,
      mode,
      playing,
      speed,
      index,
      total,
      label,
      setSpeed,
      settings,
      setSettings,
      status,
      selectedController,
      selectedDay,
      playFixture,
      importText,
      togglePlayback,
      stopReplay,
      tauri,
      telemetry.state,
      telemetry.lastMessageMs,
      telemetry.ageMs,
    ],
  );

  return <MonitorContext.Provider value={value}>{children}</MonitorContext.Provider>;
}

export function useMonitor(): MonitorContextValue {
  const value = useContext(MonitorContext);
  if (!value) throw new Error("useMonitor must be used inside MonitorProvider");
  return value;
}
