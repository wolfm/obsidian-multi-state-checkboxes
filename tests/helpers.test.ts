import { describe, expect, it } from "vitest";
import {
  charLabel,
  charSlug,
  CycleDirection,
  getLineCheckboxStatusChar,
  getLineCheckboxStatusCharPos,
  setLineCheckboxStatus,
  stepCycle,
} from "../main";

describe("stepCycle", () => {
  const cycle = [" ", "/", "x"];

  it.each([
    // [name, currentChar, dir, expected]
    ["next: unchecked -> in progress", " ", CycleDirection.Next, "/"],
    ["next: in progress -> complete", "/", CycleDirection.Next, "x"],
    ["next: complete -> unchecked (wrap)", "x", CycleDirection.Next, " "],
    ["prev: complete -> in progress", "x", CycleDirection.Previous, "/"],
    ["prev: in progress -> unchecked", "/", CycleDirection.Previous, " "],
    ["prev: unchecked -> complete (wrap)", " ", CycleDirection.Previous, "x"],
    ["off-cycle next snaps to first", "-", CycleDirection.Next, " "],
    ["off-cycle prev snaps to first", "?", CycleDirection.Previous, " "],
  ])("%s", (_name, current, dir, expected) => {
    expect(stepCycle(current, cycle, dir)).toBe(expected);
  });

  it("returns current char when cycle is empty", () => {
    expect(stepCycle("x", [], CycleDirection.Next)).toBe("x");
    expect(stepCycle("x", [], CycleDirection.Previous)).toBe("x");
  });

  it("returns same char when cycle has only one entry and current is in it", () => {
    expect(stepCycle("x", ["x"], CycleDirection.Next)).toBe("x");
    expect(stepCycle("x", ["x"], CycleDirection.Previous)).toBe("x");
  });
});

describe("lineStatusChar", () => {
  it.each([
    // [name, line, expected]
    ["dash list, unchecked", "- [ ] task", " "],
    ["dash list, checked", "- [x] task", "x"],
    ["dash list, custom char", "- [/] in progress", "/"],
    ["asterisk list", "* [-] task", "-"],
    ["plus list", "+ [?] task", "?"],
    ["numbered list", "1. [x] task", "x"],
    ["indented (spaces)", "    - [/] task", "/"],
    ["indented (tabs)", "\t\t- [x] task", "x"],
    ["plain line returns null", "just text", null],
    ["heading returns null", "# heading", null],
    ["list item without checkbox returns null", "- regular item", null],
    ["empty brackets without space returns null", "- [] task", null],
    ["empty line returns null", "", null],
  ])("%s", (_name, line, expected) => {
    expect(getLineCheckboxStatusChar(line)).toBe(expected);
  });
});

describe("statusCharPos", () => {
  it.each([
    // [name, line, expected]
    ["no indent", "- [ ] task", 3],
    ["asterisk", "* [x] task", 3],
    ["numbered", "1. [x] task", 4],
    ["indented 2 spaces", "  - [/] task", 5],
    ["indented 4 spaces", "    - [x] task", 7],
    ["tab indent", "\t- [ ] task", 4],
    ["plain line returns null", "no checkbox here", null],
    ["empty line returns null", "", null],
  ])("%s", (_name, line, expected) => {
    expect(getLineCheckboxStatusCharPos(line)).toBe(expected);
  });

  it("position is consistent with lineStatusChar", () => {
    const line = "    - [/] something";
    const pos = getLineCheckboxStatusCharPos(line);
    expect(pos).not.toBeNull();
    expect(line[pos!]).toBe(getLineCheckboxStatusChar(line));
  });
});

describe("setLineStatus", () => {
  it.each([
    // [name, line, newChar, expected]
    ["toggle unchecked to checked", "- [ ] task", "x", "- [x] task"],
    ["toggle checked to unchecked", "- [x] task", " ", "- [ ] task"],
    ["change to custom char", "- [ ] task", "/", "- [/] task"],
    ["preserve indent", "    - [ ] task", "x", "    - [x] task"],
    ["preserve trailing content", "- [ ] task #tag @due", "x", "- [x] task #tag @due"],
    ["preserve numbered marker", "1. [ ] task", "x", "1. [x] task"],
    ["preserve tab indent", "\t- [ ] task", "x", "\t- [x] task"],
    ["plain line returns null", "no checkbox", "x", null],
    ["empty line returns null", "", "x", null],
  ])("%s", (_name, line, newChar, expected) => {
    expect(setLineCheckboxStatus(line, newChar)).toBe(expected);
  });
});

describe("charSlug", () => {
  it.each([
    // [name, char, expected]
    ["space → 'space'", " ", "space"],
    ["lowercase letter kept", "x", "x"],
    ["uppercase letter kept (distinct from lowercase)", "X", "X"],
    ["digit kept", "5", "5"],
    ["slash → unicode", "/", "u2f"],
    ["dash → unicode", "-", "u2d"],
    ["question → unicode", "?", "u3f"],
    ["emoji-ish → unicode", "!", "u21"],
  ])("%s", (_name, char, expected) => {
    expect(charSlug(char)).toBe(expected);
  });

  it("produces unique slugs for distinct chars (no command-id collisions)", () => {
    const chars = [" ", "/", "x", "-", "?", "!", "+", "X", "0", "9"];
    const slugs = chars.map(charSlug);
    expect(new Set(slugs).size).toBe(chars.length);
  });
});

describe("charLabel", () => {
  it.each([
    // [name, char, expected]
    ["space → '[ ]'", " ", "[ ]"],
    ["x → '[x]'", "x", "[x]"],
    ["slash → '[/]'", "/", "[/]"],
    ["dash → '[-]'", "-", "[-]"],
  ])("%s", (_name, char, expected) => {
    expect(charLabel(char)).toBe(expected);
  });
});

describe("round-trip", () => {
  it("setLineStatus output is parseable back by lineStatusChar", () => {
    const cases: Array<[string, string]> = [
      ["- [ ] task", "x"],
      ["- [x] task", "/"],
      ["    1. [/] indented numbered", "-"],
      ["\t* [-] task", " "],
    ];
    for (const [line, newChar] of cases) {
      const updated = setLineCheckboxStatus(line, newChar);
      expect(updated).not.toBeNull();
      expect(getLineCheckboxStatusChar(updated!)).toBe(newChar);
    }
  });
});
