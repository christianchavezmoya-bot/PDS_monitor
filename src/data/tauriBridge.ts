import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { dayKey } from "../core/padState";
import { summarize } from "../core/summary";
import type { EngineSnapshot, RawMqttMessage } from "../core/types";

export interface MqttSettings {
  host: string;
  port: number;
  topic: string;
  jsonlLog: boolean;
}

export interface MqttStatus {
  state: "disconnected" | "connecting" | "connected" | "reconnecting" | "error";
  detail?: string;
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function persistRaw(message: RawMqttMessage): Promise<RawMqttMessage> {
  if (!isTauri()) return message;
  const id = await invoke<number>("insert_raw", { message });
  return { ...message, id };
}

export interface EventIdentitySnapshot { id:string; padNameSnapshot?:string|null; controllerNameSnapshot?:string|null; }
export async function loadEventIdentitySnapshots(): Promise<EventIdentitySnapshot[]> {
  if (!isTauri()) return [];
  return invoke<EventIdentitySnapshot[]>("list_event_identity_snapshots");
}

export async function loadRecordedMessages(): Promise<RawMqttMessage[]> {
  if (!isTauri()) return [];
  return invoke<RawMqttMessage[]>("list_raw", { query: { limit: 200000 } });
}

export async function saveDerived(snap: EngineSnapshot): Promise<void> {
  if (!isTauri()) return;
  const days = [...new Set(snap.events.map((event) => dayKey(event.startMs)))];
  await invoke("replace_derived", {
    dump: {
      controllers: snap.controllers,
      generators: snap.generators,
      pads: snap.pads,
      transitions: snap.transitions,
      events: snap.events,
      stats: days.map((day) => summarize(snap, day, null)),
    },
  });
}

export async function startMqtt(
  settings: MqttSettings,
  onStatus: (status: MqttStatus) => void,
  onMessage?: (message: RawMqttMessage) => void,
): Promise<UnlistenFn> {
  const unlistenStatus = await listen<MqttStatus>("mqtt://status", (event) => onStatus(event.payload));
  const unlistenMessage = await listen<RawMqttMessage>("mqtt://message", (event) => onMessage?.(event.payload));
  await invoke("configure_mqtt", { settings });
  return () => {
    unlistenStatus();
    unlistenMessage();
  };
}


export interface NetworkAdapter {
  name: string;
  ipv4: string;
  subnet: string;
  gateway?: string;
}

export interface NetworkDiagnostic {
  pdsIp: string;
  adapter?: NetworkAdapter;
  sameSubnet: boolean;
  pdsReachable: boolean;
  brokerReachable: boolean;
  mqttTarget?: string;
  detail: string;
}

export async function listNetworkAdapters(): Promise<NetworkAdapter[]> {
  if (!isTauri()) return [];
  return invoke<NetworkAdapter[]>("list_network_adapters");
}

export async function diagnoseNetwork(pdsIp: string, settings: MqttSettings): Promise<NetworkDiagnostic> {
  if (!isTauri()) {
    return { pdsIp, sameSubnet: false, pdsReachable: false, brokerReachable: false, detail: "Network diagnostics run in the Windows app." };
  }
  return invoke<NetworkDiagnostic>("diagnose_network", {
    pdsIp,
    brokerHost: settings.host,
    brokerPort: settings.port,
  });
}

export async function startLocalBroker(port: number): Promise<string> {
  if (!isTauri()) return "Local broker control runs in the Windows app.";
  return invoke<string>("start_local_broker", { port });
}
