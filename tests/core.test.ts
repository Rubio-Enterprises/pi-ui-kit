import { describe, expect, test } from 'bun:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import {
  bindingHint,
  bindingLabel,
  fit,
  highlight,
  match,
  matches,
  sanitize,
  spread,
} from '../src/core.ts';
import { KEY, keybindings } from './support.ts';

describe('match', () => {
  test.each([
    ['Deploy the release', 'the release', 0],
    ['Deploy the release', 'rel dep', 1],
    ['subprocess runner', 'unner proc', 2],
    ['release-notes', 'rlnts', 3],
  ])('%s / %s is tier %i', (text, query, tier) => {
    expect(match(text, query)?.tier).toBe(tier);
  });

  test('is case- and accent-insensitive and maps ranges to the original text', () => {
    const result = match('Café Crème', 'creme');
    expect(result?.tier).toBe(0);
    expect(result?.ranges).toEqual([[5, 10]]);
  });

  test('returns null when no tier matches and tier 0 for an empty query', () => {
    expect(match('alpha', 'zzz')).toBeNull();
    expect(match('alpha', '  ')).toEqual({ tier: 0, ranges: [] });
  });
});

test('highlight wraps ranges and ignores out-of-order or out-of-bounds ranges', () => {
  expect(
    highlight(
      'abcdef',
      [
        [1, 3],
        [2, 4],
        [9, 10],
      ],
      (text) => `[${text}]`,
    ),
  ).toBe('a[bc]def');
});

test('sanitize removes escapes and control characters, keeps newlines, expands tabs', () => {
  expect(sanitize('a\x1b[31mb\x07c\n\td')).toBe('abc\n    d');
});

test('fit and spread always produce exactly the requested width', () => {
  for (const width of [0, 1, 5, 20]) {
    expect(visibleWidth(fit('hello world', width))).toBe(width);
    expect(visibleWidth(spread('left side', 'right', width))).toBeLessThanOrEqual(width);
  }
  expect(spread('left', 'right', 20)).toBe('left           right');
});

describe('bindings', () => {
  test('match raw keys and Pi keybinding IDs', () => {
    const binding = { keys: ['ctrl+t', { id: 'tui.select.confirm' }] as const };
    expect(matches(KEY.ctrlT, binding, keybindings)).toBe(true);
    expect(matches(KEY.enter, binding, keybindings)).toBe(true);
    expect(matches(KEY.tab, binding, keybindings)).toBe(false);
  });

  test('labels collapse shared modifiers and follow Pi keybindings', () => {
    expect(bindingLabel({ keys: ['shift+up', 'shift+down'] }, keybindings)).toBe('Shift+↑/↓');
    expect(bindingLabel({ keys: ['left', 'right'] }, keybindings)).toBe('←/→');
    expect(bindingLabel({ keys: ['tab', 'shift+tab'] }, keybindings)).toBe('Tab/Shift+Tab');
    expect(bindingLabel({ keys: ['ctrl+t'] }, keybindings)).toBe('Ctrl+T');
    expect(bindingLabel({ keys: [{ id: 'tui.select.confirm' }] }, keybindings)).toBe('Enter');
  });

  test('hints may be computed per render', () => {
    let on = false;
    const binding = { keys: ['ctrl+t'] as const, hint: () => `subagents ${on ? 'on' : 'off'}` };
    expect(bindingHint(binding)).toBe('subagents off');
    on = true;
    expect(bindingHint(binding)).toBe('subagents on');
  });
});
