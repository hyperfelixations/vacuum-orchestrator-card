# Vacuum Orchestrator Card

The Vacuum Orchestrator Card is a Home Assistant custom card for the separate
Vacuum Orchestrator integration. It presents the integration's queue, jobs,
diagnostics, rooms, robots, and job editor when the corresponding backend
capabilities are available.

The card requires Home Assistant 2026.9 or newer and the Vacuum Orchestrator
integration. It remains optional; the integration is also usable through Home
Assistant actions and automations.

## Installation

The card has no published release yet and is not currently installable through
HACS. HACS validation is part of the release preparation. Installation
instructions will apply after the first release has been validated and
published. Developers can build and test the card from source as described in
[TESTING.md](TESTING.md).

The card type is:

```yaml
type: custom:vacuum-orchestrator-card
```

The empty configuration is valid and uses the first available section:

```yaml
type: custom:vacuum-orchestrator-card
```

## Configuration

All options are optional. Unknown options that belong to Home Assistant or
another frontend module are ignored. A misspelled card option is rejected with
an explanatory message.

### Header

`title` defaults to the localized title `Cleaning`/`Reinigung`. Use a string,
an empty string, `clip`, `wrap`, or an object with `text` and `overflow`.

```yaml
title:
  text: Cleaning jobs
  overflow: wrap
```

`subtitle` uses the automatic queue summary by default and accepts the same
forms as `title`. `icon` defaults to `mdi:robot-vacuum` and accepts any Home
Assistant icon name.

`accent_line` defaults to `top` and accepts `top` or `bottom`.

```yaml
accent_line: bottom
icon: mdi:robot-vacuum-outline
```

### Language and display

`language` defaults to `auto` and accepts `auto`, `en`, or `de`.
`auto` follows the Home Assistant language.

`page_size` defaults to `25` and accepts whole numbers from `5` to `100`. It
sets the default query page size for queue and history data.

`time_format` defaults to `auto` and accepts `auto`, `relative`, or `absolute`.
It selects how job timestamps are presented.

`density` defaults to `auto` and accepts `auto`, `comfortable`, or `compact`.

`confirm_destructive` defaults to `true` and controls confirmation for deleting
and canceling jobs.

```yaml
language: de
page_size: 20
time_format: absolute
density: compact
confirm_destructive: true
```

### Sections

`sections` defaults to the registered sections. A list is authoritative and
accepts `queue`, `rooms`, `robots`, `history`, and `diagnostics`; each value can
be a string or an object with `type`, `enabled`, and `options`.
`start_section` selects the initial section and defaults to the first enabled
section.

```yaml
sections:
  - queue
  - type: history
    enabled: true
start_section: queue
```

The rooms and robots sections describe their target capabilities even when the
connected backend does not provide those capabilities yet. The card shows a
localized unavailable state instead of inventing data.

### Visibility

`show` controls shell parts. Each switch defaults to `true`; `tabs` defaults to
`auto` and hides the section bar when only one section is active. The accepted
keys are `accent_line`, `icon`, `title`, `subtitle`, `pill`, `warnings`,
`stats`, `tabs`, `queue_controls`, and `unavailable_sections`.

```yaml
show:
  subtitle: true
  stats: true
  tabs: auto
  warnings: true
```

### Home Assistant actions

`tap_action` and `hold_action` default to `none`. They accept the Home Assistant
action types `more-info`, `toggle`, `perform-action`, `navigate`, `url`,
`assist`, and `none`.

```yaml
tap_action:
  action: navigate
  navigation_path: /lovelace/reinigung
hold_action:
  action: none
```

## Troubleshooting

The diagnostics section identifies a missing integration, an incompatible API,
a disconnected backend, missing capabilities, and the latest command error.
Install or load Vacuum Orchestrator and check its Home Assistant log when the
card reports that the backend is unavailable.

## License

Vacuum Orchestrator Card is licensed under the [MIT License](LICENSE).
