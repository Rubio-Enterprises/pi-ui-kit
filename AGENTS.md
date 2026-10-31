# Agent context

Checks come from `@rubio-enterprises/standards`. Run `mise run setup` once (it needs
`NODE_AUTH_TOKEN` and installs the package, tools, dependencies and git hooks), then
`mise run check`, `mise run typecheck` and `mise run test` (JUnit in `reports/test/`); `mise tasks`
lists the rest. Put repository exceptions in each tool's own config (`biome.jsonc`,
`tsconfig.json`) or in `lefthook.override.yml`.

## Repository guidance

pi-ui-kit holds UI components shared by Pi extensions. Use [GLOSSARY.md](GLOSSARY.md)
vocabulary, and read [docs/adr](docs/adr) before changing the package shape.

Invariants:

- Runtime imports are `@earendil-works/pi-tui` (a `*` peer, never a dependency), `node:`
  built-ins, sibling modules and pi-core-kit (a dependency pinned to a release tag; only
  `shortcut` uses it). pi-core-kit's `typebox` peer is passed through as a `*` peer here too;
  Pi provides it. Never import `@earendil-works/pi-coding-agent` at runtime:
  type its objects structurally (`UiTheme`, `UiKeybindings`, `PickerHost`) and keep
  `tests/host-types.test.ts` proving Pi's real types still fit.
- Each module is `src/<name>.ts`, exported as `./<name>`. There is no root entry point.
  Adding a module or an optional option is a minor change; renaming or removing either is
  breaking.
- Building blocks are a caller-owned state class plus a pure render function. Render functions
  never return lines wider than `width` or more than `height` rows; tests enforce both.
- `Picker` is the only Pi `Component`. Theme and keybindings are injected, never read globally.
  Key hints are generated from bindings, never hand-written.
- Options are objects with optional additions; no public mutable fields. Optional fields
  accept an explicit `undefined`.
- Consumers compile this source with their own settings, so `tsconfig.strict.json` checks it
  under the strictest common ones (including `exactOptionalPropertyTypes`); keep it passing.
- Extension-specific behavior (ranking, scopes, what an action does) stays in the extension.
  Add something here only when at least two extensions need it.

Tests use plain and SGR-tagged themes from `tests/support.ts`; keep width/height invariants
for every block at several widths. The test runner must prove a positive executed-test count.
