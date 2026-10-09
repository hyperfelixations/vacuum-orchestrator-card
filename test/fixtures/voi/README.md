# Vacuum Orchestrator API V3 fixtures

These fixtures describe the wire contract of the
[Vacuum Orchestrator](https://github.com/hyperfelixations/vacuum-orchestrator) integration,
API version 3, unreleased integration state after source commit `c2682ca`.

| File | Source |
|---|---|
| `recordings/` | The integration's recordings (`tests/contract/recordings`, API version 4) and `provenance.json`, copied by `npm run sync:voi`; see TESTING.md "Recordings". They replace these API V3 fixtures once the card speaks API version 4. |
| `api_v3_job.json` | Verbatim copy of the integration's consumer fixture `tests/fixtures/contracts/api_v3_job.json`, verified there against the real WebSocket handler. Additive fields are permitted. |
| `exceptions.js` | Verbatim copy of the `exceptions` messages in the integration's `translations/en.json` and `translations/de.json`. |
| `wire.js` | Builders derived from the integration's serializers: `api/presentation.py` (job, readiness, queue page), `api/room_presentation.py` and `infrastructure/room_codec.py` (room), `api/configuration.py` (robots, candidates, templates, history runs, trace page, job execution, job preview), `diagnostics.py`, `api/websocket.py` (subscription event) and Home Assistant's own `manifest/get`, `config/entity_registry/list` and error frames. |

`test/contract/voi-fixtures.test.js` keeps `wireJob()` a superset of `api_v3_job.json` and
checks every builder against the card's response guards. When the integration changes its
serializers, update the builders here first; the card's guards and normalizers then show
every affected place.
