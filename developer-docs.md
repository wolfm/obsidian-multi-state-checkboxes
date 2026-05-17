# Developer docs

Notes for working on this plugin.

## First-time setup

1. `npm install --legacy-peer-deps`
2. Symlink the repo into your test vault so changes show up live:
   ```sh
   ln -s "$(pwd)" ~/path/to/vault/.obsidian/plugins/multi-state-checkboxes
   ```

> [!NOTE]
> Use the [Hot-Reload](https://github.com/pjeby/hot-reload) plugin to auto-relaod on rebuild

## Planned work

- **Mobile support.** Currently ships with `isDesktopOnly: true`; tap-to-cycle should work on touch, but it hasn't been tested. Before flipping, verify:
  - Right-click context menu opens via long-press and is dismissable
  - Settings drag-and-drop reorder works (likely broken on touch; may need a fallback or `sortablejs`)
  - `mousedown` capture handler wins the race vs. Obsidian's native toggle on touch (may need `touchstart`/`pointerdown`)
  - Settings hit-targets are reasonable at phone density
- **Multiple cycles** Define multiple cycles
- **Enable / disable custom cycle** Ability to turn off the custom cycle in settings
- **Document specific cycle enabled/disabled** - Enable
  - For example, on my lists of tasks, I want a cusotm cycle with todo, in progess, complete. But on my grocery list, I just wanted checkboxes

## Releasing

### Per-release: cut a new version

1. Ensure build and test both succeed

   ```sh
   npm test
   npm run build
   ```

2. Bump the version (updates `package.json`, `manifest.json`, and `versions.json` in lockstep via the `version` lifecycle script, then commits + tags):

   ```sh
   npm version patch   # or `minor` / `major`
   ```

3. Push commit + tag:

   ```sh
   git push --follow-tags
   ```

The [release workflow](.github/workflows/release.yml) auto-runs on tag push. It checks that build and test succeed, then it creates a public Github release.
