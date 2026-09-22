import { useMemo, useState } from "react";
import { decodeMqtt, describeDecode } from "../core/decoder";
import { downloadText, rawToCsv, rawToJsonl } from "../core/export";
import { formatClock } from "../core/padState";
import { useMonitor } from "../state/monitor";

export function RawPage() {
  const { engine, snap, settings, setSettings, status, tauri, importText } = useMonitor();
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [family, setFamily] = useState("all");
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
      <p className="hint">
        Every MQTT payload is stored before decoding. {snap.rawCount} messages in this session, {snap.decodeErrors} decode
        notes, {snap.unknownTopics} unknown topics.{" "}
        {tauri
          ? "The desktop app is subscribed to the broker and writing SQLite."
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
