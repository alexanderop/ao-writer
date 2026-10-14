import { codeBlockKey, sanitizeLanguage } from "./code.ts";
import type { CodeBlock, CodeToken, CodeTokenMap } from "./code.ts";
import { parseInline } from "./inline.ts";
import type { DelimRun, EmphasisMatch, InlineNode } from "./inline.ts";

/** Deepest block container nesting (quotes and lists); deeper structure is rendered as plain text. */
const MAX_BLOCK_DEPTH = 16;

/** Deepest emphasis nesting rendered; deeper delimiters stay literal. */
const MAX_EMPHASIS_DEPTH = 32;

type Align = "left" | "center" | "right" | "none";

type Block =
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "heading"; readonly level: number; readonly text: string }
  | { readonly kind: "code"; readonly lang: string; readonly code: string }
  | { readonly kind: "rule" }
  | { readonly kind: "quote"; readonly children: readonly Parsed[] }
  | {
      readonly kind: "list";
      readonly ordered: boolean;
      readonly start: number;
      readonly loose: boolean;
      readonly items: readonly ListItem[];
    }
  | {
      readonly kind: "table";
      readonly aligns: readonly Align[];
      readonly header: readonly string[];
      readonly rows: readonly (readonly string[])[];
    };

/** A parsed block and the index of the first line after it. */
interface Parse {
  readonly block: Block;
  readonly next: number;
}

/** A block plus whether a blank line separated it from the previous sibling. */
interface Parsed {
  readonly block: Block;
  readonly blankBefore: boolean;
}

interface ListItem {
  readonly blocks: readonly Parsed[];
  readonly task: boolean | null;
}

interface ListMarker {
  readonly indent: number;
  readonly ordered: boolean;
  readonly number: number;
  readonly delim: string;
  /** Column where the item content starts. */
  readonly width: number;
  /** First line of the item content, already stripped of the marker. */
  readonly first: string;
}

interface FenceOpen {
  readonly indent: number;
  readonly char: string;
  readonly length: number;
  readonly info: string;
}

interface RenderContext {
  readonly slugs: Map<string, number>;
  readonly code: CodeTokenMap;
}

interface Safe {
  readonly href: string;
  readonly external: boolean;
}

// ---------------------------------------------------------------------------------------------
// Escaping, entities and url safety
// ---------------------------------------------------------------------------------------------

const HTML_ESCAPES = new Map<string, string>([
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ['"', "&quot;"],
  ["'", "&#39;"],
]);

const NAMED_ENTITIES = new Map<string, string>([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", "\u00a0"],
  ["copy", "\u00a9"],
  ["reg", "\u00ae"],
  ["trade", "\u2122"],
  ["hellip", "\u2026"],
  ["mdash", "\u2014"],
  ["ndash", "\u2013"],
  ["colon", ":"],
  ["Tab", "\t"],
  ["NewLine", "\n"],
  ["lpar", "("],
  ["rpar", ")"],
  ["sol", "/"],
  ["num", "#"],
]);

const ENTITY_PATTERN = /&(?:#([0-9]{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));/g;

const BACKSLASH_ESCAPE_PATTERN = /\\([!-/:-@[-`{-~])/g;



const ALLOWED_SCHEMES: ReadonlySet<string> = new Set(["http", "https", "mailto", "tel"]);

function isInvisibleCode(code: number): boolean {
  return (
    code <= 0x20 ||
    (code >= 0x7f && code <= 0xa0) ||
    code === 0x1680 ||
    code === 0x180e ||
    (code >= 0x2000 && code <= 0x200f) ||
    (code >= 0x2028 && code <= 0x202f) ||
    (code >= 0x205f && code <= 0x206f) ||
    code === 0x3000 ||
    code === 0xfeff
  );
}

/** Remove whitespace and control characters browsers ignore inside a url scheme. */
function stripInvisible(value: string): string {
  let out = "";

  for (let i = 0; i < value.length; i++) {
    if (!isInvisibleCode(value.charCodeAt(i))) {
      out += value.charAt(i);
    }
  }

  return out;
}

/** Percent-encode characters that must never appear raw in an attribute url. */
function encodeUnsafe(value: string): string {
  let out = "";

  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    const unsafe = code <= 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029 || '"<>\\`'.includes(value.charAt(i));

    out += unsafe ? encodeURIComponent(value.charAt(i)) : value.charAt(i);
  }

  return out;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES.get(ch) ?? ch);
}

function codePointText(value: number): string {
  const valid = value > 0 && value <= 0x10ffff && (value < 0xd800 || value > 0xdfff);

  return valid ? String.fromCodePoint(value) : "\ufffd";
}

function decodeEntities(value: string): string {
  if (!value.includes("&")) {
    return value;
  }

  return value.replace(
    ENTITY_PATTERN,
    (match: string, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
      if (dec !== undefined) {
        return codePointText(Number.parseInt(dec, 10));
      }

      if (hex !== undefined) {
        return codePointText(Number.parseInt(hex, 16));
      }

      return NAMED_ENTITIES.get(name ?? "") ?? match;
    },
  );
}

function unescapeBackslashes(value: string): string {
  return value.includes("\\") ? value.replace(BACKSLASH_ESCAPE_PATTERN, "$1") : value;
}

/** Decode a raw link destination or title: backslash escapes first, then entities. */
function decodeLinkPart(raw: string): string {
  return decodeEntities(unescapeBackslashes(raw));
}

/**
 * Validate a url taken from the source. Only http, https, mailto, tel and scheme-less
 * (relative or fragment) urls survive; everything else yields null.
 */
function safeUrl(raw: string): Safe | null {
  const decoded = decodeLinkPart(raw).trim();
  const squashed = stripInvisible(decoded);
  const colon = squashed.indexOf(":");

  if (colon !== -1) {
    const delimiter = squashed.search(/[/?#]/);

    if (delimiter === -1 || colon < delimiter) {
      const scheme = squashed.slice(0, colon).toLowerCase();

      if (!ALLOWED_SCHEMES.has(scheme)) {
        return null;
      }
    }
  }

  const href = escapeHtml(encodeUnsafe(decoded));

  return { href, external: /^https?:/i.test(squashed) };
}

// ---------------------------------------------------------------------------------------------
// Inline rendering
// ---------------------------------------------------------------------------------------------

function countTrailingSpaces(value: string): number {
  let count = 0;

  while (count < value.length && value.charCodeAt(value.length - 1 - count) === 32) {
    count++;
  }

  return count;
}

function renderText(raw: string): string {
  if (!raw.includes("\n")) {
    return escapeHtml(decodeEntities(raw));
  }

  const parts = raw.split("\n");
  let out = "";

  for (let k = 0; k < parts.length; k++) {
    const part = parts[k] ?? "";
    const segment = k > 0 ? part.trimStart() : part;

    if (k === parts.length - 1) {
      out += escapeHtml(decodeEntities(segment));
    } else {
      const hard = countTrailingSpaces(segment) >= 2;

      out += `${escapeHtml(decodeEntities(segment.trimEnd()))}${hard ? "<br />\n" : "\n"}`;
    }
  }

  return out;
}

function codeSpanText(src: string, start: number, end: number, ticks: number): string {
  let content = src.slice(start + ticks, end - ticks).replace(/\n/g, " ");

  if (content.length > 2 && content.startsWith(" ") && content.endsWith(" ") && content.trim() !== "") {
    content = content.slice(1, -1);
  }

  return content;
}

function emphasisTag(match: EmphasisMatch, open: boolean): string {
  const name = match.char === "~" ? "del" : match.size === 2 ? "strong" : "em";

  return open ? `<${name}>` : `</${name}>`;
}

function literalCount(run: DelimRun): number {
  return run.len - run.usedLeft - run.usedRight;
}

function renderDelimiter(run: DelimRun): string {
  let out = "";

  for (const match of run.closeMarks) {
    out += emphasisTag(match, false);
  }

  out += run.char.repeat(literalCount(run));

  for (let k = run.openMarks.length - 1; k >= 0; k--) {
    const match = run.openMarks[k];

    if (match !== undefined) {
      out += emphasisTag(match, true);
    }
  }

  return out;
}

function anchor(rawUrl: string, label: string): string {
  const safe = safeUrl(rawUrl);

  if (safe === null) {
    return `<a href="#">${label}</a>`;
  }

  const extra = safe.external ? ' rel="noopener noreferrer" target="_blank"' : "";

  return `<a href="${safe.href}"${extra}>${label}</a>`;
}

function titleAttribute(src: string, start: number, end: number): string {
  if (start === -1) {
    return "";
  }

  return ` title="${escapeHtml(decodeLinkPart(src.slice(start, end)))}"`;
}

function renderNodes(src: string, nodes: readonly InlineNode[], inLink: boolean): string {
  let out = "";

  for (const node of nodes) {
    if (node.kind === "text") {
      out += renderText(src.slice(node.start, node.end));
    } else if (node.kind === "escape") {
      const ch = src.charAt(node.start + 1);

      out += ch === "\n" ? "<br />\n" : escapeHtml(ch);
    } else if (node.kind === "code") {
      out += `<code>${escapeHtml(codeSpanText(src, node.start, node.end, node.ticks))}</code>`;
    } else if (node.kind === "url") {
      const raw = src.slice(node.start, node.end);

      out += inLink ? escapeHtml(raw) : anchor(raw, escapeHtml(raw));
    } else if (node.kind === "delim") {
      out += renderDelimiter(node.run);
    } else if (node.image) {
      out += renderImage(src, node);
    } else {
      const inner = renderNodes(src, node.children, true);
      const safe = safeUrl(src.slice(node.destStart, node.destEnd));
      const title = titleAttribute(src, node.titleStart, node.titleEnd);

      if (safe === null) {
        out += `<a href="#"${title}>${inner}</a>`;
      } else {
        const extra = safe.external ? ' rel="noopener noreferrer" target="_blank"' : "";

        out += `<a href="${safe.href}"${title}${extra}>${inner}</a>`;
      }
    }
  }

  return out;
}

function renderImage(src: string, node: Extract<InlineNode, { kind: "link" }>): string {
  const alt = plainNodes(src, node.children);
  const safe = safeUrl(src.slice(node.destStart, node.destEnd));

  if (safe === null) {
    return escapeHtml(alt);
  }

  const title = titleAttribute(src, node.titleStart, node.titleEnd);

  return `<img src="${safe.href}" alt="${escapeHtml(alt)}"${title}>`;
}

/** Visible text of inline nodes without any markup; used for image alt text and heading slugs. */
function plainNodes(src: string, nodes: readonly InlineNode[]): string {
  let out = "";

  for (const node of nodes) {
    if (node.kind === "text") {
      out += decodeEntities(src.slice(node.start, node.end)).replace(/\n/g, " ");
    } else if (node.kind === "escape") {
      out += src.charAt(node.start + 1) === "\n" ? " " : src.charAt(node.start + 1);
    } else if (node.kind === "code") {
      out += codeSpanText(src, node.start, node.end, node.ticks);
    } else if (node.kind === "url") {
      out += src.slice(node.start, node.end);
    } else if (node.kind === "delim") {
      out += node.run.char.repeat(literalCount(node.run));
    } else {
      out += plainNodes(src, node.children);
    }
  }

  return out;
}

function renderInline(src: string): string {
  if (src === "") {
    return "";
  }

  return renderNodes(src, parseInline(src, MAX_EMPHASIS_DEPTH).nodes, false);
}

// ---------------------------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------------------------

function expandLeadingTabs(line: string): string {
  if (!line.includes("\t")) {
    return line;
  }

  let column = 0;
  let i = 0;

  for (; i < line.length; i++) {
    const ch = line.charAt(i);

    if (ch === " ") {
      column++;
    } else if (ch === "\t") {
      column += 4 - (column % 4);
    } else {
      break;
    }
  }

  return " ".repeat(column) + line.slice(i);
}

function splitLines(source: string): string[] {
  return source
    .replace(/\r\n?/g, "\n")
    .split(String.fromCharCode(0))
    .join("\ufffd")
    .split("\n")
    .map(expandLeadingTabs);
}

function indentOf(line: string): number {
  let i = 0;

  while (i < line.length && line.charCodeAt(i) === 32) {
    i++;
  }

  return i;
}

function isBlankLine(line: string): boolean {
  return line.trim() === "";
}

function parseAtx(line: string): { level: number; text: string } | null {
  const indent = indentOf(line);

  if (indent > 3) {
    return null;
  }

  let j = indent;

  while (line.charAt(j) === "#") {
    j++;
  }

  const level = j - indent;

  if (level < 1 || level > 6 || (j < line.length && line.charAt(j) !== " ")) {
    return null;
  }

  let text = line.slice(j).trim();
  let k = text.length;

  while (k > 0 && text.charAt(k - 1) === "#") {
    k--;
  }

  if (k < text.length && (k === 0 || text.charAt(k - 1) === " ")) {
    text = text.slice(0, k).trimEnd();
  }

  return { level, text };
}

function isRule(line: string): boolean {
  const indent = indentOf(line);

  if (indent > 3) {
    return false;
  }

  const char = line.charAt(indent);

  if (char !== "-" && char !== "*" && char !== "_") {
    return false;
  }

  let count = 0;

  for (let i = indent; i < line.length; i++) {
    const ch = line.charAt(i);

    if (ch === char) {
      count++;
    } else if (ch !== " ") {
      return false;
    }
  }

  return count >= 3;
}

function parseFenceOpen(line: string): FenceOpen | null {
  const indent = indentOf(line);

  if (indent > 3) {
    return null;
  }

  const char = line.charAt(indent);

  if (char !== "`" && char !== "~") {
    return null;
  }

  let j = indent;

  while (line.charAt(j) === char) {
    j++;
  }

  const info = line.slice(j).trim();

  if (j - indent < 3 || (char === "`" && info.includes("`"))) {
    return null;
  }

  return { indent, char, length: j - indent, info };
}

function closesFence(line: string, fence: FenceOpen): boolean {
  const indent = indentOf(line);

  if (indent > 3) {
    return false;
  }

  let j = indent;

  while (line.charAt(j) === fence.char) {
    j++;
  }

  return j - indent >= fence.length && line.slice(j).trim() === "";
}

function isQuoteLine(line: string): boolean {
  const indent = indentOf(line);

  return indent <= 3 && line.charAt(indent) === ">";
}

function stripQuote(line: string): string {
  const at = indentOf(line) + 1;

  return line.charAt(at) === " " ? line.slice(at + 1) : line.slice(at);
}

function parseListMarker(line: string): ListMarker | null {
  const indent = indentOf(line);
  const first = line.charAt(indent);
  let markerEnd = indent + 1;
  let ordered = false;
  let number = 1;
  let delim = first;

  if (first !== "-" && first !== "*" && first !== "+") {
    let j = indent;

    while (j < line.length && j - indent < 9 && line.charCodeAt(j) >= 48 && line.charCodeAt(j) <= 57) {
      j++;
    }

    const after = line.charAt(j);

    if (j === indent || (after !== "." && after !== ")")) {
      return null;
    }

    ordered = true;
    number = Number.parseInt(line.slice(indent, j), 10);
    delim = after;
    markerEnd = j + 1;
  }

  if (markerEnd < line.length && line.charAt(markerEnd) !== " ") {
    return null;
  }

  let spaces = 0;

  while (line.charAt(markerEnd + spaces) === " ") {
    spaces++;
  }

  const blank = markerEnd + spaces >= line.length;
  const width = blank || spaces >= 5 ? markerEnd + 1 : markerEnd + spaces;

  return { indent, ordered, number, delim, width, first: blank ? "" : line.slice(width) };
}

/** True when the line starts a block that may interrupt a paragraph. */
function interruptsParagraph(line: string): boolean {
  if (parseFenceOpen(line) !== null || parseAtx(line) !== null || isRule(line) || isQuoteLine(line)) {
    return true;
  }

  const marker = parseListMarker(line);

  return marker !== null && marker.indent <= 3 && marker.first.trim() !== "" && (!marker.ordered || marker.number === 1);
}

/** True when the line starts any block, so it cannot be a lazy continuation line. */
function startsBlock(line: string): boolean {
  if (parseFenceOpen(line) !== null || parseAtx(line) !== null || isRule(line) || isQuoteLine(line)) {
    return true;
  }

  const marker = parseListMarker(line);

  return marker !== null && marker.indent <= 3;
}

function splitRow(line: string): string[] {
  const text = line.trim();
  const cells: string[] = [];
  let cell = "";
  let endedOnPipe = false;

  for (let i = text.startsWith("|") ? 1 : 0; i < text.length; i++) {
    const ch = text.charAt(i);

    endedOnPipe = false;

    if (ch === "\\" && text.charAt(i + 1) === "|") {
      cell += "|";
      i++;
    } else if (ch === "|") {
      cells.push(cell.trim());
      cell = "";
      endedOnPipe = true;
    } else {
      cell += ch;
    }
  }

  if (!endedOnPipe) {
    cells.push(cell.trim());
  }

  return cells;
}

function parseAlign(cell: string): Align | null {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":") && cell.length > 1;
  const dashes = cell.slice(left ? 1 : 0, right ? -1 : undefined);

  if (dashes === "" || /[^-]/.test(dashes)) {
    return null;
  }

  if (left && right) {
    return "center";
  }

  return left ? "left" : right ? "right" : "none";
}

function tryTable(lines: readonly string[], at: number): Parse | null {
  const headerLine = lines[at] ?? "";
  const delimiterLine = lines[at + 1];

  if (delimiterLine === undefined || !headerLine.includes("|") || !delimiterLine.includes("|") || indentOf(headerLine) > 3) {
    return null;
  }

  const header = splitRow(headerLine);
  const aligns: Align[] = [];

  for (const cell of splitRow(delimiterLine)) {
    const align = parseAlign(cell);

    if (align === null) {
      return null;
    }

    aligns.push(align);
  }

  if (aligns.length !== header.length) {
    return null;
  }

  const rows: string[][] = [];
  let next = at + 2;

  while (next < lines.length) {
    const line = lines[next] ?? "";

    if (isBlankLine(line) || interruptsParagraph(line)) {
      break;
    }

    const cells = splitRow(line);

    rows.push(header.map((_, column) => cells[column] ?? ""));
    next++;
  }

  return { block: { kind: "table", aligns, header, rows }, next };
}

function parseTaskMarker(text: string): { checked: boolean; rest: string } | null {
  if (text.length < 4 || text.charAt(0) !== "[" || text.charAt(2) !== "]" || text.charAt(3) !== " ") {
    return null;
  }

  const mid = text.charAt(1);

  if (mid !== " " && mid !== "x" && mid !== "X") {
    return null;
  }

  return { checked: mid !== " ", rest: text.slice(4).trimStart() };
}

function parseList(lines: readonly string[], start: number, depth: number): Parse {
  const head = parseListMarker(lines[start] ?? "");
  const items: ListItem[] = [];
  let loose = false;
  let at = start;
  let blankBetween = false;

  while (at < lines.length) {
    const line = lines[at] ?? "";
    const marker = parseListMarker(line);

    if (
      marker === null ||
      head === null ||
      marker.indent > 3 ||
      marker.ordered !== head.ordered ||
      marker.delim !== head.delim ||
      isRule(line)
    ) {
      break;
    }

    if (blankBetween) {
      loose = true;
    }

    const itemLines = [marker.first];
    let j = at + 1;
    let blanks = 0;

    while (j < lines.length) {
      const next = lines[j] ?? "";

      if (isBlankLine(next)) {
        if (itemLines.length === 1 && itemLines[0]?.trim() === "") {
          break;
        }

        blanks++;
        j++;
      } else if (indentOf(next) >= marker.width) {
        for (let b = 0; b < blanks; b++) {
          itemLines.push("");
        }

        blanks = 0;
        itemLines.push(next.slice(marker.width));
        j++;
      } else if (blanks === 0 && !startsBlock(next)) {
        itemLines.push(next.trimStart());
        j++;
      } else {
        break;
      }
    }

    const task = parseTaskMarker(itemLines[0] ?? "");

    if (task !== null) {
      itemLines[0] = task.rest;
    }

    const blocks = parseBlocks(itemLines, depth + 1);

    if (blocks.some((parsed, index) => index > 0 && parsed.blankBefore)) {
      loose = true;
    }

    items.push({ blocks, task: task === null ? null : task.checked });

    const upcoming = lines[j] ?? "";
    const sibling = parseListMarker(upcoming);

    const continues =
      j < lines.length &&
      sibling !== null &&
      sibling.indent <= 3 &&
      sibling.ordered === head.ordered &&
      sibling.delim === head.delim &&
      !isRule(upcoming);

    blankBetween = continues && blanks > 0;
    at = continues ? j : j - blanks;
  }

  return {
    block: { kind: "list", ordered: head?.ordered ?? false, start: head?.number ?? 1, loose, items },
    next: at,
  };
}

function parseFencedCode(lines: readonly string[], start: number, fence: FenceOpen): Parse {
  const body: string[] = [];
  let at = start + 1;

  while (at < lines.length && !closesFence(lines[at] ?? "", fence)) {
    const line = lines[at] ?? "";

    body.push(line.slice(Math.min(fence.indent, indentOf(line))));
    at++;
  }

  const word = fence.info.split(" ")[0] ?? "";
  const lang = sanitizeLanguage(decodeEntities(word));

  return { block: { kind: "code", lang, code: body.join("\n") }, next: Math.min(at + 1, lines.length) };
}

function parseIndentedCode(lines: readonly string[], start: number): Parse {
  const body: string[] = [];
  let at = start;
  let end = start;

  while (at < lines.length) {
    const line = lines[at] ?? "";

    if (isBlankLine(line)) {
      body.push(line.length > 4 ? line.slice(4) : "");
    } else if (indentOf(line) >= 4) {
      body.push(line.slice(4));
      end = at + 1;
    } else {
      break;
    }

    at++;
  }

  return { block: { kind: "code", lang: "", code: body.slice(0, end - start).join("\n") }, next: end };
}

function parseQuote(lines: readonly string[], start: number, depth: number): Parse {
  const inner: string[] = [];
  let at = start;

  while (at < lines.length) {
    const line = lines[at] ?? "";
    const previous = inner[inner.length - 1];

    if (isQuoteLine(line)) {
      inner.push(stripQuote(line));
    } else if (
      previous !== undefined &&
      !isBlankLine(line) &&
      !isBlankLine(previous) &&
      !startsBlock(line) &&
      parseAtx(previous) === null &&
      !isRule(previous) &&
      parseFenceOpen(previous) === null
    ) {
      inner.push(line.trimStart());
    } else {
      break;
    }

    at++;
  }

  return { block: { kind: "quote", children: parseBlocks(inner, depth + 1) }, next: at };
}

function parseParagraph(lines: readonly string[], start: number): Parse {
  const collected: string[] = [];
  let at = start;

  while (at < lines.length) {
    const line = lines[at] ?? "";

    if (isBlankLine(line) || (at > start && interruptsParagraph(line))) {
      break;
    }

    collected.push(line.trimStart());
    at++;
  }

  return { block: { kind: "paragraph", text: collected.join("\n").trimEnd() }, next: at };
}

function parseBlocks(lines: readonly string[], depth: number): Parsed[] {
  const out: Parsed[] = [];
  const containers = depth < MAX_BLOCK_DEPTH;
  let at = 0;
  let blank = false;

  const push = (block: Block): void => {
    out.push({ block, blankBefore: blank && out.length > 0 });
    blank = false;
  };

  while (at < lines.length) {
    const line = lines[at] ?? "";

    if (isBlankLine(line)) {
      blank = true;
      at++;
      continue;
    }

    const fence = parseFenceOpen(line);
    const atx = parseAtx(line);
    let parsed: Parse | null = null;

    if (fence !== null) {
      parsed = parseFencedCode(lines, at, fence);
    } else if (indentOf(line) >= 4) {
      parsed = parseIndentedCode(lines, at);
    } else if (atx !== null) {
      parsed = { block: { kind: "heading", level: atx.level, text: atx.text }, next: at + 1 };
    } else if (isRule(line)) {
      parsed = { block: { kind: "rule" }, next: at + 1 };
    } else if (containers && isQuoteLine(line)) {
      parsed = parseQuote(lines, at, depth);
    } else if (containers && parseListMarker(line) !== null) {
      parsed = parseList(lines, at, depth);
    } else {
      parsed = tryTable(lines, at) ?? parseParagraph(lines, at);
    }

    push(parsed.block);
    at = parsed.next;
  }

  return out;
}

// ---------------------------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------------------------

function slugFor(plain: string, ctx: RenderContext): string {
  const base =
    plain
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s+/g, "-") || "section";

  const seen = ctx.slugs.get(base);

  ctx.slugs.set(base, (seen ?? 0) + 1);

  return seen === undefined ? base : `${base}-${seen}`;
}

function renderHeading(level: number, text: string, ctx: RenderContext): string {
  if (text === "") {
    return `<h${level} id="${slugFor("", ctx)}"></h${level}>`;
  }

  const parsed = parseInline(text, MAX_EMPHASIS_DEPTH);
  const html = renderNodes(text, parsed.nodes, false);
  const id = slugFor(plainNodes(text, parsed.nodes), ctx);

  return `<h${level} id="${escapeHtml(id)}">${html}</h${level}>`;
}

function renderTable(block: Extract<Block, { kind: "table" }>): string {
  const cell = (tag: string, text: string, align: Align | undefined): string => {
    const style = align === undefined || align === "none" ? "" : ` style="text-align:${align}"`;

    return `<${tag}${style}>${renderInline(text)}</${tag}>`;
  };

  const row = (tag: string, cells: readonly string[]): string =>
    `<tr>\n${cells.map((text, index) => cell(tag, text, block.aligns[index])).join("\n")}\n</tr>`;

  const parts = ["<table>", "<thead>", row("th", block.header), "</thead>"];

  if (block.rows.length > 0) {
    parts.push("<tbody>");

    for (const cells of block.rows) {
      parts.push(row("td", cells));
    }

    parts.push("</tbody>");
  }

  parts.push("</table>");

  return parts.join("\n");
}

function renderItem(item: ListItem, tight: boolean, ctx: RenderContext): string {
  const checkbox =
    item.task === null ? "" : `<input type="checkbox" disabled${item.task ? " checked" : ""}>`;

  const pieces: string[] = [];
  let firstInline = false;
  let lastInline = false;

  item.blocks.forEach((parsed, index) => {
    const block = parsed.block;
    const prefix = index === 0 && checkbox !== "" ? `${checkbox} ` : "";
    const inline = tight && block.kind === "paragraph";

    if (block.kind === "paragraph") {
      const html = prefix + renderInline(block.text);

      pieces.push(inline ? html : `<p>${html}</p>`);
    } else {
      pieces.push(index === 0 && checkbox !== "" ? checkbox : "", renderBlock(block, ctx));
    }

    firstInline = index === 0 ? inline : firstInline;
    lastInline = inline;
  });

  const body = pieces.filter((piece) => piece !== "").join("\n");
  const cls = item.task === null ? "" : ' class="task"';

  if (body === "") {
    return `<li${cls}>${checkbox}</li>`;
  }

  return `<li${cls}>${firstInline ? "" : "\n"}${body}${lastInline ? "" : "\n"}</li>`;
}

/** The colour of a token as a CSS value: the colour from the theme, or the page's text colour. */
function toneValue(color: string | null): string {
  return color === null ? "var(--ink)" : color;
}

/**
 * Code with one span per coloured token. The text is escaped here, token by token; the colours
 * only ever reach a style attribute through escapeHtml, so neither can inject markup.
 */
function coloredCode(code: string, tokens: readonly CodeToken[]): string {
  let out = "";
  let at = 0;

  for (const token of tokens) {
    const start = Math.max(token.start, at);
    const end = Math.min(token.end, code.length);

    if (end <= start) {
      continue;
    }

    out += escapeHtml(code.slice(at, start));

    const text = escapeHtml(code.slice(start, end));

    out +=
      token.light === null && token.dark === null
        ? text
        : `<span style="--shiki-light:${escapeHtml(toneValue(token.light))};--shiki-dark:${escapeHtml(toneValue(token.dark))}">${text}</span>`;
    at = end;
  }

  return out + escapeHtml(code.slice(at));
}

function renderBlock(block: Block, ctx: RenderContext): string {
  switch (block.kind) {
    case "paragraph":
      return `<p>${renderInline(block.text)}</p>`;
    case "heading":
      return renderHeading(block.level, block.text, ctx);
    case "code": {
      const cls = block.lang === "" ? "" : ` class="language-${escapeHtml(block.lang)}"`;
      const tokens = block.lang === "" ? undefined : ctx.code.get(codeBlockKey(block));
      const body = block.code === "" ? "" : `${tokens === undefined ? escapeHtml(block.code) : coloredCode(block.code, tokens)}\n`;

      return `<pre><code${cls}>${body}</code></pre>`;
    }

    case "rule":
      return "<hr />";
    case "quote":
      return `<blockquote>\n${renderBlocks(block.children, ctx)}${block.children.length > 0 ? "\n" : ""}</blockquote>`;
    case "table":
      return renderTable(block);
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const start = block.ordered && block.start !== 1 ? ` start="${block.start}"` : "";
      const items = block.items.map((item) => renderItem(item, !block.loose, ctx)).join("\n");

      return `<${tag}${start}>\n${items}\n</${tag}>`;
    }
  }
}

function renderBlocks(parsed: readonly Parsed[], ctx: RenderContext): string {
  return parsed.map((entry) => renderBlock(entry.block, ctx)).join("\n");
}

/**
 * Render Markdown to safe HTML. Raw HTML in the source is escaped, and only http, https,
 * mailto, tel and relative urls are kept.
 */
export function renderMarkdown(source: string, code: CodeTokenMap = new Map()): string {
  const ctx: RenderContext = { slugs: new Map<string, number>(), code };

  return renderBlocks(parseBlocks(splitLines(source), 0), ctx);
}

function collectCode(parsed: readonly Parsed[], out: Map<string, CodeBlock>): void {
  for (const { block } of parsed) {
    if (block.kind === "code" && block.lang !== "") {
      out.set(codeBlockKey(block), { lang: block.lang, code: block.code });
    } else if (block.kind === "quote") {
      collectCode(block.children, out);
    } else if (block.kind === "list") {
      for (const item of block.items) {
        collectCode(item.blocks, out);
      }
    }
  }
}

/** The fenced code blocks with a language that {@link renderMarkdown} would colour, each once. */
export function codeBlocks(source: string): readonly CodeBlock[] {
  const found = new Map<string, CodeBlock>();

  collectCode(parseBlocks(splitLines(source), 0), found);

  return [...found.values()];
}
