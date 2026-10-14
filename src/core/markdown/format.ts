/** A formatting command the editor can run on the current selection. */
export type FormatAction =
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "codeBlock"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "list"
  | "orderedList"
  | "taskList"
  | "quote"
  | "link"
  | "toggleTask";

/**
 * Replace `text[from, to)` with `insert`, then select `[selectionStart, selectionEnd)` in the
 * new text. All offsets are UTF-16 indices.
 */
export interface TextEdit {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

type ListKind = "none" | "bullet" | "ordered" | "task";

/** The structural pieces of one line: indent, quote prefix, list marker and content. */
interface LineInfo {
  readonly text: string;
  /** Index after the indent and any quote prefix. */
  readonly quoteEnd: number;
  readonly indent: number;
  readonly kind: ListKind;
  readonly marker: string;
  readonly number: number;
  readonly checked: boolean;
  /** Index where the line's own content starts (after quote and list prefix). */
  readonly contentStart: number;
}

/** One transformed line plus how far its prefix moved; used to remap the selection. */
interface LineChange {
  readonly line: string;
  readonly oldContent: number;
  readonly newContent: number;
}

/** A half-open range of the text. */
interface Span {
  readonly start: number;
  readonly end: number;
}

interface HeadingInfo {
  readonly level: number;
  readonly contentStart: number;
}

interface FenceBlock {
  readonly openStart: number;
  readonly openEnd: number;
  readonly closeStart: number;
  readonly closeEnd: number;
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

const URL_LIKE = /^https?:\/\/\S+$/i;

const INLINE_MARKERS = new Map<FormatAction, string>([
  ["bold", "**"],
  ["italic", "*"],
  ["strike", "~~"],
  ["code", "`"],
]);

const LIST_KINDS = new Map<FormatAction, ListKind>([
  ["list", "bullet"],
  ["orderedList", "ordered"],
  ["taskList", "task"],
]);

const HEADING_LEVELS = new Map<FormatAction, number>([
  ["h1", 1],
  ["h2", 2],
  ["h3", 3],
  ["h4", 4],
  ["h5", 5],
  ["h6", 6],
]);

// ---------------------------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------------------------

function lineStartOf(text: string, pos: number): number {
  return pos === 0 ? 0 : text.lastIndexOf("\n", pos - 1) + 1;
}

function lineEndOf(text: string, pos: number): number {
  const found = text.indexOf("\n", pos);

  return found === -1 ? text.length : found;
}

function noop(selStart: number, selEnd: number): TextEdit {
  return { from: selStart, to: selStart, insert: "", selectionStart: selStart, selectionEnd: selEnd };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** Shrink a replacement to the part that actually differs, without splitting surrogate pairs. */
function minimize(text: string, from: number, to: number, insert: string, selectionStart: number, selectionEnd: number): TextEdit {
  const old = text.slice(from, to);
  const limit = Math.min(old.length, insert.length);
  let prefix = 0;

  while (prefix < limit && old.charCodeAt(prefix) === insert.charCodeAt(prefix)) {
    prefix++;
  }

  if (prefix > 0 && isHighSurrogate(old.charCodeAt(prefix - 1))) {
    prefix--;
  }

  let suffix = 0;

  while (
    suffix < limit - prefix &&
    old.charCodeAt(old.length - 1 - suffix) === insert.charCodeAt(insert.length - 1 - suffix)
  ) {
    suffix++;
  }

  if (suffix > 0 && isLowSurrogate(old.charCodeAt(old.length - suffix))) {
    suffix--;
  }

  return {
    from: from + prefix,
    to: to - suffix,
    insert: insert.slice(prefix, insert.length - suffix),
    selectionStart,
    selectionEnd,
  };
}

/** Start and end of the lines touched by a selection; a selection ending right after "\n" excludes the next line. */
function selectedRegion(text: string, selStart: number, selEnd: number): Span {
  const effectiveEnd = selEnd > selStart && text.charAt(selEnd - 1) === "\n" ? selEnd - 1 : selEnd;

  return { start: lineStartOf(text, selStart), end: lineEndOf(text, effectiveEnd) };
}

// ---------------------------------------------------------------------------------------------
// Inline wrapping: bold, italic, strike, code
// ---------------------------------------------------------------------------------------------

function runLength(text: string, from: number, step: number, char: string): number {
  let count = 0;

  while (text.charAt(from + step * count) === char && from + step * count >= 0) {
    count++;
  }

  return count;
}

/** Whether a run of `n` marker characters on both sides means the marker is present. */
function isMarked(marker: string, n: number): boolean {
  if (marker.length === 2) {
    return n >= 2;
  }

  return marker === "*" ? n % 2 === 1 : n === 1;
}

function expandToWord(text: string, caret: number): Span {
  let start = caret;
  let end = caret;

  while (start > 0 && WORD_CHAR.test(text.charAt(start - 1))) {
    start--;
  }

  while (end < text.length && WORD_CHAR.test(text.charAt(end))) {
    end++;
  }

  return { start, end };
}

function trimSelection(text: string, selStart: number, selEnd: number): Span {
  let start = selStart;
  let end = selEnd;

  while (start < end && text.charAt(start).trim() === "") {
    start++;
  }

  while (end > start && text.charAt(end - 1).trim() === "") {
    end--;
  }

  return { start, end };
}

function wrapRange(text: string, start: number, end: number, marker: string): TextEdit {
  const length = marker.length;
  const char = marker.charAt(0);
  const before = runLength(text, start - 1, -1, char);
  const after = runLength(text, end, 1, char);

  if (isMarked(marker, Math.min(before, after))) {
    return {
      from: start - length,
      to: end + length,
      insert: text.slice(start, end),
      selectionStart: start - length,
      selectionEnd: end - length,
    };
  }

  const inner = text.slice(start, end);
  const leading = runLength(inner, 0, 1, char);
  const trailing = runLength(inner, inner.length - 1, -1, char);

  if (
    inner.length > 2 * length &&
    leading < inner.length &&
    isMarked(marker, Math.min(leading, trailing))
  ) {
    const stripped = inner.slice(length, inner.length - length);

    return { from: start, to: end, insert: stripped, selectionStart: start, selectionEnd: start + stripped.length };
  }

  return {
    from: start,
    to: end,
    insert: marker + inner + marker,
    selectionStart: start + length,
    selectionEnd: start + length + inner.length,
  };
}

function applyWrap(text: string, selStart: number, selEnd: number, marker: string): TextEdit {
  const length = marker.length;
  const char = marker.charAt(0);
  const trimmed = trimSelection(text, selStart, selEnd);

  if (trimmed.end > trimmed.start) {
    return wrapRange(text, trimmed.start, trimmed.end, marker);
  }

  const word = expandToWord(text, selStart);

  if (word.end > word.start) {
    return wrapRange(text, word.start, word.end, marker);
  }

  const before = runLength(text, selStart - 1, -1, char);
  const after = runLength(text, selStart, 1, char);

  if (isMarked(marker, Math.min(before, after))) {
    const at = selStart - length;

    return { from: at, to: selStart + length, insert: "", selectionStart: at, selectionEnd: at };
  }

  return {
    from: selStart,
    to: selStart,
    insert: marker + marker,
    selectionStart: selStart + length,
    selectionEnd: selStart + length,
  };
}

// ---------------------------------------------------------------------------------------------
// Line parsing and line-based edits
// ---------------------------------------------------------------------------------------------

function skipSpaces(line: string, from: number): number {
  let i = from;

  while (line.charAt(i) === " ") {
    i++;
  }

  return i;
}

function parseLine(line: string): LineInfo {
  const indent = skipSpaces(line, 0);
  let quoteEnd = indent;

  while (line.charAt(quoteEnd) === ">") {
    quoteEnd++;

    if (line.charAt(quoteEnd) === " ") {
      quoteEnd++;
    }
  }

  const afterQuote = quoteEnd === indent ? indent : skipSpaces(line, quoteEnd);
  const first = line.charAt(afterQuote);
  const base = { text: line, quoteEnd, indent, marker: "", number: 0, checked: false };
  let markerEnd = -1;
  let kind: ListKind = "none";
  let marker = "";
  let number = 0;

  if (first === "-" || first === "*" || first === "+") {
    markerEnd = afterQuote + 1;
    kind = "bullet";
    marker = first;
  } else {
    let j = afterQuote;

    while (j < line.length && j - afterQuote < 9 && line.charCodeAt(j) >= 48 && line.charCodeAt(j) <= 57) {
      j++;
    }

    if (j > afterQuote && (line.charAt(j) === "." || line.charAt(j) === ")")) {
      markerEnd = j + 1;
      kind = "ordered";
      marker = line.slice(afterQuote, j + 1);
      number = Number.parseInt(line.slice(afterQuote, j), 10);
    }
  }

  if (markerEnd === -1 || (markerEnd < line.length && line.charAt(markerEnd) !== " ")) {
    return { ...base, kind: "none", contentStart: quoteEnd };
  }

  const contentStart = skipSpaces(line, markerEnd);
  const box = line.slice(contentStart, contentStart + 3);

  const hasBox =
    kind === "bullet" || kind === "ordered"
      ? /^\[[ xX]\]$/.test(box) && (contentStart + 3 === line.length || line.charAt(contentStart + 3) === " ")
      : false;

  if (hasBox) {
    return {
      ...base,
      kind: "task",
      marker: kind === "bullet" ? marker : "-",
      number,
      checked: box !== "[ ]",
      contentStart: skipSpaces(line, contentStart + 3),
    };
  }

  return { ...base, kind, marker, number, contentStart };
}

function lineEdit(text: string, selStart: number, selEnd: number, region: Span, changes: readonly LineChange[]): TextEdit {
  const oldLines = text.slice(region.start, region.end).split("\n");
  const newText = changes.map((change) => change.line).join("\n");
  const delta = newText.length - (region.end - region.start);

  const mapPosition = (pos: number, isRangeStart: boolean): number => {
    if (pos < region.start) {
      return pos;
    }

    if (pos > region.end) {
      return pos + delta;
    }

    let oldStart = region.start;
    let newStart = region.start;

    for (let k = 0; k < changes.length; k++) {
      const change = changes[k];
      const oldLine = oldLines[k] ?? "";

      if (change === undefined) {
        break;
      }

      if (pos <= oldStart + oldLine.length) {
        if (isRangeStart && pos === oldStart) {
          return newStart;
        }

        const offset = pos - oldStart - change.oldContent + change.newContent;

        return newStart + clamp(offset, change.newContent, change.line.length);
      }

      oldStart += oldLine.length + 1;
      newStart += change.line.length + 1;
    }

    return pos + delta;
  };

  return minimize(text, region.start, region.end, newText, mapPosition(selStart, selEnd > selStart), mapPosition(selEnd, false));
}

/** Indexes of lines an action applies to: non-empty lines, or the only line of a single-line region. */
function targetLines(lines: readonly string[]): ReadonlySet<number> {
  const targets = new Set<number>();

  lines.forEach((line, index) => {
    if (line.trim() !== "" || lines.length === 1) {
      targets.add(index);
    }
  });

  return targets;
}

function unchanged(line: string): LineChange {
  return { line, oldContent: 0, newContent: 0 };
}

function transformLines(
  text: string,
  selStart: number,
  selEnd: number,
  transform: (line: string, index: number, count: number) => LineChange,
): TextEdit {
  const region = selectedRegion(text, selStart, selEnd);
  const lines = text.slice(region.start, region.end).split("\n");
  const targets = targetLines(lines);
  let seen = 0;

  const changes = lines.map((line, index) => {
    if (!targets.has(index)) {
      return unchanged(line);
    }

    const change = transform(line, seen, targets.size);

    seen++;

    return change;
  });

  return lineEdit(text, selStart, selEnd, region, changes);
}

function headingLevelOf(line: string): HeadingInfo {
  const indent = Math.min(skipSpaces(line, 0), 3);
  let j = indent;

  while (line.charAt(j) === "#") {
    j++;
  }

  const level = j - indent;

  if (level < 1 || level > 6 || (j < line.length && line.charAt(j) !== " ")) {
    return { level: 0, contentStart: skipSpaces(line, 0) };
  }

  return { level, contentStart: skipSpaces(line, j) };
}

function applyHeading(text: string, selStart: number, selEnd: number, level: number): TextEdit {
  const region = selectedRegion(text, selStart, selEnd);
  const lines = text.slice(region.start, region.end).split("\n");
  const targets = targetLines(lines);
  let allSame = targets.size > 0;

  for (const index of targets) {
    allSame = allSame && headingLevelOf(lines[index] ?? "").level === level;
  }

  const prefix = allSame ? "" : `${"#".repeat(level)} `;

  return transformLines(text, selStart, selEnd, (line) => {
    const info = headingLevelOf(line);

    return { line: prefix + line.slice(info.contentStart), oldContent: info.contentStart, newContent: prefix.length };
  });
}

function removeQuoteLevel(line: string, info: LineInfo): LineChange {
  const at = info.indent;
  const end = at + 1 + (line.charAt(at + 1) === " " ? 1 : 0);

  return { line: line.slice(0, at) + line.slice(end), oldContent: info.quoteEnd, newContent: info.quoteEnd - (end - at) };
}

function applyQuote(text: string, selStart: number, selEnd: number): TextEdit {
  const region = selectedRegion(text, selStart, selEnd);
  const lines = text.slice(region.start, region.end).split("\n");
  const targets = targetLines(lines);
  let allQuoted = targets.size > 0;

  for (const index of targets) {
    allQuoted = allQuoted && parseLine(lines[index] ?? "").quoteEnd > parseLine(lines[index] ?? "").indent;
  }

  return transformLines(text, selStart, selEnd, (line) => {
    const info = parseLine(line);

    if (allQuoted) {
      return removeQuoteLevel(line, info);
    }

    if (info.quoteEnd > info.indent) {
      return unchanged(line);
    }

    return {
      line: `${line.slice(0, info.indent)}> ${line.slice(info.indent)}`,
      oldContent: info.quoteEnd,
      newContent: info.quoteEnd + 2,
    };
  });
}

function listPrefix(action: FormatAction, info: LineInfo, ordinal: number): string {
  if (action === "orderedList") {
    return `${ordinal + 1}. `;
  }

  const marker = info.kind === "bullet" || info.kind === "task" ? info.marker : "-";

  if (action === "taskList") {
    return info.kind === "task" ? `${marker} [${info.checked ? "x" : " "}] ` : `${marker} [ ] `;
  }

  return info.kind === "bullet" ? `${marker} ` : "- ";
}

function applyList(text: string, selStart: number, selEnd: number, action: FormatAction): TextEdit {
  const kind = LIST_KINDS.get(action) ?? "bullet";
  const region = selectedRegion(text, selStart, selEnd);
  const lines = text.slice(region.start, region.end).split("\n");
  const targets = targetLines(lines);
  let allMatch = targets.size > 0;

  for (const index of targets) {
    allMatch = allMatch && parseLine(lines[index] ?? "").kind === kind;
  }

  return transformLines(text, selStart, selEnd, (line, ordinal) => {
    const info = parseLine(line);
    const prefix = allMatch ? "" : listPrefix(action, info, ordinal);
    const listStart = info.quoteEnd;
    const content = line.slice(info.contentStart);

    return {
      line: line.slice(0, listStart) + prefix + content,
      oldContent: info.contentStart,
      newContent: listStart + prefix.length,
    };
  });
}

function applyToggleTask(text: string, selStart: number, selEnd: number): TextEdit {
  const edit = transformLines(text, selStart, selEnd, (line) => {
    const info = parseLine(line);

    if (info.kind === "task") {
      const boxAt = skipSpaces(line, info.quoteEnd);
      const open = line.indexOf("[", boxAt);
      const next = info.checked ? " " : "x";

      return {
        line: `${line.slice(0, open + 1)}${next}${line.slice(open + 2)}`,
        oldContent: info.contentStart,
        newContent: info.contentStart,
      };
    }

    if (info.kind === "bullet" || info.kind === "ordered") {
      const rest = line.slice(info.contentStart);
      const head = line.slice(0, info.contentStart);
      const spacer = head.endsWith(" ") || rest === "" ? "" : " ";

      return {
        line: `${head}${spacer}[ ] ${rest}`,
        oldContent: info.contentStart,
        newContent: info.contentStart + spacer.length + 4,
      };
    }

    return unchanged(line);
  });

  return edit.insert === "" && edit.from === edit.to ? noop(selStart, selEnd) : edit;
}

// ---------------------------------------------------------------------------------------------
// Fenced code blocks
// ---------------------------------------------------------------------------------------------

function fenceMarker(line: string): { char: string; length: number } | null {
  const indent = skipSpaces(line, 0);
  const char = line.charAt(indent);

  if (indent > 3 || (char !== "`" && char !== "~")) {
    return null;
  }

  let j = indent;

  while (line.charAt(j) === char) {
    j++;
  }

  return j - indent >= 3 ? { char, length: j - indent } : null;
}

function findFenceBlocks(text: string): FenceBlock[] {
  const blocks: FenceBlock[] = [];
  let open: { char: string; length: number; start: number; end: number } | null = null;
  let start = 0;

  while (start <= text.length) {
    const end = lineEndOf(text, start);
    const line = text.slice(start, end);
    const marker = fenceMarker(line);

    if (open === null) {
      if (marker !== null) {
        open = { ...marker, start, end };
      }
    } else if (marker !== null && marker.char === open.char && marker.length >= open.length && line.trim().replace(/^[`~]+/, "") === "") {
      blocks.push({ openStart: open.start, openEnd: open.end, closeStart: start, closeEnd: end });
      open = null;
    }

    start = end + 1;
  }

  if (open !== null) {
    blocks.push({ openStart: open.start, openEnd: open.end, closeStart: -1, closeEnd: text.length });
  }

  return blocks;
}

function applyCodeBlock(text: string, selStart: number, selEnd: number): TextEdit {
  const region = selectedRegion(text, selStart, selEnd);
  const block = findFenceBlocks(text).find((candidate) => candidate.openStart <= region.start && region.end <= candidate.closeEnd);

  if (block !== undefined) {
    const innerStart = Math.min(block.openEnd + 1, block.closeEnd);
    const innerEnd = block.closeStart === -1 ? block.closeEnd : Math.max(block.closeStart - 1, innerStart);
    const inner = text.slice(innerStart, innerEnd);
    const shift = innerStart - block.openStart;
    const map = (pos: number): number => clamp(pos - shift, block.openStart, block.openStart + inner.length);

    return minimize(text, block.openStart, block.closeEnd, inner, map(selStart), map(selEnd));
  }

  const body = text.slice(region.start, region.end);
  const insert = `\`\`\`\n${body}\n\`\`\``;

  if (selStart === selEnd && body.trim() === "") {
    return { from: region.start, to: region.end, insert: "```\n\n```", selectionStart: region.start + 4, selectionEnd: region.start + 4 };
  }

  const limit = region.start + 4 + body.length;

  return {
    from: region.start,
    to: region.end,
    insert,
    selectionStart: clamp(selStart + 4, region.start + 4, limit),
    selectionEnd: clamp(selEnd + 4, region.start + 4, limit),
  };
}

// ---------------------------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------------------------

function applyLink(text: string, selStart: number, selEnd: number): TextEdit {
  const selected = text.slice(selStart, selEnd);

  if (selected === "") {
    return { from: selStart, to: selEnd, insert: "[text](url)", selectionStart: selStart + 1, selectionEnd: selStart + 5 };
  }

  if (URL_LIKE.test(selected)) {
    return { from: selStart, to: selEnd, insert: `[](${selected})`, selectionStart: selStart + 1, selectionEnd: selStart + 1 };
  }

  const urlStart = selStart + selected.length + 3;

  return { from: selStart, to: selEnd, insert: `[${selected}](url)`, selectionStart: urlStart, selectionEnd: urlStart + 3 };
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

/**
 * Compute the text edit for a formatting action. Offsets are clamped to the text, and every
 * action toggles: running it twice restores the original text.
 */
export function applyFormat(text: string, selStart: number, selEnd: number, action: FormatAction): TextEdit {
  const a = clamp(Math.min(selStart, selEnd), 0, text.length);
  const b = clamp(Math.max(selStart, selEnd), 0, text.length);
  const marker = INLINE_MARKERS.get(action);

  if (marker !== undefined) {
    return applyWrap(text, a, b, marker);
  }

  const level = HEADING_LEVELS.get(action);

  if (level !== undefined) {
    return applyHeading(text, a, b, level);
  }

  switch (action) {
    case "codeBlock":
      return applyCodeBlock(text, a, b);
    case "list":
    case "orderedList":
    case "taskList":
      return applyList(text, a, b, action);
    case "quote":
      return applyQuote(text, a, b);
    case "link":
      return applyLink(text, a, b);
    case "toggleTask":
      return applyToggleTask(text, a, b);
    default:
      return noop(a, b);
  }
}

function nextMarker(info: LineInfo): string {
  if (info.kind === "ordered") {
    return `${info.number + 1}${info.marker.slice(-1)} `;
  }

  return info.kind === "task" ? `${info.marker} [ ] ` : `${info.marker} `;
}

/**
 * Continue a list or blockquote when Enter is pressed at `caret`. Returns null when the line is
 * not a list or quote line, so the browser can handle Enter normally.
 */
export function continueList(text: string, caret: number): TextEdit | null {
  const at = clamp(caret, 0, text.length);
  const start = lineStartOf(text, at);
  const end = lineEndOf(text, at);
  const line = text.slice(start, end);
  const info = parseLine(line);
  const column = at - start;
  const quoted = info.quoteEnd > info.indent;

  if ((info.kind === "none" && !quoted) || column < info.contentStart) {
    return null;
  }

  const rest = line.slice(info.contentStart);

  if (rest.trim() === "") {
    const cleared = info.kind !== "none" && quoted ? line.slice(0, info.quoteEnd) : "";

    return {
      from: start,
      to: end,
      insert: cleared,
      selectionStart: start + cleared.length,
      selectionEnd: start + cleared.length,
    };
  }

  const head = line.slice(0, info.quoteEnd);
  const prefix = info.kind === "none" ? head : head + nextMarker(info);
  const insert = `\n${prefix}`;

  return { from: at, to: at, insert, selectionStart: at + insert.length, selectionEnd: at + insert.length };
}
