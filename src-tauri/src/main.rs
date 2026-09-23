#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod mqtt;

use db::{DerivedDump, MqttSettings, RawMessage, RawQuery};
use mqtt::MqttRuntime;
use rusqlite::Connection;
use std::net::{IpAddr, Ipv4Addr, TcpStream};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Manager, State};

struct AppDb {
    conn: Arc<Mutex<Connection>>,
    log_dir: std::path::PathBuf,
    mqtt: Mutex<MqttRuntime>,
    broker: Mutex<Option<Child>>,
}

#[tauri::command]
fn configure_mqtt(app: tauri::AppHandle, state: State<AppDb>, settings: MqttSettings) -> Result<(), String> {
    {
        let conn = state.conn.lock().map_err(|err| err.to_string())?;
        db::save_settings(&conn, &settings).map_err(|err| err.to_string())?;
    }
    let mut mqtt = state.mqtt.lock().map_err(|err| err.to_string())?;
    mqtt.restart(app, Arc::clone(&state.conn), state.log_dir.clone(), settings);
    Ok(())
}

#[tauri::command]
fn insert_raw(state: State<AppDb>, message: RawMessage) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    db::insert_raw(&conn, &message, &state.log_dir, false).map_err(|err| err.to_string())
}

#[tauri::command]
fn list_raw(state: State<AppDb>, query: RawQuery) -> Result<Vec<RawMessage>, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    db::list_raw(&conn, &query).map_err(|err| err.to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NetworkAdapter {
    name: String,
    ipv4: String,
    subnet: String,
    gateway: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NetworkDiagnostic {
    pds_ip: String,
    adapter: Option<NetworkAdapter>,
    same_subnet: bool,
    pds_reachable: bool,
    broker_reachable: bool,
    mqtt_target: Option<String>,
    detail: String,
}

fn parse_ipconfig() -> Vec<NetworkAdapter> {
    let Ok(output) = Command::new("ipconfig").arg("/all").output() else { return Vec::new(); };
    let text = String::from_utf8_lossy(&output.stdout);
    let mut out = Vec::new();
    let mut name = String::new();
    let mut ipv4: Option<String> = None;
    let mut subnet: Option<String> = None;
    let mut gateway: Option<String> = None;
    fn flush(out: &mut Vec<NetworkAdapter>, name: &str, ipv4: &mut Option<String>, subnet: &mut Option<String>, gateway: &mut Option<String>) {
        if let (Some(ip), Some(mask)) = (ipv4.take(), subnet.take()) {
            if ip != "127.0.0.1" && !ip.starts_with("169.254.") {
                out.push(NetworkAdapter { name: name.to_string(), ipv4: ip, subnet: mask, gateway: gateway.take() });
            }
        }
    }
    for raw in text.lines() {
        let line = raw.trim();
        if !raw.starts_with(' ') && line.ends_with(':') {
            flush(&mut out, &name, &mut ipv4, &mut subnet, &mut gateway);
            name = line.trim_end_matches(':').to_string();
        } else if line.contains("IPv4 Address") {
            if let Some(v) = line.split(':').nth(1) { ipv4 = Some(v.trim().trim_end_matches("(Preferred)").trim().to_string()); }
        } else if line.contains("Subnet Mask") {
            if let Some(v) = line.split(':').nth(1) { subnet = Some(v.trim().to_string()); }
        } else if line.contains("Default Gateway") {
            if let Some(v) = line.split(':').nth(1) {
                let v = v.trim();
                if v.parse::<Ipv4Addr>().is_ok() { gateway = Some(v.to_string()); }
            }
        }
    }
    flush(&mut out, &name, &mut ipv4, &mut subnet, &mut gateway);
    out
}

fn same_subnet(ip: Ipv4Addr, target: Ipv4Addr, mask: Ipv4Addr) -> bool {
    u32::from(ip) & u32::from(mask) == u32::from(target) & u32::from(mask)
}

fn tcp_open(host: &str, port: u16, timeout_ms: u64) -> bool {
    let Ok(ip) = host.parse::<IpAddr>() else { return false; };
    TcpStream::connect_timeout(&std::net::SocketAddr::new(ip, port), Duration::from_millis(timeout_ms)).is_ok()
}

#[tauri::command]
fn list_network_adapters() -> Vec<NetworkAdapter> { parse_ipconfig() }

#[tauri::command]
fn diagnose_network(pds_ip: String, broker_host: String, broker_port: u16) -> NetworkDiagnostic {
    let target = pds_ip.parse::<Ipv4Addr>().ok();
    let selected = target.and_then(|target| parse_ipconfig().into_iter().find(|a| {
        match (a.ipv4.parse::<Ipv4Addr>(), a.subnet.parse::<Ipv4Addr>()) {
            (Ok(ip), Ok(mask)) => same_subnet(ip, target, mask),
            _ => false,
        }
    }));
    let same = selected.is_some();
    let pds_ok = target.map(|_| tcp_open(&pds_ip, 80, 800)).unwrap_or(false);
    let broker_ok = tcp_open(&broker_host, broker_port, 400);
    let mqtt_target = selected.as_ref().map(|a| format!("{}:{}", a.ipv4, broker_port));
    let detail = if target.is_none() { "Invalid PDS IPv4 address" }
        else if !same { "No active PC IPv4 adapter is on the PDS subnet" }
        else if !pds_ok { "PDS subnet is valid, but controller web interface is not reachable" }
        else if !broker_ok { "PDS is reachable; MQTT broker is not running" }
        else { "Network and broker are ready" }.to_string();
    NetworkDiagnostic { pds_ip, adapter: selected, same_subnet: same, pds_reachable: pds_ok, broker_reachable: broker_ok, mqtt_target, detail }
}

#[tauri::command]
fn start_local_broker(state: State<AppDb>, port: u16) -> Result<String, String> {
    if tcp_open("127.0.0.1", port, 300) { return Ok(format!("Broker already running on 127.0.0.1:{port}")); }
    let mut guard = state.broker.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.as_mut() {
        if child.try_wait().map_err(|e| e.to_string())?.is_none() { return Ok("Broker process is already starting".into()); }
    }
    let candidates = [r"C:\Program Files\Mosquitto\mosquitto.exe", r"C:\Program Files (x86)\Mosquitto\mosquitto.exe"];
    let exe = candidates.iter().find(|p| std::path::Path::new(p).exists()).ok_or("Mosquitto was not found. Install Mosquitto or configure an existing broker.")?;
    let dir = std::env::var("LOCALAPPDATA").map(std::path::PathBuf::from).unwrap_or_else(|_| std::env::temp_dir()).join("SHR_PDS_Monitor");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let config = dir.join("mosquitto-monitor.conf");
    std::fs::write(&config, format!("listener {port} 0.0.0.0\nallow_anonymous true\n")).map_err(|e| e.to_string())?;
    let child = Command::new(exe).arg("-c").arg(config).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|e| e.to_string())?;
    *guard = Some(child);
    Ok(format!("Starting local broker on 0.0.0.0:{port}"))
}

#[tauri::command]
fn replace_derived(state: State<AppDb>, dump: DerivedDump) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    db::replace_derived(&conn, &dump).map_err(|err| err.to_string())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir().expect("app data directory");
            std::fs::create_dir_all(&dir).ok();
            let conn = db::open(&dir.join("pds-monitor.sqlite")).expect("open sqlite");
            app.manage(AppDb {
                conn: Arc::new(Mutex::new(conn)),
                log_dir: dir,
                mqtt: Mutex::new(MqttRuntime::new()),
                broker: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![configure_mqtt, insert_raw, list_raw, replace_derived, list_network_adapters, diagnose_network, start_local_broker])
        .run(tauri::generate_context!())
        .expect("error while running SHR PDS Monitor");
}
