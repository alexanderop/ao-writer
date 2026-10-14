import { parseInline } from "./inline.ts";
import type { EmphasisMatch, InlineNode } from "./inline.ts";

/** A styled span of the source text; offsets are UTF-16 indices, `end` exclusive. */
export interface MdRange {
  readonly start: number;
  readonly end: number;
  readonly className: string;
  /** True when the span is not prose (syntax, code, urls) so the part-of-speech tagger must skip it. */
  readonly mask: boolean;
}

interface Segment {
  readonly start: number;
  readonly end: number;
}

type PendingKind = "para" | "quote" | "item";

interface Pending {
  readonly kind: PendingKind;
  readonly segments: Segment[];
}

interface Fence {
  readonly char: string;
  readonly length: number;
}

interface State {
  readonly text: string;
  readonly out: MdRange[];
  fence: Fence | null;
  pending: Pending | null;
}

/** Emphasis nesting depth beyond which delimiters are left as plain text. */
const MAX_EMPHASIS_DEPTH = 64;

function add(state: State, start: number, end: number, className: string, mask: boolean): void {
  if (end > start) {
    state.out.push({ start, end, className, mask });
  }
}

function skipSpaces(text: string, from: number, end: number, max: number): number {
  let i = from;

  while (i < end && i - from < max && (text.charCodeAt(i) === 32 || text.charCodeAt(i) === 9)) {
    i++;
  }

  return i;
}

function isBlank(text: string, from: number, end: number): boolean {
  return skipSpaces(text, from, end, end - from) >= end;
}

function trimEnd(text: string, from: number, end: number): number {
  let i = end;

  while (i > from && (text.charCodeAt(i - 1) === 32 || text.charCodeAt(i - 1) === 9)) {
    i--;
  }

  return i;
}

function isThematicBreak(text: string, from: number, end: number): boolean {
  const char = text.charAt(from);

  if (char !== "-" && char !== "*" && char !== "_") {
    return false;
  }

  let count = 0;

  for (let i = from; i < end; i++) {
    const c = text.charAt(i);

    if (c === char) {
      count++;
    } else if (c !== " " && c !== "\t") {
      return false;
    }
  }

  return count >= 3;
}

function openFence(text: string, from: number, end: number): { fence: Fence } | null {
  const char = text.charAt(from);

  if (char !== "`" && char !== "~") {
    return null;
  }

  let j = from;

  while (j < end && text.charAt(j) === char) {
    j++;
  }

  if (j - from < 3) {
    return null;
  }

  if (char === "`" && text.slice(j, end).includes("`")) {
    return null;
  }

  return { fence: { char, length: j - from } };
}

function closesFence(text: string, from: number, end: number, fence: Fence): boolean {
  const start = skipSpaces(text, from, end, 3);
  let j = start;

  while (j < end && text.charAt(j) === fence.char) {
    j++;
  }

  return j - start >= fence.length && isBlank(text, j, end);
}

function flushPending(state: State): void {
  const pending = state.pending;

  state.pending = null;

  if (pending === null) {
    return;
  }

  applyInline(state, pending.segments);
}

function pushSegment(state: State, kind: PendingKind, segment: Segment): void {
  const pending = state.pending;

  if (pending !== null && (kind === "para" || pending.kind === kind)) {
    pending.segments.push(segment);

    return;
  }

  flushPending(state);
  state.pending = { kind, segments: [segment] };
}

function listMarkerEnd(text: string, from: number, end: number): number {
  const first = text.charAt(from);

  if (first === "-" || first === "*" || first === "+") {
    const next = text.charCodeAt(from + 1);

    return from + 1 === end || next === 32 || next === 9 ? from + 1 : -1;
  }

  let j = from;

  while (j < end && j - from < 9 && text.charCodeAt(j) >= 48 && text.charCodeAt(j) <= 57) {
    j++;
  }

  if (j === from || j >= end || (text.charAt(j) !== "." && text.charAt(j) !== ")")) {
    return -1;
  }

  const next = text.charCodeAt(j + 1);

  return j + 1 === end || next === 32 || next === 9 ? j + 1 : -1;
}

function taskBoxLength(text: string, from: number, end: number): number {
  if (text.charAt(from) !== "[" || text.charAt(from + 2) !== "]" || from + 3 > end) {
    return 0;
  }

  const mid = text.charAt(from + 1);
  const after = text.charCodeAt(from + 3);

  if (mid !== " " && mid !== "x" && mid !== "X") {
    return 0;
  }

  return from + 3 === end || after === 32 || after === 9 ? 3 : 0;
}

function headingLine(state: State, from: number, end: number): boolean {
  const { text } = state;
  let j = from;

  while (j < end && text.charAt(j) === "#") {
    j++;
  }

  const level = j - from;

  if (level < 1 || level > 6 || (j < end && text.charCodeAt(j) !== 32 && text.charCodeAt(j) !== 9)) {
    return false;
  }

  flushPending(state);
  add(state, from, Math.min(j + 1, end), "md-mark", true);

  const textStart = skipSpaces(text, j, end, end - j);
  let textEnd = trimEnd(text, textStart, end);
  let k = textEnd;

  while (k > textStart && text.charAt(k - 1) === "#") {
    k--;
  }

  if (k < textEnd && (k === textStart || text.charAt(k - 1) === " " || text.charAt(k - 1) === "\t")) {
    add(state, k, textEnd, "md-mark", true);
    textEnd = trimEnd(text, textStart, k);
  }

  add(state, textStart, textEnd, `md-h${level}`, false);

  if (textEnd > textStart) {
    applyInline(state, [{ start: textStart, end: textEnd }]);
  }

  return true;
}

function listLine(state: State, from: number, end: number): boolean {
  const { text } = state;
  const markerStart = skipSpaces(text, from, end, end - from);
  const markerEnd = listMarkerEnd(text, markerStart, end);

  if (markerEnd === -1) {
    return false;
  }

  flushPending(state);
  add(state, markerStart, markerEnd, "md-list-mark", true);

  let contentStart = skipSpaces(text, markerEnd, end, end - markerEnd);
  const box = taskBoxLength(text, contentStart, end);

  if (box > 0) {
    add(state, contentStart, contentStart + box, "md-task-mark", true);

    const done = text.charAt(contentStart + 1) !== " ";

    contentStart = skipSpaces(text, contentStart + box, end, end - contentStart - box);

    if (done) {
      add(state, contentStart, end, "md-task-done", false);
    }
  }

  if (contentStart < end) {
    state.pending = { kind: "item", segments: [{ start: contentStart, end }] };
  }

  return true;
}

function processLine(state: State, from: number, end: number): void {
  const { text } = state;
  const fence = state.fence;

  if (fence !== null) {
    if (closesFence(text, from, end, fence)) {
      add(state, from, end, "md-mark", true);
      state.fence = null;
    } else {
      add(state, from, end, "md-code", true);
    }

    return;
  }

  if (isBlank(text, from, end)) {
    flushPending(state);

    return;
  }

  let c = skipSpaces(text, from, end, 3);
  const opened = openFence(text, c, end);

  if (opened !== null) {
    flushPending(state);
    add(state, from, end, "md-mark", true);
    state.fence = opened.fence;

    return;
  }

  let quoted = false;

  while (text.charAt(c) === ">" && c < end) {
    add(state, c, c + 1, "md-mark", true);
    c++;

    if (text.charAt(c) === " " && c < end) {
      c++;
    }

    add(state, c, end, "md-quote", false);
    quoted = true;
    c = skipSpaces(text, c, end, 3);
  }

  if (isBlank(text, c, end)) {
    flushPending(state);

    return;
  }

  if (isThematicBreak(text, c, end)) {
    flushPending(state);
    add(state, c, trimEnd(text, c, end), "md-hr", true);

    return;
  }

  if (headingLine(state, c, end) || listLine(state, c, end)) {
    return;
  }

  const start = skipSpaces(text, c, end, end - c);

  pushSegment(state, quoted ? "quote" : "para", { start, end });
}

/** Maps offsets of the joined inline string back to the real text, splitting at line joins. */
function createEmitter(state: State, segments: readonly Segment[]): (start: number, end: number, className: string, mask: boolean) => void {
  const virtualStarts: number[] = [];
  let offset = 0;

  for (const segment of segments) {
    virtualStarts.push(offset);
    offset += segment.end - segment.start + 1;
  }

  const firstSegment = (virtual: number): number => {
    let low = 0;
    let high = segments.length - 1;

    while (low < high) {
      const mid = (low + high + 1) >> 1;

      if ((virtualStarts[mid] ?? 0) <= virtual) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    return low;
  };

  return (start, end, className, mask) => {
    for (let k = firstSegment(start); k < segments.length; k++) {
      const segment = segments[k];
      const base = virtualStarts[k];

      if (segment === undefined || base === undefined || base >= end) {
        return;
      }

      const from = Math.max(start, base);
      const to = Math.min(end, base + segment.end - segment.start);

      add(state, segment.start + from - base, segment.start + to - base, className, mask);
    }
  };
}

type Emit = (start: number, end: number, className: string, mask: boolean) => void;

function emitNodes(nodes: readonly InlineNode[], emit: Emit): void {
  for (const node of nodes) {
    if (node.kind === "code") {
      emit(node.start, node.start + node.ticks, "md-mark", true);
      emit(node.start + node.ticks, node.end - node.ticks, "md-code", true);
      emit(node.end - node.ticks, node.end, "md-mark", true);
    } else if (node.kind === "url") {
      emit(node.start, node.end, "md-link-url", true);

      if (node.angle) {
        emit(node.start - 1, node.start, "md-mark", true);
        emit(node.end, node.end + 1, "md-mark", true);
      }
    } else if (node.kind === "link") {
      if (node.image) {
        emit(node.start, node.end, "md-image", false);
      }

      emit(node.start, node.textStart, "md-mark", true);
      emit(node.textStart, node.textEnd, "md-link-text", false);
      emit(node.textEnd, node.textEnd + 1, "md-mark", true);
      emit(node.textEnd + 1, node.textEnd + 2, "md-mark", true);
      emit(node.textEnd + 2, node.end - 1, "md-link-url", true);
      emit(node.end - 1, node.end, "md-mark", true);
      emitNodes(node.children, emit);
    }
  }
}

function emphasisClass(match: EmphasisMatch): string {
  if (match.char === "~") {
    return "md-strike";
  }

  return match.size === 2 ? "md-bold" : "md-italic";
}

function applyInline(state: State, segments: readonly Segment[]): void {
  const joined = segments.map((segment) => state.text.slice(segment.start, segment.end)).join("\n");
  const emit = createEmitter(state, segments);
  const parsed = parseInline(joined, MAX_EMPHASIS_DEPTH);

  emitNodes(parsed.nodes, emit);

  for (const match of parsed.matches) {
    emit(match.openStart, match.openStart + match.size, "md-mark", true);
    emit(match.openStart + match.size, match.closeStart, emphasisClass(match), false);
    emit(match.closeStart, match.closeStart + match.size, "md-mark", true);
  }
}

/**
 * Compute the styling ranges for Markdown source text. Ranges may overlap or nest; sorted by
 * start, then longest first. Linear in the length of the text.
 */
export function markdownRanges(text: string): readonly MdRange[] {
  const state: State = { text, out: [], fence: null, pending: null };
  let from = 0;

  while (from <= text.length) {
    const found = text.indexOf("\n", from);
    const end = found === -1 ? text.length : found;

    processLine(state, from, end);
    from = end + 1;
  }

  flushPending(state);
  state.out.sort((a, b) => a.start - b.start || b.end - a.end);

  return state.out;
}
