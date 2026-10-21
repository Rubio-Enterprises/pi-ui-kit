import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readShortcut, toKeyId } from '../src/shortcut.ts';

const directories: string[] = [];
function agentDir(keybindings?: string) {
  const directory = mkdtempSync(join(tmpdir(), 'pi-ui-kit-shortcut-'));
  directories.push(directory);
  if (keybindings !== undefined) writeFileSync(join(directory, 'keybindings.json'), keybindings);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('toKeyId', () => {
  test.each([
    ['ctrl+r', 'ctrl+r'],
    [' Ctrl+Shift+P ', 'ctrl+shift+p'],
    ['alt+pageUp', 'alt+pageup'],
    ['f12', 'f12'],
    ['ctrl++', 'ctrl++'],
    ['+', '+'],
    ['super+enter', 'super+enter'],
  ])('accepts %p', (text, expected) => {
    expect(toKeyId(text)).toBe(expected as never);
  });

  test.each(['', 'ctrl+', 'ctrl+ctrl+r', 'hyper+r', 'ctrl+f13', 'ctrl+rr', 'ctrl r'])(
    'rejects %p',
    (text) => {
      expect(toKeyId(text)).toBeUndefined();
    },
  );
});

describe('readShortcut', () => {
  const id = 'pi-example.shortcut';

  test('reads a single key', () => {
    const dir = agentDir(JSON.stringify({ [id]: 'Alt+K' }));
    expect(readShortcut({ agentDir: dir, id, fallback: 'ctrl+r' })).toBe('alt+k');
  });

  test('takes the first valid key from a list', () => {
    const dir = agentDir(JSON.stringify({ [id]: ['ctrl+', 42, 'ctrl+y', 'ctrl+z'] }));
    expect(readShortcut({ agentDir: dir, id, fallback: 'ctrl+r' })).toBe('ctrl+y');
  });

  test('keeps a byte order mark from hiding the entry', () => {
    const dir = agentDir(`\uFEFF${JSON.stringify({ [id]: 'ctrl+y' })}`);
    expect(readShortcut({ agentDir: dir, id, fallback: 'ctrl+r' })).toBe('ctrl+y');
  });

  test.each([
    ['a missing file', undefined],
    ['malformed JSON', '{'],
    ['a non-object root', '[]'],
    ['no entry', '{"other":"ctrl+y"}'],
    ['only invalid keys', JSON.stringify({ [id]: ['ctrl+', 'nope'] })],
  ])('falls back on %s', (_case, text) => {
    expect(readShortcut({ agentDir: agentDir(text), id, fallback: 'ctrl+r' })).toBe('ctrl+r');
  });
});
