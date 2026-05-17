# Multi-State Checkboxes

Switch Obsidian checkboxes between customizable statuses via click, keyboard shortcut, or context menu.

## Features

- Define your list of checkbox statuses (e.g. `[ ]` not started, `[/]` in progress, `[x]` complete, `[-]` cancelled).
- Customize how your editor cycles between them.
- Transition between checkbox statuses on click:
  - **Left-click** to cycle to the next status.
  - **Right-click** to pick a status from the context menu.
- Define keyboard shortcuts using the provided editor commands:
  - **Cycle to next status**
  - **Cycle to previous status**
  - **Set status: …** (one command per defined status)

## Installation

### From Obsidian's Community Plugins (recommended)

1. Open **Settings → Community plugins** in Obsidian.
2. Make sure **Restricted mode** is off.
3. Click **Browse**, search for **Multi-State Checkboxes**, and click **Install**.
4. After installing, click **Enable**.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [GitHub release](https://github.com/wolfm/obsidian-multi-state-checkboxes/releases).
2. Copy them into your vault under `<vault>/.obsidian/plugins/multi-state-checkboxes/` (create the folder if it does not exist).
3. Reload Obsidian, then enable **Multi-State Checkboxes** under **Settings → Community plugins**.

## Usage

1. Open the plugin's settings tab (**Settings → Multi-State Checkboxes**) to define your list of checkbox statuses. Each status has a single character (the value inside the brackets, e.g. `/`, `x`, `-`) and a label.
2. In any note, place your cursor on a checkbox line (or click a rendered checkbox) and:
   - **Left-click** a checkbox to cycle it to the next status.
   - **Right-click** a checkbox to pick a specific status from the context menu.
   - Use the **Cycle to next status** / **Cycle to previous status** commands from the Command Palette, or bind them to hotkeys under **Settings → Hotkeys**.
   - Use a **Set status: …** command to jump directly to a specific status.
3. Set custom keyboard shortcuts for any of the above commands

### Example

With statuses configured as `[ ]` → `[/]` → `[x]` → `[-]`, repeatedly cycling a line like:

```
- [ ] Write the README
```

will step through all the configured states:

```
- [/] Write the README
- [x] Write the README
- [-] Write the README
- [ ] Write the README
```

Once we arrive at the initial state, the cycle simply starts again.

## Requirements

Requires a theme that styles multi-state checkboxes — many popular themes do, including:

- [Minimal](https://github.com/kepano/obsidian-minimal)
- [Things](https://github.com/colineckert/obsidian-things)
- [AnuPpuccin](https://github.com/AnubisNekhet/AnuPpuccin)
- [Cupertino](https://github.com/aaaaalexis/obsidian-cupertino)

Without a supporting theme the checkbox character still cycles in the source, but won't render with a distinct visual.
