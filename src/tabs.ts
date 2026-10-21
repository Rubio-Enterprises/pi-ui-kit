import { truncateToWidth } from '@earendil-works/pi-tui';
import type { UiTheme } from './core.ts';

export interface Tab {
  id: string;
  label: string;
  /** Shown but not selectable; `note` explains why, for example "untrusted". */
  disabled?: boolean;
  note?: string;
}

/** A row of mutually exclusive choices, one of them active. */
export class TabsState {
  private activeIndex = 0;

  constructor(
    readonly tabs: readonly Tab[],
    active?: string,
  ) {
    if (!tabs.length) throw new Error('TabsState needs at least one tab');
    this.select(active ?? tabs[0]?.id ?? '');
  }

  get active(): Tab {
    return this.tabs[this.activeIndex] as Tab;
  }

  /** Make the tab with `id` active. Unknown IDs are ignored; disabled tabs may be selected. */
  select(id: string): void {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index >= 0) this.activeIndex = index;
  }

  /** Move to the next (`1`) or previous (`-1`) tab, wrapping around. */
  cycle(direction: 1 | -1): void {
    this.activeIndex = (this.activeIndex + direction + this.tabs.length) % this.tabs.length;
  }
}

/** Render the tabs on one row: the active tab is bold accent in brackets, disabled tabs dim. */
export function renderTabs(state: TabsState, width: number, theme: UiTheme): string {
  const parts = state.tabs.map((tab) => {
    const text = tab.note ? `${tab.label} (${tab.note})` : tab.label;
    if (tab === state.active) return theme.bold(theme.fg('accent', `[${text}]`));
    return theme.fg(tab.disabled ? 'dim' : 'muted', ` ${text} `);
  });
  return truncateToWidth(parts.join(' '), width);
}
