import { describe, expect, test } from 'bun:test';
import { Text, visibleWidth } from '@earendil-works/pi-tui';
import { frameInnerWidth, renderFrame } from '../src/frame.ts';
import { renderKeyHints } from '../src/key-hints.ts';
import { ListState, type Row, renderList, singleLine } from '../src/list.ts';
import { PreviewState, renderPreview } from '../src/preview.ts';
import { renderTabs, TabsState } from '../src/tabs.ts';
import { expectBounded, keybindings, plain, plainTheme, tags, tagTheme } from './support.ts';

const rows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ label: `item ${i}`, meta: `meta ${i}` }));

describe('list', () => {
  test('scrolls only as far as needed to keep the selection visible', () => {
    const state = new ListState();
    const render = () =>
      plain(renderList(rows(10), state, 30, 3, { theme: plainTheme, empty: '' }));
    expect(render()[0]).toStartWith('› item 0');
    state.move(4);
    expect(render().map((line) => line.slice(0, 8))).toEqual(['  item 2', '  item 3', '› item 4']);
    state.move(-1);
    // Moving up inside the window moves the cursor, not the window.
    expect(render()[0]).toStartWith('  item 2');
    expect(render()[1]).toStartWith('› item 3');
  });

  test('highlights ranges, aligns dim meta right, and shows the empty message', () => {
    const state = new ListState();
    const [line] = renderList(
      [{ label: 'alpha beta', ranges: [[6, 10]], meta: 'src', marker: '●' }],
      state,
      30,
      1,
      { theme: tagTheme, empty: '' },
    );
    expect(tags(line ?? '')).toContain('● alpha <b><accent>beta</></>');
    expect(tags(line ?? '')).toEndWith('<dim> src</>');
    expect(
      plain(renderList([], state, 30, 3, { theme: plainTheme, empty: 'Nothing here' })),
    ).toEqual(['Nothing here']);
  });

  test('singleLine collapses whitespace and moves ranges with it', () => {
    expect(singleLine('a\n\n  b\x07c', [[5, 8]])).toEqual({ text: 'a bc', ranges: [[2, 4]] });
  });

  test.each([20, 60, 100])('rows never exceed %i columns', (width) => {
    const state = new ListState();
    const long = [
      { label: 'word '.repeat(40), ranges: [[0, 200]] as [number, number][], meta: 'm'.repeat(80) },
    ];
    expectBounded(renderList(long, state, width, 5, { theme: tagTheme, empty: '' }), width, 5);
  });
});

test('tabs cycle, wrap, and render the active tab in brackets', () => {
  const state = new TabsState([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B', disabled: true, note: 'untrusted' },
  ]);
  expect(plain([renderTabs(state, 40, plainTheme)])).toEqual(['[A]  B (untrusted) ']);
  state.cycle(-1);
  expect(state.active.id).toBe('b');
  state.cycle(1);
  expect(state.active.id).toBe('a');
});

test('preview wraps text, scrolls within bounds and renders components at width', () => {
  const state = new PreviewState();
  const text = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
  expect(renderPreview(text, state, 20, 3)).toEqual(['line 0', 'line 1', 'line 2']);
  state.scroll(100);
  expect(renderPreview(text, state, 20, 3)).toEqual(['line 7', 'line 8', 'line 9']);
  state.reset();
  expectBounded(renderPreview(new Text('x'.repeat(100), 0, 0), state, 15, 4), 15, 4);
});

test('key hints pack onto rows and drop what does not fit', () => {
  const hints = [
    { keys: ['enter'] as const, hint: 'restore' },
    { keys: ['tab'] as const, hint: 'scope' },
    { keys: ['ctrl+t'] as const },
    { keys: ['escape'] as const, hint: 'close' },
  ];
  expect(plain(renderKeyHints(hints, keybindings, plainTheme, 80))).toEqual([
    'Enter restore · Tab scope · Esc close',
  ]);
  expect(plain(renderKeyHints(hints, keybindings, plainTheme, 14, 1))).toEqual(['Enter restore']);
});

describe('frame', () => {
  test.each([
    [36, 6],
    [78, 10],
    [120, 4],
  ])('owns every cell of a %i×%i rectangle and keeps the footer', (width, height) => {
    const tinted: string[] = [];
    const lines = renderFrame(
      { header: ['head'], body: Array.from({ length: 50 }, () => 'body'), footer: ['foot'] },
      width,
      height,
      {
        theme: {
          ...plainTheme,
          bg: (_color, text) => {
            tinted.push(text);
            return text;
          },
        },
      },
    );
    expect(lines).toHaveLength(height);
    expect(lines.every((line) => visibleWidth(line) === width)).toBe(true);
    expect(lines[0]).toBe(`┌${'─'.repeat(width - 2)}┐`);
    expect(lines.at(-1)).toBe(`└${'─'.repeat(width - 2)}┘`);
    expect(lines.at(-2)).toStartWith('│ foot');
    expect(tinted).toHaveLength(height);
    expect(frameInnerWidth(width)).toBe(width - 4);
  });

  test('restores the tint after ANSI resets in content', () => {
    const bg = '\x1b[48;2;1;2;3m';
    const [, line] = renderFrame({ header: ['a\x1b[0mb'], body: [], footer: [] }, 20, 3, {
      theme: { ...plainTheme, getBgAnsi: () => bg },
    });
    expect(line).toContain(`\x1b[0m${bg}b`);
  });
});
