# Implementation decisions

## Pipeline

Live MQTT and replay both call `SessionEngine.ingest`. The decoder and event engine do not have a second copy for playback. Raw SQLite insert happens before ingest. A decode error does not roll back the raw row.

Replay uses the original receive timestamps for durations. Playback speed only changes the delay between messages. Maximum speed still runs the same ingest function, in batches, so the UI can paint.

The bundled fixture `src/fixtures/site-visit-22-sept.json` is the 22 Sept `mosquitto_sub -v` capture. That capture has no PC clock, so fixture receive time is the device Unix timestamp in milliseconds. Live messages use the PC clock.

## Events

An interaction starts when a PAD enters Warning or Hazard and ends when it leaves both. Warning followed by Hazard on the same PAD is one Hazard interaction, not two events. Repeated packets in the same state update last-seen and battery only.

Daily counts:

- Warning events: interactions that never reached Hazard
- Hazard events: interactions that reached Hazard
- Entries to Warning / Hazard: transition counts, which can both increase inside one interaction
- Durations: time spent in that state, clipped to the selected local day

## Map

Shuttle Car and Continuous Miner art is loaded from `public/machines/shuttle-car.svg` and `public/machines/continuous-miner.svg`. Replace those files to change the art. The Shuttle Car hull uses the SVG class `machine-body` so parking-brake colour still applies.

The Continuous Miner is shown only while at least one PAD is Silent. Its tail is the top of the asset and points toward the Shuttle Car. PAD chips sit in the logical zone ring. They are not coordinates.

## Desktop shell

Tauri stores raw MQTT in SQLite under the app data directory and can append a daily JSONL log. Derived tables are rewritten from the engine snapshot. `generator_events` is created and left empty.

Browser `npm run dev` can replay and export without the broker. Live subscribe runs in the Tauri process because the page cannot open a raw MQTT socket.
