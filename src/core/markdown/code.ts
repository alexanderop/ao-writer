/** A fenced code block with a language: what the highlighter is asked to colour. */
export interface CodeBlock {
  readonly lang: string;
  readonly code: string;
}

/** The colour of a token in each theme. A null colour means the text colour of the page. */
export interface CodeTone {
  readonly light: string | null;
  readonly dark: string | null;
}

/** One coloured run of a code block; offsets are UTF-16 indices into the block's code, `end` exclusive. */
export interface CodeToken extends CodeTone {
  readonly start: number;
  readonly end: number;
}

/** Finished tokens by block key, shared by the preview and the editor overlay. */
export type CodeTokenMap = ReadonlyMap<string, readonly CodeToken[]>;

/** The map key of a block: its language and its exact code. */
export function codeBlockKey(block: CodeBlock): string {
  return `${block.lang}\n${block.code}`;
}

/** Reduces the first word of a fence's info string to a language name. */
export function sanitizeLanguage(word: string): string {
  return word.replace(/[^A-Za-z0-9_+#.-]/g, "");
}
