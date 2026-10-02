# Vacuum Orchestrator Card

A custom dashboard card for [Home Assistant](https://www.home-assistant.io/)
that shows and controls the
[Vacuum Orchestrator](https://github.com/hyperfelixations/vacuum-orchestrator)
integration: its cleaning queue, rooms, robots, templates and history. The card
follows your dashboard's light or dark theme.

## Features

- The cleaning queue at a glance: start, pause and resume it, reorder waiting
  jobs, start one right away, cancel, retry, edit or delete jobs
- For every waiting job, whether it can start and what it is waiting for
- Room cards with vacuum and mop due bars, the last cleaning and one-tap release
  or lock
- Robot cards with live state, battery, capabilities, reachable rooms and map
- Templates for recurring jobs, a history of jobs and cleaning runs, and a
  diagnostics view
- A guided start, from installing the integration to your first job
- Tabs you choose and order through `views:`, and the `show:` block for the
  parts around them
- Made for phones and touch screens as well as for the desktop
- English and German, following your Home Assistant language setting

## What you need

- **Home Assistant 2026.9 or newer.**
- **The Vacuum Orchestrator integration**, installed and set up. Without it the
  card shows how to get it.
- **An administrator account to change anything.** Other users see the card
  read-only.
- **A current browser.** The layout uses CSS container queries, so any currently
  supported version of Chrome, Edge, Firefox, or Safari.

## Installation

There is no published release yet. Build the card from source as described in
[TESTING.md](TESTING.md), then:

1. Copy `dist/vacuum-orchestrator-card.js` into your Home Assistant `www/`
   folder.
2. Add it as a dashboard resource: Settings → Dashboards → the three-dot menu →
   **Resources** → add `/local/vacuum-orchestrator-card.js` as a JavaScript
   module.
3. Add a card with `type: custom:vacuum-orchestrator-card` to a dashboard.

## Quickstart

The card picker knows this card: start from **Add card** and pick
**Vacuum Orchestrator Card**. In YAML, this is all you need:

```yaml
type: custom:vacuum-orchestrator-card
```

The card then leads you to a working setup:

1. **Vacuum Orchestrator is not installed** — follow the three steps on the card,
   or **Installation guide**.
2. **Installed but not set up** — **Set up integration** opens Home Assistant's
   dialog for adding it.
3. **Could not start** — **Open integration** shows Home Assistant's error for
   it.
4. **No robot or room yet** — the **Setup** tab lists four steps: add a robot,
   assign rooms to a robot, release rooms for cleaning, create the first job.
   It is shown until a robot and a room it reaches exist.

See [Configuration](#configuration) below for every available option.

## Configuration

Everything is optional — leave an option out and you get the default. A value
the card cannot use gets the default too, and a warning under the header names
it.

> **A misspelled option name stops the card.** The message names the option and
> suggests the right spelling, for example `start_veiw` → `start_view`.

### Top-level options

| Option | Default | What it does |
| --- | --- | --- |
| `title` | `Cleaning` | Sets the card title and what happens when it is too long. `title: ""` removes the line. See [The two header lines](#the-two-header-lines). |
| `subtitle` | automatic | Sets the line under the title, in the same shape. Left out, it says what is going on: the job in progress, how many jobs wait, what needs attention. `subtitle: ""` removes the line. |
| `icon` | `mdi:robot-vacuum` | Sets the header icon to any `mdi:*` icon. |
| `accent_line` | `top` | Places the colored accent line along the `top` or `bottom` edge of the card. |
| `language` | `auto` | Sets the language to `en` or `de`. `auto` follows your Home Assistant language. |
| `show` | every part | Chooses the parts of the card around the views. See [What the card shows](#what-the-card-shows). |
| `views` | automatic | Chooses which views appear, in which order, with which options. See [Views](#views). |
| `start_view` | first available view | Sets the view the card opens on. If that one is not available, the first available view is used. |
| `page_size` | `25` | Sets how many jobs or history entries one page shows, from `5` to `100`. |
| `time_format` | `auto` | Shows times as `relative` (“3 hours ago”), `absolute` (date and time), or `auto`: relative within a day, absolute beyond. |
| `confirm_destructive` | `true` | Asks before cancelling or deleting a job, deleting a template or robot, and excluding a room. |

```yaml
title: Downstairs
icon: mdi:home-floor-0
page_size: 20
time_format: absolute
```

### What the card shows

Use `show:` to fit the card to your dashboard. Each entry controls one layout
part; omitted entries use the defaults shown below.

```yaml
show:
  panel: false
  pill: false
```

| Part | Default | What it is |
| --- | --- | --- |
| `accent_line` | `true` | The colored bar along the edge selected by the top-level `accent_line` option. |
| `icon` | `true` | The icon in the top left. |
| `title` | `true` | The card title. |
| `subtitle` | `true` | The line under the title. |
| `pill` | `true` | The status label in the top right — “Cleaning”, “Not installed”, and so on. |
| `warnings` | `true` | The block under the header that names a problem with the configuration or the integration. |
| `panel` | `true` | The block with the number of waiting jobs, the queue run and the robots. |
| `queue_controls` | `true` | The start, pause or resume button in that block. |
| `tabs` | `auto` | The tab row. `auto` shows it when there are at least two views; `true` always shows it; `false` never does. |
| `unavailable_views` | `true` | Shows views the installed integration does not offer as dimmed tabs. |

### Views

| View | What it shows | Shown without `views:` |
| --- | --- | --- |
| `setup` | The four setup steps with the next action. | While the setup is unfinished |
| `queue` | The queue run, jobs in progress and needing attention, the waiting jobs in order, and shortcuts to create a job from a template. | Always |
| `rooms` | Room cards: due bars, last cleaning, release, reaching robots and conditions. | Always |
| `robots` | Robot cards: live state, battery, capabilities, reachable rooms and map. | Always |
| `templates` | Templates for recurring jobs. | Always |
| `history` | Finished jobs and recorded cleaning runs. | Always |
| `diagnostics` | Connection, versions, the setup checklist and the integration's event trace. | When something needs a look |
| `settings` | How long a queue run waits for new work before it ends, and the versions of the integration and the card. | For administrators |

A string and an object without `enabled` both switch a view on:

```yaml
views:
  - queue
  - rooms
  - history
```

Use the object form to set `enabled` or `options`:

```yaml
views:
  - queue
  - type: rooms
    options:
      sort: due
  - type: diagnostics
    enabled: auto
```

`enabled` accepts `true`, `false`, or `auto`. Leaving it out means `true`;
`auto` follows the last column of the table above. `settings` with
`enabled: true` appears for every user, read-only for those who are not
administrators.

Once you write a `views:` section, it is the full list: the card shows exactly
those views, in exactly that order, and adds nothing on its own.

#### View-specific options

Options belong inside the corresponding `views:` entry.

| View | Option | Values | Default | Effect |
| --- | --- | --- | --- | --- |
| `queue` | `show_active` | `true` / `false` | `true` | Shows the jobs in progress. |
| `queue` | `show_attention` | `true` / `false` | `true` | Shows the jobs that need attention. |
| `queue` | `show_templates` | `true` / `false` | `true` | Shows the template shortcuts below the queue. |
| `rooms` | `sort` | `configured` / `name` / `due` | `configured` | Orders the rooms as configured in the integration, by name, or most due first. |
| `rooms` | `show_disabled` | `true` / `false` | `false` | Shows the rooms excluded from cleaning. |
| `robots` | `show_map` | `true` / `false` | `true` | Shows the robot's map, when it has one. |
| `robots` | `show_capabilities` | `true` / `false` | `true` | Shows the suction, water and route levels the robot offers. |
| `history` | `source` | `jobs` / `runs` / `both` | `both` | Shows finished jobs, recorded cleaning runs, or both with a switch between them. |
| `diagnostics` | `show_trace` | `true` / `false` | `true` | Shows the integration's event trace. |

`setup`, `templates` and `settings` have no options.

```yaml
views:
  - type: queue
    options:
      show_templates: false
  - type: history
    options:
      source: runs
```

### The two header lines

Both lines take the same four shapes:

```yaml
title: Downstairs
subtitle: Ground floor robots
```

```yaml
subtitle: wrap
```

```yaml
subtitle:
  text: Ground floor robots
  overflow: wrap
```

```yaml
title: ""
```

`overflow: wrap` lets a line run onto as many lines as it needs; `clip` cuts it
off with an ellipsis. The title wraps by default, the subtitle clips. Writing
`clip` or `wrap` on its own sets the overflow; to use either word as the text,
use the block form: `title: {text: wrap}`.

An empty string removes the line entirely, and so does `show: {title: false}`.

### Full example

Several cards side by side work well, for example one per floor with its own
views.

```yaml
type: custom:vacuum-orchestrator-card
title: Downstairs
icon: mdi:home-floor-0
accent_line: bottom
language: auto
page_size: 20
time_format: absolute
confirm_destructive: true

show:
  pill: false
  tabs: auto
  unavailable_views: false

start_view: queue
views:
  - type: queue
    options:
      show_attention: true
      show_templates: false
  - type: rooms
    options:
      sort: due
      show_disabled: false
  - type: robots
    options:
      show_map: false
  - templates
  - type: history
    options:
      source: both
  - type: diagnostics
    enabled: auto
  - type: settings
    enabled: auto
```

### Styling with card-mod

With [card-mod](https://github.com/thomasloven/lovelace-card-mod) installed,
style the card through `ha-card`:

```yaml
card_mod:
  style: |
    ha-card {
      border: none;
    }
```

## Known limitations

- The visual editor covers `title`, `subtitle`, `start_view` and `language`;
  `views:` and `show:` are YAML.
- The integration's own options and logs are on its page in Home Assistant:
  Settings → Devices & services → Vacuum Orchestrator.
- The card is available in English and German.

## Troubleshooting

**The card doesn't appear after installing.**
Confirm the dashboard resource was added (Settings → Dashboards → the three-dot
menu → **Resources**) and points at the right path as a JavaScript module, then
hard-reload the browser (see below).

**Changes don't show up, or the card looks outdated after an update.**
Browsers cache dashboard resources. Hard-reload the dashboard tab
(Ctrl+Shift+R / Cmd+Shift+R), or clear the browser cache for your Home
Assistant URL.

**"Custom element doesn't exist: vacuum-orchestrator-card".**
Check the card's `type:` — it must be exactly
`custom:vacuum-orchestrator-card` (the `custom:` prefix is required), and the
resource must have loaded without a console error.

**A button is greyed out.**
Point at it with the mouse: its tooltip says why. Changes need an administrator
account.

**“This card does not support the installed version.”**
The installed integration is newer than this card. Update the card.

**A tab is dimmed.**
The installed integration does not offer that view. Update the integration, or
hide such tabs with `show: {unavailable_views: false}`.

**Something broke after updating the card.**
Hard-reload the dashboard first. If the problem persists, or the card says it
could not be drawn, open the **Diagnostics** tab and your browser's developer
console and check for an error message before reporting it.

If none of this helps, please open a
[GitHub issue](https://github.com/hyperfelixations/vacuum-orchestrator-card/issues)
and include:

- your Home Assistant version;
- the card version (shown in the **Settings** tab; without it, open your browser's
  developer console, type `vacuumOrchestratorCardVersion`, and press Enter);
- the Vacuum Orchestrator version (shown in the **Settings** and
  **Diagnostics** tabs);
- your browser and its version;
- the relevant part of your card's YAML configuration;
- the exact warning shown by the card, if any;
- any error message from the browser console.

## Links

- [Vacuum Orchestrator](https://github.com/hyperfelixations/vacuum-orchestrator)
  — the integration this card controls
- [Issues](https://github.com/hyperfelixations/vacuum-orchestrator-card/issues)
- [License](LICENSE) (MIT)
- [Testing](TESTING.md) — how the card is tested, and how to run any part of it
