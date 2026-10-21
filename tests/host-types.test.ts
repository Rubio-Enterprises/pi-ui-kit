import { expect, test } from 'bun:test';
import type { ExtensionUIContext, Theme } from '@earendil-works/pi-coding-agent';
import type { UiTheme } from '../src/core.ts';
import type { PickerHost } from '../src/picker.ts';

// Compile-time contracts: Pi's own objects satisfy the kit's structural host types.
const themeFits = (theme: Theme): UiTheme => theme;
const hostFits = (ui: ExtensionUIContext): PickerHost => ui;

test('Pi host types satisfy the kit interfaces', () => {
  expect(typeof themeFits).toBe('function');
  expect(typeof hostFits).toBe('function');
});
