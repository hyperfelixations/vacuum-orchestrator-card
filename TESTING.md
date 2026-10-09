# Testing

This repository is tested in layers. The commands below are intended to run
from the repository root with the project Node version.

## Install and build

```sh
npm ci
npm run build
```

`dist/` is generated output and is intentionally ignored by Git. The
production bundle is an IIFE with no static runtime dependencies.

## Checks

Run the fast checks first, then the complete suite:

```sh
npm run build
npm run check:run
npm run test:node
npm run test:unit
npm run test:component
npm run test:contract
npm run test:architecture
npm run test:characterization
npm run test:property
npm run test:browser
npm run test:browser:cross-engine:run
npm test
npm run coverage
```

The browser suite uses Playwright. If a browser executable is not installed,
install the supported browsers once with:

```sh
npm run test:install
```

`npm test` builds the production artifact first and then runs the Node,
component, contract, architecture, characterization, property, and browser
suites. A browser test uses the generated bundle through the local static test
server; it does not import source modules directly.

Browser specs are grouped into `core`, `accessibility`, `interaction`,
`geometry`, and `visual`. Chromium runs every group; Firefox and WebKit run
`core` (projects `firefox-core` and `webkit-core`). `test/helpers/playwright.js` records Chromium V8
coverage for every group during `npm run coverage`. The coverage runner uses
unit, bundle, contract/property/characterization, and browser layers; it
checks source inventory, actual bundle execution, and the merged quality floor.
It restores the ordinary bundle after the measurement build.

## Release preparation

The manual Release Candidate workflow accepts
the exact package version, the full SHA of any commit in the history of `main`,
and a stable or development release kind. A stable version must be higher than
every published stable version, and every earlier stable release must be an
ancestor of the approved commit. The workflow audits the dependencies (see
[Dependency security](#dependency-security)), builds the bundle from the approved
commit, runs the complete Node suite and an extended property sweep, records the
baseline anchor and bundle SHA-256, and uploads the candidate. Browser tests
download and verify that same bundle. Once a stable release is published,
official HACS validation must pass before the workflow can create an
unpublished GitHub draft with the tested asset and checksum; HACS cannot
validate a repository that has neither a stable release nor a committed bundle,
so until a stable release exists the check is skipped and the Validate workflow
is run manually after that release is published. Publishing the draft remains a separate
owner action. `dist/` is never committed.

## README image

`npm run readme:image` builds the card and records `vacuum-orchestrator-card.png`: the queue
of the typical household on the test harness, light and dark side by side, with the fixed
clock of the goldens. No test compares it; look at the picture before committing it.

## Dependency security

```sh
npm run check:security
```

The check runs two audits against the installed lockfile:

| Audit | Fails on |
| --- | --- |
| `npm audit --omit=dev --audit-level=low` | any advisory against a runtime dependency |
| `npm audit signatures` | a package without a valid registry signature |

The card has no runtime dependencies today, so the first audit guards the
moment one is added. Build and test tooling does not ship: an advisory against
it does not change the bundle and does not stop CI or a release. GitHub reports
it through Dependabot alerts, and Dependabot opens a pull request for each
security advisory. The Security workflow runs the check on every push and pull
request and weekly, and the Release Candidate workflow runs it before the
build. Dependabot proposes npm and action updates weekly.

An `overrides` entry only raises a transitive package that is in the lockfile
to a caret minimum such as `^6.16.0`, for a fix its parent does not yet allow.
An exact pin is rejected: it holds a package on a vulnerable version after its
fix ships. Every workflow action is pinned to a full commit SHA with its
version as a comment, and Dependabot moves both together. The one exception is
`hacs/action@main`: it publishes no releases to follow and runs only in jobs
without permissions, where it reaches neither the repository nor its secrets.
`test/architecture/dependency-security.test.js` enforces all of this.

## Development bundle

```sh
npm run build:dev
```

The development bundle has a separate filename and global version identity:
`vacuum-orchestrator-card-dev.js` and
`vacuumOrchestratorCardDevVersion`. It must never overwrite the production
bundle or its production version global.

## Recordings

`test/fixtures/voi/recordings/` holds what the Vacuum Orchestrator integration
recorded in its own repository (`tests/contract/recordings`): every message a
card exchanges with the real integration over Home Assistant's WebSocket, and
what Home Assistant's frontend gives a card as `hass`. Copy them after the
integration changed and committed its recordings:

```sh
npm run sync:voi
npm run sync:voi -- --from <checkout of the integration>
```

Without `--from` the script reads the sibling checkout `../vacuum-orchestrator`.
It writes `provenance.json` with the integration commit and the SHA-256 of
every file. `test/contract/voi-recordings.test.js` checks the files against it
and, when the sibling checkout is at that commit, against the integration's own
files.

`test/helpers/recorded-backend.js` plays a recording behind the frontend's
objects and holds no rule of the integration
(`createRecordedBackend(recording, { language, admin, formatEntityState, clock })`):

- `hass` is built as the frontend builds it from the recorded messages (states,
  entities, areas, actions, user, components) and is a new object after every
  recorded change.
- A read is answered with the integration's latest answer to the same request
  (keys sorted, transport `id` ignored) before the next change in the
  recording; a request the recording lacks fails the test and names the
  scenario to record it in.
- Commands (`call_service`, `configuration/command`) must follow the recorded
  order. Events recorded before a command's result reach the card first,
  frames after it arrive in a later task. An answer recorded after a change in
  the home arrives once that change is played.
- `until(<home change>)` plays a change in the home and what followed it,
  `play()` plays what follows without a cause, recorded `advance` steps move
  `clock`. `hold()` delays answers until its release, `disconnect()` rejects
  outstanding ones as a lost connection does.

## The browser harness

`test/fixtures/harness.html` reproduces the page the card is rendered on in
Home Assistant, because a screenshot is only worth as much as the environment
it was taken in:

- Home Assistant's default-theme custom properties, in light and in dark. The
  card derives its colours from them.
- Roboto, self-hosted from `test/fixtures/fonts/`. The card inherits its font
  from the host, so text metrics decide every wrap and column width.
- `ha-card` and `ha-icon` as registered custom elements
  (`test/fixtures/ha-stubs.js`). An undefined `ha-card` would default to
  `display: inline`, which cannot be a size container, and every container
  query in the card would silently stop matching. Like the real one, the
  `ha-card` stub declares `display: block` in its own shadow root, so the
  card's rules win over it.
- The box Home Assistant puts the card in: `mount({layout: "grid"})` places
  it in a sections grid cell of `rows · 64 − 8` px (`rows` from the mount
  option, else the card's default) and sets `card.layout` as `hui-card` does;
  `layout: "panel"` places it in a block 800 px high. Without `layout` the
  card takes its own height.
- `#stage`, a 40 px gutter around the card, so the screenshot contains the
  card's shadow and some page background instead of a tight crop.
- A fake Vacuum Orchestrator (`test/helpers/fake-orchestrator.js`) behind
  `hass`, fed from the wire builders in `test/fixtures/voi/wire.js`; named
  states such as an uninstalled integration or a read-only user come from
  `test/fixtures/scenarios.js`.

Browser runs pin the clock to a fixed instant and the browser to UTC, so a
golden does not change with the day or the machine it is recorded on. Specs
for touch use Playwright's `hasTouch`, which makes the page report a coarse
pointer; their viewport stays taller than the screenshot, because a taller
element screenshot resets the emulated device.

## Golden and baseline files

Characterization output is updated only deliberately:

```sh
npm run characterize:update
npm run baseline:anchor
```

Golden screenshots are re-recorded with Playwright:

```sh
npx playwright test test/browser/visual --project=chromium --update-snapshots=all
```

`=all` rewrites every golden; the default mode leaves an image untouched while
its difference stays within the comparison tolerance.

Review generated changes manually before committing: open every changed image
and confirm it shows what the test claims. Do not update a baseline or a golden
to hide a failing assertion.
