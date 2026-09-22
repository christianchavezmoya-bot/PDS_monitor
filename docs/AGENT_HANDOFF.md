# Coding Agent Handoff

Build a standalone Windows application named **SHR PDS Monitor**.

## Hard constraints
- This is independent from N-Go.
- Do not import or modify N-Go.
- No cloud backend.
- No remote application server.
- No database server.
- No Internet requirement at runtime.
- Preserve all raw MQTT data before decoding.

## Preferred stack
- Tauri
- React
- TypeScript
- SQLite

## MQTT defaults
- Host: 127.0.0.1
- Port: 1884
- Subscribe: #

Settings must be configurable.

## UX
Create four pages:
1. Raw Data
2. Live Map
3. Daily Summary
4. Warning & Hazard Report

Use the dark industrial visual direction from the supplied concept.

The Live Map must use replaceable machine assets:
- Shuttle Car: one rear Silent zone
- Continuous Miner: two Silent zones
- Continuous Miner tail always faces Shuttle Car in the logical visualization

Do not use plain machine rectangles in the finished Live Map.

## Safety/data rules
- Distinguish reported / decoded / derived data.
- Do not guess unknown safety-related MQTT fields.
- Keep generator Low Voltage and Communications Error decoding provisional until validated.
- PAD state transitions are events; repeated packets are not.
- Never claim exact PAD physical coordinates unless a future data source proves them.

## Known PAD state mapping
- 0 = ID/no active zone
- 1 = Monitor
- 2 = Silent
- 4 = Warning
- 5 = Hazard

## Initial delivery order
1. scaffold project
2. SQLite schema
3. MQTT ingestion
4. raw recorder
5. replay engine
6. four-page shell
7. confirmed decoder
8. Live Map
9. event engine
10. reports

Use test fixtures and replay so the UI can be developed without live hardware.
