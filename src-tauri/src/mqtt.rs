use crate::db::{self, MqttSettings, RawMessage};
use rumqttc::{Client, Event, MqttOptions, Packet, QoS};
use rusqlite::Connection;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

pub struct MqttRuntime {
    stop: Arc<AtomicBool>,
    client: Option<Client>,
    thread: Option<JoinHandle<()>>,
}

impl MqttRuntime {
    pub fn new() -> Self {
        Self {
            stop: Arc::new(AtomicBool::new(false)),
            client: None,
            thread: None,
        }
    }

    pub fn restart(
        &mut self,
        app: AppHandle,
        db: Arc<Mutex<Connection>>,
        log_dir: std::path::PathBuf,
        settings: MqttSettings,
    ) {
        self.stop();
        self.stop = Arc::new(AtomicBool::new(false));
        let stop = Arc::clone(&self.stop);
        let client_id = format!("shr-pds-monitor-{}", std::process::id());
        let mut options = MqttOptions::new(client_id, settings.host.clone(), settings.port);
        options.set_keep_alive(Duration::from_secs(15));
        let (client, connection) = Client::new(options, 100);
        if let Err(err) = client.subscribe(settings.topic.clone(), QoS::AtMostOnce) {
            let _ = app.emit(
                "mqtt://status",
                serde_json::json!({ "state": "error", "detail": err.to_string() }),
            );
        }
        self.client = Some(client.clone());
        self.thread = Some(thread::spawn(move || {
            run_loop(app, db, log_dir, settings, client, connection, stop);
        }));
    }

    pub fn stop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(client) = &self.client {
            let _ = client.disconnect();
        }
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
        self.client = None;
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn qos_code(qos: QoS) -> i64 {
    match qos {
        QoS::AtMostOnce => 0,
        QoS::AtLeastOnce => 1,
        QoS::ExactlyOnce => 2,
    }
}

fn payload_text(bytes: &[u8]) -> String {
    match String::from_utf8(bytes.to_vec()) {
        Ok(text) => text,
        Err(_) => format!("base64:{}", base64_encode(bytes)),
    }
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    let mut i = 0;
    while i < bytes.len() {
        let b0 = bytes[i] as u32;
        let b1 = if i + 1 < bytes.len() { bytes[i + 1] as u32 } else { 0 };
        let b2 = if i + 2 < bytes.len() { bytes[i + 2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((triple >> 18) & 63) as usize] as char);
        out.push(TABLE[((triple >> 12) & 63) as usize] as char);
        if i + 1 < bytes.len() {
            out.push(TABLE[((triple >> 6) & 63) as usize] as char);
        } else {
            out.push('=');
        }
        if i + 2 < bytes.len() {
            out.push(TABLE[(triple & 63) as usize] as char);
        } else {
            out.push('=');
        }
        i += 3;
    }
    out
}

fn run_loop(
    app: AppHandle,
    db: Arc<Mutex<Connection>>,
    log_dir: std::path::PathBuf,
    settings: MqttSettings,
    client: Client,
    mut connection: rumqttc::Connection,
    stop: Arc<AtomicBool>,
) {
    let _ = app.emit("mqtt://status", serde_json::json!({ "state": "connecting" }));
    for notification in connection.iter() {
        if stop.load(Ordering::Relaxed) {
            break;
        }
        match notification {
            Ok(Event::Incoming(Packet::ConnAck(_))) => {
                let _ = client.subscribe(settings.topic.clone(), QoS::AtMostOnce);
                let _ = app.emit(
                    "mqtt://status",
                    serde_json::json!({ "state": "connected", "detail": format!("{}:{}", settings.host, settings.port) }),
                );
            }
            Ok(Event::Incoming(Packet::Publish(publish))) => {
                let message = RawMessage {
                    id: None,
                    received_at_ms: now_ms(),
                    topic: publish.topic,
                    payload: payload_text(&publish.payload),
                    qos: qos_code(publish.qos),
                    retain: publish.retain,
                };
                let stored = {
                    let conn = db.lock().expect("sqlite lock");
                    db::insert_raw(&conn, &message, &log_dir, settings.jsonl_log)
                };
                match stored {
                    Ok(id) => {
                        let mut outgoing = message;
                        outgoing.id = Some(id);
                        let _ = app.emit("mqtt://message", &outgoing);
                    }
                    Err(err) => {
                        let _ = app.emit(
                            "mqtt://status",
                            serde_json::json!({ "state": "error", "detail": format!("raw save failed: {err}") }),
                        );
                    }
                }
            }
            Err(err) => {
                if stop.load(Ordering::Relaxed) {
                    break;
                }
                let _ = app.emit(
                    "mqtt://status",
                    serde_json::json!({ "state": "reconnecting", "detail": err.to_string() }),
                );
                thread::sleep(Duration::from_secs(2));
            }
            _ => {}
        }
    }
    let _ = app.emit("mqtt://status", serde_json::json!({ "state": "disconnected" }));
}
