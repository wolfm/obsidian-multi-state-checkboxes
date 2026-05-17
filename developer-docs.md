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

### Releasing to the community plugin store

> [!WARNING]
> **Don't perform until ready to publicly release.**

1. Make sure at least one published (non-draft) GitHub Release exists with `main.js`, `manifest.json`, `styles.css` attached.
2. Fork [`obsidianmd/obsidian-releases`](https://github.com/obsidianmd/obsidian-releases).
3. Edit `community-plugins.json` and **append** (do not insert mid-array) the following entry at the end of the array:

   ```json
   {
     "id": "multi-state-checkboxes",
     "name": "Multi-State Checkboxes",
     "author": "Michael Wolf",
     "description": "Switch checkboxes between customizable statuses via click, keyboard shortcut, or context menu.",
     "repo": "wolfm/obsidian-multi-state-checkboxes"
   }
   ```

4. Open a PR against `obsidian-releases` `main`. Follow their PR-template checklist.
5. Wait for Obsidian team review (days to months). Address feedback on the PR.
6. Once merged, the plugin appears in the in-app community browser within ~24 hours.

### Pre-submission self-check

Reviewers will likely check:

- [x] No `innerHTML` / `outerHTML` / `insertAdjacentHTML` — we use `createEl` / `createDiv`
- [x] No `Obsidian` or `Plugin` in `manifest.json` `name`
- [x] Style class names are prefixed (we use `cs-*`)
- [x] `isDesktopOnly` is honest (currently `true`; see [Planned work](#planned-work))
- [x] No `console.log` debug noise
- [x] `as any` casts justified (we use `as unknown` + type guards)
- [x] `LICENSE` file present
- [x] `README.md` is user-facing and describes the plugin
- [x] `versions.json` present and matches `manifest.json` `version`

### Release process stubbed items

Remove the stubs to enable plugin release

| Stub                                                                                                      | Where                                                                                           | To unstub                                                              |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Release workflow runs on tag push but does **not** create a GitHub Release (only uploads build artifacts) | [`.github/workflows/release.yml`](.github/workflows/release.yml) — `Create GitHub Release` step | Uncomment the `gh release create` step                                 |
| Plugin is desktop-only                                                                                    | [`manifest.json`](manifest.json) — `isDesktopOnly`                                              | Verify the [mobile concerns](#planned-work) above, then set to `false` |
| Plugin is not listed in the community store                                                               | See [Releasing → community store](#releasing-to-the-community-plugin-store)                     | Follow the manual PR-to-`obsidian-releases` steps when ready           |
