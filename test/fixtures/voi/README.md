# Vacuum Orchestrator API V2 fixtures

These fixtures describe the wire contract of the
[Vacuum Orchestrator](https://github.com/hyperfelixations/vacuum-orchestrator) integration,
API version 2, integration version 0.1.0, source commit `739ca68`.

| File | Source |
|---|---|
| `api_v2_job.json` | Verbatim copy of the integration's consumer fixture `tests/fixtures/contracts/api_v2_job.json`, verified there against the real WebSocket handler. Additive fields are permitted. |
| `wire.js` | Builders derived from the integration's serializers: `api/presentation.py` (job, readiness, queue page), `api/room_presentation.py` and `infrastructure/room_codec.py` (room), `api/configuration.py` (robots, candidates, templates, history runs, trace page, job execution), `diagnostics.py`, `api/websocket.py` (subscription event) and Home Assistant's own `manifest/get`, `config/entity_registry/list` and error frames. |

`test/contract/voi-fixtures.test.js` keeps `wireJob()` a superset of `api_v2_job.json` and
checks every builder against the card's response guards. When the integration changes its
serializers, update the builders here first; the card's guards and normalizers then show
every affected place.
