import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { highlight, type Range, sanitize, type UiTheme } from './core.ts';

/**
 * One item as the list pane shows it. The kit puts `label` and `meta` on one line, applies the
 * highlight ranges, truncates and aligns; `marker` and `style` are the caller's own styling.
 */
export interface Row {
  /** Untrusted text should go through `sanitize` first; control characters are dropped. */
  label: string;
  /** Ranges of `label` to highlight, usually from `match`. */
  ranges?: readonly Range[];
  /** Dim, right-aligned detail such as a date or a source. */
  meta?: string;
  /** A one-column state glyph shown before the label, already styled. */
  marker?: string;
  /** Style applied to the label after highlighting, for example a status color. */
  style?: (text: string) => string;
}

/**
 * Selection and scroll for a list. The caller owns it so it survives re-filtering and
 * re-rendering; `render` only scrolls as far as needed to keep the selection visible.
 */
export class ListState {
  private selectedIndex = 0;
  private offsetIndex = 0;
  private count = 0;

  get selected(): number {
    return this.selectedIndex;
  }

  get offset(): number {
    return this.offsetIndex;
  }

  /** Set the number of items, clamping the selection. */
  setCount(count: number): void {
    this.count = Math.max(0, count);
    this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, this.count - 1));
  }

  /** Select the first item and scroll to the top. */
  reset(): void {
    this.selectedIndex = 0;
    this.offsetIndex = 0;
  }

  /** Move the selection by `delta` items, clamped to the list. */
  move(delta: number): void {
    this.selectedIndex = Math.max(0, Math.min(this.count - 1, this.selectedIndex + delta));
  }

  /** Scroll so the selection is visible in `height` rows, moving as little as possible. */
  reveal(height: number): void {
    const rows = Math.max(1, height);
    if (this.selectedIndex < this.offsetIndex) this.offsetIndex = this.selectedIndex;
    else if (this.selectedIndex >= this.offsetIndex + rows)
      this.offsetIndex = this.selectedIndex - rows + 1;
    this.offsetIndex = Math.max(0, Math.min(this.offsetIndex, Math.max(0, this.count - rows)));
  }
}

export interface ListOptions {
  theme: UiTheme;
  /** Shown when there are no rows. */
  empty: string;
  /** The widest share of the row the meta column may take. Default 0.5. */
  maxMetaShare?: number;
}

const selectedPrefix = '› ';
const plainPrefix = '  ';

/**
 * Render `rows` into at most `height` lines of at most `width` columns, scrolled by `state`.
 * The selected row gets a `›` prefix; matched ranges are bold accent; meta is dim and
 * right-aligned.
 */
export function renderList(
  rows: readonly Row[],
  state: ListState,
  width: number,
  height: number,
  options: ListOptions,
): string[] {
  const { theme } = options;
  if (height <= 0) return [];
  if (!rows.length) return [truncateToWidth(theme.fg('dim', options.empty), width)];
  state.setCount(rows.length);
  state.reveal(height);
  const share = options.maxMetaShare ?? 0.5;
  return rows.slice(state.offset, state.offset + height).map((row, index) => {
    const selected = state.offset + index === state.selected;
    const prefix = selected ? theme.fg('accent', selectedPrefix) : plainPrefix;
    const marker = row.marker === undefined ? '' : `${row.marker} `;
    const meta = row.meta
      ? truncateToWidth(` ${sanitize(row.meta).replace(/\s+/gu, ' ')}`, Math.floor(width * share))
      : '';
    const labelWidth = Math.max(
      1,
      width - visibleWidth(prefix) - visibleWidth(marker) - visibleWidth(meta),
    );
    const { text, ranges } = singleLine(row.label, row.ranges ?? []);
    let label = truncateToWidth(
      highlight(text, ranges, (part) => theme.bold(theme.fg('accent', part))),
      labelWidth,
    );
    if (row.style) label = row.style(label);
    const pad = ' '.repeat(Math.max(0, labelWidth - visibleWidth(label)));
    return truncateToWidth(
      `${prefix}${marker}${label}${meta ? pad + theme.fg('dim', meta) : ''}`,
      width,
    );
  });
}

/**
 * `text` on one line: control characters dropped, every whitespace run collapsed to one space, and
 * `ranges` (offsets into the original `text`) moved to match.
 */
export function singleLine(
  text: string,
  ranges: readonly Range[],
): { text: string; ranges: Range[] } {
  const map: number[] = [];
  let out = '';
  let space = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i] ?? '';
    map[i] = out.length;
    if (/\s/u.test(char)) {
      if (!space) out += ' ';
      space = true;
    } else if (!/\p{Cc}/u.test(char)) {
      out += char;
      space = false;
    }
  }
  map[text.length] = out.length;
  const moved: Range[] = [];
  for (const [start, end] of ranges) {
    const from = map[Math.max(0, Math.min(start, text.length))] ?? out.length;
    const to = map[Math.max(0, Math.min(end, text.length))] ?? out.length;
    if (to > from) moved.push([from, to]);
  }
  return { text: out, ranges: moved };
}
