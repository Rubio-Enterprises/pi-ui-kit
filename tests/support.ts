import { getKeybindings, stripTerminalSequences, visibleWidth } from '@earendil-works/pi-tui';
import type { UiTheme } from '../src/core.ts';

const sgr = (open: number, text: string) => `\x1b[${open}m${text}\x1b[0m`;
const colorCodes: Record<string, number> = {
  accent: 35,
  dim: 90,
  muted: 37,
  error: 31,
  warning: 33,
};

/** A theme that styles with real SGR codes; `tags` turns them into readable markers. */
export const tagTheme: UiTheme = {
  fg: (color, text) => sgr(colorCodes[color] ?? 39, text),
  bg: (_color, text) => text,
  bold: (text) => sgr(1, text),
  getBgAnsi: () => '',
};

const codeNames = Object.fromEntries(
  Object.entries(colorCodes).map(([name, code]) => [code, name]),
);

/** Render SGR codes from `tagTheme` as `<name>` markers and resets as `</>`. */
export function tags(line: string): string {
  return line.replace(
    new RegExp(`${String.fromCharCode(27)}\\[(\\d+)m`, 'gu'),
    (_, code: string) =>
      code === '0' ? '</>' : code === '1' ? '<b>' : `<${codeNames[code] ?? code}>`,
  );
}

/** A theme that adds no styling, for layout assertions. */
export const plainTheme: UiTheme = {
  fg: (_color, text) => text,
  bg: (_color, text) => text,
  bold: (text) => text,
  getBgAnsi: () => '',
};

export const keybindings = getKeybindings();

export const plain = (lines: readonly string[]) => lines.map(stripTerminalSequences);

export function expectBounded(lines: readonly string[], width: number, height?: number) {
  for (const line of lines) {
    if (visibleWidth(line) > width)
      throw new Error(`line wider than ${width}: ${JSON.stringify(line)}`);
  }
  if (height !== undefined && lines.length > height)
    throw new Error(`${lines.length} lines exceed height ${height}`);
}

export const KEY = {
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  shiftUp: '\x1b[1;2A',
  shiftDown: '\x1b[1;2B',
  enter: '\r',
  escape: '\x1b',
  tab: '\t',
  space: ' ',
  ctrlT: '\x14',
  pageDown: '\x1b[6~',
};
