import {
  fuzzyMatch,
  type KeybindingsManager,
  type KeyId,
  matchesKey,
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
} from '@earendil-works/pi-tui';

/**
 * The subset of Pi's theme the kit draws with. Pass the `theme` that `ctx.ui.custom`
 * supplies; the kit never reads a global theme.
 */
export interface UiTheme {
  fg(color: UiColor, text: string): string;
  bg(color: UiBackground, text: string): string;
  bold(text: string): string;
  getBgAnsi(color: UiBackground): string;
}

export type UiColor =
  | 'accent'
  | 'muted'
  | 'dim'
  | 'text'
  | 'success'
  | 'warning'
  | 'error'
  | 'borderAccent'
  | 'borderMuted';
export type UiBackground = 'userMessageBg' | 'selectedBg';

/** The subset of Pi's keybindings manager the kit reads. */
export type UiKeybindings = Pick<KeybindingsManager, 'matches' | 'getKeys'>;

/** Text with terminal control sequences and control characters removed; tabs become spaces. */
export function sanitize(text: string): string {
  return stripTerminalSequences(text)
    .replace(/\p{Cc}/gu, (char) => (char === '\n' || char === '\t' ? char : ''))
    .replace(/\t/gu, '    ');
}

/** Cut `line` to `width` columns, then pad it with spaces to exactly `width`. */
export function fit(line: string, width: number): string {
  const clipped = truncateToWidth(line, Math.max(0, width));
  return clipped + ' '.repeat(Math.max(0, width - visibleWidth(clipped)));
}

/** Join `left` and `right` on one row of `width` columns, right-aligning `right`. */
export function spread(left: string, right: string, width: number): string {
  const rightWidth = Math.min(visibleWidth(right), width);
  const leftPart = truncateToWidth(left, Math.max(0, width - rightWidth - (rightWidth ? 1 : 0)));
  const gap = Math.max(0, width - visibleWidth(leftPart) - rightWidth);
  return truncateToWidth(leftPart + ' '.repeat(gap) + right, width);
}

export type Range = [start: number, end: number];

/** A query match. Lower tiers are better: 0 phrase, 1 word start, 2 substring, 3 fuzzy. */
export interface Match {
  tier: number;
  ranges: Range[];
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function fold(text: string): { text: string; offsets: Range[] } {
  let folded = '';
  const offsets: Range[] = [];
  for (const part of segmenter.segment(text)) {
    const value = part.segment.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    folded += value;
    for (let i = 0; i < value.length; i++)
      offsets.push([part.index, part.index + part.segment.length]);
  }
  return { text: folded, offsets };
}

/**
 * Match `query` against `text`, case- and accent-insensitively. Tries the whole phrase, then
 * every whitespace-separated token at a word start, as a substring, and as a fuzzy subsequence.
 * Returns the best tier and the matched ranges of `text`, or null. An empty query matches at tier 0.
 */
export function match(text: string, query: string): Match | null {
  const haystack = fold(text);
  const needle = fold(query.trim()).text;
  if (!needle) return { tier: 0, ranges: [] };
  let tier = 0;
  const phrase = haystack.text.indexOf(needle);
  let positions: number[] = [];
  if (phrase >= 0) positions = Array.from({ length: needle.length }, (_, i) => phrase + i);
  else {
    const tokens = needle.split(/\s+/u);
    for (tier = 1; tier <= 3; tier++) {
      positions = [];
      let matched = true;
      for (const token of tokens) {
        let start = haystack.text.indexOf(token);
        if (tier === 1) {
          while (start > 0 && /[\p{L}\p{N}_]/u.test(haystack.text[start - 1] ?? ''))
            start = haystack.text.indexOf(token, start + 1);
        }
        if (tier < 3) {
          if (start < 0) {
            matched = false;
            break;
          }
          positions.push(...Array.from({ length: token.length }, (_, i) => start + i));
        } else {
          if (!fuzzyMatch(token, haystack.text).matches) {
            matched = false;
            break;
          }
          let cursor = 0;
          for (const char of token) {
            const index = haystack.text.indexOf(char, cursor);
            if (index < 0) {
              matched = false;
              break;
            }
            positions.push(...Array.from({ length: char.length }, (_, i) => index + i));
            cursor = index + char.length;
          }
        }
      }
      if (matched) break;
    }
    if (tier > 3) return null;
  }
  const ranges: Range[] = [];
  for (const position of [...new Set(positions)].sort((a, b) => a - b)) {
    const offset = haystack.offsets[position];
    if (!offset) continue;
    const last = ranges.at(-1);
    if (last && offset[0] <= last[1]) last[1] = Math.max(last[1], offset[1]);
    else ranges.push([...offset]);
  }
  return { tier, ranges };
}

/** Wrap each range of `text` with `style`. Ranges must be sorted and non-overlapping. */
export function highlight(
  text: string,
  ranges: readonly Range[],
  style: (text: string) => string,
): string {
  let result = '';
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start < cursor || start >= text.length) continue;
    result += text.slice(cursor, start) + style(text.slice(start, end));
    cursor = end;
  }
  return result + text.slice(cursor);
}

/** A raw key such as `ctrl+t`, or a Pi keybinding ID such as `tui.select.confirm`. */
export type KeyRef = KeyId | { id: string };

/**
 * One user-facing key action. Pi keybinding IDs follow the user's remaps. `hint` labels the
 * binding in key hints and may be computed per render; omit it to keep the binding out of them.
 */
export interface Binding {
  keys: readonly KeyRef[];
  hint?: string | (() => string);
}

type BindingId = Parameters<UiKeybindings['matches']>[1];

/** Whether `data` is one of the binding's keys. */
export function matches(data: string, binding: Binding, keybindings: UiKeybindings): boolean {
  return binding.keys.some((key) =>
    typeof key === 'string'
      ? matchesKey(data, key)
      : keybindings.matches(data, key.id as BindingId),
  );
}

const keyNames: Record<string, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  escape: 'Esc',
  enter: 'Enter',
  space: 'Space',
  tab: 'Tab',
  pageup: 'PgUp',
  pagedown: 'PgDn',
  home: 'Home',
  end: 'End',
  backspace: 'Backspace',
  ctrl: 'Ctrl',
  shift: 'Shift',
  alt: process.platform === 'darwin' ? 'Option' : 'Alt',
  super: 'Super',
};

function keyLabel(key: string): { modifiers: string; base: string } {
  const parts = key.split('+').map((part) => {
    const name = keyNames[part.toLowerCase()];
    if (name) return name;
    return part.length === 1 ? part.toUpperCase() : part;
  });
  const base = parts.pop() ?? '';
  return { modifiers: parts.map((part) => `${part}+`).join(''), base };
}

/**
 * The display label for a binding's keys, for example `↑/↓`, `Shift+↑/↓` or `Ctrl+T`.
 * Keys that share the same modifiers are collapsed.
 */
export function bindingLabel(binding: Binding, keybindings: UiKeybindings): string {
  const keys = binding.keys.flatMap((key) =>
    typeof key === 'string' ? [key] : keybindings.getKeys(key.id as BindingId).map(String),
  );
  const labels = [...new Set(keys)].map(keyLabel);
  const modifiers = labels[0]?.modifiers;
  if (labels.length > 1 && labels.every((label) => label.modifiers === modifiers))
    return `${modifiers}${labels.map((label) => label.base).join('/')}`;
  return labels.map((label) => label.modifiers + label.base).join('/');
}

/** The binding's hint text for this render, or undefined when it has none. */
export function bindingHint(binding: Binding): string | undefined {
  return typeof binding.hint === 'function' ? binding.hint() : binding.hint;
}
