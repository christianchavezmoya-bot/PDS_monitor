# SHR PDS Monitor

Standalone Windows application for monitoring Strata SHR / PDS MQTT telemetry.

## Goals

- No cloud backend or external server
- Local MQTT connection (default: 127.0.0.1:1884)
- Subscribe to all topics (`#`)
- Preserve every raw MQTT message
- Decode known controller / generator / PAD data
- Interactive live machine map
- Daily warning/hazard analytics
- Warning & hazard interaction reporting
- Replay recorded MQTT data without physical hardware

## Target stack

- Tauri
- React
- TypeScript
- SQLite
- Local MQTT client

## Planned application pages

1. Raw Data
2. Live Map
3. Daily Summary
4. Warning & Hazard Report

## Important design rules

- Raw MQTT evidence is stored before decoding.
- Unknown fields are preserved and shown, never silently guessed.
- Reported, decoded, and derived/inferred data are separated.
- PAD state transitions are treated as events; repeated MQTT packets are not separate events.
- Exact physical PAD position is not inferred from zone state.
- Continuous Miner is shown as logical Silent-zone context when one or more Silent PADs are active.
- Generator Low Voltage / Communications Error mappings remain provisional until field validation.

See `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/FIELD_MAPPINGS.md`, and `docs/DECISIONS.md`.

## Run on Windows

Requirements for the desktop app:

- Windows 10 or 11 with WebView2 (already present on current Windows 10/11)
- Node.js 20 or newer
- Rust with the MSVC toolchain (`rustup` default host `x86_64-pc-windows-msvc`) and Visual Studio Build Tools with the C++ workload
- Mosquitto, or another broker, listening on `127.0.0.1:1884` if you want live hardware data. The app does not start the broker and does not need the Internet once it is installed.

```text
npm install
npm test
npm run dev
```

`npm run dev` opens the UI at `http://127.0.0.1:1420`. Use **Replay site visit** to play the 22 Sept capture through the decoder and reports. Add `?demo=1` to start that replay immediately. `?page=summary` or `?page=report` opens those screens.

```text
npm run tauri:dev
npm run tauri:build
```

The installer is written to `src-tauri/target/release/bundle/nsis/`. The SQLite file and optional daily JSONL logs are created in the per-user app data folder for `com.shr.pdsmonitor`.

In the desktop app, set the broker host, port, and topic on Raw Data. Defaults are `127.0.0.1`, `1884`, and `#`. Every accepted MQTT message is written to SQLite before it is decoded.

## Known limitations

- Generator Low Voltage and Communications Error are not decoded.
- Feedback Stop is shown as not validated.
- The map is a logical zone view, not a survey of PAD positions.
- Browser preview does not connect to MQTT. Live subscribe is part of the Tauri shell.
- This machine image did not include Rust or the MSVC linker at the time of the first POC build, so the NSIS package has to be produced after that toolchain is installed.

## Still needs the next physical PDS test

- Confirm Feedback Stop's MQTT index on `proximity/1`.
- Confirm which raw generator fields mean Low Voltage and Communications Error. Do not assume `100` versus `1023` on `proximity/0` until that test.
- Confirm whether the display label "Warning 2" is PAD state 4 or another code that was not present in the 22 Sept capture.
- Confirm Parking Brake Release polarity on the machine (this build treats Input 2 value 1 as ON / blue and 0 as OFF / green, matching the display column and the colour rule).
- Record a controlled session that includes each sequence: Monitor → Warning, Monitor → Warning → Hazard, Monitor → Warning → Monitor, Silent → Warning, Silent → Warning → Hazard. Keep the raw capture as a fixture.
