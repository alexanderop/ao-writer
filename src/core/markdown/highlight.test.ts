import { describe, expect, it } from "vitest";

import { markdownRanges } from "./highlight.ts";
import type { MdRange } from "./highlight.ts";

/** Describe each range as `class:text` for compact assertions. */
function spans(text: string): string[] {
  return markdownRanges(text).map((range) => `${range.className}:${text.slice(range.start, range.end)}`);
}

function find(text: string, className: string): MdRange[] {
  const found: MdRange[] = [];

  for (const range of markdownRanges(text)) {
    if (range.className === className) {
      found.push(range);
    }
  }

  return found;
}

function maskedText(text: string): string {
  const chars = [...text];

  for (const range of markdownRanges(text)) {
    if (range.mask) {
      for (let i = range.start; i < range.end; i++) {
        chars[i] = "_";
      }
    }
  }

  return chars.join("");
}

describe("given headings", () => {
  it.each([1, 2, 3, 4, 5, 6])("should style an h%i and mask its hashes", (level) => {
    const text = `${"#".repeat(level)} Title`;

    expect(markdownRanges(text)).toEqual([
      { start: 0, end: level + 1, className: "md-mark", mask: true },
      { start: level + 1, end: level + 6, className: `md-h${level}`, mask: false },
    ]);
  });

  it("should not treat seven hashes or a missing space as a heading", () => {
    expect(spans("####### seven")).toEqual([]);
    expect(spans("#hashtag")).toEqual([]);
  });

  it("should mark closing hashes", () => {
    expect(spans("## Title ##")).toEqual(["md-mark:## ", "md-h2:Title", "md-mark:##"]);
  });

  it("should style an empty heading marker without a text range", () => {
    expect(spans("#")).toEqual(["md-mark:#"]);
  });

  it("should allow up to three spaces of indentation", () => {
    expect(spans("   # Hi")).toContain("md-h1:Hi");
  });

  it("should nest inline styles inside the heading", () => {
    expect(spans("# a **b**")).toEqual(["md-mark:# ", "md-h1:a **b**", "md-mark:**", "md-bold:b", "md-mark:**"]);
  });
});

describe("given blockquotes", () => {
  it("should style the content and mask the marker", () => {
    expect(markdownRanges("> hi")).toEqual([
      { start: 0, end: 1, className: "md-mark", mask: true },
      { start: 2, end: 4, className: "md-quote", mask: false },
    ]);
  });

  it("should handle nested markers and lines without a space", () => {
    expect(spans(">> deep")).toEqual(["md-mark:>", "md-quote:> deep", "md-mark:>", "md-quote:deep"]);
    expect(spans(">tight")).toEqual(["md-mark:>", "md-quote:tight"]);
  });

  it("should style blocks inside a quote", () => {
    expect(spans("> # Title")).toContain("md-h1:Title");
    expect(spans("> - item")).toContain("md-list-mark:-");
  });

  it("should span emphasis across quote lines", () => {
    const found = spans("> *a\n> b*");

    expect(found).toContain("md-italic:a");
    expect(found).toContain("md-italic:b");
  });
});

describe("given lists", () => {
  it.each([
    ["- a", "-"],
    ["* a", "*"],
    ["+ a", "+"],
    ["1. a", "1."],
    ["12) a", "12)"],
    ["  - nested", "-"],
  ])("should mask the marker in %j", (text, marker) => {
    const [first] = find(text, "md-list-mark");

    expect(first?.mask).toBe(true);
    expect(text.slice(first?.start, first?.end)).toBe(marker);
  });

  it("should not treat emphasis or text as list markers", () => {
    expect(find("*bold* text", "md-list-mark")).toEqual([]);
    expect(find("-x", "md-list-mark")).toEqual([]);
    expect(find("1.5 apples", "md-list-mark")).toEqual([]);
  });

  it("should mark empty items", () => {
    expect(spans("- ")).toEqual(["md-list-mark:-"]);
  });

  it("should mask task boxes", () => {
    expect(markdownRanges("- [ ] todo")).toEqual([
      { start: 0, end: 1, className: "md-list-mark", mask: true },
      { start: 2, end: 5, className: "md-task-mark", mask: true },
    ]);
  });

  it("should style completed task text", () => {
    expect(spans("- [x] done")).toEqual(["md-list-mark:-", "md-task-mark:[x]", "md-task-done:done"]);
    expect(spans("- [X] done")).toContain("md-task-done:done");
    expect(spans("- [ ] open")).not.toContain("md-task-done:open");
  });

  it("should not treat a box without a following space as a task", () => {
    expect(find("- [x]nope", "md-task-mark")).toEqual([]);
  });

  it("should style inline text inside items", () => {
    expect(spans("- a *b*")).toContain("md-italic:b");
  });
});

describe("given thematic breaks", () => {
  it.each(["---", "***", "___", "- - -", "* * *", "-----", "  ***"])("should mask %j", (text) => {
    const [range] = markdownRanges(text);

    expect(range?.className).toBe("md-hr");
    expect(range?.mask).toBe(true);
    expect(text.slice(range?.start, range?.end)).toBe(text.trim());
  });

  it("should not treat two characters or mixed characters as a break", () => {
    expect(find("--", "md-hr")).toEqual([]);
    expect(find("-*-", "md-hr")).toEqual([]);
  });
});

describe("given fenced code", () => {
  it("should mask fence lines as marks and inner lines as code", () => {
    const text = "```ts\nlet a = 1;\n\nlet b;\n```\nafter";

    expect(spans(text)).toEqual(["md-mark:```ts", "md-code:let a = 1;", "md-code:let b;", "md-mark:```"]);
    expect(markdownRanges(text).every((range) => range.mask)).toBe(true);
  });

  it("should support tilde fences and longer closing fences", () => {
    expect(spans("~~~\ncode\n~~~~")).toEqual(["md-mark:~~~", "md-code:code", "md-mark:~~~~"]);
  });

  it("should not close a fence with a shorter or different marker", () => {
    expect(spans("````\na\n```\nb\n````")).toEqual(["md-mark:````", "md-code:a", "md-code:```", "md-code:b", "md-mark:````"]);
    expect(spans("```\na\n~~~")).toEqual(["md-mark:```", "md-code:a", "md-code:~~~"]);
  });

  it("should extend an unterminated fence to the end of the text", () => {
    expect(spans("```\nstill *code*\nmore")).toEqual(["md-mark:```", "md-code:still *code*", "md-code:more"]);
  });

  it("should not parse markdown inside the fence", () => {
    expect(find("```\n# not heading\n**x**\n```", "md-h1")).toEqual([]);
    expect(find("```\n**x**\n```", "md-bold")).toEqual([]);
  });

  it("should resume normal parsing after the fence", () => {
    expect(spans("```\nx\n```\n# After")).toContain("md-h1:After");
  });

  it("should reject a backtick fence whose info string has a backtick", () => {
    expect(find("```a`b\nx", "md-code")).toEqual([]);
  });
});

describe("given inline emphasis", () => {
  it("should style bold with both delimiter styles", () => {
    expect(spans("**x**")).toEqual(["md-mark:**", "md-bold:x", "md-mark:**"]);
    expect(spans("__x__")).toEqual(["md-mark:__", "md-bold:x", "md-mark:__"]);
  });

  it("should style italic with both delimiter styles", () => {
    expect(spans("*x*")).toEqual(["md-mark:*", "md-italic:x", "md-mark:*"]);
    expect(spans("_x_")).toEqual(["md-mark:_", "md-italic:x", "md-mark:_"]);
  });

  it("should style strikethrough", () => {
    expect(spans("~~x~~")).toEqual(["md-mark:~~", "md-strike:x", "md-mark:~~"]);
  });

  it("should mask the delimiters but not the styled text", () => {
    const ranges = markdownRanges("a **b** c");

    expect(ranges.filter((range) => range.className === "md-mark").every((range) => range.mask)).toBe(true);
    expect(find("a **b** c", "md-bold")[0]?.mask).toBe(false);
  });

  it("should handle bold and italic combined", () => {
    expect(spans("***x***")).toEqual(["md-mark:*", "md-italic:**x**", "md-mark:**", "md-bold:x", "md-mark:**", "md-mark:*"]);
  });

  it("should nest italic inside bold", () => {
    expect(spans("**a *b* c**")).toContain("md-italic:b");
    expect(spans("**a *b* c**")).toContain("md-bold:a *b* c");
  });

  it("should not treat underscores inside words as emphasis", () => {
    expect(spans("snake_case_name")).toEqual([]);
    expect(spans("a_b_ c")).toEqual([]);
  });

  it("should still allow asterisks inside words", () => {
    expect(spans("un*frigging*believable")).toContain("md-italic:frigging");
  });

  it("should not treat spaced delimiters as emphasis", () => {
    expect(spans("2 * 3 * 4")).toEqual([]);
    expect(spans("a ** b ** c")).toEqual([]);
  });

  it("should span emphasis across lines of one paragraph", () => {
    const found = spans("*a\nb*");

    expect(found).toContain("md-italic:a");
    expect(found).toContain("md-italic:b");
    expect(found.filter((entry) => entry.startsWith("md-italic")).join("")).not.toContain("\n");
  });

  it("should not span emphasis across blank lines", () => {
    expect(spans("*a\n\nb*")).toEqual([]);
  });

  it("should not span emphasis across a block boundary", () => {
    expect(find("*a\n# b*", "md-italic")).toEqual([]);
  });

  it("should treat backslash-escaped markers as text", () => {
    expect(spans("\\*x\\*")).toEqual([]);
    expect(spans("\\*\\*x\\*\\*")).toEqual([]);
    expect(spans("\\`x\\`")).toEqual([]);
  });

  it("should leave unmatched delimiters alone", () => {
    expect(spans("**x")).toEqual([]);
    expect(spans("x*")).toEqual([]);
  });
});

describe("given inline code", () => {
  it("should mask the content and backticks", () => {
    expect(markdownRanges("a `b` c")).toEqual([
      { start: 2, end: 3, className: "md-mark", mask: true },
      { start: 3, end: 4, className: "md-code", mask: true },
      { start: 4, end: 5, className: "md-mark", mask: true },
    ]);
  });

  it("should support multi-backtick spans", () => {
    expect(spans("`` a ` b ``")).toEqual(["md-mark:``", "md-code: a ` b ", "md-mark:``"]);
  });

  it("should not parse emphasis or links inside a code span", () => {
    expect(find("`**x** [a](b)`", "md-bold")).toEqual([]);
    expect(find("`[a](http://x.y)`", "md-link-url")).toEqual([]);
  });

  it("should leave unmatched backticks alone", () => {
    expect(spans("a ` b")).toEqual([]);
  });

  it("should let a code span hide a delimiter from emphasis", () => {
    expect(spans("*a `*` b*")).toContain("md-italic:a `*` b");
  });
});

describe("given links and images", () => {
  it("should split a link into text, marks and url", () => {
    expect(spans("[text](http://x.y)")).toEqual([
      "md-mark:[",
      "md-link-text:text",
      "md-mark:]",
      "md-mark:(",
      "md-link-url:http://x.y",
      "md-mark:)",
    ]);
  });

  it("should mask brackets and the url but not the text", () => {
    const ranges = markdownRanges("[text](url)");

    expect(ranges.find((range) => range.className === "md-link-text")?.mask).toBe(false);
    expect(ranges.find((range) => range.className === "md-link-url")?.mask).toBe(true);
    expect(ranges.filter((range) => range.className === "md-mark").every((range) => range.mask)).toBe(true);
  });

  it("should add md-image for images", () => {
    expect(spans("![alt](src.png)")).toEqual([
      "md-image:![alt](src.png)",
      "md-mark:![",
      "md-link-text:alt",
      "md-mark:]",
      "md-mark:(",
      "md-link-url:src.png",
      "md-mark:)",
    ]);
  });

  it("should include titles in the masked url part", () => {
    expect(spans('[a](u "title")')).toContain('md-link-url:u "title"');
  });

  it("should balance parentheses in the url", () => {
    expect(spans("[a](http://x.y/a_(b))")).toContain("md-link-url:http://x.y/a_(b)");
  });

  it("should style emphasis inside link text", () => {
    expect(spans("[a *b*](u)")).toContain("md-italic:b");
  });

  it("should not treat emphasis markers in the url as emphasis", () => {
    expect(find("[a](http://x.y/_a_b_)", "md-italic")).toEqual([]);
  });

  it("should ignore brackets without a url part", () => {
    expect(spans("[just text] and [more]")).toEqual([]);
    expect(spans("[a](unclosed")).toEqual([]);
  });

  it("should mask bare urls", () => {
    expect(markdownRanges("see https://example.com/a_b_c now")).toEqual([
      { start: 4, end: 29, className: "md-link-url", mask: true },
    ]);
    expect(spans("http://x.y.")).toEqual(["md-link-url:http://x.y"]);
  });

  it("should leave trailing punctuation and unbalanced parens out of bare urls", () => {
    expect(spans("(see http://x.y/a)")).toContain("md-link-url:http://x.y/a");
    expect(spans("http://x.y/a_(b), ok")).toContain("md-link-url:http://x.y/a_(b)");
  });

  it("should mask angle-bracket autolinks and their brackets", () => {
    expect(spans("<https://x.y>")).toEqual(["md-mark:<", "md-link-url:https://x.y", "md-mark:>"]);
  });

  it("should not detect a url in the middle of a word", () => {
    expect(spans("xhttp://a.b")).toEqual([]);
  });
});

describe("given mask ranges", () => {
  it("should mask every syntax character and keep prose visible", () => {
    const text = "# Title\n\nSome **bold** and `code` with [a link](http://x.y).\n\n- [x] done\n> quote\n---";

    expect(maskedText(text)).toBe(
      "__Title\n\nSome __bold__ and ______ with _a link_____________.\n\n_ ___ done\n_ quote\n___",
    );
  });

  it("should mask code blocks completely", () => {
    expect(maskedText("```js\nlet a\n```")).toBe("_____\n_____\n___");
  });
});

describe("given any text", () => {
  const samples = [
    "",
    "\n",
    "\n\n\n",
    "a",
    "# ",
    "> ",
    "- ",
    "```",
    "**",
    "[]()",
    "![]()",
    "[](",
    "`",
    "\\",
    "a\\",
    "~~",
    "# h\n> q\n- l\n```\ncode",
    "*a **b ~~c `d [e](f) ![g](h) http://i.j` k~~ l** m*",
    "café 😀 **bold** 😀",
  ];

  it.each(samples)("should return ordered in-bounds ranges for %j", (text) => {
    const ranges = markdownRanges(text);
    let previous = 0;

    for (const range of ranges) {
      expect(range.start).toBeGreaterThanOrEqual(0);
      expect(range.end).toBeLessThanOrEqual(text.length);
      expect(range.start).toBeLessThan(range.end);
      expect(range.start).toBeGreaterThanOrEqual(previous);
      previous = range.start;
    }
  });

  it("should always mask marks, code and urls", () => {
    for (const text of samples) {
      for (const range of markdownRanges(text)) {
        const syntax = ["md-mark", "md-code", "md-link-url", "md-hr", "md-list-mark", "md-task-mark"];

        expect(range.mask).toBe(syntax.includes(range.className));
      }
    }
  });

  it("should be deterministic", () => {
    const text = "# a\n*b* [c](d)\n";

    expect(markdownRanges(text)).toEqual(markdownRanges(text));
  });
});

describe("given stress input", () => {
  const alphabet = ["*", "_", "~~", "`", "[", "]", "(", ")", "!", "\\", "\n", "\n\n", "# ", "> ", "- ", "1. ", "```\n", "http://a.b", " ", "word", "x", "<", "&", "|"];

  function generate(seed: number, length: number): string {
    let state = seed;
    let out = "";

    for (let i = 0; i < length; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      out += alphabet[state % alphabet.length] ?? "";
    }

    return out;
  }

  it("should never throw and stay in bounds for generated documents", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const text = generate(seed, 120);

      for (const range of markdownRanges(text)) {
        expect(range.start).toBeGreaterThanOrEqual(0);
        expect(range.end).toBeLessThanOrEqual(text.length);
        expect(range.start).toBeLessThan(range.end);
      }
    }
  });

  it("should highlight a 20k-word document in well under a second", () => {
    const text = "Some **bold** and *italic* words with `code` and [links](http://x.y) here.\n".repeat(1700);
    const started = performance.now();
    const ranges = markdownRanges(text);

    expect(ranges.length).toBeGreaterThan(10000);
    expect(performance.now() - started).toBeLessThan(1500);
  });

  it.each([
    ["unmatched stars", "*".repeat(50000)],
    ["unmatched underscores", "_a".repeat(25000)],
    ["unmatched backticks", "`a".repeat(25000)],
    ["unmatched brackets", "[".repeat(50000)],
    ["repeated link openers", "[a](".repeat(10000)],
    ["nested quotes", ">".repeat(50000)],
    ["nested emphasis", `${"*a ".repeat(10000)}${"a* ".repeat(10000)}`],
    ["one long line", "word ".repeat(40000)],
    ["many fences", "```\n".repeat(10000)],
  ])("should stay fast on %s", (_, text) => {
    const started = performance.now();

    markdownRanges(text);

    expect(performance.now() - started).toBeLessThan(3000);
  });
});
