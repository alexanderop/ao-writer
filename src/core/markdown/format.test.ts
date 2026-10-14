import { describe, expect, it } from "vitest";

import { applyFormat, continueList } from "./format.ts";
import type { FormatAction, TextEdit } from "./format.ts";

/** Strip the `|` selection markers from `marked` and return text plus selection offsets. */
interface Marked {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

function parse(marked: string): Marked {
  const first = marked.indexOf("|");
  const second = marked.indexOf("|", first + 1);

  if (second === -1) {
    return { text: marked.slice(0, first) + marked.slice(first + 1), start: first, end: first };
  }

  return {
    text: marked.slice(0, first) + marked.slice(first + 1, second) + marked.slice(second + 1),
    start: first,
    end: second - 1,
  };
}

function applyEdit(text: string, edit: TextEdit): string {
  return text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
}

/** Render the text after an edit with `|` at the new selection boundaries. */
function show(text: string, edit: TextEdit): string {
  const next = applyEdit(text, edit);

  expect(edit.selectionStart).toBeGreaterThanOrEqual(0);
  expect(edit.selectionEnd).toBeLessThanOrEqual(next.length);
  expect(edit.selectionStart).toBeLessThanOrEqual(edit.selectionEnd);

  if (edit.selectionStart === edit.selectionEnd) {
    return `${next.slice(0, edit.selectionStart)}|${next.slice(edit.selectionStart)}`;
  }

  return `${next.slice(0, edit.selectionStart)}|${next.slice(edit.selectionStart, edit.selectionEnd)}|${next.slice(edit.selectionEnd)}`;
}

function format(marked: string, action: FormatAction): string {
  const { text, start, end } = parse(marked);

  return show(text, applyFormat(text, start, end, action));
}

function enter(marked: string): string | null {
  const { text, start } = parse(marked);
  const edit = continueList(text, start);

  return edit === null ? null : show(text, edit);
}

describe("given inline formatting actions", () => {
  describe("when wrapping a selection", () => {
    it.each([
      ["bold", "a |word| b", "a **|word|** b"],
      ["italic", "a |word| b", "a *|word|* b"],
      ["strike", "a |word| b", "a ~~|word|~~ b"],
      ["code", "a |word| b", "a `|word|` b"],
    ] as const)("should %s the selection and keep the inner text selected", (action, input, output) => {
      expect(format(input, action)).toBe(output);
    });

    it("should keep the edit minimal", () => {
      const edit = applyFormat("hello world", 6, 11, "bold");

      expect(edit).toEqual({ from: 6, to: 11, insert: "**world**", selectionStart: 8, selectionEnd: 13 });
    });

    it("should leave surrounding whitespace outside the markers", () => {
      expect(format("a| word |b", "bold")).toBe("a **|word|** b");
    });

    it("should wrap a multi-line selection as a whole", () => {
      expect(format("|one\ntwo|", "italic")).toBe("*|one\ntwo|*");
    });
  });

  describe("when the selection is already wrapped", () => {
    it.each([
      ["bold", "a **|word|** b", "a |word| b"],
      ["italic", "a *|word|* b", "a |word| b"],
      ["strike", "a ~~|word|~~ b", "a |word| b"],
      ["code", "a `|word|` b", "a |word| b"],
    ] as const)("should unwrap %s when the markers sit just outside", (action, input, output) => {
      expect(format(input, action)).toBe(output);
    });

    it.each([
      ["bold", "a |**word**| b", "a |word| b"],
      ["italic", "a |*word*| b", "a |word| b"],
      ["strike", "a |~~word~~| b", "a |word| b"],
      ["code", "a |`word`| b", "a |word| b"],
    ] as const)("should unwrap %s when the markers are inside the selection", (action, input, output) => {
      expect(format(input, action)).toBe(output);
    });

    it("should not mistake bold markers for italic ones", () => {
      expect(format("**|word|**", "italic")).toBe("***|word|***");
    });

    it("should italicise inside bold and unwrap it again", () => {
      expect(format("***|word|***", "italic")).toBe("**|word|**");
      expect(format("***|word|***", "bold")).toBe("*|word|*");
    });

    it("should be an involution for every inline action", () => {
      for (const action of ["bold", "italic", "strike", "code"] as const) {
        const { text, start, end } = parse("x |some text| y");
        const once = applyFormat(text, start, end, action);
        const wrapped = applyEdit(text, once);
        const twice = applyFormat(wrapped, once.selectionStart, once.selectionEnd, action);

        expect(applyEdit(wrapped, twice)).toBe(text);
      }
    });
  });

  describe("when the selection is empty", () => {
    it("should insert paired markers with the caret between them", () => {
      expect(format("a | b", "bold")).toBe("a **|** b");
      expect(format("|", "code")).toBe("`|`");
    });

    it("should remove an empty pair on the second toggle", () => {
      expect(format("a **|** b", "bold")).toBe("a | b");
    });

    it("should wrap the word the caret is inside of", () => {
      expect(format("one tw|o three", "bold")).toBe("one **|two|** three");
    });

    it("should wrap the word the caret touches at either edge", () => {
      expect(format("one |two three", "italic")).toBe("one *|two|* three");
      expect(format("one two| three", "italic")).toBe("one *|two|* three");
    });

    it("should unwrap a word that is already wrapped", () => {
      expect(format("one **tw|o** three", "bold")).toBe("one |two| three");
    });
  });
});

describe("given the code block action", () => {
  it("should fence the selected lines", () => {
    expect(format("a\n|b\nc|\nd", "codeBlock")).toBe("a\n```\n|b\nc|\n```\nd");
  });

  it("should fence the caret line when the selection is empty", () => {
    expect(format("a\nb|c\nd", "codeBlock")).toBe("a\n```\nb|c\n```\nd");
  });

  it("should insert an empty block with the caret inside on a blank line", () => {
    expect(format("a\n|\nb", "codeBlock")).toBe("a\n```\n|\n```\nb");
  });

  it("should exclude the next line when the selection ends at its start", () => {
    const text = "a\nb\nc";

    expect(applyEdit(text, applyFormat(text, 0, 4, "codeBlock"))).toBe("```\na\nb\n```\nc");
  });

  it("should remove the fences when the selection is inside a fenced block", () => {
    expect(format("```js\nlet |a|\n```", "codeBlock")).toBe("let |a|");
  });

  it("should remove the fences from the caret position", () => {
    expect(format("x\n```\nfoo|\nbar\n```\ny", "codeBlock")).toBe("x\nfoo|\nbar\ny");
  });

  it("should remove an unterminated fence", () => {
    expect(format("```\nfoo|", "codeBlock")).toBe("foo|");
  });

  it("should round-trip", () => {
    const { text, start, end } = parse("one\n|two\nthree|");
    const first = applyFormat(text, start, end, "codeBlock");
    const fenced = applyEdit(text, first);
    const second = applyFormat(fenced, first.selectionStart, first.selectionEnd, "codeBlock");

    expect(applyEdit(fenced, second)).toBe(text);
  });
});

describe("given the heading actions", () => {
  it.each([1, 2, 3, 4, 5, 6] as const)("should set level %i", (level) => {
    expect(format("ti|tle", `h${level}`)).toBe(`${"#".repeat(level)} ti|tle`);
  });

  it("should remove the heading when the same level is applied again", () => {
    expect(format("## ti|tle", "h2")).toBe("ti|tle");
  });

  it("should replace a different level", () => {
    expect(format("## ti|tle", "h4")).toBe("#### ti|tle");
    expect(format("###### ti|tle", "h1")).toBe("# ti|tle");
  });

  it("should apply to every selected line and skip empty ones", () => {
    expect(format("|one\n\ntwo|", "h2")).toBe("|## one\n\n## two|");
  });

  it("should remove headings only when every line already has the level", () => {
    expect(format("|## one\n## two|", "h2")).toBe("|one\ntwo|");
    expect(format("|## one\ntwo|", "h2")).toBe("|## one\n## two|");
  });

  it("should add a heading marker to a blank line", () => {
    expect(format("|", "h1")).toBe("# |");
  });

  it("should produce a minimal edit", () => {
    const edit = applyFormat("a\nb\nc", 2, 2, "h1");

    expect(edit.from).toBe(2);
    expect(edit.to).toBe(2);
    expect(edit.insert).toBe("# ");
  });

  it("should keep the caret on the same character", () => {
    expect(format("tit|le", "h1")).toBe("# tit|le");
  });
});

describe("given the list actions", () => {
  it("should add bullets to every non-empty selected line", () => {
    expect(format("|a\n\nb|", "list")).toBe("|- a\n\n- b|");
  });

  it("should remove bullets when every line has one", () => {
    expect(format("|- a\n- b|", "list")).toBe("|a\nb|");
  });

  it("should add a bullet to the caret line", () => {
    expect(format("hel|lo", "list")).toBe("- hel|lo");
  });

  it("should number ordered lists from one", () => {
    expect(format("|a\nb\nc|", "orderedList")).toBe("|1. a\n2. b\n3. c|");
  });

  it("should remove ordered numbering when every line has it", () => {
    expect(format("|1. a\n2. b|", "orderedList")).toBe("|a\nb|");
  });

  it("should renumber when only some lines are numbered", () => {
    expect(format("|1. a\nb\n7. c|", "orderedList")).toBe("|1. a\n2. b\n3. c|");
  });

  it("should add task boxes", () => {
    expect(format("|a\nb|", "taskList")).toBe("|- [ ] a\n- [ ] b|");
  });

  it("should remove task boxes when every line has one", () => {
    expect(format("|- [ ] a\n- [x] b|", "taskList")).toBe("|a\nb|");
  });

  it("should convert a bullet to a task and keep checked state", () => {
    expect(format("|- a\n- [x] b|", "taskList")).toBe("|- [ ] a\n- [x] b|");
  });

  it("should replace a prefix when switching list kinds", () => {
    expect(format("|- a\n- b|", "orderedList")).toBe("|1. a\n2. b|");
    expect(format("|1. a\n2. b|", "list")).toBe("|- a\n- b|");
    expect(format("|- [ ] a|", "list")).toBe("|- a|");
    expect(format("|1. a|", "taskList")).toBe("|- [ ] a|");
  });

  it("should keep the indentation of nested items", () => {
    expect(format("  |a|", "list")).toBe("  - |a|");
    expect(format("  |- a|", "list")).toBe("  |a|");
  });

  it("should keep an existing bullet character", () => {
    expect(format("|* a|", "taskList")).toBe("|* [ ] a|");
  });

  it("should put the list marker after a quote prefix", () => {
    expect(format("> |a|", "list")).toBe("> - |a|");
  });
});

describe("given the quote action", () => {
  it("should quote every non-empty selected line", () => {
    expect(format("|a\n\nb|", "quote")).toBe("|> a\n\n> b|");
  });

  it("should remove quotes when every line is quoted", () => {
    expect(format("|> a\n> b|", "quote")).toBe("|a\nb|");
  });

  it("should only quote the lines that lack a quote", () => {
    expect(format("|> a\nb|", "quote")).toBe("|> a\n> b|");
  });

  it("should remove only one nesting level", () => {
    expect(format("|> > a|", "quote")).toBe("|> a|");
  });

  it("should quote a list item after its indentation", () => {
    expect(format("  |- a|", "quote")).toBe("  > |- a|");
  });
});

describe("given the link action", () => {
  it("should wrap a selection and select the placeholder url", () => {
    expect(format("a |link| b", "link")).toBe("a [link](|url|) b");
  });

  it("should turn a selected url into the target and put the caret in the brackets", () => {
    expect(format("see |https://example.com/x| now", "link")).toBe("see [|](https://example.com/x) now");
  });

  it("should insert a template with the text selected", () => {
    expect(format("a | b", "link")).toBe("a [|text|](url) b");
  });

  it("should produce a minimal edit", () => {
    expect(applyFormat("ab", 0, 2, "link")).toEqual({
      from: 0,
      to: 2,
      insert: "[ab](url)",
      selectionStart: 5,
      selectionEnd: 8,
    });
  });
});

describe("given the toggle task action", () => {
  it("should check an unchecked task", () => {
    expect(format("- [ ] a|b", "toggleTask")).toBe("- [x] a|b");
  });

  it("should uncheck a checked task", () => {
    expect(format("- [x] a|b", "toggleTask")).toBe("- [ ] a|b");
    expect(format("- [X] a|b", "toggleTask")).toBe("- [ ] a|b");
  });

  it("should turn a plain list item into a task", () => {
    expect(format("- a|b", "toggleTask")).toBe("- [ ] a|b");
    expect(format("1. a|b", "toggleTask")).toBe("1. [ ] a|b");
  });

  it("should toggle every selected line", () => {
    expect(format("|- [ ] a\n- [x] b|", "toggleTask")).toBe("|- [x] a\n- [ ] b|");
  });

  it("should do nothing on a line that is not a list item", () => {
    const edit = applyFormat("plain text", 3, 3, "toggleTask");

    expect(edit.from).toBe(edit.to);
    expect(edit.insert).toBe("");
    expect(edit.selectionStart).toBe(3);
    expect(edit.selectionEnd).toBe(3);
  });

  it("should keep indentation", () => {
    expect(format("  - [ ] a|", "toggleTask")).toBe("  - [x] a|");
  });
});

describe("given out-of-range selections", () => {
  it("should clamp offsets to the text", () => {
    const edit = applyFormat("ab", -5, 99, "bold");

    expect(applyEdit("ab", edit)).toBe("**ab**");
  });

  it("should accept a reversed selection", () => {
    const edit = applyFormat("ab cd", 5, 3, "bold");

    expect(applyEdit("ab cd", edit)).toBe("ab **cd**");
  });

  it("should not split surrogate pairs when minimising", () => {
    const text = "😀 a";
    const edit = applyFormat(text, 0, text.length, "h1");

    expect(applyEdit(text, edit)).toBe(`# ${text}`);
    expect(edit.insert.length === 0 || edit.insert.charCodeAt(0) < 0xdc00 || edit.insert.charCodeAt(0) > 0xdfff).toBe(true);
  });
});

describe("given Enter at the end of a list item", () => {
  it("should continue a bullet", () => {
    expect(enter("- one|")).toBe("- one\n- |");
    expect(enter("* one|")).toBe("* one\n* |");
    expect(enter("+ one|")).toBe("+ one\n+ |");
  });

  it("should increment an ordered number and keep the delimiter", () => {
    expect(enter("1. one|")).toBe("1. one\n2. |");
    expect(enter("9) one|")).toBe("9) one\n10) |");
  });

  it("should continue a task with an unchecked box", () => {
    expect(enter("- [x] done|")).toBe("- [x] done\n- [ ] |");
    expect(enter("- [ ] todo|")).toBe("- [ ] todo\n- [ ] |");
  });

  it("should continue a blockquote", () => {
    expect(enter("> quoted|")).toBe("> quoted\n> |");
    expect(enter("> > nested|")).toBe("> > nested\n> > |");
  });

  it("should keep the indentation", () => {
    expect(enter("    - nested|")).toBe("    - nested\n    - |");
    expect(enter("  2. nested|")).toBe("  2. nested\n  3. |");
  });

  it("should continue a list inside a quote", () => {
    expect(enter("> - a|")).toBe("> - a\n> - |");
  });

  it("should split the line when the caret is in the middle", () => {
    expect(enter("- one| two")).toBe("- one\n- | two");
  });

  it("should only look at the caret line", () => {
    expect(enter("para\n- one|\nafter")).toBe("para\n- one\n- |\nafter");
  });
});

describe("given Enter on an empty list item", () => {
  it("should remove an empty bullet", () => {
    expect(enter("- |")).toBe("|");
    expect(enter("a\n- |")).toBe("a\n|");
  });

  it("should remove an empty ordered marker", () => {
    expect(enter("1. a\n2. |")).toBe("1. a\n|");
  });

  it("should remove an empty task marker", () => {
    expect(enter("- [ ] |")).toBe("|");
  });

  it("should remove an empty quote marker", () => {
    expect(enter("> a\n> |")).toBe("> a\n|");
  });

  it("should remove an indented empty item entirely", () => {
    expect(enter("  - |")).toBe("|");
  });

  it("should keep the quote when only the list item is empty", () => {
    expect(enter("> - |")).toBe("> |");
  });
});

describe("given Enter on a line that is not a list", () => {
  it.each(["plain|", "", "|", "# heading|", "**bold**|", "---|", "1986 was a year|", "-x|"])("should return null for %j", (input) => {
    expect(enter(input.includes("|") ? input : `${input}|`)).toBeNull();
  });

  it("should return null when the caret is inside the marker", () => {
    expect(continueList("- one", 1)).toBeNull();
    expect(continueList("1. one", 2)).toBeNull();
  });

  it("should clamp an out-of-range caret", () => {
    expect(continueList("- a", 99)).not.toBeNull();
  });
});
