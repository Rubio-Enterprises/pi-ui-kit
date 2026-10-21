import {
  type Component,
  type Focusable,
  Input,
  type TuiMouseEvent,
  type TuiMouseEventResult,
  visibleWidth,
} from '@earendil-works/pi-tui';
import { type Binding, fit, matches, spread, type UiKeybindings, type UiTheme } from './core.ts';
import { frameInnerWidth, renderFrame } from './frame.ts';
import { renderKeyHints } from './key-hints.ts';
import { ListState, type Row, renderList } from './list.ts';
import { type PreviewContent, PreviewState, renderPreview } from './preview.ts';
import { renderTabs, type TabsState } from './tabs.ts';

/** Controls an action or preview may use while the picker is open. */
export interface PickerControls<R> {
  /** Close the picker, resolving `openPicker` with `result`. */
  close(result?: R): void;
  /** Re-read items, keeping the selection on the same key when it is still listed. */
  refresh(): void;
  /** Redraw, for example after a preview finished loading. */
  requestRender(): void;
  /** Show a status message in the header instead of the count; undefined clears it. */
  setStatus(text: string | undefined, tone?: 'muted' | 'warning' | 'error'): void;
  /** The current search query. */
  readonly query: string;
}

/** A row of mutually exclusive choices in the header, such as a scope. */
export interface PickerTabs {
  state: TabsState;
  /** Shown dim before the tabs, for example `Scope`. */
  label?: string;
  /** Moves to the next tab; its hint labels the strip in key hints. */
  next: Binding;
  /** Moves to the previous tab. */
  previous?: Binding;
}

/** A key that acts on the selected item, for example restore or cycle. */
export interface PickerAction<T, R> {
  binding: Binding;
  run(item: T | undefined, controls: PickerControls<R>): void | Promise<void>;
}

export interface PickerSource<T, R> {
  /** Items for `query`, already filtered and ordered. Called whenever the query or a tab changes. */
  items(query: string): readonly T[];
  /** A stable identity, used to keep the selection across refreshes. */
  key(item: T): string;
  row(item: T): Row;
  /** What the preview pane shows for the selected item. Omit for a list without a preview. */
  preview?(item: T, controls: PickerControls<R>): PreviewContent;
  /** Shown in the list when nothing matches. */
  empty: string;
}

export interface PickerOptions<T, R> {
  title: string;
  /** Right side of the title row, for example `3 matches`. */
  count?(items: readonly T[]): string;
  source: PickerSource<T, R>;
  tabs?: readonly PickerTabs[];
  /** In order of importance; the first ones keep their key hints when space runs out. */
  actions?: readonly PickerAction<T, R>[];
  /** Initial search query. */
  query?: string;
  /** Search placeholder. */
  placeholder?: string;
  /** Key-hint text for Esc. Default `close`. */
  closeHint?: string;
  /** Share of the terminal's rows the frame fills. Default 0.8. */
  heightShare?: number;
}

export interface PickerEnvironment<R> {
  theme: UiTheme;
  keybindings: UiKeybindings;
  /** The terminal's current row count. */
  rows(): number;
  requestRender(): void;
  done(result: R | undefined): void;
}

const keys = {
  up: { keys: [{ id: 'tui.select.up' }] },
  down: { keys: [{ id: 'tui.select.down' }] },
  pageUp: { keys: [{ id: 'tui.select.pageUp' }] },
  pageDown: { keys: [{ id: 'tui.select.pageDown' }] },
  cancel: { keys: [{ id: 'tui.select.cancel' }] },
  previewUp: { keys: ['shift+up'] },
  previewDown: { keys: ['shift+down'] },
} satisfies Record<string, Binding>;

/** Width at or above which the preview sits beside the list rather than below it. */
export const SIDE_BY_SIDE_WIDTH = 100;
const separator = ' │ ';

/**
 * A filterable list with an optional preview pane, drawn in a frame. Typing searches; the
 * consumer's actions act on the selected item. Open it with `openPicker`.
 */
export class Picker<T, R = void> implements Component, Focusable {
  private readonly input: Input;
  private readonly list = new ListState();
  private readonly preview = new PreviewState();
  private items: readonly T[] = [];
  private previewKey: string | undefined;
  private status: { text: string; tone: 'muted' | 'warning' | 'error' } | undefined;
  private closed = false;
  private busy = false;
  readonly controls: PickerControls<R>;

  constructor(
    private readonly options: PickerOptions<T, R>,
    private readonly env: PickerEnvironment<R>,
  ) {
    this.input = new Input({
      placeholder: options.placeholder ?? '',
      placeholderStyle: (text) => env.theme.fg('dim', text),
    });
    this.input.setValue(options.query ?? '');
    const picker = this;
    this.controls = {
      close: (result) => this.close(result),
      refresh: () => this.refresh(true),
      requestRender: () => {
        if (!this.closed) env.requestRender();
      },
      setStatus: (text, tone = 'muted') => {
        this.status = text === undefined ? undefined : { text, tone };
      },
      get query() {
        return picker.input.getValue();
      },
    };
    this.refresh(false);
  }

  get focused(): boolean {
    return this.input.focused;
  }
  set focused(value: boolean) {
    this.input.focused = value;
  }

  /** The selected item, if any. */
  get selected(): T | undefined {
    return this.items[this.list.selected];
  }

  invalidate(): void {
    this.input.invalidate();
  }

  render(width: number): string[] {
    const height = Math.max(8, Math.floor(this.env.rows() * (this.options.heightShare ?? 0.8)));
    try {
      return this.renderContent(width, height);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return renderFrame(
        {
          header: [this.env.theme.fg('error', `Could not render: ${message}`)],
          body: [],
          footer: [this.env.theme.fg('dim', 'Esc close')],
        },
        width,
        height,
        { theme: this.env.theme },
      );
    }
  }

  handleInput(data: string): void {
    if (this.closed) return;
    const kb = this.env.keybindings;
    if (matches(data, keys.cancel, kb)) {
      this.close(undefined);
      return;
    }
    const action = this.options.actions?.find((candidate) => matches(data, candidate.binding, kb));
    if (action) void this.run(action);
    else if (matches(data, keys.up, kb)) this.move(-1);
    else if (matches(data, keys.down, kb)) this.move(1);
    else if (matches(data, keys.pageUp, kb)) this.move(-this.pageSize());
    else if (matches(data, keys.pageDown, kb)) this.move(this.pageSize());
    else if (matches(data, keys.previewUp, kb)) this.preview.scroll(-1);
    else if (matches(data, keys.previewDown, kb)) this.preview.scroll(1);
    else if (!this.cycleTabs(data)) {
      const before = this.input.getValue();
      this.input.handleInput(data);
      if (this.input.getValue() !== before) this.refresh(false);
    }
    this.env.requestRender();
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type !== 'wheel') return undefined;
    this.move(event.wheelDelta ?? 0);
    this.env.requestRender();
    return { handled: true };
  }

  private lastListHeight = 1;

  private pageSize(): number {
    return Math.max(1, this.lastListHeight);
  }

  private move(delta: number): void {
    this.list.move(delta);
    this.syncPreview();
  }

  private cycleTabs(data: string): boolean {
    for (const strip of this.options.tabs ?? []) {
      const direction = matches(data, strip.next, this.env.keybindings)
        ? 1
        : strip.previous && matches(data, strip.previous, this.env.keybindings)
          ? -1
          : 0;
      if (direction) {
        strip.state.cycle(direction);
        this.refresh(false);
        return true;
      }
    }
    return false;
  }

  private async run(action: PickerAction<T, R>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await action.run(this.selected, this.controls);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.status = { text: message, tone: 'error' };
    } finally {
      this.busy = false;
      if (!this.closed) this.env.requestRender();
    }
  }

  private close(result: R | undefined): void {
    if (this.closed) return;
    this.closed = true;
    this.env.done(result);
  }

  /** Re-read items. `keep` keeps the selection on the same key; otherwise select the first. */
  private refresh(keep: boolean): void {
    const key =
      keep && this.selected !== undefined ? this.options.source.key(this.selected) : undefined;
    this.items = this.options.source.items(this.input.getValue());
    this.list.setCount(this.items.length);
    if (key === undefined) this.list.reset();
    else {
      const index = this.items.findIndex((item) => this.options.source.key(item) === key);
      if (index >= 0) this.list.move(index - this.list.selected);
      else this.list.reset();
    }
    this.syncPreview();
  }

  private syncPreview(): void {
    const item = this.selected;
    const key = item === undefined ? undefined : this.options.source.key(item);
    if (key !== this.previewKey) {
      this.previewKey = key;
      this.preview.reset();
    }
  }

  private header(width: number): string[] {
    const { theme } = this.env;
    const right = this.status
      ? theme.fg(this.status.tone, this.status.text)
      : theme.fg('dim', this.options.count?.(this.items) ?? '');
    const strips = (this.options.tabs ?? []).map((strip) => {
      const label = strip.label ? `${theme.fg('dim', strip.label)} ` : '';
      return label + renderTabs(strip.state, width, theme);
    });
    const title = theme.bold(this.options.title);
    const inline = [title, ...strips].join('   ');
    const rows =
      visibleWidth(inline) + visibleWidth(right) + 1 <= width
        ? [spread(inline, right, width)]
        : [spread(title, right, width), ...strips];
    return [...rows, ...this.input.render(width)];
  }

  private footer(width: number): string[] {
    const hints: Binding[] = [
      ...(this.options.actions ?? []).map((action) => action.binding),
      ...(this.options.tabs ?? []).map((strip) => ({
        keys: [...(strip.previous?.keys ?? []), ...strip.next.keys],
        hint: strip.next.hint,
      })),
      { keys: [...keys.up.keys, ...keys.down.keys], hint: 'select' },
      ...(this.options.source.preview
        ? [{ keys: [...keys.previewUp.keys, ...keys.previewDown.keys], hint: 'preview' }]
        : []),
      { keys: ['escape'], hint: this.options.closeHint ?? 'close' },
    ];
    return renderKeyHints(hints, this.env.keybindings, this.env.theme, width, 2);
  }

  private renderContent(width: number, height: number): string[] {
    const { theme } = this.env;
    const inner = frameInnerWidth(width);
    const header = this.header(inner);
    const footer = this.footer(inner);
    const bodyHeight = Math.max(1, height - 2 - header.length - footer.length);
    const rows = this.items.map((item) => this.options.source.row(item));
    const listOptions = { theme, empty: this.options.source.empty };
    const item = this.selected;
    const previewFn = this.options.source.preview;
    let body: string[];
    if (!previewFn || item === undefined) {
      this.lastListHeight = bodyHeight;
      body = renderList(rows, this.list, inner, bodyHeight, listOptions);
    } else if (inner >= SIDE_BY_SIDE_WIDTH) {
      const listWidth = Math.floor((inner - separator.length) * 0.55);
      const previewWidth = inner - listWidth - separator.length;
      this.lastListHeight = bodyHeight;
      const left = renderList(rows, this.list, listWidth, bodyHeight, listOptions);
      const right = [
        theme.fg('dim', 'Preview'),
        ...renderPreview(
          previewFn(item, this.controls),
          this.preview,
          previewWidth,
          bodyHeight - 1,
        ),
      ];
      body = Array.from(
        { length: bodyHeight },
        (_, i) => `${fit(left[i] ?? '', listWidth)}${theme.fg('dim', separator)}${right[i] ?? ''}`,
      );
    } else {
      const listHeight = Math.max(1, Math.floor(bodyHeight / 2));
      this.lastListHeight = listHeight;
      const top = renderList(rows, this.list, inner, listHeight, listOptions);
      while (top.length < listHeight) top.push('');
      body = [
        ...top,
        theme.fg('dim', `Preview ${'─'.repeat(Math.max(0, inner - 8))}`),
        ...renderPreview(
          previewFn(item, this.controls),
          this.preview,
          inner,
          bodyHeight - listHeight - 1,
        ),
      ];
    }
    return renderFrame({ header, body, footer }, width, height, { theme });
  }
}

/** The part of Pi's extension UI context `openPicker` needs. */
export interface PickerHost {
  custom<V>(
    factory: (
      tui: { terminal: { rows: number }; requestRender(): void },
      theme: UiTheme,
      keybindings: UiKeybindings,
      done: (result: V) => void,
    ) => Component,
    options?: {
      overlay?: boolean;
      overlayOptions?: { anchor?: 'center'; width?: `${number}%`; maxHeight?: `${number}%` };
    },
  ): Promise<V>;
}

/**
 * Open a picker as a centered overlay, 90% of the terminal wide. Resolves with the result an
 * action passed to `close`, or undefined when the user cancels.
 */
export function openPicker<T, R = void>(
  ui: PickerHost,
  options: PickerOptions<T, R>,
): Promise<R | undefined> {
  return ui.custom<R | undefined>(
    (tui, theme, keybindings, done) =>
      new Picker<T, R>(options, {
        theme,
        keybindings,
        rows: () => tui.terminal.rows,
        requestRender: () => tui.requestRender(),
        done,
      }),
    { overlay: true, overlayOptions: { anchor: 'center', width: '90%', maxHeight: '85%' } },
  );
}
