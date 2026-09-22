# SHR PDS Monitor Implementation Plan

## Phase 1 - Application foundation

Create:
- Tauri desktop shell
- React + TypeScript frontend
- local settings
- SQLite database initialization
- four-page navigation
- dark industrial dashboard layout

Pages:
1. Raw Data
2. Live Map
3. Daily Summary
4. Warning & Hazard Report

## Phase 2 - MQTT and evidence recording

Implement:
- MQTT connection to configurable broker
- defaults: `127.0.0.1:1884`
- subscription: `#`
- reconnect logic
- connection indicator
- raw SQLite persistence
- optional daily JSONL log
- CSV / JSONL export

Raw ingestion must work even when decoding fails.

## Phase 3 - Replay mode

Recorded MQTT data must be replayable through the exact same ingestion/decoder/event pipeline.

Replay speeds:
- 1x
- 2x
- 5x
- 10x
- maximum

Replay exists so development can continue without physical PDS hardware.

## Phase 4 - Decoder

Implement confirmed / strongly validated fields first:
- Controller ID
- timestamp
- controller firmware
- Input 1
- Input 2 / Parking Brake Release
- Feedback Stop
- generator IDs
- generator firmware
- PAD encoded identifier
- PAD display identifier
- PAD firmware
- PAD battery
- PAD state

Leave unknown fields visible/raw.

## Phase 5 - Live Map

Use machine assets instead of generic rectangles.

### Shuttle Car
- top-down asset
- rear Silent zone
- logical Monitor, Warning and Hazard zones
- machine body/status green when Parking Brake Release OFF
- blue when Parking Brake Release ON
- show four generator statuses

### Continuous Miner
- top-down asset
- two Silent zones
- tail orientation toward Shuttle Car
- appears when one or more Silent PADs are detected

### PADs
For every active detected PAD show:
- PAD ID
- state
- battery
- last seen
- time in current state
- previous state

Do not imply precise personnel coordinates. Position PAD markers logically inside their current zone.

## Phase 6 - Event analytics

Generate events only from state transitions.

Store:
- event ID
- controller ID
- PAD IDs
- start
- end
- duration
- from state
- to state
- complete relevant state sequence
- Parking Brake Release state
- PDS state
- generator state snapshot
- references to raw MQTT evidence

## Phase 7 - Reports

### Daily Summary
Show:
- Warning event count
- Hazard event count
- unique PADs
- PADs entering Warning
- PADs entering Hazard
- Silent -> Warning count
- Silent -> Warning -> Hazard count
- total Warning duration
- total Hazard duration
- longest Warning
- longest Hazard

### Warning & Hazard Report
Chronological detail:
- PAD ID
- controller
- event type
- start
- end
- duration
- state journey
- Parking Brake Release
- PDS state
- generator health
- raw MQTT drill-down

Support date/controller/PAD/event filters and CSV export.

## Phase 8 - Field validation

When physical system access is available:
- validate Parking Brake Release mapping
- validate generator Low Voltage mapping
- validate generator Communications Error mapping
- validate exact PDS Warning/Hazard fields
- confirm Silent-zone behavior
- record controlled test datasets

Keep raw captures as permanent regression fixtures.
