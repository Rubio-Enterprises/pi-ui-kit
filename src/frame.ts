import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { fit, type UiBackground, type UiTheme } from './core.ts';

export interface FrameOptions {
  theme: UiTheme;
  /** Background tint for every cell of the frame. Default `userMessageBg`. */
  background?: UiBackground;
}

/** Inner width available to content inside a frame of `width` columns. */
export function frameInnerWidth(width: number): number {
  return Math.max(1, width - 4);
}

/**
 * Draw a bordered, tinted box exactly `width` columns wide around `header`, `body` and
 * `footer`. The result is exactly `height` lines: the body is cut or padded so the header and
 * footer always stay visible. Content lines are truncated to `frameInnerWidth(width)`.
 */
export function renderFrame(
  sections: { header: readonly string[]; body: readonly string[]; footer: readonly string[] },
  width: number,
  height: number,
  options: FrameOptions,
): string[] {
  const outer = Math.max(4, width);
  const inner = frameInnerWidth(outer);
  const rows = Math.max(0, height - 2);
  const fixed = sections.header.length + sections.footer.length;
  const bodyRows = Math.max(0, rows - fixed);
  const body = sections.body.slice(0, bodyRows);
  while (body.length < bodyRows) body.push('');
  const content = [...sections.header, ...body, ...sections.footer].slice(0, rows);
  const border = (left: string, right: string) =>
    `${left}${'─'.repeat(Math.max(0, outer - 2))}${right}`;
  const background = options.background ?? 'userMessageBg';
  const reset = options.theme.getBgAnsi(background);
  return [
    border('┌', '┐'),
    ...content.map((line) => `│ ${fit(line, inner)} │`),
    border('└', '┘'),
  ].map((line) => {
    const clipped = truncateToWidth(line, outer);
    const padded = clipped + ' '.repeat(Math.max(0, outer - visibleWidth(clipped)));
    // Styled content ends with SGR resets; restore the tint so it covers every cell.
    return options.theme.bg(background, padded.replaceAll('\x1b[0m', `\x1b[0m${reset}`));
  });
}
