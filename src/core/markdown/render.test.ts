import { describe, expect, it } from "vitest";

import { renderMarkdown } from "./render.ts";

const EXTERNAL = 'rel="noopener noreferrer" target="_blank"';

/** Every tag name the renderer may emit. */
const ALLOWED_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "em",
  "strong",
  "del",
  "code",
  "pre",
  "a",
  "img",
  "ul",
  "ol",
  "li",
  "blockquote",
  "hr",
  "br",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "input",
]);

/** Assert that the html only contains whitelisted tags and no event-handler attributes. */
function expectSafe(html: string): void {
  for (const match of html.matchAll(/<(\/?)([a-zA-Z0-9]*)/g)) {
    expect(ALLOWED_TAGS.has((match[2] ?? "").toLowerCase())).toBe(true);
  }

  expect(html).not.toMatch(/<[^>]*\son[a-z]+\s*=/i);
  expect(html).not.toMatch(/href="\s*(?:javascript|data|vbscript):/i);
  expect(html).not.toMatch(/src="\s*(?:javascript|data|vbscript):/i);
}

describe("given an empty document", () => {
  it("should render nothing", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown("\n\n  \n")).toBe("");
  });
});

describe("given paragraphs", () => {
  it("should wrap text in a paragraph and join blocks with newlines", () => {
    expect(renderMarkdown("one\n\ntwo")).toBe("<p>one</p>\n<p>two</p>");
  });

  it("should keep soft line breaks as newlines", () => {
    expect(renderMarkdown("one\ntwo")).toBe("<p>one\ntwo</p>");
  });

  it("should render two trailing spaces as a hard break", () => {
    expect(renderMarkdown("one  \ntwo")).toBe("<p>one<br />\ntwo</p>");
  });

  it("should render a trailing backslash as a hard break", () => {
    expect(renderMarkdown("one\\\ntwo")).toBe("<p>one<br />\ntwo</p>");
  });

  it("should strip leading whitespace from continuation lines and trailing space at the end", () => {
    expect(renderMarkdown("one\n   two   ")).toBe("<p>one\ntwo</p>");
  });

  it("should normalise CRLF and CR line endings", () => {
    expect(renderMarkdown("one\r\n\r\ntwo\rthree")).toBe("<p>one</p>\n<p>two\nthree</p>");
  });

  it("should have no trailing newline", () => {
    expect(renderMarkdown("a\n\n\n")).toBe("<p>a</p>");
  });

  it("should be deterministic", () => {
    const source = "# a\n\n- b\n- c\n\n| x |\n|---|\n| y |";

    expect(renderMarkdown(source)).toBe(renderMarkdown(source));
  });
});

describe("given headings", () => {
  it.each([1, 2, 3, 4, 5, 6])("should render h%i with a slug id", (level) => {
    expect(renderMarkdown(`${"#".repeat(level)} Hello World`)).toBe(`<h${level} id="hello-world">Hello World</h${level}>`);
  });

  it("should not render seven hashes or a missing space as a heading", () => {
    expect(renderMarkdown("####### x")).toBe("<p>####### x</p>");
    expect(renderMarkdown("#x")).toBe("<p>#x</p>");
  });

  it("should strip closing hashes", () => {
    expect(renderMarkdown("## Title ##")).toBe('<h2 id="title">Title</h2>');
  });

  it("should render inline markup and build the slug from the plain text", () => {
    expect(renderMarkdown("# A *b* [c](d)")).toBe('<h1 id="a-b-c">A <em>b</em> <a href="d">c</a></h1>');
  });

  it("should drop punctuation from slugs and keep unicode letters", () => {
    expect(renderMarkdown("# Hello, World! #1")).toBe('<h1 id="hello-world-1">Hello, World! #1</h1>');
    expect(renderMarkdown("# Gr\u00fc\u00dfe aus K\u00f6ln")).toContain('id="gr\u00fc\u00dfe-aus-k\u00f6ln"');
  });

  it("should de-duplicate slugs in document order", () => {
    expect(renderMarkdown("# A\n\n# A\n\n# A")).toBe('<h1 id="a">A</h1>\n<h1 id="a-1">A</h1>\n<h1 id="a-2">A</h1>');
  });

  it("should fall back to a section slug", () => {
    expect(renderMarkdown("# !!!")).toBe('<h1 id="section">!!!</h1>');
    expect(renderMarkdown("#")).toBe('<h1 id="section"></h1>');
  });

  it("should escape html in headings", () => {
    expect(renderMarkdown('# <img src=x onerror="a">')).toBe(
      '<h1 id="img-srcx-onerrora">&lt;img src=x onerror=&quot;a&quot;&gt;</h1>',
    );
  });
});

describe("given inline formatting", () => {
  it.each([
    ["**b**", "<p><strong>b</strong></p>"],
    ["__b__", "<p><strong>b</strong></p>"],
    ["*i*", "<p><em>i</em></p>"],
    ["_i_", "<p><em>i</em></p>"],
    ["~~s~~", "<p><del>s</del></p>"],
    ["`c`", "<p><code>c</code></p>"],
    ["***bi***", "<p><em><strong>bi</strong></em></p>"],
    ["*a **b** c*", "<p><em>a <strong>b</strong> c</em></p>"],
    ["**a *b* c**", "<p><strong>a <em>b</em> c</strong></p>"],
  ])("should render %j", (source, html) => {
    expect(renderMarkdown(source)).toBe(html);
  });

  it("should not treat intraword underscores as emphasis", () => {
    expect(renderMarkdown("snake_case_word")).toBe("<p>snake_case_word</p>");
  });

  it("should treat intraword asterisks as emphasis", () => {
    expect(renderMarkdown("2*3*4")).toBe("<p>2<em>3</em>4</p>");
  });

  it("should leave unmatched markers as text", () => {
    expect(renderMarkdown("**a *b")).toBe("<p>**a *b</p>");
    expect(renderMarkdown("a * b * c")).toBe("<p>a * b * c</p>");
  });

  it("should escape html inside inline code and keep markers literal", () => {
    expect(renderMarkdown("`<b>**x**</b>`")).toBe("<p><code>&lt;b&gt;**x**&lt;/b&gt;</code></p>");
  });

  it("should handle multi-backtick spans and strip one padding space", () => {
    expect(renderMarkdown("`` a ` b ``")).toBe("<p><code>a ` b</code></p>");
  });

  it("should leave a lone backtick as text", () => {
    expect(renderMarkdown("a ` b")).toBe("<p>a ` b</p>");
  });

  it("should honour backslash escapes", () => {
    expect(renderMarkdown("\\*a\\* \\# \\[x\\] \\\\")).toBe("<p>*a* # [x] \\</p>");
    expect(renderMarkdown("a \\q")).toBe("<p>a \\q</p>");
  });

  it("should decode numeric and common named entities and re-escape them", () => {
    expect(renderMarkdown("&copy; &#x41; &#66; &amp; &lt;")).toBe("<p>\u00a9 A B &amp; &lt;</p>");
    expect(renderMarkdown("& &bogus;")).toBe("<p>&amp; &amp;bogus;</p>");
  });

  it("should replace invalid code points", () => {
    expect(renderMarkdown("&#0; &#xD800;")).toBe("<p>\ufffd \ufffd</p>");
  });
});

describe("given links", () => {
  it("should render an external link with rel and target", () => {
    expect(renderMarkdown("[a](https://example.com/x?y=1&z=2)")).toBe(
      `<p><a href="https://example.com/x?y=1&amp;z=2" ${EXTERNAL}>a</a></p>`,
    );
  });

  it("should not add target to relative, fragment, mailto and tel links", () => {
    expect(renderMarkdown("[a](/x) [b](#y) [c](mailto:a@b.co) [d](tel:+123) [e](rel/path)")).toBe(
      '<p><a href="/x">a</a> <a href="#y">b</a> <a href="mailto:a@b.co">c</a> <a href="tel:+123">d</a> <a href="rel/path">e</a></p>',
    );
  });

  it("should render link titles", () => {
    expect(renderMarkdown('[a](/x "A \\"title\\"")')).toBe('<p><a href="/x" title="A &quot;title&quot;">a</a></p>');
  });

  it("should render inline markup in link text", () => {
    expect(renderMarkdown("[**a** `b`](/x)")).toBe('<p><a href="/x"><strong>a</strong> <code>b</code></a></p>');
  });

  it("should support angle-bracket destinations with spaces", () => {
    expect(renderMarkdown("[a](<b c>)")).toBe('<p><a href="b%20c">a</a></p>');
  });

  it("should support balanced parentheses in urls", () => {
    expect(renderMarkdown("[a](https://x.y/a_(b))")).toContain('href="https://x.y/a_(b)"');
  });

  it("should leave brackets without a destination as text", () => {
    expect(renderMarkdown("[a] and [b](")).toBe("<p>[a] and [b](</p>");
  });

  it("should not nest links", () => {
    expect(renderMarkdown("[a [b](/u) c](/v)")).toBe('<p>[a <a href="/u">b</a> c](/v)</p>');
  });

  it("should autolink bare urls", () => {
    expect(renderMarkdown("see https://example.com/a_b_c now")).toBe(
      `<p>see <a href="https://example.com/a_b_c" ${EXTERNAL}>https://example.com/a_b_c</a> now</p>`,
    );
  });

  it("should leave trailing punctuation out of autolinks", () => {
    expect(renderMarkdown("go to http://x.y/z.")).toBe(`<p>go to <a href="http://x.y/z" ${EXTERNAL}>http://x.y/z</a>.</p>`);
    expect(renderMarkdown("(http://x.y/z)")).toBe(`<p>(<a href="http://x.y/z" ${EXTERNAL}>http://x.y/z</a>)</p>`);
  });

  it("should autolink angle-bracket urls without the brackets", () => {
    expect(renderMarkdown("<https://x.y>")).toBe(`<p><a href="https://x.y" ${EXTERNAL}>https://x.y</a></p>`);
  });

  it("should not create nested anchors for urls in link text", () => {
    expect(renderMarkdown("[https://x.y](https://x.y)")).toBe(
      `<p><a href="https://x.y" ${EXTERNAL}>https://x.y</a></p>`,
    );
  });

  it("should not autolink urls inside code", () => {
    expect(renderMarkdown("`http://x.y`")).toBe("<p><code>http://x.y</code></p>");
  });
});

describe("given images", () => {
  it("should render an image with alt text", () => {
    expect(renderMarkdown("![A cat](cat.png)")).toBe('<p><img src="cat.png" alt="A cat"></p>');
  });

  it("should render a title and flatten markup in the alt text", () => {
    expect(renderMarkdown('![a *b* `c`](https://x.y/i.png "T")')).toBe('<p><img src="https://x.y/i.png" alt="a b c" title="T"></p>');
  });

  it("should allow an image inside a link", () => {
    expect(renderMarkdown("[![a](i.png)](/x)")).toBe('<p><a href="/x"><img src="i.png" alt="a"></a></p>');
  });

  it("should escape html in alt text", () => {
    expect(renderMarkdown("![<b>x</b>](i.png)")).toBe('<p><img src="i.png" alt="&lt;b&gt;x&lt;/b&gt;"></p>');
  });
});

describe("given code blocks", () => {
  it("should render a fenced block with a language class", () => {
    expect(renderMarkdown("```js\nlet a = 1 < 2;\n```")).toBe(
      '<pre><code class="language-js">let a = 1 &lt; 2;\n</code></pre>',
    );
  });

  it("should render a fenced block without a language", () => {
    expect(renderMarkdown("```\nx\n\ny\n```")).toBe("<pre><code>x\n\ny\n</code></pre>");
  });

  it("should support tilde fences and keep longer fences open", () => {
    expect(renderMarkdown("~~~\n```\nx\n```\n~~~")).toBe("<pre><code>```\nx\n```\n</code></pre>");
  });

  it("should close an unterminated fence at the end of the document", () => {
    expect(renderMarkdown("```\nx\ny")).toBe("<pre><code>x\ny\n</code></pre>");
  });

  it("should render an empty fence", () => {
    expect(renderMarkdown("```\n```")).toBe("<pre><code></code></pre>");
  });

  it("should not interpret markdown inside a fence", () => {
    expect(renderMarkdown("```\n# no\n**no**\n```")).toBe("<pre><code># no\n**no**\n</code></pre>");
  });

  it("should strip unsafe characters from the language", () => {
    expect(renderMarkdown('```js" onclick="x\ny\n```')).toBe('<pre><code class="language-js">y\n</code></pre>');
    expect(renderMarkdown("```c++\nx\n```")).toContain('class="language-c++"');
  });

  it("should remove the fence indentation from content lines", () => {
    expect(renderMarkdown("  ```\n  a\n   b\n  ```")).toBe("<pre><code>a\n b\n</code></pre>");
  });

  it("should render indented code", () => {
    expect(renderMarkdown("    a <b>\n\n    c")).toBe("<pre><code>a &lt;b&gt;\n\nc\n</code></pre>");
  });

  it("should expand leading tabs", () => {
    expect(renderMarkdown("\ta")).toBe("<pre><code>a\n</code></pre>");
  });
});

describe("given blockquotes", () => {
  it("should render a quote with paragraphs", () => {
    expect(renderMarkdown("> a\n> b")).toBe("<blockquote>\n<p>a\nb</p>\n</blockquote>");
  });

  it("should nest quotes", () => {
    expect(renderMarkdown("> a\n> > b")).toBe("<blockquote>\n<p>a</p>\n<blockquote>\n<p>b</p>\n</blockquote>\n</blockquote>");
  });

  it("should contain other blocks", () => {
    expect(renderMarkdown("> # T\n>\n> - x\n>\n> ```\n> c\n> ```")).toBe(
      '<blockquote>\n<h1 id="t">T</h1>\n<ul>\n<li>x</li>\n</ul>\n<pre><code>c\n</code></pre>\n</blockquote>',
    );
  });

  it("should support lazy continuation lines", () => {
    expect(renderMarkdown("> a\nb")).toBe("<blockquote>\n<p>a\nb</p>\n</blockquote>");
  });

  it("should end at a blank line", () => {
    expect(renderMarkdown("> a\n\nb")).toBe("<blockquote>\n<p>a</p>\n</blockquote>\n<p>b</p>");
  });

  it("should not continue lazily after a heading", () => {
    expect(renderMarkdown("> # T\nb")).toBe('<blockquote>\n<h1 id="t">T</h1>\n</blockquote>\n<p>b</p>');
  });

  it("should render an empty quote", () => {
    expect(renderMarkdown(">")).toBe("<blockquote>\n</blockquote>");
  });
});

describe("given lists", () => {
  it("should render a tight unordered list", () => {
    expect(renderMarkdown("- a\n- b")).toBe("<ul>\n<li>a</li>\n<li>b</li>\n</ul>");
    expect(renderMarkdown("* a\n* b")).toBe("<ul>\n<li>a</li>\n<li>b</li>\n</ul>");
    expect(renderMarkdown("+ a")).toBe("<ul>\n<li>a</li>\n</ul>");
  });

  it("should render an ordered list and honour the start number", () => {
    expect(renderMarkdown("1. a\n2. b")).toBe("<ol>\n<li>a</li>\n<li>b</li>\n</ol>");
    expect(renderMarkdown("3. a\n4. b")).toBe('<ol start="3">\n<li>a</li>\n<li>b</li>\n</ol>');
    expect(renderMarkdown("1) a\n2) b")).toBe("<ol>\n<li>a</li>\n<li>b</li>\n</ol>");
    expect(renderMarkdown("0. a")).toBe('<ol start="0">\n<li>a</li>\n</ol>');
  });

  it("should render a loose list with paragraphs", () => {
    expect(renderMarkdown("- a\n\n- b")).toBe("<ul>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n</ul>");
  });

  it("should nest lists by indentation", () => {
    expect(renderMarkdown("- a\n  - b\n    - c\n- d")).toBe(
      "<ul>\n<li>a\n<ul>\n<li>b\n<ul>\n<li>c</li>\n</ul>\n</li>\n</ul>\n</li>\n<li>d</li>\n</ul>",
    );
  });

  it("should nest ordered lists inside bullets and vice versa", () => {
    expect(renderMarkdown("1. a\n   - b\n2. c")).toBe("<ol>\n<li>a\n<ul>\n<li>b</li>\n</ul>\n</li>\n<li>c</li>\n</ol>");
  });

  it("should start a new list when the bullet character changes", () => {
    expect(renderMarkdown("- a\n* b")).toBe("<ul>\n<li>a</li>\n</ul>\n<ul>\n<li>b</li>\n</ul>");
  });

  it("should end the list at an unindented paragraph after a blank line", () => {
    expect(renderMarkdown("- a\n\nafter")).toBe("<ul>\n<li>a</li>\n</ul>\n<p>after</p>");
  });

  it("should support lazy continuation lines in items", () => {
    expect(renderMarkdown("- a\nb")).toBe("<ul>\n<li>a\nb</li>\n</ul>");
  });

  it("should put block content inside an item", () => {
    expect(renderMarkdown("- a\n\n  para\n\n  ```\n  c\n  ```")).toBe(
      "<ul>\n<li>\n<p>a</p>\n<p>para</p>\n<pre><code>c\n</code></pre>\n</li>\n</ul>",
    );
  });

  it("should interrupt a paragraph with a list", () => {
    expect(renderMarkdown("text\n- a")).toBe("<p>text</p>\n<ul>\n<li>a</li>\n</ul>");
    expect(renderMarkdown("text\n1. a")).toBe("<p>text</p>\n<ol>\n<li>a</li>\n</ol>");
  });

  it("should not interrupt a paragraph with an ordered list that does not start at one", () => {
    expect(renderMarkdown("text\n2. a")).toBe("<p>text\n2. a</p>");
  });

  it("should treat a thematic break as a break and not a list", () => {
    expect(renderMarkdown("- - -")).toBe("<hr />");
    expect(renderMarkdown("- a\n---")).toBe("<ul>\n<li>a</li>\n</ul>\n<hr />");
  });

  it("should render an empty item", () => {
    expect(renderMarkdown("-\n- b")).toBe("<ul>\n<li></li>\n<li>b</li>\n</ul>");
  });

  it("should render inline markup in items", () => {
    expect(renderMarkdown("- **a** [b](/c)")).toBe('<ul>\n<li><strong>a</strong> <a href="/c">b</a></li>\n</ul>');
  });

  it("should keep a tight parent when only a nested list is loose", () => {
    const html = renderMarkdown("- a\n  - b\n\n  - c\n- d");

    expect(html).toContain("<li>a\n<ul>");
    expect(html).toContain("<p>b</p>");
    expect(html).toContain("<li>d</li>");
  });
});

describe("given task lists", () => {
  it("should render unchecked and checked tasks", () => {
    expect(renderMarkdown("- [ ] a\n- [x] b\n- [X] c")).toBe(
      [
        "<ul>",
        '<li class="task"><input type="checkbox" disabled> a</li>',
        '<li class="task"><input type="checkbox" disabled checked> b</li>',
        '<li class="task"><input type="checkbox" disabled checked> c</li>',
        "</ul>",
      ].join("\n"),
    );
  });

  it("should render markup after the box", () => {
    expect(renderMarkdown("- [ ] **a**")).toContain('<input type="checkbox" disabled> <strong>a</strong>');
  });

  it("should render nested tasks", () => {
    expect(renderMarkdown("- [ ] a\n  - [x] b")).toBe(
      [
        "<ul>",
        '<li class="task"><input type="checkbox" disabled> a',
        "<ul>",
        '<li class="task"><input type="checkbox" disabled checked> b</li>',
        "</ul>",
        "</li>",
        "</ul>",
      ].join("\n"),
    );
  });

  it("should not treat a box without a following space as a task", () => {
    expect(renderMarkdown("- [x]a")).toBe("<ul>\n<li>[x]a</li>\n</ul>");
    expect(renderMarkdown("- [ ]")).toBe("<ul>\n<li>[ ]</li>\n</ul>");
  });

  it("should render ordered tasks", () => {
    expect(renderMarkdown("1. [x] a")).toContain('<li class="task"><input type="checkbox" disabled checked> a</li>');
  });
});

describe("given thematic breaks", () => {
  it.each(["---", "***", "___", "- - -", "* * *", "_____", "   ---"])("should render %j", (source) => {
    expect(renderMarkdown(source)).toBe("<hr />");
  });

  it("should not render two characters as a break", () => {
    expect(renderMarkdown("--")).toBe("<p>--</p>");
  });
});

describe("given tables", () => {
  it("should render header, alignment and body", () => {
    expect(renderMarkdown("| a | b | c | d |\n|---|:--|:-:|--:|\n| 1 | 2 | 3 | 4 |")).toBe(
      [
        "<table>",
        "<thead>",
        "<tr>",
        "<th>a</th>",
        '<th style="text-align:left">b</th>',
        '<th style="text-align:center">c</th>',
        '<th style="text-align:right">d</th>',
        "</tr>",
        "</thead>",
        "<tbody>",
        "<tr>",
        "<td>1</td>",
        '<td style="text-align:left">2</td>',
        '<td style="text-align:center">3</td>',
        '<td style="text-align:right">4</td>',
        "</tr>",
        "</tbody>",
        "</table>",
      ].join("\n"),
    );
  });

  it("should work without outer pipes", () => {
    expect(renderMarkdown("a | b\n--|--\n1 | 2")).toContain("<td>1</td>\n<td>2</td>");
  });

  it("should omit tbody when there are no body rows", () => {
    expect(renderMarkdown("| a |\n|---|")).toBe("<table>\n<thead>\n<tr>\n<th>a</th>\n</tr>\n</thead>\n</table>");
  });

  it("should pad short rows and truncate long rows", () => {
    const html = renderMarkdown("| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |");

    expect(html).toContain("<td>1</td>\n<td></td>");
    expect(html).not.toContain("<td>3</td>");
  });

  it("should render inline markup and escaped pipes in cells", () => {
    const html = renderMarkdown("| **a** | `b` |\n|---|---|\n| x \\| y | [l](/u) |");

    expect(html).toContain("<th><strong>a</strong></th>");
    expect(html).toContain("<td>x | y</td>");
    expect(html).toContain('<td><a href="/u">l</a></td>');
  });

  it("should end the table at a blank line", () => {
    expect(renderMarkdown("| a |\n|---|\n| 1 |\n\ntext")).toMatch(/<\/table>\n<p>text<\/p>$/);
  });

  it("should require matching column counts", () => {
    expect(renderMarkdown("| a | b |\n|---|")).toBe("<p>| a | b |\n|---|</p>");
  });

  it("should escape html in cells", () => {
    expect(renderMarkdown("| <script> |\n|---|\n| <b> |")).toContain("<th>&lt;script&gt;</th>");
  });

  it("should not treat a lone pipe line as a table", () => {
    expect(renderMarkdown("a | b\nc")).toBe("<p>a | b\nc</p>");
  });
});

describe("given html in the source", () => {
  it.each([
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    '<a href="javascript:alert(1)">x</a>',
    "<iframe src=//evil></iframe>",
    "<svg/onload=alert(1)>",
    "<!-- comment --><style>*{}</style>",
    "<scr<script>ipt>alert(1)</script>",
    "<div onmouseover=alert(1)>hover</div>",
    "<<script>script>",
    "unterminated <script src=x",
    "<img src='x' onerror='y'",
    "<a href=\"x",
    "</p><script>alert(1)</script>",
  ])("should escape %j", (source) => {
    const html = renderMarkdown(source);

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img src=");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<style");
    expect(html).not.toContain("<div");
    expectSafe(html);
  });

  it("should escape html next to markdown", () => {
    expect(renderMarkdown("**<b>x</b>**")).toBe("<p><strong>&lt;b&gt;x&lt;/b&gt;</strong></p>");
    expect(renderMarkdown("<b>*x*</b>")).toBe("<p>&lt;b&gt;<em>x</em>&lt;/b&gt;</p>");
  });

  it("should escape html in link text, titles, alt text and urls", () => {
    expect(renderMarkdown("[<img src=x onerror=y>](/u)")).toBe('<p><a href="/u">&lt;img src=x onerror=y&gt;</a></p>');
    expect(renderMarkdown('[a](/u "<script>")')).toBe('<p><a href="/u" title="&lt;script&gt;">a</a></p>');
    expect(renderMarkdown('[a](/u"onclick="x)')).not.toMatch(/"onclick=/);
    expect(renderMarkdown('![x" onerror="y](i.png)')).toBe('<p><img src="i.png" alt="x&quot; onerror=&quot;y"></p>');
  });

  it("should escape html inside blockquotes, lists and tables", () => {
    for (const source of ["> <script>x</script>", "- <script>x</script>", "| <script> |\n|---|\n| <img onerror=x> |"]) {
      expectSafe(renderMarkdown(source));
    }
  });

  it("should escape quotes and apostrophes in text", () => {
    expect(renderMarkdown("\"a\" 'b'")).toBe("<p>&quot;a&quot; &#39;b&#39;</p>");
  });
});

describe("given dangerous urls", () => {
  const blocked = [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "JAVASCRIPT:alert(1)",
    " javascript:alert(1)",
    "  JaVaScRiPt:alert(1)",
    "&#106;avascript:alert(1)",
    "&#x6A;avascript:alert(1)",
    "java&#09;script:alert(1)",
    "java&Tab;script:alert(1)",
    "java&NewLine;script:alert(1)",
    "javascript&colon;alert(1)",
    "javascript&#58;alert(1)",
    "javascript&#x3A;alert(1)",
    "jav\\ascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "DATA:text/html,x",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://x.y",
    "blob:https://x.y/uuid",
    "custom-scheme:payload",
    "\u00a0javascript:alert(1)",
    "java\u2028script:alert(1)",
  ];

  it.each(blocked)("should replace the link target %j with #", (url) => {
    const html = renderMarkdown(`[x](<${url}>)`);

    expect(html).toBe('<p><a href="#">x</a></p>');
  });

  it.each(blocked)("should not link %j when written without angle brackets", (url) => {
    expectSafe(renderMarkdown(`[x](${url})`));
  });

  it.each(blocked)("should drop the image %j", (url) => {
    const html = renderMarkdown(`![alt](<${url}>)`);

    expect(html).toBe("<p>alt</p>");
  });

  it("should keep an entity without a semicolon escaped so the browser cannot decode it", () => {
    expect(renderMarkdown("[x](<&#106avascript:alert(1)>)")).toBe('<p><a href="&amp;#106avascript:alert(1)">x</a></p>');
  });

  it("should not link a destination that contains angle brackets inside angle brackets", () => {
    expectSafe(renderMarkdown("[x](<DATA:text/html,<script>alert(1)</script>>)"));
  });

  it("should reject a scheme that contains an embedded control character", () => {
    expect(renderMarkdown("[x](<java\u0001script:alert(1)>)")).toBe('<p><a href="#">x</a></p>');
  });

  it("should neutralise dangerous bare text that looks like a link", () => {
    expect(renderMarkdown("javascript:alert(1)")).toBe("<p>javascript:alert(1)</p>");
    expect(renderMarkdown("<javascript:alert(1)>")).toBe("<p>&lt;javascript:alert(1)&gt;</p>");
  });

  it("should accept safe schemes in any case", () => {
    expect(renderMarkdown("[x](HTTPS://X.Y/)")).toContain(`href="HTTPS://X.Y/" ${EXTERNAL}`);
    expect(renderMarkdown("[x](MAILTO:a@b.c)")).toContain('href="MAILTO:a@b.c"');
  });

  it("should treat colons after a path, query or fragment as relative", () => {
    expect(renderMarkdown("[x](/a:b) [y](?q=a:b) [z](#a:b)")).toBe(
      '<p><a href="/a:b">x</a> <a href="?q=a:b">y</a> <a href="#a:b">z</a></p>',
    );
  });

  it("should percent-encode quotes, angle brackets and spaces in urls", () => {
    const html = renderMarkdown('[x](<a"b d>)');

    expect(html).toBe('<p><a href="a%22b%20d">x</a></p>');
  });

  it("should keep angle brackets in urls from breaking out of the attribute", () => {
    expectSafe(renderMarkdown('[x](http://a.b/"><script>alert(1)</script>)'));
    expectSafe(renderMarkdown("[x](http://a.b/'onmouseover='alert(1))"));
  });

  it("should reject non-http schemes for autolinks", () => {
    expect(renderMarkdown("<ftp://x.y>")).toBe("<p>&lt;ftp://x.y&gt;</p>");
  });
});

describe("given pathological input", () => {
  it("should cap block nesting depth", () => {
    const quotes = renderMarkdown(`${"> ".repeat(500)}deep`);

    expect(quotes.split("<blockquote>").length - 1).toBeLessThanOrEqual(17);
    expect(quotes).toContain("deep");
    expectSafe(quotes);

    const lists = renderMarkdown(`${"- ".repeat(500)}deep`);

    expect(lists.split("<ul>").length - 1).toBeLessThanOrEqual(17);
    expect(lists).toContain("deep");

    const indented = renderMarkdown(Array.from({ length: 200 }, (_, index) => `${" ".repeat(index * 2)}- x`).join("\n"));

    expect(indented.split("<ul>").length - 1).toBeLessThanOrEqual(17);
  });

  it("should cap emphasis nesting depth", () => {
    const html = renderMarkdown(`${"*a ".repeat(500)}${"a* ".repeat(500)}`);
    let depth = 0;
    let max = 0;

    for (const match of html.matchAll(/<(\/?)em>/g)) {
      depth += match[1] === "/" ? -1 : 1;
      max = Math.max(max, depth);
    }

    expect(depth).toBe(0);
    expect(max).toBeLessThanOrEqual(32);
  });

  it("should stay linear for unmatched delimiters", () => {
    const started = performance.now();

    for (const source of [
      "*".repeat(100000),
      "_a".repeat(50000),
      "~~a".repeat(30000),
      "`a".repeat(50000),
      "[".repeat(100000),
      "]".repeat(100000),
      "![".repeat(50000),
      "[a](".repeat(25000),
      "](".repeat(50000),
      "*a _b ".repeat(10000),
      "\\".repeat(100000),
      "<".repeat(100000),
      "&".repeat(100000),
      "http://".repeat(20000),
    ]) {
      renderMarkdown(source);
    }

    expect(performance.now() - started).toBeLessThan(8000);
  });

  it("should handle very long lines and many lines", () => {
    const started = performance.now();

    renderMarkdown("word ".repeat(200000));
    renderMarkdown("a\n".repeat(100000));
    renderMarkdown("> a\n".repeat(50000));
    renderMarkdown("- a\n".repeat(50000));
    renderMarkdown("- a\n\n".repeat(30000));
    renderMarkdown(`| a | b |\n|---|---|\n${"| 1 | 2 |\n".repeat(30000)}`);
    renderMarkdown("# h\n".repeat(30000));
    renderMarkdown("```\n".repeat(30000));

    expect(performance.now() - started).toBeLessThan(8000);
  });

  it("should render a 20k-word document quickly", () => {
    const paragraph = "Some **bold** and *italic* text with `code` and a [link](https://x.y/z) in it.\n\n";
    const started = performance.now();
    const html = renderMarkdown(paragraph.repeat(1500));

    expect(html.length).toBeGreaterThan(100000);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("should handle lone surrogates and control characters", () => {
    const html = renderMarkdown("\ud800 a \u0001 b \u0000 c");

    expect(html.startsWith("<p>")).toBe(true);
    expectSafe(html);
  });
});

describe("given generated stress documents", () => {
  const alphabet = [
    "*",
    "**",
    "_",
    "~~",
    "`",
    "[",
    "]",
    "(",
    ")",
    "![",
    "\\",
    "\n",
    "\n\n",
    "# ",
    "> ",
    "- ",
    "- [ ] ",
    "1. ",
    "    ",
    "```\n",
    "http://a.b",
    "javascript:",
    "<script>",
    "<b ",
    "onerror=",
    "&#106;",
    "|",
    "|---|",
    " ",
    "word",
    "x",
    '"',
    "'",
  ];

  function generate(seed: number, length: number): string {
    let state = seed;
    let out = "";

    for (let i = 0; i < length; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      out += alphabet[(state >>> 8) % alphabet.length] ?? "";
    }

    return out;
  }

  it("should never throw and always produce safe html", () => {
    const started = performance.now();

    for (let seed = 1; seed <= 400; seed++) {
      expectSafe(renderMarkdown(generate(seed, 80)));
    }

    expect(performance.now() - started).toBeLessThan(8000);
  });

  it("should stay safe on longer generated documents", () => {
    for (let seed = 1000; seed < 1020; seed++) {
      expectSafe(renderMarkdown(generate(seed, 3000)));
    }
  });
});
