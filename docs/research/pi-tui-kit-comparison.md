# @narumitw/pi-tui-kit (A) vs pi-ui-kit (B)

- **A:** `@narumitw/pi-tui-kit` 0.59.0, as installed for `@narumitw/pi-tool` 0.3.2 (`^0.59.0`). Paths
  below are relative to `~/.pi/agent/npm/node_modules/@narumitw/pi-tui-kit/dist/`. I also
  spot-checked the latest release, 0.66.0, from `npm pack`.
- **B:** `pi-ui-kit` 0.1.2, this repository.
- Checked 2026-10-20. Read-only: no repository was edited.

## 1. One searchable list with a persistent preview beside it

**No.** A's only list-plus-detail screen is `browse`. It has two modes and shows one at a time:

- `components/browse.js:26` sets `let view = "list"`.
- `:184-189` switches the whole screen to `view = "detail"` when the user presses confirm.
- `:82-103` renders either the detail or (`:105-132`) the list, never both.

While the list is showing, the only detail is one muted `description` line under it (`:112`, `:125`).
The detail view can scroll (`:153-169`), but in the list view ↑/↓ moves the selection, so the
two can't be scrolled independently. A has no width breakpoint or column layout anywhere.

`runLiveChoice` (`live-choice.js:5-107`) fires `onSelectionChange` as the cursor moves
(`:52-57`). The caller has to draw the "live preview" somewhere else, such as an editor widget;
A doesn't lay it out.

A also never opens an overlay. `runtime.js:122` and `custom-interaction.js:30` call
`ui.custom(...)` without overlay options, and the test harness rejects overlays outright
(`testing/tui-harness.js:32`).

B: `SIDE_BY_SIDE_WIDTH = 100` (`src/picker.ts:106-107`) puts the preview beside the list at 100+
inner columns and below it when narrower. Shift+↑/↓ and Shift+PgUp/PgDn scroll the preview
independently of the list.

## 2. Search ranking and highlighting

**A only filters with pi-tui's `fuzzyFilter`:**

- `components/browse.js:52`, `components/index.js:123,159,317`, and in 0.66
  `components/pi-selectors.js:295`.
- The upstream `fuzzyMatch` (pi-tui 1.3.0 `dist/fuzzy.js:6-73`) lowercases only. It doesn't strip
  accents, and it returns a numeric gap score with **no match ranges**.
- So A has no exact/prefix/word/substring tiers, and rows aren't highlighted (`browse.js:214-222`
  prints labels as-is).

**B's `match`** (`src/core.ts:60-139`):

- Tiers: 0 phrase, 1 word start, 2 substring, 3 fuzzy.
- Normalizes with NFD and strips marks, so matching ignores case and accents (`:72`).
- Returns `ranges` for `highlight` (`:143`).

B reuses the same pi-tui `fuzzyMatch` as its tier-3 fallback (`:2`, `:111`).

## 3. Multiple tab strips in the header

**No.** A has no tab or strip concept in any shipped type: `types.d.ts:182` lists the screen kinds,
and none is tabs. The closest things are:

- Screen navigation through `to:` transitions (`types.d.ts:41-54`, `navigator.js`).
- A per-item `disabledReason` (`types.d.ts:39,71,165`).

B has `TabsState` with `disabled` and `note`, which is the reason text (`src/tabs.ts:4-10`).
Its `PickerTabs` (`src/picker.ts:27-35`) supports any number of strips, each with a label and
configurable `next`/`previous` bindings. Tabs cycle at `:229-237` and render inline or wrapped at
`:308-319`.

## 4. Row and interaction details

| Feature | A (evidence) | B |
| --- | --- | --- |
| Per-row marker | Fixed `›` cursor (plus a space), `✓ current` suffix, `unavailable: reason` (`components/index.js:98-100`). No caller-supplied glyph. | `Row.marker` (`list.ts:16`) |
| Right-aligned dim meta | No. `statusText` is appended after the label as `[status]`, preceded by two spaces (`browse.js:217-220`). | `meta` is dim and right-aligned, capped at a share of the width (`list.ts:69,98-113`) |
| Key hints from bindings | Yes. `formatInteractionHints` reads `keybindings.getKeys` (`interaction-hints.js:3-20`). | Yes, through `renderKeyHints` and bindings (`picker.ts:322-335`) |
| `tui.select.*` remaps | Yes, for example `browse.js:144-184` | Yes. Binding IDs resolve through the user's keybindings (`core.ts:159-227`). |
| Sync vs async actions | Actions are menu transitions. A `busyLabel` action runs inside `runTask`, which replaces the screen with a loader (`interaction.js:70-92`). `runLiveChoice` shortcuts **end** the interaction (`live-choice.js:84-86`). Nothing acts in place on the selected row. | `PickerAction.run` returns `void` or a `Promise`. Sync actions apply before the next key, and a `busy` flag ignores keys while an async action runs (`picker.ts:41-44,246-264`). |
| Status line | None inside the list. Errors go to `ui.notify` (`interaction.js:135-148`). | `setStatus(text, tone)` replaces the header count (`picker.ts:24,120,142,305`) |

## 5. Dependencies and peers

- **A 0.59.0:**
  - Runtime dependencies: `grok-mermaid` 0.2.3 and `highlight.js` 11.12.0, which take
    **9.2 MB** in Pi's npm tree.
  - 0.66.0 also adds `diff` 9.0.0.
  - Peers: `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui`, both `*`.
- **Does A import pi-coding-agent at runtime? No.**
  - `rg pi-coding-agent -g '*.js' dist` finds nothing in either version.
  - The only references are `import type` in `.d.ts` files, such as `types.d.ts:1` and
    `custom-interaction.d.ts:1`.
- **Cost when nested in an extension's `node_modules`:** none for managed installs. Pi
  "suppresses automatic peer installation for managed npm packages and git packages"
  (`pi/docs/packages.md:88`), and the loader maps the host copy.
  - The real costs are the bundled highlighters and the mermaid renderer. A consumer that only
    wants a list ships them anyway.
  - The `.d.ts` files couple consumer type-checking to pi-coding-agent's exported names
    (`Theme`, `KeybindingsManager`, `ExtensionCommandContext`). B avoids this with structural
    types (ADR 0002, `core.ts:15-35`).
- **B:** peer `pi-tui` only, with no runtime dependencies.

## 6. Maintenance

| | A | B |
| --- | --- | --- |
| Releases | 39 versions (0.35.0 to 0.66.0) between 2026-07-28 and 2026-10-20, about 3 a week. 21 shipped in August. | 3 releases (0.1.0 to 0.1.2) |
| API churn | `PI_EXTENSION_MENU_API_VERSION` went from 14 in 0.59 (`index.d.ts`) to 22 in 0.66: 8 contract bumps in 8 weeks. Every 0.x minor can break under semver. | 0.x. We control the churn. |
| Maintainers | One npm maintainer (`narumitw`). Repository commits: narumiruna 4045, the next human 10. The monorepo has 719 stars and 7 open issues. | Us |
| Tests | 66 entries in `packages/pi-tui-kit/test`, plus RPC and TUI test harnesses shipped under `./testing` | 4 test files, about 530 lines |
| License | MIT | MIT |

A is well-tested and active. Its risks are pace and the single maintainer, not neglect.

## Verdict: B is justified; adopting or extending A would have been worse

- **Adopt: no.**
  - A can't produce the core interaction of `/exposure` and prompt recall: a persistent,
    independently scrollable preview beside a ranked, highlighted list in an overlay. It also
    lacks scope tab strips with a disabled reason and in-place async actions guarded by a busy flag.
  - The nearest substitute, `browse` plus `runLiveChoice`, means Enter-to-detail mode swaps,
    unranked fuzzy filtering, and actions that close the screen. That's a different and worse
    UX, not a skin of the same one.
- **Extend upstream: no.**
  - The missing parts are not small. They'd be:
    - a new screen kind with a two-pane responsive layout;
    - a ranking matcher that returns ranges;
    - a header tab model;
    - a non-terminating action and status channel.
  - A's design runs against them. Every screen must degrade to `ui.select` and `ui.input` over
    RPC (`runtime.js:166-200`, `live-choice.js:108-131`), and a side preview with in-place
    actions has no RPC equivalent.
  - Upstreaming would also land in a single-maintainer library that changed its contract 8 times
    in 8 weeks, and every consumer would still carry about 9 MB of highlight.js and mermaid.
- **The cheapest hybrid** would host B's `Picker` through A's `runCustomInteraction`
  (`custom-interaction.js:30`) for lifecycle and stale-handling. It adds A's dependencies and
  churn to gain abort plumbing that `openPicker` already covers.
- **Where B owes A:** if an extension later needs questionnaires, markdown, code or diff review,
  task loaders, or RPC fallbacks, depend on A for those screens instead of growing B. A is much
  further along there, and its test count dwarfs B's.

## Paragraph proposed for ADR 0001 under "Alternatives considered"

A shortened version is in [ADR 0004](../adr/0004-shared-libraries-split-by-dependency.md) under Considered Options.

- **Adopt @narumitw/pi-tui-kit (0.59–0.66).** It's MIT, well-tested and active, but it doesn't
  fit this overlay. Its `browse` screen swaps between the list and a full-screen detail instead
  of keeping a preview beside the list. Search is pi-tui's unranked `fuzzyFilter`, which
  doesn't fold accents and returns no highlight ranges. It has no header tab strips, and
  shortcuts end the interaction instead of acting in place under a busy guard. It renders in
  the editor slot, not an overlay. Every screen must degrade to RPC `select`/`input`, which rules
  out a two-pane picker upstream. One maintainer changed its menu API contract eight times in
  eight weeks, and it ships highlight.js and mermaid (about 9 MB) as runtime dependencies. We
  reuse its approach only where it overlaps (keybinding-derived hints, pi-tui `fuzzyMatch` as
  the last match tier). For questionnaires, document review or task screens, use it rather than
  growing this kit.
