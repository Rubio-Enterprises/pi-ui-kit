import { describe, expect, test } from 'bun:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import { match } from '../src/core.ts';
import { openPicker, Picker, type PickerHost, type PickerOptions } from '../src/picker.ts';
import { TabsState } from '../src/tabs.ts';
import { expectBounded, KEY, keybindings, plain, plainTheme } from './support.ts';

const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];

function setup(overrides: Partial<PickerOptions<string, string>> = {}, rows = 30) {
  const results: Array<string | undefined> = [];
  let renders = 0;
  const scope = new TabsState([
    { id: 'all', label: 'All' },
    { id: 'short', label: 'Short' },
  ]);
  const picker = new Picker<string, string>(
    {
      title: 'Words',
      count: (items) => `${items.length} matches`,
      source: {
        items: (query) =>
          words.filter(
            (word) => (scope.active.id === 'all' || word.length <= 4) && match(word, query),
          ),
        key: (word) => word,
        row: (word) => ({ label: word, ranges: match(word, '')?.ranges, meta: `${word.length}` }),
        preview: (word) => `Preview of ${word}`,
        empty: 'No words',
      },
      tabs: [{ state: scope, label: 'Scope', next: { keys: ['tab'], hint: 'scope' } }],
      actions: [
        {
          binding: { keys: [{ id: 'tui.select.confirm' }], hint: 'choose' },
          run: (word, controls) => controls.close(word),
        },
      ],
      ...overrides,
    },
    {
      theme: plainTheme,
      keybindings,
      rows: () => rows,
      requestRender: () => {
        renders++;
      },
      done: (result) => results.push(result),
    },
  );
  picker.focused = true;
  return { picker, results, scope, renders: () => renders };
}

describe('Picker', () => {
  test('typing filters, arrows select, Enter runs the action and Esc cancels', () => {
    const { picker, results } = setup();
    for (const char of 'eta') picker.handleInput(char);
    expect(plain(picker.render(80)).join('\n')).toContain('5 matches');
    picker.handleInput(KEY.down);
    expect(picker.selected).toBe('delta');
    picker.handleInput(KEY.enter);
    expect(results).toEqual(['delta']);
    picker.handleInput(KEY.escape);
    expect(results).toEqual(['delta']);
  });

  test('Esc resolves undefined', () => {
    const { picker, results } = setup();
    picker.handleInput(KEY.escape);
    expect(results).toEqual([undefined]);
  });

  test('tabs cycle on their binding and re-read items', () => {
    const { picker, scope } = setup();
    picker.handleInput(KEY.tab);
    expect(scope.active.id).toBe('short');
    expect(plain(picker.render(80)).join('\n')).toContain('3 matches');
  });

  test('refresh keeps the selection on the same key', () => {
    let count = 0;
    const { picker } = setup({
      actions: [
        {
          binding: { keys: ['space'], hint: 'cycle' },
          run: (_word, controls) => {
            count++;
            controls.refresh();
          },
        },
      ],
    });
    picker.handleInput(KEY.down);
    picker.handleInput(KEY.down);
    picker.handleInput(KEY.space);
    expect(count).toBe(1);
    expect(picker.selected).toBe('gamma');
  });

  test('a synchronous action takes effect before the next key', () => {
    let toggled = false;
    const { picker, results } = setup({
      actions: [
        {
          binding: { keys: ['ctrl+t'] },
          run: () => {
            toggled = true;
          },
        },
        {
          binding: { keys: [{ id: 'tui.select.confirm' }] },
          run: (word, controls) => controls.close(word),
        },
      ],
    });
    picker.handleInput(KEY.ctrlT);
    picker.handleInput(KEY.enter);
    expect(toggled).toBe(true);
    expect(results).toEqual(['alpha']);
  });

  test('while an asynchronous action is pending, other actions are ignored', async () => {
    let release = () => {};
    let runs = 0;
    const { picker } = setup({
      actions: [
        {
          binding: { keys: ['space'] },
          run: () => {
            runs++;
            return new Promise<void>((resolve) => {
              release = resolve;
            });
          },
        },
      ],
    });
    picker.handleInput(KEY.space);
    picker.handleInput(KEY.space);
    expect(runs).toBe(1);
    release();
    await Bun.sleep(0);
    picker.handleInput(KEY.space);
    expect(runs).toBe(2);
  });

  test('synchronous action errors become an error status', () => {
    const { picker } = setup({
      actions: [
        {
          binding: { keys: ['space'] },
          run: () => {
            throw new Error('read only');
          },
        },
      ],
    });
    picker.handleInput(KEY.space);
    expect(plain(picker.render(80))[1]).toContain('read only');
  });

  test('action errors become an error status instead of throwing', async () => {
    const { picker } = setup({
      actions: [
        { binding: { keys: ['space'] }, run: () => Promise.reject(new Error('disk full')) },
      ],
    });
    picker.handleInput(KEY.space);
    await Bun.sleep(0);
    expect(plain(picker.render(80))[1]).toContain('disk full');
  });

  test('preview sits beside the list when wide and below it when narrow', () => {
    const { picker } = setup();
    const wide = plain(picker.render(140));
    expect(wide.some((line) => line.includes('│ Preview of alpha'))).toBe(true);
    const narrow = plain(picker.render(70));
    expect(narrow.some((line) => line.startsWith('│ Preview ─'))).toBe(true);
    expect(narrow.some((line) => line.startsWith('│ Preview of alpha'))).toBe(true);
  });

  test('footer hints are generated from bindings', () => {
    const { picker } = setup();
    const footer = plain(picker.render(140)).slice(-3, -1).join(' ');
    expect(footer).toContain(
      'Enter choose · Tab scope · ↑/↓ select · Shift+↑/↓ preview · Esc close',
    );
  });

  test.each([
    [36, 12],
    [70, 24],
    [100, 30],
    [160, 50],
  ])('renders exactly %i columns and a fixed height at %i terminal rows', (width, rows) => {
    const { picker } = setup({}, rows);
    const lines = picker.render(width);
    expect(lines.every((line) => visibleWidth(line) === width)).toBe(true);
    expect(lines).toHaveLength(Math.max(8, Math.floor(rows * 0.8)));
    expectBounded(lines, width, rows);
  });

  test('Shift+PgDn and Shift+PgUp scroll the preview by a page', () => {
    const long = Array.from({ length: 80 }, (_, i) => `para ${i}`).join('\n');
    const { picker } = setup({
      source: {
        items: () => ['one'],
        key: (word) => word,
        row: (word) => ({ label: word }),
        preview: () => long,
        empty: '',
      },
    });
    const preview = () => plain(picker.render(140)).find((line) => line.includes('para '));
    expect(preview()).toContain('para 0');
    picker.handleInput('\x1b[6;2~');
    expect(preview()).not.toContain('para 0 ');
    picker.handleInput('\x1b[5;2~');
    expect(preview()).toContain('para 0');
  });

  test('a failing preview shows its error in the pane and keeps the list usable', () => {
    const { picker } = setup({
      source: {
        items: () => ['one', 'two'],
        key: (word) => word,
        row: (word) => ({ label: word }),
        preview: (word) => {
          if (word === 'one') throw new Error('no theme');
          return `fine ${word}`;
        },
        empty: '',
      },
    });
    const first = plain(picker.render(140)).join('\n');
    expect(first).toContain('Could not show preview: no theme');
    expect(first).toContain('› one');
    picker.handleInput(KEY.down);
    expect(plain(picker.render(140)).join('\n')).toContain('fine two');
  });

  test('prepare runs once per render, before rows', () => {
    const calls: string[] = [];
    const { picker } = setup({
      source: {
        items: () => ['one', 'two', 'three'],
        key: (word) => word,
        row: (word) => {
          calls.push(word);
          return { label: word };
        },
        prepare: () => calls.push('prepare'),
        empty: '',
      },
    });
    picker.render(80);
    expect(calls).toEqual(['prepare', 'one', 'two', 'three']);
  });

  test('page down moves by the visible list height', () => {
    const { picker } = setup({}, 14);
    picker.render(80);
    picker.handleInput(KEY.pageDown);
    expect(words.indexOf(picker.selected ?? '')).toBeGreaterThan(1);
  });
});

test('openPicker builds options from the host theme and resolves with the closed result', async () => {
  let component: Picker<string, string> | undefined;
  let overlay: unknown;
  const host: PickerHost = {
    custom: (factory, options) => {
      overlay = options;
      return new Promise((resolve) => {
        component = factory(
          { terminal: { rows: 20 }, requestRender() {} },
          plainTheme,
          keybindings,
          resolve,
        ) as Picker<string, string>;
      });
    },
  };
  let themed: unknown;
  const opened = openPicker<string, string>(host, (theme) => {
    themed = theme;
    return {
      title: 'Pick',
      source: { items: () => ['a'], key: (v) => v, row: (v) => ({ label: v }), empty: '' },
      actions: [{ binding: { keys: ['enter'] }, run: (v, c) => c.close(v) }],
    };
  });
  expect(themed).toBe(plainTheme);
  expect(overlay).toEqual({
    overlay: true,
    overlayOptions: { anchor: 'center', width: '90%', maxHeight: '85%' },
  });
  component?.handleInput(KEY.enter);
  expect(await opened).toBe('a');
});
