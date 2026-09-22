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

See `docs/ARCHITECTURE.md` and `docs/IMPLEMENTATION_PLAN.md`.
