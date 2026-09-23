import { useEffect, useMemo, useState } from "react";
import { decodeMqtt, describeDecode } from "../core/decoder";
import { downloadText, rawToCsv, rawToJsonl } from "../core/export";
import { formatClock } from "../core/padState";
import { useMonitor } from "../state/monitor";
import { diagnoseNetwork, listNetworkAdapters, startLocalBroker, type NetworkAdapter, type NetworkDiagnostic } from "../data/tauriBridge";

export function RawPage() {
  const { engine, snap, settings, setSettings, status, tauri, importText, mode } = useMonitor();
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [family, setFamily] = useState("all");
  const [pdsIp, setPdsIp] = useState(() => localStorage.getItem("shr-pds-controller-ip") || "192.168.1.1");
  const [adapters, setAdapters] = useState<NetworkAdapter[]>([]);
  const [diagnostic, setDiagnostic] = useState<NetworkDiagnostic | null>(null);
  const [networkBusy, setNetworkBusy] = useState(false);
  const [brokerMessage, setBrokerMessage] = useState("");

  useEffect(() => {
    if (!tauri) return;
    void listNetworkAdapters().then(setAdapters);
  }, [tauri]);

  async function runDiagnostic() {
    setNetworkBusy(true);
    localStorage.setItem("shr-pds-controller-ip", pdsIp);
    try {
      setAdapters(await listNetworkAdapters());
      setDiagnostic(await diagnoseNetwork(pdsIp, settings));
    } finally {
      setNetworkBusy(false);
    }
  }

  async function startBroker() {
    setNetworkBusy(true);
    try {
      setBrokerMessage(await startLocalBroker(settings.port));
      await new Promise((resolve) => window.setTimeout(resolve, 800));
      setDiagnostic(await diagnoseNetwork(pdsIp, settings));
    } catch (error) {
      setBrokerMessage(String(error));
    } finally {
      setNetworkBusy(false);
    }
  }
  const rows = engine.rawMessages();
  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (family !== "all" && !row.topic.includes(family)) return false;
        if (topic && !row.topic.toLowerCase().includes(topic.toLowerCase())) return false;
        if (text && !row.payload.toLowerCase().includes(text.toLowerCase())) return false;
        return true;
      }),
    [rows, family, topic, text, snap.rawCount],
  );

  return (
    <main className="page">
      <section className="network-setup">
        <div>
          <h3>Field Network Setup</h3>
          <p className="hint">Validated recorder workflow: arbitrary IPv4 networks, PDS subnet check, local broker check, and the PC MQTT target to enter in the PDS.</p>
        </div>
        <label>
          PDS Controller IP
          <input value={pdsIp} onChange={(e) => setPdsIp(e.target.value)} placeholder="e.g. 192.168.1.1" />
        </label>
        <button type="button" disabled={!tauri || networkBusy} onClick={runDiagnostic}>
          {networkBusy ? "Testing..." : "Run Full Diagnostic"}
        </button>
        <button type="button" disabled={!tauri || networkBusy} onClick={startBroker}>Start Local Broker</button>
        <div className="network-result">
          <b>{diagnostic?.detail ?? (tauri ? "Not tested" : "Available in the Windows app")}</b>
          {diagnostic?.adapter && <span>Adapter: {diagnostic.adapter.name} — {diagnostic.adapter.ipv4}/{diagnostic.adapter.subnet}</span>}
          {diagnostic?.mqttTarget && <span>PDS MQTT target: <strong>{diagnostic.mqttTarget}</strong></span>}
          {diagnostic && <span>Subnet {diagnostic.sameSubnet ? "✓" : "✗"} · PDS {diagnostic.pdsReachable ? "✓" : "✗"} · Broker {diagnostic.brokerReachable ? "✓" : "✗"}</span>}
          {brokerMessage && <span>{brokerMessage}</span>}
          <small>{adapters.length ? `${adapters.length} active IPv4 adapter(s) detected.` : ""}</small>
        </div>
      </section>
      <section className="toolbar">
        <label>
          Host
          <input value={settings.host} onChange={(e) => setSettings({ ...settings, host: e.target.value })} />
        </label>
        <label>
          Port
          <input
            value={settings.port}
            onChange={(e) => setSettings({ ...settings, port: Number(e.target.value) || 1884 })}
          />
        </label>
        <label>
          Topic
          <input value={settings.topic} onChange={(e) => setSettings({ ...settings, topic: e.target.value || "#" })} />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.jsonlLog}
            onChange={(e) => setSettings({ ...settings, jsonlLog: e.target.checked })}
          />
          Daily JSONL log
        </label>
        <span className={`conn ${status.state}`}>{status.state}{status.detail ? ` — ${status.detail}` : ""}</span>
        <button type="button" onClick={() => downloadText("pds-raw.csv", rawToCsv(filtered), "text/csv")}>
          Export CSV
        </button>
        <button type="button" onClick={() => downloadText("pds-raw.jsonl", rawToJsonl(filtered), "application/x-ndjson")}>
          Export JSONL
        </button>
        <label className="file">
          Import JSONL
          <input
            type="file"
            accept=".jsonl,.txt,.log"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              await importText(await file.text(), file.name);
            }}
          />
        </label>
      </section>
      {status.state === "connected" && snap.rawCount > 0 && !rows.some((row) => row.topic.includes("strata/v1/proximity/")) && (
        <p className="telemetry-warning">MQTT connected, but no PDS proximity telemetry detected. Check PDS RTC/time configuration and controller status.</p>
      )}
      <p className="hint">
        Every MQTT payload is stored before decoding. {snap.rawCount} messages in this session, {snap.decodeErrors} decode
        notes, {snap.unknownTopics} unknown topics.{" "}
        {tauri
          ? mode === "replay"
            ? "This is the 22 Sept recording, played through the same decoder. Live MQTT is still subscribed; use Live when the broker has data."
            : "The desktop app is subscribed to the broker and writing SQLite."
          : "Browser preview replays recordings. Live MQTT runs in the Windows app."}
      </p>
      <section className="filters">
        <select value={family} onChange={(e) => setFamily(e.target.value)}>
          <option value="all">All topics</option>
          <option value="proximity/0">proximity/0 generators</option>
          <option value="proximity/1">proximity/1 controller</option>
          <option value="proximity/3">proximity/3 PADs</option>
          <option value="proximity/15">proximity/15</option>
          <option value="proximity/21">proximity/21</option>
          <option value="proximity/22">proximity/22</option>
          <option value="wifi/">wifi</option>
        </select>
        <input placeholder="Filter topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <input placeholder="Filter payload" value={text} onChange={(e) => setText(e.target.value)} />
        <span>{filtered.length} shown</span>
      </section>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Received</th>
              <th>Topic</th>
              <th>QoS</th>
              <th>Retain</th>
              <th>Decoded</th>
              <th>Payload</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(-400).reverse().map((row) => {
              const decoded = decodeMqtt(row);
              return (
                <tr key={row.id ?? `${row.receivedAtMs}-${row.topic}`}>
                  <td>{formatClock(row.receivedAtMs)}</td>
                  <td className="mono">{row.topic}</td>
                  <td>{row.qos}</td>
                  <td>{row.retain ? "yes" : "no"}</td>
                  <td>
                    {describeDecode(decoded)}
                    <small>{decoded.unmapped.length} unmapped</small>
                  </td>
                  <td className="mono payload">{row.payload}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
