import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import {
  type Binding,
  bindingHint,
  bindingLabel,
  type UiKeybindings,
  type UiTheme,
} from './core.ts';

/**
 * Key hints generated from bindings, packed onto rows of `width` columns, at most `maxRows`.
 * Bindings without a `hint` are skipped. Hints that do not fit are dropped from the end, so list
 * the most important bindings first.
 */
export function renderKeyHints(
  bindings: readonly Binding[],
  keybindings: UiKeybindings,
  theme: UiTheme,
  width: number,
  maxRows = 2,
): string[] {
  const hints = bindings.flatMap((binding) => {
    const hint = bindingHint(binding);
    if (!hint) return [];
    const keys = bindingLabel(binding, keybindings);
    return keys ? [`${keys} ${hint}`] : [];
  });
  const rows: string[][] = [];
  for (const hint of hints) {
    const row = rows.at(-1);
    if (row && visibleWidth([...row, hint].join(' · ')) <= width) row.push(hint);
    else if (rows.length < maxRows) rows.push([hint]);
    else break;
  }
  return rows.map((row) => theme.fg('dim', truncateToWidth(row.join(' · '), width)));
}
