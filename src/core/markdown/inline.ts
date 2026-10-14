/**
 * Shared inline tokenizer for the Markdown highlighter and renderer.
 *
 * It turns one paragraph of text into a small node tree (text, escapes, code spans, links,
 * images, bare urls, emphasis delimiter runs). Every step is linear or bounded by a small
 * constant, so pathological input cannot blow up.
 */

/** Longest link destination (in characters) that is considered. */
const MAX_DEST = 2048;

/** Longest link title (in characters) that is considered. */
const MAX_TITLE = 1024;

/** Whitespace characters skipped between link destination parts. */
const MAX_SKIP = 64;

/** How many openers of one kind a closer may look back through. */
const MAX_LOOKBACK = 64;

/** A matched pair of emphasis delimiters. */
export interface EmphasisMatch {
  /** The delimiter character: `*`, `_` or `~`. */
  readonly char: string;
  /** Number of delimiter characters on each side: 1 or 2. */
  readonly size: number;
  /** Index of the first opening delimiter character used by this match. */
  readonly openStart: number;
  /** Index of the first closing delimiter character used by this match. */
  readonly closeStart: number;
  readonly opener: DelimRun;
  readonly closer: DelimRun;
}

/** A run of `*`, `_` or `~~` characters with its emphasis bookkeeping. */
export interface DelimRun {
  readonly char: string;
  readonly pos: number;
  readonly len: number;
  readonly canOpen: boolean;
  readonly canClose: boolean;
  /** Matches that opened on this run, in the order they were found (innermost first). */
  openMarks: EmphasisMatch[];
  /** Matches that closed on this run, in the order they were found (innermost first). */
  closeMarks: EmphasisMatch[];
  /** Characters consumed from the left of the run by closing matches. */
  usedLeft: number;
  /** Characters consumed from the right of the run by opening matches. */
  usedRight: number;
}

/** One inline syntax node. Offsets index into the string given to `parseInline`. */
export type InlineNode =
  | { readonly kind: "text"; readonly start: number; readonly end: number }
  | { readonly kind: "escape"; readonly start: number; readonly end: number }
  | { readonly kind: "code"; readonly start: number; readonly end: number; readonly ticks: number }
  | { readonly kind: "url"; readonly start: number; readonly end: number; readonly angle: boolean }
  | { readonly kind: "delim"; readonly run: DelimRun }
  | {
      readonly kind: "link";
      readonly image: boolean;
      readonly start: number;
      readonly end: number;
      readonly textStart: number;
      readonly textEnd: number;
      readonly destStart: number;
      readonly destEnd: number;
      readonly titleStart: number;
      readonly titleEnd: number;
      readonly children: readonly InlineNode[];
    };

/** The result of tokenizing one inline string. */
interface ParsedInline {
  readonly nodes: readonly InlineNode[];
  /** Every emphasis match found, including those inside link text. */
  readonly matches: readonly EmphasisMatch[];
}

/** The parenthesised part of an inline link, `(dest "title")`. */
interface LinkTail {
  readonly destStart: number;
  readonly destEnd: number;
  readonly titleStart: number;
  readonly titleEnd: number;
  /** Index just after the closing parenthesis. */
  readonly end: number;
}

interface Opener {
  readonly run: DelimRun;
  readonly pos: number;
  readonly origLen: number;
  rem: number;
}

interface Bracket {
  readonly image: boolean;
  readonly start: number;
  readonly textStart: number;
  readonly itemIndex: number;
}

interface TickIndex {
  readonly byLen: Map<number, number[]>;
  readonly cursor: Map<number, number>;
}

const PUNCT_PATTERN = /[\p{P}\p{S}]/u;

/** True for ASCII punctuation, the characters a backslash can escape. */
function isAsciiPunct(code: number): boolean {
  return (
    (code >= 33 && code <= 47) ||
    (code >= 58 && code <= 64) ||
    (code >= 91 && code <= 96) ||
    (code >= 123 && code <= 126)
  );
}

function isWhitespaceChar(ch: string): boolean {
  return ch === " " || ch === "\n" || ch === "\t" || ch === "\r" || ch === "\f" || ch === "\u00a0" || ch.trim() === "";
}

function isAlnumCode(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isSpaceCode(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13;
}

function classifyRun(s: string, pos: number, len: number, char: string): DelimRun {
  const before = pos > 0 ? s.charAt(pos - 1) : "\n";
  const after = pos + len < s.length ? s.charAt(pos + len) : "\n";
  const beforeWs = isWhitespaceChar(before);
  const afterWs = isWhitespaceChar(after);
  const beforePunct = !beforeWs && PUNCT_PATTERN.test(before);
  const afterPunct = !afterWs && PUNCT_PATTERN.test(after);
  const left = !afterWs && (!afterPunct || beforeWs || beforePunct);
  const right = !beforeWs && (!beforePunct || afterWs || afterPunct);
  const underscore = char === "_";

  return {
    char,
    pos,
    len,
    canOpen: underscore ? left && (!right || beforePunct) : left,
    canClose: underscore ? right && (!left || afterPunct) : right,
    openMarks: [],
    closeMarks: [],
    usedLeft: 0,
    usedRight: 0,
  };
}

function indexTicks(s: string): TickIndex {
  const byLen = new Map<number, number[]>();
  let i = s.indexOf("`");

  while (i !== -1) {
    let j = i;

    while (s.charCodeAt(j) === 96) {
      j++;
    }

    const len = j - i;
    const starts = byLen.get(len);

    if (starts === undefined) {
      byLen.set(len, [i]);
    } else {
      starts.push(i);
    }

    i = s.indexOf("`", j);
  }

  return { byLen, cursor: new Map<number, number>() };
}

/** Start of the next backtick run of exactly `len` characters at or after `from`, or -1. */
function findTickCloser(index: TickIndex, from: number, len: number): number {
  const starts = index.byLen.get(len);

  if (starts === undefined) {
    return -1;
  }

  let at = index.cursor.get(len) ?? 0;

  while (at < starts.length && (starts[at] ?? 0) < from) {
    at++;
  }

  index.cursor.set(len, at);

  return starts[at] ?? -1;
}

function skipSpace(s: string, from: number): number {
  let i = from;
  const limit = Math.min(s.length, from + MAX_SKIP);

  while (i < limit && isSpaceCode(s.charCodeAt(i))) {
    i++;
  }

  return i;
}

function scanDestination(s: string, from: number): { start: number; end: number; next: number } | null {
  if (s.charCodeAt(from) === 60) {
    let j = from + 1;

    while (j < s.length && j - from < MAX_DEST) {
      const c = s.charCodeAt(j);

      if (c === 62 || c === 60 || c === 10) {
        break;
      }

      j++;
    }

    return s.charCodeAt(j) === 62 ? { start: from + 1, end: j, next: j + 1 } : null;
  }

  let depth = 0;
  let j = from;

  while (j < s.length && j - from < MAX_DEST) {
    const c = s.charCodeAt(j);

    if (c <= 32 || c === 127) {
      break;
    }

    if (c === 92 && isAsciiPunct(s.charCodeAt(j + 1))) {
      j += 2;
      continue;
    }

    if (c === 40) {
      depth++;
    } else if (c === 41) {
      if (depth === 0) {
        break;
      }

      depth--;
    }

    j++;
  }

  return depth === 0 && j - from < MAX_DEST ? { start: from, end: j, next: j } : null;
}

function scanTitle(s: string, from: number): { start: number; end: number; next: number } | null {
  const open = s.charCodeAt(from);
  const close = open === 40 ? 41 : open;

  if (open !== 34 && open !== 39 && open !== 40) {
    return null;
  }

  let j = from + 1;

  while (j < s.length && j - from < MAX_TITLE) {
    const c = s.charCodeAt(j);

    if (c === 92) {
      j += 2;
      continue;
    }

    if (c === close) {
      return { start: from + 1, end: j, next: j + 1 };
    }

    j++;
  }

  return null;
}

/** Parse `(dest "title")` starting at the `(` at `open`; null when it is not a link tail. */
function parseLinkTail(s: string, open: number): LinkTail | null {
  const destFrom = skipSpace(s, open + 1);
  const dest = scanDestination(s, destFrom);

  if (dest === null) {
    return null;
  }

  const afterDest = skipSpace(s, dest.next);

  if (s.charCodeAt(afterDest) === 41) {
    return {
      destStart: dest.start,
      destEnd: dest.end,
      titleStart: -1,
      titleEnd: -1,
      end: afterDest + 1,
    };
  }

  if (afterDest === dest.next) {
    return null;
  }

  const title = scanTitle(s, afterDest);

  if (title === null) {
    return null;
  }

  const afterTitle = skipSpace(s, title.next);

  if (s.charCodeAt(afterTitle) !== 41) {
    return null;
  }

  return {
    destStart: dest.start,
    destEnd: dest.end,
    titleStart: title.start,
    titleEnd: title.end,
    end: afterTitle + 1,
  };
}

/** End of a bare http(s) url starting at `from`, or -1 when none starts there. */
function bareUrlEnd(s: string, from: number): number {
  if (from > 0 && isAlnumCode(s.charCodeAt(from - 1))) {
    return -1;
  }

  const head = s.slice(from, from + 8).toLowerCase();
  const prefix = head.startsWith("https://") ? 8 : head.startsWith("http://") ? 7 : 0;

  if (prefix === 0) {
    return -1;
  }

  let end = from + prefix;
  let opens = 0;
  let closes = 0;

  while (end < s.length) {
    const c = s.charCodeAt(end);

    if (c <= 32 || c === 60 || c === 62 || c === 91 || c === 93) {
      break;
    }

    if (c === 40) {
      opens++;
    } else if (c === 41) {
      closes++;
    }

    end++;
  }

  while (end > from + prefix) {
    const c = s.charCodeAt(end - 1);
    const trailing = "?!.,:;*_~'\"".includes(s.charAt(end - 1));

    if (trailing) {
      end--;
    } else if (c === 41 && closes > opens) {
      closes--;
      end--;
    } else {
      break;
    }
  }

  return end > from + prefix ? end : -1;
}

/** End of the url in an `<http://...>` autolink whose `<` sits just before `from`, or -1. */
function angleUrlEnd(s: string, from: number): number {
  if (s.charAt(from - 1) !== "<") {
    return -1;
  }

  const head = s.slice(from, from + 8).toLowerCase();

  if (!head.startsWith("http://") && !head.startsWith("https://")) {
    return -1;
  }

  let end = from;

  while (end < s.length && s.charCodeAt(end) > 32 && s.charCodeAt(end) !== 60 && s.charCodeAt(end) !== 62) {
    end++;
  }

  return s.charAt(end) === ">" && end > from + 7 ? end : -1;
}

function limitDepth(found: readonly EmphasisMatch[], maxDepth: number): readonly EmphasisMatch[] {
  if (found.length <= maxDepth) {
    return found;
  }

  const order = [...found].sort((a, b) => a.openStart - b.openStart || b.closeStart - a.closeStart);
  const closes: number[] = [];
  const dropped = new Set<EmphasisMatch>();

  for (const match of order) {
    while (closes.length > 0 && (closes[closes.length - 1] ?? 0) < match.openStart) {
      closes.pop();
    }

    if (closes.length >= maxDepth) {
      dropped.add(match);
    } else {
      closes.push(match.closeStart);
    }
  }

  const kept: EmphasisMatch[] = [];

  for (const match of found) {
    if (!dropped.has(match)) {
      kept.push(match);
    }
  }

  return kept;
}

function ruleOfThreeBlocks(opener: Opener, run: DelimRun): boolean {
  if (run.char === "~") {
    return false;
  }

  const mixed = opener.run.canClose || run.canOpen;

  return mixed && (opener.origLen + run.len) % 3 === 0 && !(opener.origLen % 3 === 0 && run.len % 3 === 0);
}

function dropOpenersAbove(stacks: ReadonlyMap<string, Opener[]>, pos: number): void {
  for (const stack of stacks.values()) {
    while (stack.length > 0 && (stack[stack.length - 1]?.pos ?? 0) > pos) {
      stack.pop();
    }
  }
}

/**
 * Pair up emphasis delimiter runs (CommonMark style with a bounded look-back) and record the
 * result on the runs. Returns the matches that were kept after the nesting-depth cap.
 */
function matchEmphasis(runs: readonly DelimRun[], maxDepth: number): readonly EmphasisMatch[] {
  const stacks = new Map<string, Opener[]>([
    ["*", []],
    ["_", []],
    ["~", []],
  ]);

  const found: EmphasisMatch[] = [];

  for (const run of runs) {
    const stack = stacks.get(run.char) ?? [];
    let rem = run.len;

    if (run.canClose) {
      while (rem > 0 && stack.length > 0) {
        let at = -1;
        const floor = Math.max(0, stack.length - MAX_LOOKBACK);

        for (let j = stack.length - 1; j >= floor; j--) {
          const candidate = stack[j];

          if (candidate !== undefined && candidate.rem > 0 && !ruleOfThreeBlocks(candidate, run)) {
            at = j;
            break;
          }
        }

        const opener = stack[at];

        if (opener === undefined) {
          break;
        }

        const size = run.char === "~" || (opener.rem >= 2 && rem >= 2) ? 2 : 1;

        const match: EmphasisMatch = {
          char: run.char,
          size,
          openStart: opener.pos + opener.rem - size,
          closeStart: run.pos + (run.len - rem),
          opener: opener.run,
          closer: run,
        };

        found.push(match);
        opener.rem -= size;
        rem -= size;
        stack.length = opener.rem > 0 ? at + 1 : at;
        dropOpenersAbove(stacks, opener.pos);
      }
    }

    if (rem > 0 && run.canOpen) {
      stack.push({ run, pos: run.pos + (run.len - rem), origLen: run.len, rem });
    }
  }

  const kept = limitDepth(found, maxDepth);

  for (const match of kept) {
    match.opener.openMarks.push(match);
    match.opener.usedRight += match.size;
    match.closer.closeMarks.push(match);
    match.closer.usedLeft += match.size;
  }

  return kept;
}

function pushAll(target: EmphasisMatch[], source: readonly EmphasisMatch[]): void {
  for (const match of source) {
    target.push(match);
  }
}

function collectRuns(nodes: readonly InlineNode[]): DelimRun[] {
  const runs: DelimRun[] = [];

  for (const node of nodes) {
    if (node.kind === "delim") {
      runs.push(node.run);
    }
  }

  return runs;
}

/**
 * Tokenize `s` (one paragraph; lines joined by "\n") into inline nodes and resolve emphasis.
 * `maxDepth` caps how deeply emphasis may nest.
 */
export function parseInline(s: string, maxDepth: number): ParsedInline {
  const matches: EmphasisMatch[] = [];
  const items: InlineNode[] = [];
  const brackets: Bracket[] = [];
  const ticks = indexTicks(s);
  const n = s.length;
  let inactiveUpTo = 0;
  let textStart = 0;
  let i = 0;

  const flush = (end: number): void => {
    if (end > textStart) {
      items.push({ kind: "text", start: textStart, end });
    }
  };

  const openBracket = (image: boolean): void => {
    flush(i);

    const width = image ? 2 : 1;

    brackets.push({ image, start: i, textStart: i + width, itemIndex: items.length });
    items.push({ kind: "text", start: i, end: i + width });
    i += width;
    textStart = i;
  };

  const closeBracket = (): void => {
    const opener = brackets.pop();

    if (opener === undefined) {
      i++;

      return;
    }

    const active = opener.image || brackets.length >= inactiveUpTo;

    inactiveUpTo = Math.min(inactiveUpTo, brackets.length);

    const tail = active && s.charCodeAt(i + 1) === 40 ? parseLinkTail(s, i + 1) : null;

    if (tail === null) {
      i++;

      return;
    }

    flush(i);

    const children = items.splice(opener.itemIndex + 1);

    items.pop();
    pushAll(matches, matchEmphasis(collectRuns(children), maxDepth));
    items.push({
      kind: "link",
      image: opener.image,
      start: opener.start,
      end: tail.end,
      textStart: opener.textStart,
      textEnd: i,
      destStart: tail.destStart,
      destEnd: tail.destEnd,
      titleStart: tail.titleStart,
      titleEnd: tail.titleEnd,
      children,
    });
    i = tail.end;
    textStart = i;

    if (!opener.image) {
      inactiveUpTo = brackets.length;
    }
  };

  const delimiter = (code: number): void => {
    let j = i;

    while (s.charCodeAt(j) === code) {
      j++;
    }

    const len = j - i;
    const char = String.fromCharCode(code);

    if (code === 126 && len !== 2) {
      i = j;

      return;
    }

    const run = classifyRun(s, i, len, char);

    if (run.canOpen || run.canClose) {
      flush(i);
      items.push({ kind: "delim", run });
      textStart = j;
    }

    i = j;
  };

  const backtick = (): void => {
    let j = i;

    while (s.charCodeAt(j) === 96) {
      j++;
    }

    const len = j - i;
    const closer = findTickCloser(ticks, j, len);

    if (closer === -1) {
      i = j;

      return;
    }

    flush(i);
    items.push({ kind: "code", start: i, end: closer + len, ticks: len });
    i = closer + len;
    textStart = i;
  };

  const bareUrl = (): void => {
    const angleEnd = angleUrlEnd(s, i);

    if (angleEnd !== -1) {
      flush(i - 1);
      items.push({ kind: "url", start: i, end: angleEnd, angle: true });
      i = angleEnd + 1;
      textStart = i;

      return;
    }

    const end = bareUrlEnd(s, i);

    if (end === -1) {
      i++;

      return;
    }

    flush(i);
    items.push({ kind: "url", start: i, end, angle: false });
    i = end;
    textStart = i;
  };

  while (i < n) {
    const code = s.charCodeAt(i);

    if (code === 92) {
      const next = s.charCodeAt(i + 1);

      if (isAsciiPunct(next) || next === 10) {
        flush(i);
        items.push({ kind: "escape", start: i, end: i + 2 });
        i += 2;
        textStart = i;
      } else {
        i++;
      }
    } else if (code === 96) {
      backtick();
    } else if (code === 42 || code === 95 || code === 126) {
      delimiter(code);
    } else if (code === 91) {
      openBracket(false);
    } else if (code === 33 && s.charCodeAt(i + 1) === 91) {
      openBracket(true);
    } else if (code === 93) {
      closeBracket();
    } else if (code === 104 || code === 72) {
      bareUrl();
    } else {
      i++;
    }
  }

  flush(n);
  pushAll(matches, matchEmphasis(collectRuns(items), maxDepth));

  return { nodes: items, matches };
}
