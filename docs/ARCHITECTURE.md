# SHR PDS Monitor Architecture

## Runtime topology

```text
PDS Hardware
   |
   | MQTT
   v
Mosquitto broker (default 127.0.0.1:1884)
   |
   v
SHR PDS Monitor desktop app
   |
   +-- MQTT ingestion
   +-- Raw evidence recorder
   +-- Decoder
   +-- Live state store
   +-- Event engine
   +-- SQLite persistence
   +-- React UI
```

No cloud services, remote API server, or database server are required.

## Primary modules

### MQTT ingestion
- Connects to configurable host/port.
- Default host: `127.0.0.1`
- Default port: `1884`
- Default subscription: `#`
- Automatic reconnect.
- Emits connection-health state.

### Raw evidence recorder
Each MQTT message is persisted before decoding:
- PC receive timestamp with millisecond precision
- topic
- exact payload
- QoS
- retain flag

Decoder failures must never block raw persistence.

### Decoder
Known topic families currently include:
- `strata/v1/proximity/0/<controller>`
- `strata/v1/proximity/1/<controller>`
- `strata/v1/proximity/3/<controller>`
- `strata/v1/proximity/15/<controller>`
- `strata/v1/proximity/21/<controller>`
- `strata/v1/proximity/22/<controller>`
- `strata/v1/wifi/...`

Subscribe to `#` so future topics are not lost.

The decoder must separate:
1. Reported values
2. Decoded values
3. Derived/inferred events

### Live state engine
Maintains current state for:
- controller
- parking brake release
- PDS state
- generators
- PADs
- PAD state duration
- current active Warning/Hazard/Silent context

### Event engine
State transitions produce events. Repeated MQTT packets do not.

Examples:
- Monitor -> Warning
- Monitor -> Warning -> Hazard
- Monitor -> Warning -> Monitor
- Silent -> Warning
- Silent -> Warning -> Hazard

Each event should retain links to the raw MQTT rows that produced it.

## Data model

Minimum SQLite tables:
- `raw_mqtt_messages`
- `controllers`
- `generators`
- `pads`
- `pad_state_transitions`
- `pds_events`
- `generator_events`
- `daily_statistics`

## Visual model

### Shuttle Car
Use actual replaceable top-down machine artwork, not a rectangle.

The shuttle car has:
- PDS generators
- one Silent zone at the rear/back side
- Warning / Hazard / Monitor logical zones around the machine

Machine body/status:
- Parking Brake Release OFF -> green
- Parking Brake Release ON -> blue

### Continuous Miner
Use actual replaceable top-down machine artwork.

The Continuous Miner has:
- two Silent zones
- a tail orientation
- tail always faces the Shuttle Car in the logical map

The Continuous Miner appears when one or more active PADs are in Silent state.

This map is a logical operational representation. It must not claim exact X/Y coordinates for PADs.

## PAD states

Current validated/strong mappings:
- 0 = ID / no active zone
- 1 = Monitor
- 2 = Silent
- 4 = Warning
- 5 = Hazard

Keep mappings versioned/configurable for continued field validation.

## PAD identity

For current `proximity/3` records, the human-readable PAD identifier is derived from the lower 16 bits of the encoded MQTT device identifier. Preserve both identifiers.

## Safety-related unknowns

Generator Low Voltage and Communications Error fields are not yet sufficiently validated for hard-coded production labels. The architecture must support them, but provisional mappings must be clearly identified until field-tested.
