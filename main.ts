import type { EditorView } from "@codemirror/view";
import {
  App,
  ButtonComponent,
  DropdownComponent,
  Editor,
  MarkdownView,
  Menu,
  Plugin,
  PluginSettingTab,
  TFile,
  setIcon,
  setTooltip,
} from "obsidian";

interface Status {
  char: string;
  name: string;
}

interface CheckboxStatesSettings {
  statuses: Status[];
  cycle: string[];
}

export enum CycleDirection {
  Next = 1,
  Previous = -1,
}

const DEFAULT_SETTINGS: CheckboxStatesSettings = {
  statuses: [
    { char: " ", name: "Not Started" },
    { char: "/", name: "In Progress" },
    { char: "x", name: "Complete" },
    { char: "-", name: "Cancelled" },
  ],
  cycle: [" ", "/", "x"],
};

// Suggestions offered by the "Add status" button, in priority order. The first
// suggestion whose character isn't already in use is added.
const NEW_STATUS_SUGGESTIONS: Status[] = [
  { char: "i", name: "Info" },
  { char: "?", name: "Question" },
  { char: "!", name: "Important" },
  { char: "*", name: "Starred" },
  { char: ">", name: "Forwarded" },
  { char: "<", name: "Scheduled" },
];

export const CHECKBOX_LINE_REGEX = /^(\s*(?:[-*+]|\d+\.)\s+\[)(.)(\].*)$/;

/**
 * Gets the checkbox status character if the line contains a checkbox.
 *
 * @param line - The line of text to inspect.
 * @returns The status character, or `null` if the line is not a checkbox.
 */
export function getLineCheckboxStatusChar(line: string): string | null {
  const matches = line.match(CHECKBOX_LINE_REGEX);
  return matches ? matches[2] : null;
}

/**
 * Returns the input line with its checkbox status character replaced by `newChar`.
 *
 * @param line - The line of text to update.
 * @param newChar - The replacement status character.
 * @returns The updated line, or `null` if the line is not a checkbox.
 */
export function setLineCheckboxStatus(line: string, newChar: string): string | null {
  const matches = line.match(CHECKBOX_LINE_REGEX);
  if (!matches) return null;
  return matches[1] + newChar + matches[3];
}

/**
 * Returns the index of the checkbox status character within the line.
 *
 * @param line - The line of text to inspect.
 * @returns The character index, or `null` if the line is not a checkbox.
 */
export function getLineCheckboxStatusCharPos(line: string): number | null {
  const matches = line.match(CHECKBOX_LINE_REGEX);
  return matches ? matches[1].length : null;
}

/**
 * Returns the next character in the cycle relative to `currentChar`.
 *
 * If the cycle is empty, returns `currentChar` unchanged. If `currentChar` is
 * not in the cycle, returns the first character in the cycle.
 *
 * @param currentChar - The current status character.
 * @param cycle - The ordered list of characters in the cycle.
 * @param direction - The direction to step in the cycle.
 * @returns The next character in the cycle.
 */
export function stepCycle(currentChar: string, cycle: string[], direction: CycleDirection): string {
  const idx = cycle.indexOf(currentChar);

  if (cycle.length === 0) return currentChar;
  if (idx === -1) return cycle[0];

  return cycle[(idx + direction + cycle.length) % cycle.length];
}

/**
 * Returns an alphanumeric slug for a character so it can be embedded in a command id.
 *
 * Alphanumeric characters are returned as-is; a space becomes `"space"`; any
 * other character becomes `"u"` followed by its hex code point (e.g. `"u2f"`
 * for `/`).
 *
 * @param c - The character to slugify.
 * @returns The alphanumeric slug.
 */
export function charSlug(c: string): string {
  if (c === " ") return "space";
  if (/^[a-zA-Z0-9]$/.test(c)) return c;
  return "u" + c.charCodeAt(0).toString(16);
}

/**
 * Surrounds a checkbox character with `[` and `]` for display.
 *
 * @param c - The checkbox status character.
 * @returns The bracketed label (e.g. `"[x]"`).
 */
export function charLabel(c: string): string {
  return `[${c}]`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function isStatus(v: unknown): v is Status {
  return isPlainObject(v) && typeof v.char === "string" && v.char.length === 1 && typeof v.name === "string";
}

export default class CheckboxStatesPlugin extends Plugin {
  settings!: CheckboxStatesSettings;

  // Snapshot of `settings.statuses` at the time we registered hotkey commands
  // in `onload`. Used by `isStatusesDirty` to detect when the live statuses
  // have diverged from what the command palette currently reflects.
  private statusesAtLoad: Status[] = [];

  async onload() {
    await this.loadSettings();
    this.statusesAtLoad = this.settings.statuses.map((s) => ({ ...s }));

    this.addCommand({
      id: "cycle-next",
      name: "Cycle to next status",
      editorCallback: (editor) => this.applyToEditorSelection(editor, this.cycleTransform(CycleDirection.Next)),
    });

    this.addCommand({
      id: "cycle-prev",
      name: "Cycle to previous status",
      editorCallback: (editor) => this.applyToEditorSelection(editor, this.cycleTransform(CycleDirection.Previous)),
    });

    // Add set status commands for each defined status
    for (const status of this.settings.statuses) {
      this.addCommand({
        id: `set-status-${charSlug(status.char)}`,
        name: `Set status: ${charLabel(status.char)} ${status.name}`,
        editorCallback: (editor) => this.applyToEditorSelection(editor, () => status.char),
      });
    }

    // If user right-clicks on a line containing a checkbox, add state-switch options to the context menu
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        if (getLineCheckboxStatusChar(line) === null) return;
        menu.addSeparator();
        this.addStatusMenuItems(menu, (char) => this.applyToEditorSelection(editor, () => char));
      }),
    );

    // Add a context menu with state-switch options when user right-clicks directly on a checkbox widget.
    // Necessary because right-click on a checkbox widget doesn't trigger `editor-menu`.
    this.registerDomEvent(document, "contextmenu", this.onCheckboxContextmenu.bind(this), { capture: true });

    // Intercept native checkbox toggle. Obsidian wires its handler on
    // `mousedown` for live-preview widgets, so `click` is too late for the
    // source change — but we still need to suppress `click` to avoid the
    // browser briefly flipping the checkbox visual before CodeMirror redraws.
    this.registerDomEvent(document, "mousedown", this.onCheckboxMousedown.bind(this), { capture: true });
    this.registerDomEvent(document, "click", this.onCheckboxClickSuppress.bind(this), { capture: true });

    this.addSettingTab(new CheckboxStatesSettingTab(this.app, this));
  }

  async loadSettings() {
    const settingsRaw: unknown = await this.loadData();
    const settingsObj = isPlainObject(settingsRaw) ? settingsRaw : {};

    // Load statuses
    const loadedStatuses = Array.isArray(settingsObj.statuses) ? settingsObj.statuses.filter(isStatus) : [];
    const statuses = loadedStatuses.length > 0 ? loadedStatuses : DEFAULT_SETTINGS.statuses.map((s) => ({ ...s }));

    // Load cycle
    const definedChars = new Set(statuses.map((s) => s.char));
    const cycleRaw = Array.isArray(settingsObj.cycle) ? settingsObj.cycle : DEFAULT_SETTINGS.cycle;
    const cycle = cycleRaw.filter((c): c is string => typeof c === "string" && definedChars.has(c));

    this.settings = { statuses, cycle };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * Returns true if the current statuses differ from the snapshot taken at
   * plugin load. Hotkey commands are registered once in `onload`, so any
   * char or name change (and any add or remove) leaves the command palette
   * stale until the plugin is reloaded. Order is ignored — commands are
   * registered independently.
   */
  isStatusesDirty(): boolean {
    const cmp = (a: Status, b: Status) => (a.char < b.char ? -1 : a.char > b.char ? 1 : 0);
    const before = [...this.statusesAtLoad].sort(cmp);
    const after = [...this.settings.statuses].sort(cmp);
    if (before.length !== after.length) return true;
    return before.some((s, i) => s.char !== after[i].char || s.name !== after[i].name);
  }

  /**
   * Returns a transform that steps through the cycle defined in the plugin settings.
   *
   * @param direction - The direction to step in the cycle.
   * @returns A transform mapping the current status character to the next one in the cycle.
   */
  private cycleTransform(direction: CycleDirection): (current: string) => string {
    return (cur) => stepCycle(cur, this.settings.cycle, direction);
  }

  /**
   * Adds a "Set status" item to `menu` for each defined status. Each item invokes
   * `onPick` with the chosen status character.
   *
   * @param menu - The menu to append items to.
   * @param onPick - Callback invoked with the chosen status character.
   */
  private addStatusMenuItems(menu: Menu, onPick: (char: string) => void) {
    for (const status of this.settings.statuses) {
      menu.addItem((item) =>
        item.setTitle(`Set status: ${charLabel(status.char)} ${status.name}`).onClick(() => onPick(status.char)),
      );
    }
  }

  /**
   * Applies `transform` to the checkbox status character on every line covered
   * by the editor's current selections (or the cursor line if there is no
   * selection). Lines without a checkbox are skipped, as are lines whose
   * transformed character is unchanged.
   *
   * @param editor - The editor to operate on.
   * @param transform - Maps the current status character to its replacement.
   */
  applyToEditorSelection(editor: Editor, transform: (currentChar: string) => string) {
    // Compute the set of selected line numbers from the union of line numbers covered by all cursors
    const selectedLineNums = new Set<number>();
    for (const selection of editor.listSelections()) {
      const startLine = Math.min(selection.anchor.line, selection.head.line);
      const endLine = Math.max(selection.anchor.line, selection.head.line);
      for (let lineNum = startLine; lineNum <= endLine; lineNum++) selectedLineNums.add(lineNum);
    }
    if (selectedLineNums.size === 0) selectedLineNums.add(editor.getCursor().line);

    // Apply transform function to all selected lines
    for (const lineNum of selectedLineNums) {
      const line = editor.getLine(lineNum);
      const charPos = getLineCheckboxStatusCharPos(line);
      if (charPos === null) continue;
      const currentChar = line[charPos];
      const newChar = transform(currentChar);
      if (newChar === currentChar) continue;
      editor.replaceRange(newChar, { line: lineNum, ch: charPos }, { line: lineNum, ch: charPos + 1 });
    }
  }

  /**
   * Returns the checkbox input element targeted by `event`, or `null` if the
   * event didn't land on a task-list checkbox.
   */
  private checkboxFromEvent(event: MouseEvent): HTMLInputElement | null {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return null;
    if (!target.classList.contains("task-list-item-checkbox")) return null;
    return target;
  }

  /**
   * Applies `transform` to the source character backing the given checkbox
   * widget, dispatching to the appropriate handler for live-preview vs. reading mode.
   */
  private applyAtCheckbox(checkbox: HTMLInputElement, transform: (cur: string) => string) {
    const view = this.viewFromElement(checkbox);
    if (!view) return;
    if (view.getMode() === "source") {
      this.applyAtCheckboxInLivePreviewMode(view, checkbox, transform);
    } else {
      this.applyAtCheckboxInReadingMode(view, checkbox, transform);
    }
  }

  /**
   * Intercepts left-click on a checkbox widget and cycles its status forward,
   * suppressing Obsidian's default toggle.
   */
  onCheckboxMousedown(event: MouseEvent) {
    if (event.button !== 0) return;
    const target = this.checkboxFromEvent(event);
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.applyAtCheckbox(target, this.cycleTransform(CycleDirection.Next));
  }

  /**
   * Suppresses the `click` event that follows our intercepted `mousedown` so the
   * browser doesn't briefly flip the checkbox visual before CodeMirror redraws.
   */
  onCheckboxClickSuppress(event: MouseEvent) {
    if (event.button !== 0) return;
    const target = this.checkboxFromEvent(event);
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  /**
   * Shows a status-picker context menu when the user right-clicks a checkbox widget.
   */
  onCheckboxContextmenu(event: MouseEvent) {
    const target = this.checkboxFromEvent(event);
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const menu = new Menu();
    this.addStatusMenuItems(menu, (char) => this.applyAtCheckbox(target, () => char));
    menu.showAtMouseEvent(event);
  }

  /**
   * Returns the `MarkdownView` whose container contains `element`, or `null` if
   * no open leaf contains it.
   */
  private viewFromElement(element: HTMLElement): MarkdownView | null {
    let foundView: MarkdownView | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (foundView) return;
      const view = leaf.view;
      if (view instanceof MarkdownView && view.containerEl.contains(element)) {
        foundView = view;
      }
    });
    return foundView;
  }

  /**
   * Applies `transform` to the source character backing a checkbox widget in
   * live-preview mode.
   *
   * Live preview runs a CodeMirror editor, so we can map the DOM node directly
   * to a source position via `editorView.posAtDOM` and edit through the live
   * editor — both unavailable in reading mode.
   */
  private applyAtCheckboxInLivePreviewMode(
    view: MarkdownView,
    checkbox: HTMLInputElement,
    transform: (cur: string) => string,
  ) {
    // @ts-expect-error - cm (CodeMirror) is not in the public type definitions
    const editorView = view.editor.cm as EditorView;
    let pos: number;
    try {
      pos = editorView.posAtDOM(checkbox);
    } catch {
      return;
    }

    const docLine = editorView.state.doc.lineAt(pos);
    const lineNum = docLine.number - 1;
    const lineText = view.editor.getLine(lineNum);
    const charPos = getLineCheckboxStatusCharPos(lineText);
    if (charPos === null) return;

    const currentChar = lineText[charPos];
    const newChar = transform(currentChar);
    if (newChar === currentChar) return;

    view.editor.replaceRange(newChar, { line: lineNum, ch: charPos }, { line: lineNum, ch: charPos + 1 });
  }

  /**
   * Applies `transform` to a checkbox clicked in reading mode.
   *
   * Reading mode has no editor and no DOM-to-source mapping, so we count the
   * clicked checkbox's position among all rendered checkboxes and rewrite the
   * Nth checkbox in the source file directly via `vault.process`.
   */
  private applyAtCheckboxInReadingMode(
    view: MarkdownView,
    checkbox: HTMLInputElement,
    transform: (cur: string) => string,
  ) {
    const file = view.file;
    if (!file) return;

    const container = checkbox.closest(".markdown-preview-view, .markdown-reading-view");
    if (!container) return;

    const checkboxDOMNodes = Array.from(container.querySelectorAll<HTMLInputElement>("input.task-list-item-checkbox"));
    const idx = checkboxDOMNodes.indexOf(checkbox);
    if (idx === -1) return;

    void this.transformNthCheckbox(file, idx, transform);
  }

  /**
   * Applies `transform` to the status character of the `checkboxIdx`-th checkbox
   * (0-indexed, in source order) in `file`. No-op if the transform returns the
   * same character.
   */
  private async transformNthCheckbox(file: TFile, checkboxIdx: number, transform: (cur: string) => string) {
    await this.app.vault.process(file, (content) => {
      const lines = content.split("\n");
      let count = 0;
      for (let i = 0; i < lines.length; i++) {
        const pos = getLineCheckboxStatusCharPos(lines[i]);
        if (pos === null) continue;

        // If this is the target checkbox index, update its status
        if (count === checkboxIdx) {
          const currentChar = lines[i][pos];
          const newChar = transform(currentChar);
          if (newChar === currentChar) return content;

          const newLine = setLineCheckboxStatus(lines[i], newChar);
          if (newLine === null) return content;

          lines[i] = newLine;
          return lines.join("\n");
        }
        count++;
      }
      return content;
    });
  }
}

class CheckboxStatesSettingTab extends PluginSettingTab {
  plugin: CheckboxStatesPlugin;

  // Set by `dragstart` and read by `drop` on cycle rows. Lives on the instance
  // so handlers attached to different rows share a single source of truth.
  private draggedChar: string | null = null;

  // The "reload to apply" note appended to the Statuses section. Held on the
  // instance so inline edits (which don't trigger a full re-render) can toggle
  // its visibility without rebuilding the DOM.
  private dirtyNoteEl: HTMLElement | null = null;

  constructor(app: App, plugin: CheckboxStatesPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /**
   * Shows or hides the reload-required note based on whether the live statuses
   * have diverged from what was registered at plugin load.
   */
  private updateDirtyNote() {
    if (!this.dirtyNoteEl) return;
    this.dirtyNoteEl.toggleClass("cs-hidden", !this.plugin.isStatusesDirty());
  }

  /**
   * Renders the settings UI: a Statuses section (one editable row per status
   * plus an "Add status" button) and a Cycle Order section (draggable rows
   * in cycle order plus an "Add to cycle" dropdown for statuses not yet
   * included).
   */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Statuses section
    containerEl.createEl("h3", { text: "Statuses" });
    for (const status of this.plugin.settings.statuses) {
      this.renderStatusRow(containerEl, status);
    }
    this.renderAddStatusButton(containerEl);
    this.dirtyNoteEl = containerEl.createDiv({
      cls: "cs-info cs-dirty-note",
      text: "Toggle the plugin off and on to re-register statuses your changes.",
    });
    this.updateDirtyNote();

    // Cycle Order section
    containerEl.createEl("h3", { text: "Cycle Order" });
    this.plugin.settings.cycle.forEach((char, idx) => {
      this.renderCycleRow(containerEl, char, idx);
    });
    this.renderAddCycleDropdown(containerEl);
  }

  /**
   * Renders one row in the Statuses list: an editable status character, a
   * theme-styled preview of the rendered checkbox, an editable name, and a
   * delete button.
   *
   * @param containerEl - The element to append the row to.
   * @param status - The status to render.
   */
  private renderStatusRow(containerEl: HTMLElement, status: Status) {
    const row = containerEl.createDiv({ cls: "cs-status-row" });

    const charInput = row.createEl("input", {
      type: "text",
      cls: "cs-status-char",
      attr: { maxlength: "1" },
    });
    charInput.value = status.char;

    // Theme-styled preview of the rendered checkbox. We use the bare input
    // (rather than wrapping in ul/li) because Obsidian's .task-list-item
    // positioning is tuned for a list context and throws off alignment here.
    const previewCheckbox = row.createEl("input", {
      type: "checkbox",
      cls: "task-list-item-checkbox cs-preview-checkbox",
    });
    previewCheckbox.setAttribute("data-task", status.char);
    previewCheckbox.setAttribute("aria-hidden", "true");
    previewCheckbox.tabIndex = -1;
    previewCheckbox.checked = status.char !== " ";

    const updatePreview = (c: string) => {
      previewCheckbox.setAttribute("data-task", c);
      previewCheckbox.checked = c !== " ";
    };

    const validate = () => {
      const v = charInput.value;
      let error: string | null = null;

      if (v.length !== 1) {
        error = "Invalid input: status character must be exactly one character.";
      } else if (this.plugin.settings.statuses.some((s) => s !== status && s.char === v)) {
        error = `Invalid input: Character "${v}" is already used by another status.`;
      }

      if (error) {
        charInput.addClass("cs-invalid");
        setTooltip(charInput, error, { placement: "top" });
      } else {
        charInput.removeClass("cs-invalid");
        setTooltip(charInput, "");
      }
    };

    charInput.addEventListener("input", async () => {
      validate();
      const v = charInput.value;
      if (v.length !== 1) return;

      updatePreview(v);

      // Don't persist a duplicate, but the preview above still reflects what was typed.
      if (this.plugin.settings.statuses.some((s) => s !== status && s.char === v)) return;
      if (v === status.char) return;

      const oldChar = status.char;
      status.char = v;
      this.plugin.settings.cycle = this.plugin.settings.cycle.map((c) => (c === oldChar ? v : c));
      await this.plugin.saveSettings();
      this.updateDirtyNote();
    });

    // Select on focus so the common case (replace the char) is one keystroke.
    // setTimeout defers past click-to-focus so the click doesn't collapse the selection.
    charInput.addEventListener("focus", () => setTimeout(() => charInput.select(), 0));

    const nameInput = row.createEl("input", {
      type: "text",
      cls: "cs-status-name",
      attr: { placeholder: "name" },
    });
    nameInput.value = status.name;
    nameInput.addEventListener("input", async () => {
      status.name = nameInput.value;
      await this.plugin.saveSettings();
      this.updateDirtyNote();
    });

    const trash = row.createDiv({
      cls: "cs-row-action",
      attr: { "aria-label": "Delete status" },
    });
    setIcon(trash, "trash");
    trash.addEventListener("click", async () => {
      const idx = this.plugin.settings.statuses.indexOf(status);
      if (idx === -1) return;
      this.plugin.settings.statuses.splice(idx, 1);
      this.plugin.settings.cycle = this.plugin.settings.cycle.filter((c) => c !== status.char);
      await this.plugin.saveSettings();
      this.display();
    });
  }

  /**
   * Renders the "Add status" button. Adds the first `NEW_STATUS_SUGGESTIONS`
   * entry whose character isn't already in use, falling back to a generic
   * placeholder if every suggestion is taken.
   *
   * @param containerEl - The element to append the button to.
   */
  private renderAddStatusButton(containerEl: HTMLElement) {
    const addStatusRow = containerEl.createDiv({ cls: "cs-add-row" });
    new ButtonComponent(addStatusRow).setButtonText("Add status").onClick(async () => {
      const used = new Set(this.plugin.settings.statuses.map((s) => s.char));
      const suggestion = NEW_STATUS_SUGGESTIONS.find((s) => !used.has(s.char)) ?? { char: "?", name: "New status" };
      this.plugin.settings.statuses.push({ ...suggestion });
      await this.plugin.saveSettings();
      this.display();
    });
  }

  /**
   * Renders one row in the Cycle Order list: a drag handle, the 1-based
   * position number, the status character, a theme-styled preview checkbox,
   * the status name, and a remove button.
   *
   * @param containerEl - The element to append the row to.
   * @param char - The status character occupying this cycle position.
   * @param idx - The 0-based position of this row in the cycle.
   */
  private renderCycleRow(containerEl: HTMLElement, char: string, idx: number) {
    const status = this.plugin.settings.statuses.find((s) => s.char === char);
    const name = status ? status.name : `(missing: ${char})`;

    const row = containerEl.createDiv({ cls: "cs-cycle-row" });
    row.draggable = true;

    const handle = row.createDiv({ cls: "cs-drag-handle" });
    setIcon(handle, "grip-vertical");

    row.createSpan({ cls: "cs-cycle-num", text: `${idx + 1}.` });
    row.createEl("code", { cls: "cs-cycle-char", text: char });

    const cyclePreview = row.createEl("input", {
      type: "checkbox",
      cls: "task-list-item-checkbox cs-preview-checkbox",
    });
    cyclePreview.setAttribute("data-task", char);
    cyclePreview.setAttribute("aria-hidden", "true");
    cyclePreview.tabIndex = -1;
    cyclePreview.checked = char !== " ";

    row.createSpan({ cls: "cs-cycle-name", text: name });

    const trash = row.createDiv({
      cls: "cs-row-action",
      attr: { "aria-label": "Remove from cycle" },
    });
    setIcon(trash, "trash");
    trash.addEventListener("click", async () => {
      const i = this.plugin.settings.cycle.indexOf(char);
      if (i === -1) return;
      this.plugin.settings.cycle.splice(i, 1);
      await this.plugin.saveSettings();
      this.display();
    });

    this.attachCycleRowDragHandlers(row, containerEl, char);
  }

  /**
   * Wires drag-and-drop handlers to a cycle row so the cycle can be reordered.
   * Drag state is tracked on the instance via `draggedChar` so the row being
   * dragged (`dragstart`) and the row being dropped on (`drop`) can communicate.
   *
   * @param row - The cycle row element to attach handlers to.
   * @param containerEl - The cycle list container, used to clear drag-over highlights.
   * @param char - The status character this row represents.
   */
  private attachCycleRowDragHandlers(row: HTMLElement, containerEl: HTMLElement, char: string) {
    row.addEventListener("dragstart", (event) => {
      this.draggedChar = char;
      row.addClass("cs-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", char);
      }
    });

    row.addEventListener("dragend", () => {
      row.removeClass("cs-dragging");
      containerEl.querySelectorAll(".cs-cycle-row").forEach((r) => {
        r.removeClass("cs-drag-over-top");
        r.removeClass("cs-drag-over-bottom");
      });
      this.draggedChar = null;
    });

    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      if (this.draggedChar === null || this.draggedChar === char) return;
      row.removeClass("cs-drag-over-top");
      row.removeClass("cs-drag-over-bottom");
      // Drop above or below the target depending on which half of the row the cursor is in.
      const rect = row.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      row.addClass(before ? "cs-drag-over-top" : "cs-drag-over-bottom");
    });

    row.addEventListener("dragleave", () => {
      row.removeClass("cs-drag-over-top");
      row.removeClass("cs-drag-over-bottom");
    });

    row.addEventListener("drop", async (event) => {
      event.preventDefault();
      const fromChar = this.draggedChar;
      const before = row.hasClass("cs-drag-over-top");
      row.removeClass("cs-drag-over-top");
      row.removeClass("cs-drag-over-bottom");
      if (fromChar === null || fromChar === char) return;

      const arr = this.plugin.settings.cycle;
      const fromIdx = arr.indexOf(fromChar);
      const targetIdx = arr.indexOf(char);
      if (fromIdx === -1 || targetIdx === -1) return;

      // Remove first, then recompute the target index since removing may shift it.
      arr.splice(fromIdx, 1);
      let toIdx = arr.indexOf(char);
      if (toIdx === -1) toIdx = targetIdx;
      if (!before) toIdx += 1;
      arr.splice(toIdx, 0, fromChar);

      await this.plugin.saveSettings();
      this.display();
    });
  }

  /**
   * Renders the "Add to cycle" dropdown for any statuses not yet in the cycle.
   * No-op if every status is already in the cycle.
   *
   * @param containerEl - The element to append the dropdown to.
   */
  private renderAddCycleDropdown(containerEl: HTMLElement) {
    const notInCycle = this.plugin.settings.statuses.filter((s) => !this.plugin.settings.cycle.includes(s.char));
    if (notInCycle.length === 0) return;

    const addCycleRow = containerEl.createDiv({ cls: "cs-add-row" });
    const dropdown = new DropdownComponent(addCycleRow);

    dropdown.addOption("", "— Add to cycle —");
    for (const s of notInCycle) {
      dropdown.addOption(s.char, `${charLabel(s.char)} ${s.name}`);
    }

    dropdown.setValue("");

    dropdown.onChange(async (v) => {
      if (!v) return;
      this.plugin.settings.cycle.push(v);
      await this.plugin.saveSettings();
      this.display();
    });
  }
}
