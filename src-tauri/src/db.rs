use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS raw_mqtt_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at_ms INTEGER NOT NULL,
  topic TEXT NOT NULL,
  payload TEXT NOT NULL,
  qos INTEGER NOT NULL,
  retain INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_raw_time ON raw_mqtt_messages(received_at_ms);
CREATE INDEX IF NOT EXISTS idx_raw_topic ON raw_mqtt_messages(topic);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS controllers (
  controller_id INTEGER PRIMARY KEY,
  firmware TEXT,
  input1 INTEGER,
  parking_brake_release INTEGER,
  last_seen_ms INTEGER,
  unmapped_json TEXT
);
CREATE TABLE IF NOT EXISTS generators (
  controller_id INTEGER NOT NULL,
  generator_id INTEGER NOT NULL,
  firmware TEXT,
  last_seen_ms INTEGER,
  unmapped_json TEXT,
  health TEXT NOT NULL,
  PRIMARY KEY (controller_id, generator_id)
);
CREATE TABLE IF NOT EXISTS pads (
  controller_id INTEGER NOT NULL,
  display_id INTEGER NOT NULL,
  encoded_id INTEGER,
  firmware TEXT,
  battery_v REAL,
  state_code INTEGER,
  previous_state_code INTEGER,
  state_since_ms INTEGER,
  last_seen_ms INTEGER,
  unmapped_json TEXT,
  PRIMARY KEY (controller_id, display_id)
);
CREATE TABLE IF NOT EXISTS pad_state_transitions (
  id TEXT PRIMARY KEY,
  controller_id INTEGER,
  pad_display_id INTEGER,
  from_state INTEGER,
  to_state INTEGER,
  at_ms INTEGER,
  raw_message_id INTEGER,
  parking_brake_release INTEGER
);
CREATE TABLE IF NOT EXISTS pds_events (
  id TEXT PRIMARY KEY,
  controller_id INTEGER,
  pad_display_id INTEGER,
  kind TEXT,
  start_ms INTEGER,
  end_ms INTEGER,
  duration_ms INTEGER,
  journey TEXT,
  parking_brake_release INTEGER,
  input1 INTEGER,
  derived_pds TEXT,
  generator_snapshot TEXT,
  raw_ids TEXT,
  open INTEGER
);
CREATE TABLE IF NOT EXISTS generator_events (
  id INTEGER PRIMARY KEY,
  controller_id INTEGER,
  generator_id INTEGER,
  kind TEXT,
  at_ms INTEGER,
  evidence_json TEXT,
  validated INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS daily_statistics (
  day TEXT NOT NULL,
  controller_id INTEGER NOT NULL,
  stats_json TEXT NOT NULL,
  PRIMARY KEY (day, controller_id)
);
"#;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MqttSettings {
    pub host: String,
    pub port: u16,
    pub topic: String,
    pub jsonl_log: bool,
}

impl Default for MqttSettings {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".into(),
            port: 1884,
            topic: "#".into(),
            jsonl_log: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawMessage {
    pub id: Option<i64>,
    pub received_at_ms: i64,
    pub topic: String,
    pub payload: String,
    pub qos: i64,
    pub retain: bool,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawQuery {
    pub topic_contains: Option<String>,
    pub payload_contains: Option<String>,
    pub from_ms: Option<i64>,
    pub to_ms: Option<i64>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DerivedDump {
    pub controllers: Vec<Value>,
    pub generators: Vec<Value>,
    pub pads: Vec<Value>,
    pub transitions: Vec<Value>,
    pub events: Vec<Value>,
    pub stats: Vec<Value>,
}

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
    }
    let conn = Connection::open(path)?;
    conn.execute_batch(SCHEMA)?;
    Ok(conn)
}

pub fn insert_raw(conn: &Connection, message: &RawMessage, log_dir: &Path, jsonl: bool) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO raw_mqtt_messages (received_at_ms, topic, payload, qos, retain) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            message.received_at_ms,
            message.topic,
            message.payload,
            message.qos,
            message.retain as i64
        ],
    )?;
    let id = conn.last_insert_rowid();
    if jsonl {
        if let Err(err) = append_jsonl(log_dir, message) {
            eprintln!("jsonl log failed: {err}");
        }
    }
    Ok(id)
}

fn append_jsonl(log_dir: &Path, message: &RawMessage) -> std::io::Result<()> {
    let dir = log_dir.join("logs");
    fs::create_dir_all(&dir)?;
    let day = chrono::DateTime::from_timestamp_millis(message.received_at_ms)
        .map(|dt| dt.with_timezone(&chrono::Local).format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| "unknown".into());
    let mut file = OpenOptions::new().create(true).append(true).open(dir.join(format!("{day}.jsonl")))?;
    let line = json!({
        "receivedAtMs": message.received_at_ms,
        "topic": message.topic,
        "payload": message.payload,
        "qos": message.qos,
        "retain": message.retain,
    });
    writeln!(file, "{line}")
}

pub fn list_raw(conn: &Connection, query: &RawQuery) -> rusqlite::Result<Vec<RawMessage>> {
    let topic = query.topic_contains.as_ref().map(|v| format!("%{v}%"));
    let payload = query.payload_contains.as_ref().map(|v| format!("%{v}%"));
    let limit = query.limit.unwrap_or(200_000);
    let offset = query.offset.unwrap_or(0);
    let mut stmt = conn.prepare(
        "SELECT id, received_at_ms, topic, payload, qos, retain
         FROM raw_mqtt_messages
         WHERE (?1 IS NULL OR topic LIKE ?1)
           AND (?2 IS NULL OR payload LIKE ?2)
           AND (?3 IS NULL OR received_at_ms >= ?3)
           AND (?4 IS NULL OR received_at_ms < ?4)
         ORDER BY received_at_ms ASC, id ASC
         LIMIT ?5 OFFSET ?6",
    )?;
    let rows = stmt.query_map(
        params![topic, payload, query.from_ms, query.to_ms, limit, offset],
        |row| {
            Ok(RawMessage {
                id: Some(row.get(0)?),
                received_at_ms: row.get(1)?,
                topic: row.get(2)?,
                payload: row.get(3)?,
                qos: row.get(4)?,
                retain: row.get::<_, i64>(5)? != 0,
            })
        },
    )?;
    rows.collect()
}

fn opt_i64(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|n| n as i64)))
}

fn opt_string(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(|v| {
        if v.is_null() {
            None
        } else if let Some(text) = v.as_str() {
            Some(text.to_string())
        } else {
            Some(v.to_string())
        }
    })
}

pub fn replace_derived(conn: &Connection, dump: &DerivedDump) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    tx.execute_batch(
        "DELETE FROM controllers; DELETE FROM generators; DELETE FROM pads;
         DELETE FROM pad_state_transitions; DELETE FROM pds_events; DELETE FROM daily_statistics;",
    )?;
    for item in &dump.controllers {
        tx.execute(
            "INSERT INTO controllers (controller_id, firmware, input1, parking_brake_release, last_seen_ms, unmapped_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                opt_i64(item, "controllerId"),
                opt_string(item, "firmware"),
                opt_i64(item, "input1"),
                opt_i64(item, "parkingBrakeRelease"),
                opt_i64(item, "lastSeenMs"),
                item.get("unmappedByTopic").map(|v| v.to_string()),
            ],
        )?;
    }
    for item in &dump.generators {
        tx.execute(
            "INSERT INTO generators (controller_id, generator_id, firmware, last_seen_ms, unmapped_json, health)
             VALUES (?1, ?2, ?3, ?4, ?5, 'unvalidated')",
            params![
                opt_i64(item, "controllerId"),
                opt_i64(item, "generatorId"),
                opt_string(item, "firmware"),
                opt_i64(item, "lastSeenMs"),
                item.get("unmapped").map(|v| v.to_string()),
            ],
        )?;
    }
    for item in &dump.pads {
        tx.execute(
            "INSERT INTO pads (controller_id, display_id, encoded_id, firmware, battery_v, state_code, previous_state_code, state_since_ms, last_seen_ms, unmapped_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                opt_i64(item, "controllerId"),
                opt_i64(item, "displayId"),
                opt_i64(item, "encodedId"),
                opt_string(item, "firmware"),
                item.get("batteryV").and_then(|v| v.as_f64()),
                opt_i64(item, "stateCode"),
                opt_i64(item, "previousStateCode"),
                opt_i64(item, "stateSinceMs"),
                opt_i64(item, "lastSeenMs"),
                item.get("unmapped").map(|v| v.to_string()),
            ],
        )?;
    }
    for item in &dump.transitions {
        tx.execute(
            "INSERT INTO pad_state_transitions (id, controller_id, pad_display_id, from_state, to_state, at_ms, raw_message_id, parking_brake_release)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                opt_string(item, "id"),
                opt_i64(item, "controllerId"),
                opt_i64(item, "padDisplayId"),
                opt_i64(item, "fromState"),
                opt_i64(item, "toState"),
                opt_i64(item, "atMs"),
                opt_i64(item, "rawMessageId"),
                opt_i64(item, "parkingBrakeRelease"),
            ],
        )?;
    }
    for item in &dump.events {
        tx.execute(
            "INSERT INTO pds_events (id, controller_id, pad_display_id, kind, start_ms, end_ms, duration_ms, journey, parking_brake_release, input1, derived_pds, generator_snapshot, raw_ids, open)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                opt_string(item, "id"),
                opt_i64(item, "controllerId"),
                opt_i64(item, "padDisplayId"),
                opt_string(item, "kind"),
                opt_i64(item, "startMs"),
                opt_i64(item, "endMs"),
                opt_i64(item, "durationMs"),
                opt_string(item, "journeyLabel"),
                opt_i64(item, "parkingBrakeRelease"),
                opt_i64(item, "input1"),
                opt_string(item, "derivedPdsAtStart"),
                item.get("generatorSnapshot").map(|v| v.to_string()),
                item.get("rawMessageIds").map(|v| v.to_string()),
                item.get("open").and_then(|v| v.as_bool()).unwrap_or(false) as i64,
            ],
        )?;
    }
    for item in &dump.stats {
        tx.execute(
            "INSERT INTO daily_statistics (day, controller_id, stats_json) VALUES (?1, ?2, ?3)",
            params![
                item.get("day").and_then(|v| v.as_str()).unwrap_or(""),
                item.get("controllerId").and_then(|v| v.as_i64()).unwrap_or(-1),
                item.to_string(),
            ],
        )?;
    }
    tx.commit()
}

pub fn save_settings(conn: &Connection, settings: &MqttSettings) -> rusqlite::Result<()> {
    let value = serde_json::to_string(settings).unwrap_or_else(|_| "{}".into());
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('mqtt', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![value],
    )?;
    Ok(())
}
