# MQTT field mappings

Source: Centurion site visit 22 Sept 2026 (`mosquitto_sub` capture and the SHR display spreadsheets). Mappings below are the only ones the decoder treats as validated. Everything else is stored and shown as raw indexed values.

## Validated

| Topic | Index | Field | Notes |
| --- | --- | --- | --- |
| `strata/v1/proximity/3/<controller>` | 1 | Device timestamp | Unix seconds |
| same | 2 | Controller ID | Matches the topic suffix |
| same | 3 | Encoded PAD id | Display id is the lower 16 bits. 2147512536 → 28888, 2147512547 → 28899 |
| same | 4 | PAD firmware | Example `1.3.198` |
| same | 5 | PAD state | 0 ID, 1 Monitor, 2 Silent, 4 Warning, 5 Hazard |
| same | 11 | Battery volts | Example 4.20 / 4.10, matches the display Battery column |
| `strata/v1/proximity/1/<controller>` | 1 | Device timestamp | |
| same | 2 | Controller ID | |
| same | 5 | Input 1 | 0/1, matches the display Input 1 column in the overlapping capture |
| same | 6 | Input 2 / Parking Brake Release | 0 = OFF (shuttle car green), 1 = ON (shuttle car blue) |
| `strata/v1/proximity/0/<controller>` | 1 | Device timestamp | |
| same | 2 | Controller ID | |
| same | 3 | Generator ID | 312860, 312864, 312847, 312853 in this capture |
| same | 4 | Generator firmware | Example `2.3.10` |
| `strata/v1/proximity/21/<controller>` | 1 | Device timestamp | |
| same | 2 | Controller ID | |
| same | 3 | Controller firmware | Example `2.6.9` |
| same | 3 | Controller firmware | Example `2.6.9` |
| same | 11–14 | Not validated as generator IDs | On controller 311933 these match the proximity/0 generator IDs. On controller 317924 the same indexes include 323144 and 323126, which never appear in proximity/0. They stay raw. |

## Preserved and not named

- `proximity/3` indexes other than the validated set, including index 6 and the trailing counter.
- `proximity/1` indexes other than 0, 1, 2, 5 and 6. Feedback Stop is a column in the SHR display export, but this capture does not confirm which MQTT index it is.
- `proximity/0` indexes after firmware. One generator (`312864`) reported `100,100,100` while the others reported `1023,1023,1023`. That difference is kept as raw evidence. It is not labelled Low Voltage.
- `proximity/15` and `proximity/22` except timestamp and controller id.
- `strata/v1/wifi/...` full arrays.
- Any topic outside these families, and any payload that is not a JSON array.

## Explicitly not decoded

Generator Low Voltage, Communications Error, SZ Coil Low Voltage, and the SHR display "State" sentence are not mapped. `generator_events` exists in SQLite and stays empty until a controlled hardware test confirms the fields.

The SHR display sometimes shows a zone named "Warning 2". This capture's PAD state codes are only 0, 1, 2, 4 and 5. State 4 is labelled Warning. Do not invent a second warning code.
