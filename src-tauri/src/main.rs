#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod mqtt;

use db::{DerivedDump, MqttSettings, RawMessage, RawQuery};
use mqtt::MqttRuntime;
use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

struct AppDb {
    conn: Arc<Mutex<Connection>>,
    log_dir: std::path::PathBuf,
    mqtt: Mutex<MqttRuntime>,
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
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![configure_mqtt, insert_raw, list_raw, replace_derived])
        .run(tauri::generate_context!())
        .expect("error while running SHR PDS Monitor");
}
