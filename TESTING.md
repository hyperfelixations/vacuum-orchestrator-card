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

## Development bundle

```sh
npm run build:dev
```

The development bundle has a separate filename and global version identity:
`vacuum-orchestrator-card-dev.js` and
`vacuumOrchestratorCardDevVersion`. It must never overwrite the production
bundle or its production version global.

## The browser harness

`test/fixtures/harness.html` reproduces the page the card is rendered on in
Home Assistant, because a screenshot is only worth as much as the environment
it was taken in:

- Home Assistant's default-theme custom properties, in light and in dark. The
  card derives every colour from them and sets none of its own.
- Roboto, self-hosted from `test/fixtures/fonts/`. The card inherits its font
  from the host, so text metrics decide every wrap and column width.
- `ha-card` and `ha-icon` as registered custom elements
  (`test/fixtures/ha-stubs.js`). An undefined `ha-card` would default to
  `display: inline`, which cannot be a size container, and every container
  query in the card would silently stop matching.
- `#stage`, a 40 px gutter around the card, so the screenshot contains the
  card's shadow and some page background instead of a tight crop.

Browser runs pin the clock to a fixed instant and the browser to UTC, so a
golden does not change with the day or the machine it is recorded on.

## Golden and baseline files

Characterization output is updated only deliberately:

```sh
npm run characterize:update
npm run baseline:anchor
```

Golden screenshots are re-recorded with Playwright:

```sh
npx playwright test --project=chromium --update-snapshots
```

Review generated changes manually before committing: open every changed image
and confirm it shows what the test claims. Do not update a baseline or a golden
to hide a failing assertion.
