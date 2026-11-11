# Agent context

Checks come from `@rubio-enterprises/standards`. Run `just build && just setup` once (dependencies and git hooks), then
`just check`, `just typecheck` and `just test` (JUnit in `reports/test/`); `just --list`
lists the rest. Put repository exceptions in each tool's own config (`biome.jsonc`,
`tsconfig.json`) or in `lefthook.override.yml`.

## Repository guidance

pi-ui-kit holds UI components shared by Pi extensions. Use [GLOSSARY.md](GLOSSARY.md)
vocabulary.

Invariants:

- **Architecture decisions**: an ADR records why a rule exists. Before changing a decision, check
  `docs/adr/` for an accepted ADR; reversing one needs a superseding ADR. Write one only if a
  person approved it: in the session, or in an approved plan or `delegate-to-agent` issue that
  names the ADR. Otherwise the PR description is the record. Follow
  [the format](docs/adr/0001-record-architecture-decisions.md), which states the ADR test.
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

## Commands

First command in a fresh checkout: `just build`.
Never install toolchains on the host — all project commands run in the dev image through `just`.

```bash
just build
just setup
just check
just fmt
just check-pr
just typecheck
just test
just setup-deps
just shell
just exec <cmd...>
```

Single test: `just exec uv run pytest path::test` (Python); otherwise prefix the underlying runner with `just exec`.
