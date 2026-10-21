# pi-ui-kit

UI components for Pi extensions, built on Pi's TUI.

Picker overlays, list and preview panes, tab strips, key hints, frames and shortcut lookup, shared by
extensions such as pi-prompt-recall and pi-capability-exposure so they look and behave alike.
Host-independent helpers live in [pi-core-kit](https://github.com/Rubio-Enterprises/pi-core-kit).
Status: `internal`, pre-1.0.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Development](#development)
- [API](#api)
- [Contributing](#contributing)
- [License](#license)

## Install

Add it as a runtime dependency pinned to a release tag:

```json
{
  "dependencies": {
    "pi-ui-kit": "git+https://github.com/Rubio-Enterprises/pi-ui-kit.git#v0.1.3"
  },
  "peerDependencies": {
    "@earendil-works/pi-tui": "*"
  }
}
```

Pi installs package dependencies when it installs a git or npm package, and maps the kit's
`@earendil-works/pi-tui` imports to the host's copy, so the kit adds no second TUI
([ADR 0002](docs/adr/0002-host-peers-from-a-nested-dependency.md)). The package ships
TypeScript source for Bun and Pi's extension loader. Its one runtime dependency is
[pi-core-kit](https://github.com/Rubio-Enterprises/pi-core-kit), used by `pi-ui-kit/shortcut`.

## Usage

```ts
import { match } from 'pi-ui-kit/core';
import { openPicker } from 'pi-ui-kit/picker';

const choice = await openPicker<string, string>(ctx.ui, (theme) => ({
  title: 'Branches',
  count: (items) => `${items.length} matches`,
  source: {
    items: (query) => branches.filter((name) => match(name, query)),
    key: (name) => name,
    row: (name) => ({ label: name }),
    preview: (name) => `Branch ${name}`,
    empty: 'No branches match.',
  },
  actions: [
    {
      binding: { keys: [{ id: 'tui.select.confirm' }], hint: 'check out' },
      run: (name, controls) => controls.close(name),
    },
  ],
}));
```

## Development

```bash
mise run setup
mise run lint
mise run typecheck
mise run test
```

Read [AGENTS.md](AGENTS.md), [GLOSSARY.md](GLOSSARY.md) and [docs/adr](docs/adr) before
changing the API.

## API

Each module is a subpath export. There is no root entry point.

| Module | Contents |
| --- | --- |
| `pi-ui-kit/core` | `UiTheme`, `sanitize`, `fit`, `spread`, `match`, `highlight`, `Binding`, `matches`, `bindingLabel` |
| `pi-ui-kit/list` | `ListState`, `Row`, `renderList`, `singleLine` |
| `pi-ui-kit/tabs` | `TabsState`, `renderTabs` |
| `pi-ui-kit/preview` | `PreviewState`, `renderPreview`, `textPreview` |
| `pi-ui-kit/key-hints` | `renderKeyHints` |
| `pi-ui-kit/frame` | `renderFrame`, `frameInnerWidth` |
| `pi-ui-kit/picker` | `Picker`, `openPicker` |
| `pi-ui-kit/shortcut` | `readShortcut`, `toKeyId` |

- **Building blocks** (`list`, `tabs`, `preview`, `key-hints`, `frame`) are a state object
  the caller owns plus a pure render function. They return at most the requested width and
  height.
- **Picker** is the one Pi `Component`. `openPicker` takes its options, or a function that
  builds them from the host theme. It composes the blocks into a framed overlay: a title
  row with tab strips and a count, a search input, the list pane, a preview pane (beside the
  list at 100 or more inner columns, below it otherwise) and key hints generated from its
  bindings. It routes keys in this order: Esc closes; actions; ↑/↓ and PgUp/PgDn select;
  Shift+↑/↓ and Shift+PgUp/PgDn scroll the preview; tab strips; everything else edits the search.
  A source's `prepare` runs once per render before its rows; a preview that throws shows its
  error in the pane.
- **Bindings** name raw keys or Pi keybinding IDs. IDs follow the user's remaps in both
  matching and key hints.
- **Shortcut lookup**: `readShortcut({ agentDir: getAgentDir(), id, fallback })` returns the
  user's key for an extension shortcut from `keybindings.json`. The entry may be one key or a
  list, and the first valid key wins. Extensions register shortcuts before Pi's keybinding
  manager reaches them, so this reads the file Pi reads; it never throws. `toKeyId` normalizes
  a key name to Pi's key-id grammar or returns undefined.
- **Theme and keybindings** are injected. Pass the objects `ctx.ui.custom` supplies;
  `openPicker` does this for you.

## Contributing

Questions and bug reports belong in [issues](https://github.com/Rubio-Enterprises/pi-ui-kit/issues).
Pull requests are welcome. Use Conventional Commits and run the development checks above.

## License

[MIT](LICENSE) © 2026 Rubio Enterprises.
