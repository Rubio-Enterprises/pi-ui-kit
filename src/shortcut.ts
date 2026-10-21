import { join } from 'node:path';
import type { KeyId } from '@earendil-works/pi-tui';
import { type ConfigFs, readConfig } from 'pi-core-kit/config-file';

const MODIFIERS = ['ctrl', 'shift', 'alt', 'super'] as const;
const BASE_KEY =
  /^(?:[a-z0-9]|f(?:[1-9]|1[0-2])|escape|esc|enter|return|tab|space|backspace|delete|insert|clear|home|end|pageup|pagedown|up|down|left|right|[`\-=[\]\\;',./!@#$%^&*()_+|~{}:<>?])$/u;

/**
 * Normalizes a key name to Pi's key-id grammar: modifiers (each at most once) joined by `+`,
 * then one key. Matching is case-insensitive, so the result is lowercase. Returns undefined for
 * anything Pi's TUI would never match.
 */
export function toKeyId(text: string): KeyId | undefined {
  let rest = text.trim().toLowerCase();
  const seen = new Set<string>();
  for (;;) {
    const modifier = MODIFIERS.find(
      (name) => rest.startsWith(`${name}+`) && rest.length > name.length + 1,
    );
    if (!modifier) break;
    if (seen.has(modifier)) return undefined;
    seen.add(modifier);
    rest = rest.slice(modifier.length + 1);
  }
  return BASE_KEY.test(rest) ? (`${[...seen, rest].join('+')}` as KeyId) : undefined;
}

export interface ShortcutOptions {
  /** Pi's agent directory: pass `getAgentDir()` from the coding agent. */
  agentDir: string;
  /** The keybinding id, for example `pi-prompt-recall.shortcut`. */
  id: string;
  /** Used when the file, the id or every listed key is missing or invalid. */
  fallback: KeyId;
  /** Filesystem to use; defaults to `node:fs`. For tests. */
  fs?: ConfigFs | undefined;
}

/**
 * The user's key for an extension shortcut, from `keybindings.json` in Pi's agent directory.
 * The entry may be one key or a list; the first valid key wins.
 *
 * Extensions register shortcuts at load time, before Pi's keybinding manager is available to
 * them, so this reads the file Pi reads. It never throws.
 */
export function readShortcut(options: ShortcutOptions): KeyId {
  const outcome = readConfig(join(options.agentDir, 'keybindings.json'), { fs: options.fs });
  if (outcome.status !== 'value') return options.fallback;
  const entry = outcome.value[options.id];
  for (const candidate of Array.isArray(entry) ? entry : [entry]) {
    if (typeof candidate !== 'string') continue;
    const key = toKeyId(candidate);
    if (key) return key;
  }
  return options.fallback;
}
