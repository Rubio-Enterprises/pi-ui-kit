# TUI component library design patterns

Research for a small shared TypeScript component library for Pi extensions. Pi's TUI uses a string-line model: `render(width): string[]`.

Written on 2026-10-20, while this kit was being designed. The consumer code it cites is the pickers in pi-prompt-recall and pi-capability-exposure as they stood before they moved onto this kit. The kit's actual shape is set by its [ADRs](../adr); where this note's recommendations differ (for example, the kit has no root entry point), the ADRs win.

**Question:** how do small, well-regarded terminal-UI component libraries structure reusable components so they compose cleanly and stay maintainable?

## Sources and pinned revisions

All GitHub links are permalinks to the commit read on the day of research.

| Library | Repo @ commit | Notes |
|---|---|---|
| Bubbles | `charmbracelet/bubbles@c3bde0d` | v2 (`charm.land/bubbles/v2`) |
| Bubble Tea | `charmbracelet/bubbletea@f9df43c` | v2 |
| Lip Gloss | `charmbracelet/lipgloss@19f011f` | string layout/styling used by Bubbles |
| Ratatui | `ratatui/ratatui@9e6e1e3` | workspace: `ratatui-core`, `ratatui-widgets`, `ratatui` |
| Textual | `Textualize/textual@5e5b7ef` | |
| Ink | `vadimdemedes/ink@26d2c3f` | |
| @inkjs/ui | `vadimdemedes/ink-ui@14b1145` | |
| OpenTUI | `anomalyco/opentui@d9fb841` (formerly `sst/opentui`) | |
| Pi TUI | `@earendil-works/pi-tui` **1.3.0**, installed copy | `PI_TUI` = `node_modules/@earendil-works/pi-tui/dist`, as installed in pi-prompt-recall |
| Pi coding agent | `@earendil-works/pi-coding-agent`, same `node_modules` | `PI_CA` = `…/node_modules/@earendil-works/pi-coding-agent/dist` |

The consumers I read were `pi-prompt-recall/src/picker.ts` (`RecallPicker`), plus `pi-capability-exposure/src/picker.ts` (`ExposurePicker`) and its `preview.ts`.

---

## 0. Pi baseline: constraints the library must design around

These facts come from the installed `.d.ts` and `.js` files. They drive several of the recommendations below.

- **Components only get a width.** `Component.render(width): string[]`, `handleInput?(data): void`, `handleMouse?`, `invalidate()` (`PI_TUI/tui.d.ts:68-89`).
  - There is no height parameter. Both consumers fetch height themselves, from `env.rows()` or `env.height()` backed by `tui.terminal.rows` (`pi-prompt-recall/src/picker.ts:182`, `pi-capability-exposure/src/picker.ts:84`).
- **Overlay `maxHeight` truncates from the bottom.** The overlay renderer keeps the first `maxHeight` lines: `overlayLines = overlayLines.slice(0, maxHeight)` (`PI_TUI/tui.js:980-981`).
  - A footer of key hints is therefore the first thing lost.
  - `RecallPicker` works around this by hand-coupling `rows * 0.8 - 6` to `maxHeight: '85%'` (`picker.ts:182`, `open.ts:71`).
- **Height-aware layout exists only in the alt-screen layout engine.**
  - `HStack`/`VStack` take flex options `{basis, grow, shrink, minSize, maxSize, visible}` (`PI_TUI/components/stack.d.ts`).
  - In the regular `render(width)` path, `VStack` passes `undefined` as the available size (`PI_TUI/components/v-stack.js:11`).
  - `ScrollView.render` returns all of its child's lines (`PI_TUI/components/scroll-view.js:186-190`).
  - Height allocation only happens in `renderLayoutFrame(root, width, height, …)` (`PI_TUI/layout.js:275`), which `tui-alt-screen.js` uses.
  - So in overlays, scrolling and vertical splits are the component's job.
- **Built-in lists are narrow.**
  - `SelectList.setFilter` is a prefix match on `value` (`PI_TUI/components/select-list.js:26-30`).
  - The empty-state text is hard-coded as `"No matching commands"` (`:41`).
  - The visible window re-centres on the selection on every render, with no persisted offset (`:130-136`).
  - `SettingsList` hard-codes its hint line (`PI_TUI/components/settings-list.js:245-250`).
  - `SettingsList` mutates `item.currentValue` synchronously on cycle (`:216-223`). That doesn't fit the exposure picker's async `setRule`.
- **Keybindings are data, but scoped to the app's manager.**
  - `KeybindingsManager` is built from `{ defaultKeys, description }` definitions. It exposes `matches(data, id)` and `getKeys(id)` (`PI_TUI/keybindings.d.ts:56-59, 256-269`).
  - For an ID the manager wasn't constructed with, `matches` returns `false` (`PI_TUI/keybindings.js:190-197`).
- **The global theme is unreliable in extensions.**
  - `keyHint()` derives key text from bindings, but styles it with the global `theme` (`PI_CA/modes/interactive/components/keybinding-hints.js:5,30-32`).
  - `DynamicBorder` documents that this global "may be undefined" in jiti-loaded extensions (`PI_CA/modes/interactive/components/dynamic-border.d.ts:5-7`).
  - `ctx.ui.custom(factory)` passes `theme` and `keybindings` explicitly (`PI_CA/core/extensions/types.d.ts:121`).

The two pickers duplicate most of the following:

- selection clamping;
- page size derived from height;
- the scroll window `start = max(0, selected - height + 1)` (`recall picker.ts:132`, `exposure picker.ts:86`);
- truncation and padding;
- hand-written footer strings (`recall :208`, `exposure :126`);
- error-safe `render`;
- a "swap whole view to preview" router (`exposure picker.ts:81,159`).

Prompt recall also hand-draws the box and repairs the background after SGR resets (`picker.ts:219-226`).

---

## 1. Separating pure rendering from state: who owns selection and scroll

### Bubble Tea and Bubbles: the component owns its state, the parent embeds it (Elm architecture)

The root `Model` has `Init`, `Update` and `View`. Reusable bubbles mirror that shape with concrete types, so a parent stores the child by value and forwards messages to it.

```go
type Model interface { Init() Cmd; Update(Msg) (Model, Cmd); View() View }   // tea.go:53-65
func (m Model) Update(msg tea.Msg) (Model, tea.Cmd)                         // list/list.go:819
```

`list.Model` privately owns `cursor`, a `Paginator`, the filter state and the filtered items (`list/list.go:178-203`). The parent pushes size in with `SetSize(w, h)` (`:695`).

Links:

- [tea.go#L53-L65](https://github.com/charmbracelet/bubbletea/blob/f9df43c4f2c021d8740a2628d59cd810a862eb98/tea.go#L53-L65)
- [list.go#L178-L203](https://github.com/charmbracelet/bubbles/blob/c3bde0d166c2ca607d9864493453fd77bdcae7e4/list/list.go#L178-L203)

### Ratatui: stateless widget plus caller-owned state (`Widget` vs `StatefulWidget`)

```rust
pub trait Widget { fn render(self, area: Rect, buf: &mut Buffer) where Self: Sized; }        // widget.rs:70-76
pub trait StatefulWidget { type State: ?Sized;
    fn render(self, area: Rect, buf: &mut Buffer, state: &mut Self::State); }               // stateful_widget.rs:124-134
pub struct ListState { pub(crate) offset: usize, pub(crate) selected: Option<usize> }        // list/state.rs:45-48
```

The app stores `ListState`. The widget is rebuilt each frame. Render clamps an out-of-range selection and writes back the offset: "Important: this changes the state's offset" (`list/rendering.rs:47-58`).

The trait docs give the reason: keeping the last offset gives "a natural scrolling experience where the last offset is reused until the selected item is out of the viewport" (`stateful_widget.rs:12-22`).

`Widget for &List` renders with a throwaway default state (`rendering.rs:15-20`). The same widget therefore works with or without state.

Links:

- [stateful_widget.rs#L12-L22](https://github.com/ratatui/ratatui/blob/9e6e1e3430e8194fa29d0f5d96afaf26fbb3c626/ratatui-core/src/widgets/stateful_widget.rs#L12-L22)
- [stateful_widget.rs#L124-L134](https://github.com/ratatui/ratatui/blob/9e6e1e3430e8194fa29d0f5d96afaf26fbb3c626/ratatui-core/src/widgets/stateful_widget.rs#L124-L134)
- [list/rendering.rs#L15-L58](https://github.com/ratatui/ratatui/blob/9e6e1e3430e8194fa29d0f5d96afaf26fbb3c626/ratatui-widgets/src/list/rendering.rs#L15-L58)

### Textual: the widget owns reactive state and repaints itself

`highlighted: reactive[int | None] = reactive(None)` (`_option_list.py:196`).

Its "Line API" (`render_line(y) -> Strip`, guide `widgets.md:395-407`) is the closest analogue to Pi's string lines.

Links:

- [_option_list.py#L196](https://github.com/Textualize/textual/blob/5e5b7ef58b8c5572c13a3ff9027d756623661495/src/textual/widgets/_option_list.py#L196)
- [Line API guide](https://textual.textualize.io/guide/widgets/#line-api)

### @inkjs/ui: three-way split into state, input binding and view

```tsx
const state = useSelectState({visibleOptionCount, options, defaultValue, onChange}); // reducer
useSelect({isDisabled, state});                    // useInput → state.focusNextOption() …
const {styles} = useComponentTheme<Theme>('Select');                                // select.tsx:54-63
```

The state is a reducer over the actions `focus-next-option`, `focus-previous-option`, `select-focused-option` and `reset` (`use-select-state.ts:50-71`). The state exposes `visibleFromIndex` and `visibleToIndex`, so the scroll window persists (`:196-219`).

Links:

- [select.tsx#L46-L95](https://github.com/vadimdemedes/ink-ui/blob/14b1145da0123a48cfc2f0ec9ff33dff0633f464/source/components/select/select.tsx#L46-L95)
- [use-select-state.ts#L196-L219](https://github.com/vadimdemedes/ink-ui/blob/14b1145da0123a48cfc2f0ec9ff33dff0633f464/source/components/select/use-select-state.ts#L196-L219)

### OpenTUI: retained-mode renderables own state and emit events

`SelectRenderableEvents { SELECTION_CHANGED, ITEM_SELECTED }` (`Select.ts:61-64`).

Link: [Select.ts#L61-L64](https://github.com/anomalyco/opentui/blob/d9fb841ff4f7771a4f7bd09c950920a30a2452c4/packages/core/src/renderables/Select.ts#L61-L64)

### Pi

`SelectList` owns `selectedIndex` but has no offset (`select-list.js:130-136`). The consumers recompute `start` from `selected` on every frame.

As a result, after scrolling down, the first ↑ scrolls the list instead of moving the cursor. Ratatui's persisted offset avoids exactly that.

**Recommendation:** split each widget into three parts:

1. plain-data state with pure transitions, for example `ListState { selected, offset }`;
2. a pure `render(state, props, width, height): string[]` that may only normalise `offset`, ratatui-style;
3. a thin Pi `Component` adapter.

The composite, such as the picker, owns all the state.

---

## 2. Layout primitives (splits, constraints, borders) vs higher-level components

### Ratatui: constraint solver plus `Block`, and widgets render into a `Rect`

```rust
let [top, main] = Layout::vertical([Constraint::Length(1), Constraint::Fill(1)]).areas(area); // layout.rs:574-580
enum Constraint { Min(u16), Max(u16), Length(u16), Percentage(u16), Ratio(u32,u32), Fill(u16) } // constraint.rs:77-223
Block::bordered().title("List").title_bottom(..);  let inner = block.inner(area);            // block.rs:293,366,426,762
```

Higher-level widgets accept a block and render content in its inner area: `self.block.as_ref().render(area, buf); let list_area = self.block.inner_if_some(area);` (`list/rendering.rs:34-36`).

Links:

- [layout.rs#L580-L588](https://github.com/ratatui/ratatui/blob/9e6e1e3430e8194fa29d0f5d96afaf26fbb3c626/ratatui-core/src/layout/layout.rs#L580-L588)
- [constraint.rs#L77-L223](https://github.com/ratatui/ratatui/blob/9e6e1e3430e8194fa29d0f5d96afaf26fbb3c626/ratatui-core/src/layout/constraint.rs#L77-L223)
- [block.rs#L762](https://github.com/ratatui/ratatui/blob/9e6e1e3430e8194fa29d0f5d96afaf26fbb3c626/ratatui-widgets/src/block.rs#L762)

### Lip Gloss and Bubbles: string-level joins and borders

This is closest to our string-line model.

```go
lipgloss.JoinHorizontal(lipgloss.Top, left, right)   // join.go:28 ; JoinVertical join.go:116
style.Border(lipgloss.RoundedBorder()).Width(40).Render(s)   // set.go:490, borders.go:228, set.go:286
```

Components never measure the terminal. The parent calls `list.SetSize(w, h)` (`list/list.go:695`).

Links:

- [join.go#L28](https://github.com/charmbracelet/lipgloss/blob/19f011f1cc573e5d2bf9d7a9c4f14d429647759e/join.go#L28)
- [set.go#L490](https://github.com/charmbracelet/lipgloss/blob/19f011f1cc573e5d2bf9d7a9c4f14d429647759e/set.go#L490)

### Textual: layout and borders live in CSS

`OptionList`'s `DEFAULT_CSS` contains `height: auto; max-height: 100%; border: tall $border-blurred;` (`_option_list.py:133-177`). Containers come from `compose()`.

Link: [_option_list.py#L133-L177](https://github.com/Textualize/textual/blob/5e5b7ef58b8c5572c13a3ff9027d756623661495/src/textual/widgets/_option_list.py#L133-L177)

### Ink and OpenTUI: Yoga flexbox

- Ink: `<Box flexGrow={1} borderStyle="round">` (Ink readme `Box` at L409, `flexGrow` at L688, `borderStyle` at L1100).
- OpenTUI: `BoxOptions { border, borderStyle, title, titleAlignment, focusedBorderColor }` (`Box.ts:18-30`).

Links:

- [ink readme#L1100](https://github.com/vadimdemedes/ink/blob/26d2c3f83008142061c22267482489588cc3823c/readme.md#L1100)
- [Box.ts#L18-L30](https://github.com/anomalyco/opentui/blob/d9fb841ff4f7771a4f7bd09c950920a30a2452c4/packages/core/src/renderables/Box.ts#L18-L30)

### Pi

Pi has `Box`, which only does padding and background, and `HStack`/`VStack` with flex entries. As section 0 shows, though, overlays get no height-aware allocation.

**Recommendation:** ship height-aware string primitives that take an explicit `(width, height)` and always return exactly `height` lines:

- `split(total, constraints, gap) → sizes`;
- `columns(parts, widths, sep)`;
- `box(content, {title, footer})` with `inner(w, h)`.

The Pi adapter should be the only code that discovers height.

---

## 3. Keybinding definitions and help/footer hints generated from them

### Bubbles: one value carries the keys and the help text

```go
CursorUp: key.NewBinding(key.WithKeys("up", "k"), key.WithHelp("↑/k", "up"))  // list/keys.go:37-40
func Matches[Key fmt.Stringer](k Key, b ...Binding) bool                       // key/key.go:130-140
type KeyMap interface { ShortHelp() []key.Binding; FullHelp() [][]key.Binding } // help/help.go:18-28
```

- Disabled bindings neither match nor show in help (`key/key.go:103-108`).
- `help.Model.View(k)` renders short or full help. It skips disabled bindings and truncates with `…` to fit the width (`help/help.go:108-167`).
- `list.Model` implements `KeyMap` itself. It splices in the delegate's bindings when the delegate implements `help.KeyMap`, plus `AdditionalShortHelpKeys()` from the app (`list/list.go:967-998`).
- The result is help that composes up the tree.

Links:

- [key.go#L41-L140](https://github.com/charmbracelet/bubbles/blob/c3bde0d166c2ca607d9864493453fd77bdcae7e4/key/key.go#L41-L140)
- [help.go#L18-L28](https://github.com/charmbracelet/bubbles/blob/c3bde0d166c2ca607d9864493453fd77bdcae7e4/help/help.go#L18-L28)
- [help.go#L128-L167](https://github.com/charmbracelet/bubbles/blob/c3bde0d166c2ca607d9864493453fd77bdcae7e4/help/help.go#L128-L167)
- [list.go#L967-L998](https://github.com/charmbracelet/bubbles/blob/c3bde0d166c2ca607d9864493453fd77bdcae7e4/list/list.go#L967-L998)

### Textual: declarative bindings mapped to actions, with a footer generated from the active set

```python
BINDINGS = [Binding("down", "cursor_down", "Down", show=False), ...]   # _option_list.py:112-120
def action_cursor_down(self) -> None: ...                               # :973
BINDINGS = [Binding("space", "select", "Toggle option", show=False)]   # SelectionList, _selection_list.py:79
```

- `Binding` has `key`, `action`, `description`, `show`, `key_display`, `priority`, `id` and `group` (`binding.py:55-97`).
- `Footer.compose()` reads `self.screen.active_bindings` and keeps those with `binding.show` (`_footer.py:244-256`).
- `check_action()` is tri-state: `True` means visible, `False` means hidden, `None` means shown greyed out. `refresh_bindings()` updates the footer (`dom.py:1909-1933`).

Links:

- [binding.py#L55-L97](https://github.com/Textualize/textual/blob/5e5b7ef58b8c5572c13a3ff9027d756623661495/src/textual/binding.py#L55-L97)
- [_footer.py#L244-L256](https://github.com/Textualize/textual/blob/5e5b7ef58b8c5572c13a3ff9027d756623661495/src/textual/widgets/_footer.py#L244-L256)
- [dom.py#L1909-L1923](https://github.com/Textualize/textual/blob/5e5b7ef58b8c5572c13a3ff9027d756623661495/src/textual/dom.py#L1909-L1923)

### OpenTUI: an action union plus overridable binding tables, but no help

```ts
export type SelectAction = "move-up" | "move-down" | "move-up-fast" | "move-down-fast" | "select-current"
const defaultSelectKeybindings = [{ name: "up", action: "move-up" }, { name: "k", action: "move-up" }, …]  // Select.ts:24-36
```

User `keyBindings` are merged with the defaults via `mergeKeyBindings` (`:148-151`). `handleKeyPress(key): boolean` dispatches on the resolved action (`:339-360`).

Link: [Select.ts#L24-L58](https://github.com/anomalyco/opentui/blob/d9fb841ff4f7771a4f7bd09c950920a30a2452c4/packages/core/src/renderables/Select.ts#L24-L58)

### Ink and @inkjs/ui: hard-coded `key.downArrow` checks

These live inside `useInput` (`use-select.ts:18-35`), and there is no help model. This is a pattern to avoid.

Link: [use-select.ts#L18-L35](https://github.com/vadimdemedes/ink-ui/blob/14b1145da0123a48cfc2f0ec9ff33dff0633f464/source/components/select/use-select.ts#L18-L35)

### Pi

- Standard navigation uses `kb.matches(data, 'tui.select.up')`, so user remaps apply.
- `keyHint(id, desc)` shows how to build a hint from `getKeys(id)`.
- The consumers mix `kb.matches` with raw `matchesKey(data, 'tab')` (`recall picker.ts:86`) and write footers by hand. If a user remaps a key, the footer still shows the default.

**Recommendation:**

1. Declare each widget's keys as data: `{ id, keys: KeyId[] | { pi: Keybinding }, help: { key?, desc }, enabled?() }`.
2. Use those records both to match input and to generate the footer, via `helpLine(bindings, width, theme)` with `…` truncation.
3. For Pi IDs, take key labels from `kb.getKeys()`.
4. Composites concatenate their children's `bindings()`, as Bubbles does.

---

## 4. Theming and style injection

### Bubbles: per-component `Styles` struct, with light/dark chosen explicitly

```go
type Styles struct { TitleBar, Title, Spinner, ..., NoItems, HelpStyle lipgloss.Style; ... }  // list/style.go:15-39
func DefaultStyles(isDark bool) (s Styles)                                                   // list/style.go:44
```

v2 dropped auto-adaptive colours. The app now queries the background and reassigns each `.Styles` field (`UPGRADE_GUIDE_V2.md:502-523`). `NewDefaultDelegate` still carries an "XXX … hardcoded the dark colors" note (`list/defaultitem.go:102-104`).

Links:

- [list/style.go#L15-L44](https://github.com/charmbracelet/bubbles/blob/c3bde0d166c2ca607d9864493453fd77bdcae7e4/list/style.go#L15-L44)
- [UPGRADE_GUIDE_V2.md#L502-L523](https://github.com/charmbracelet/bubbles/blob/c3bde0d166c2ca607d9864493453fd77bdcae7e4/UPGRADE_GUIDE_V2.md#L502-L523)

### Ratatui: no global theme, only per-widget style builders

For example `List::new(items).highlight_style(Style::new().reversed()).highlight_symbol(">>")` (`list.rs:85-87`). Here `List` has fields `highlight_style`, `highlight_symbol` and `block` (`:109-127`).

Link: [list.rs#L109-L127](https://github.com/ratatui/ratatui/blob/9e6e1e3430e8194fa29d0f5d96afaf26fbb3c626/ratatui-widgets/src/list.rs#L109-L127)

### Textual: CSS with design tokens, plus named sub-parts

- `DEFAULT_CSS` uses tokens such as `$block-cursor-background`.
- It is scoped and has lower specificity than app CSS, so app CSS wins (`docs/guide/widgets.md:84-119`).
- `COMPONENT_CLASSES = {"option-list--option-highlighted", …}` exposes stylable parts of a single widget (`_option_list.py:179-185`).
- Themes are a dataclass: `Theme(name, primary, secondary, warning, error, success, accent, foreground, background, surface, panel, dark, variables)` (`theme.py:13-38`).

Links:

- [widgets guide: Default CSS](https://textual.textualize.io/guide/widgets/#default-css)
- [theme.py#L13-L38](https://github.com/Textualize/textual/blob/5e5b7ef58b8c5572c13a3ff9027d756623661495/src/textual/theme.py#L13-L38)

### @inkjs/ui: per-component theme modules of state-aware style functions, merged through React context

```ts
const theme = { styles: {
  label({isFocused, isSelected}): TextProps { … },
  highlightedText: (): TextProps => ({bold: true}) } } satisfies ComponentTheme  // select/theme.ts:4-39
export const extendTheme = (originalTheme, newTheme) => deepmerge(originalTheme, newTheme)  // theme.tsx:59-61
export const useComponentTheme = <T>(component: string): T => useContext(ThemeContext).components[component] // :63-68
```

Links:

- [select/theme.ts](https://github.com/vadimdemedes/ink-ui/blob/14b1145da0123a48cfc2f0ec9ff33dff0633f464/source/components/select/theme.ts#L4-L39)
- [theme.tsx#L17-L68](https://github.com/vadimdemedes/ink-ui/blob/14b1145da0123a48cfc2f0ec9ff33dff0633f464/source/theme.tsx#L17-L68)

### Pi: per-component interfaces of `(text) => string` functions

Examples are `SelectListTheme`, `SettingsListTheme` (`label(text, selected)`) and `MarkdownTheme`. `getSelectListTheme()` and the related getters build them from the global theme (`PI_CA/modes/interactive/theme/theme.js:881-904`).

**Recommendation:**

1. Define one semantic `UiTheme` of state-aware functions, such as `row(text, {selected, disabled})`, `match`, `border`, `muted`, `title` and `hint`.
2. Build it once from the `Theme` that `ctx.ui.custom` passes in.
3. Export adapters to Pi's `SelectListTheme` and `MarkdownTheme`.
4. Always inject the theme; never import the global one.

---

## 5. Parameterising a list or picker: delegate, filter, preview

### Bubbles: `Item` plus `ItemDelegate` plus a pluggable `FilterFunc`

```go
type Item interface { FilterValue() string }                                         // list.go:34-38
type ItemDelegate interface {
    Render(w io.Writer, m Model, index int, item Item); Height() int; Spacing() int
    Update(msg tea.Msg, m *Model) tea.Cmd }                                           // list.go:46-61
type FilterFunc func(string, []string) []Rank   // Rank{Index, MatchedIndexes}        // list.go:86-94
```

- The default delegate highlights matched runes using `m.MatchesForItem(index)` (`defaultitem.go:184-210`).
- A delegate can add row-level keys by implementing `help.KeyMap` and handling `Update`.
- `DefaultDelegate` exposes `UpdateFunc`, `ShortHelpFunc` and `FullHelpFunc` hooks (`defaultitem.go:86-94`).
- There is no built-in preview.

Links:

- [list.go#L34-L123](https://github.com/charmbracelet/bubbles/blob/c3bde0d166c2ca607d9864493453fd77bdcae7e4/list/list.go#L34-L123)
- [defaultitem.go#L86-L217](https://github.com/charmbracelet/bubbles/blob/c3bde0d166c2ca607d9864493453fd77bdcae7e4/list/defaultitem.go#L86-L217)

### Ratatui: items are pre-styled `ListItem`s, and filtering belongs to the app

`List::new<T>(items: T)`, where each item converts `Into<ListItem>` and may span several lines (`list.rs:185-193`). Tabs follow the same stateless style: `Tabs::new(titles).select(i)` (`tabs.rs:130,222`).

Link: [list.rs#L185](https://github.com/ratatui/ratatui/blob/9e6e1e3430e8194fa29d0f5d96afaf26fbb3c626/ratatui-widgets/src/list.rs#L185)

### Textual: `Option(prompt, id, disabled)`, with `OptionHighlighted` and `OptionSelected` messages

See `_option_list.py:43-60,243-255`. `SelectionList` subclasses `OptionList` to add toggling.

Link: [_option_list.py#L243-L255](https://github.com/Textualize/textual/blob/5e5b7ef58b8c5572c13a3ff9027d756623661495/src/textual/widgets/_option_list.py#L243-L255)

### @inkjs/ui and OpenTUI: fixed option shapes

- @inkjs/ui: `Select` takes `options: {label, value}[]`, `visibleOptionCount`, `highlightText` (substring only), `defaultValue` and `onChange` (`select.tsx:10-44`).
- OpenTUI: `SelectOption {name, description, value?}`, plus `showDescription`, `wrapSelection` and `keyBindings` (`Select.ts:18-58`).

### Pi

- `SelectItem {value, label, description}` with a `truncatePrimary` hook.
- `SettingsItem {id, label, currentValue, values?, submenu?}`, which cycles on Enter/Space.
- `fuzzyFilter(items, query, getText)` returns items without match ranges (`PI_TUI/fuzzy.d.ts:15`). Prompt recall had to re-match to get highlight ranges (`matchPrompt(...).ranges`).

**Preview is always composition.** None of the studied libraries ships a list-plus-preview picker. The highlight event drives a separate pane instead: Textual `OptionHighlighted`, Pi `onSelectionChange`, OpenTUI `SELECTION_CHANGED`. Bubbles' `viewport.Model` (`New`, `SetContent`, `ScrollDown`; `viewport.go:43,226,518`) is the usual scrolling preview.

**Recommendation:** give `Picker<T>` these options:

- `items` and `key(item)`;
- `filter(query, items) → {item, ranges}[]`;
- `renderRow(item, {selected, ranges, width, theme}) → string`;
- optional `rowHeight`;
- `empty` text;
- `actions` (bindings with an `(item) => void | Promise` handler).

The picker emits `onHighlight`, and a separate `Preview` pane renders from it.

---

## 6. Composing a container from children

### Bubble Tea: the parent embeds child models, forwards messages, and joins the `View()` strings

`list.Model` itself embeds `spinner.Model`, `paginator.Model`, `help.Model` and `textinput.Model` (`list.go:178-185`).

Link: [list.go#L178-L185](https://github.com/charmbracelet/bubbles/blob/c3bde0d166c2ca607d9864493453fd77bdcae7e4/list/list.go#L178-L185)

### Ratatui: the parent's render splits its `Rect` and renders the children

`List` renders its `Block`, then the items into `inner`.

### Textual: `compose()` yields children; the rule is "attributes down, messages up"

> "a widget can update a child by setting its attributes or calling its methods, but widgets should only ever send messages to their parent" (`docs/guide/widgets.md:684`)

Siblings coordinate through the parent (`:706`). `compose()` is documented in `widget.py:1679-1696`.

Link: [widgets guide: Data flow](https://textual.textualize.io/guide/widgets/#data-flow)

### Ink: JSX children inside `<Box>`

### OpenTUI: `handleKeyPress` returns `boolean`

The return value tells the parent whether the child consumed the key (`Select.ts:339-360`).

Link: [Select.ts#L339-L360](https://github.com/anomalyco/opentui/blob/d9fb841ff4f7771a4f7bd09c950920a30a2452c4/packages/core/src/renderables/Select.ts#L339-L360)

### Pi

- `Container.children` plus `addChild`, with lines concatenated.
- `SettingsList` and `ExposurePicker` each replace their whole render and input with a child "submenu" or "preview" (`settings-list.js:50-56,159-165`, `exposure picker.ts:81`). That is an ad-hoc view stack.
- Pi's `handleInput` returns `void`, so composites guess at fall-through. The pickers send any unmatched key to the search `Input`.

**Recommendation:**

1. Pass data down through setters and raise events up through `on*` callbacks.
2. Have children implement `handleInput(data): boolean`. This is assignable to Pi's `void` signature and makes fall-through explicit.
3. Model "swap to full preview" as a tiny view stack owned by the frame.

---

## 7. Module and package layout, and a public API that can grow

### Bubbles: one Go package per component, each with a predictable trio

Each package provides `New(...)`, `DefaultKeyMap()` and `DefaultStyles(isDark)` (`list/`, `help/`, `key/`, `viewport/`, `table/`, …).

`table` uses functional options: `func New(opts ...Option) Model`, plus `WithColumns`, `WithHeight`, `WithStyles`, `WithKeyMap` (`table/table.go:130-195`).

v2 had to break consumers by turning exported `Width`/`Height` fields into `SetWidth()`/`Width()` (`UPGRADE_GUIDE_V2.md:106-118`). That is the lesson against public mutable fields.

Links:

- [table.go#L130-L195](https://github.com/charmbracelet/bubbles/blob/c3bde0d166c2ca607d9864493453fd77bdcae7e4/table/table.go#L130-L195)
- [UPGRADE_GUIDE_V2.md#L106-L118](https://github.com/charmbracelet/bubbles/blob/c3bde0d166c2ca607d9864493453fd77bdcae7e4/UPGRADE_GUIDE_V2.md#L106-L118)

### Ratatui: crates split by stability

- `ratatui-core` holds the traits, buffer, layout and style. It is "Designed for maximum stability to minimize breaking changes for widget libraries".
- `ratatui-widgets` holds the implementations.
- `ratatui` re-exports everything (`ARCHITECTURE.md:31-50,111-120`).

Link: [ARCHITECTURE.md#L111-L120](https://github.com/ratatui/ratatui/blob/9e6e1e3430e8194fa29d0f5d96afaf26fbb3c626/ARCHITECTURE.md#L111-L120)

### Textual: private implementation modules, public lazy re-exports

Widgets live in private modules (`widgets/_option_list.py`). They are reached through a public, lazily loaded `textual.widgets` namespace via `__getattr__` and `__all__` (`widgets/__init__.py:98-116`).

Link: [`widgets/__init__.py#L98-L116`](https://github.com/Textualize/textual/blob/5e5b7ef58b8c5572c13a3ff9027d756623661495/src/textual/widgets/__init__.py#L98-L116)

### @inkjs/ui: one folder per component

The layout is `components/select/{select.tsx, select-option.tsx, theme.ts, use-select-state.ts, use-select.ts, index.ts}`.

- The root `index.ts` re-exports the components, the theme and the types (`source/index.ts:1-15`).
- The state and input hooks are not exported, so the internals can change freely.
- `package.json` declares a single `exports` entry.

Link: [source/index.ts](https://github.com/vadimdemedes/ink-ui/blob/14b1145da0123a48cfc2f0ec9ff33dff0633f464/source/index.ts#L1-L15)

### OpenTUI: framework-agnostic core with thin bindings

`packages/core` holds the renderables. `packages/react` and `packages/solid` are bindings over it.

### Pi

- There is a single `main` entry, and everything is re-exported from `index.d.ts`.
- Constructors are positional, for example `SettingsList(items, maxVisible, theme, onChange, onCancel, options?)`. Any new required argument is a breaking change.

**Recommendation:**

1. One package with a folder per widget (`state.ts`, `render.ts`, `component.ts`, `index.ts`).
2. A deliberately small, stable `core` subpath for primitives, plus a root re-export, wired through an `exports` map.
3. Options-object constructors with defaults; new options are always optional.
4. Getters and setters rather than public mutable fields.
5. `@earendil-works/pi-tui` as a peer dependency.

---

## 8. Testing: golden and snapshot tests of rendered lines

### Bubbles: golden files per width, with ANSI stripped

```go
for _, w := range []int{20, 30, 40} {
    t.Run(fmt.Sprintf("full help %d width", w), func(t *testing.T) {
        m.SetWidth(w); s := ansi.Strip(m.FullHelpView(kb)); golden.RequireEqual(t, []byte(s)) }) } // help_test.go:31-37
```

This produces `help/testdata/TestFullHelp/full_help_20_width.golden` and similar files. Table tests use the same pattern (`table_test.go:774-776`).

Links:

- [help_test.go#L12-L39](https://github.com/charmbracelet/bubbles/blob/c3bde0d166c2ca607d9864493453fd77bdcae7e4/help/help_test.go#L12-L39)
- [x/exp/golden](https://pkg.go.dev/github.com/charmbracelet/x/exp/golden)

### Ratatui: render into an in-memory buffer and compare inline

```rust
let buffer = widget(List::new(["Item 0","Item 1","Item 2"]).block(Block::bordered().title("List")), 10, 7);
assert_eq!(buffer, Buffer::with_lines(["┌List────┐","│Item 0  │", …, "└────────┘"]));  // list/rendering.rs:624-638
```

The `widget()` and `stateful_widget()` helpers are at `:334-345`. For whole apps, the recipe is `TestBackend::new(80, 20)` plus `insta::assert_snapshot!(terminal.backend())`.

Links:

- [rendering.rs#L624-L638](https://github.com/ratatui/ratatui/blob/9e6e1e3430e8194fa29d0f5d96afaf26fbb3c626/ratatui-widgets/src/list/rendering.rs#L624-L638)
- [ratatui.rs snapshot recipe](https://ratatui.rs/recipes/testing/snapshots/)

### Textual: SVG snapshot comparison plus a scripted pilot

`pytest-textual-snapshot` provides `snap_compare` (SVG). `app.run_test(size=(100, 50))` returns a `Pilot` with `press` and `click` (`docs/guide/testing.md:60-221`).

Link: [testing guide](https://textual.textualize.io/guide/testing/)

### Ink and @inkjs/ui: drive stdin, compare the last frame

`ink-testing-library` provides `render()`, `lastFrame()` and `stdin.write('\u001B[B')`. Expected frames are exact strings, including chalk colours (`ink-ui test/select.tsx:45-80`). Ink also has `renderToString()` (readme L2879).

Link: [ink-ui test/select.tsx#L45-L80](https://github.com/vadimdemedes/ink-ui/blob/14b1145da0123a48cfc2f0ec9ff33dff0633f464/test/select.tsx#L45-L80)

### OpenTUI: test renderer with mocked input

`createTestRenderer()` returns `{ mockInput, renderOnce, captureCharFrame, resize }` (`testing/test-renderer.ts:55-69,197`).

Link: [test-renderer.ts#L55-L69](https://github.com/anomalyco/opentui/blob/d9fb841ff4f7771a4f7bd09c950920a30a2452c4/packages/core/src/testing/test-renderer.ts#L55-L69)

### Pi consumers today

Both use an identity theme (`recall tests/picker.test.ts:33-43`, `exposure tests/ui-fixture.ts`). They assert substrings, for example `expect(picker.render(120).join('\n')).toContain('Preview')`. Those checks miss layout regressions such as misalignment, overflow or a lost footer.

**Recommendation:**

1. Golden-test the pure renderers at several `(width, height)` pairs with an identity theme. Use `bun test`'s `toMatchInlineSnapshot`/`toMatchSnapshot` ([bun docs](https://bun.com/docs/test/snapshots)) on `stripTerminalSequences` output.
2. Keep one coloured snapshot per widget to catch SGR leaks.
3. Add a shared invariant test for every widget: `lines.length ≤ height` and `visibleWidth(line) ≤ width`.
4. Drive key sequences through `handleInput`.

---

## How the two consumers decompose under this shape

- **Prompt recall:**
  - `Frame(box: title, footer = helpLine)` contains a header, `Input`, `Split(columns ≥100 cols, else rows)` of `List<SearchResult>` and `Preview(lines)`, and `HelpBar`.
  - Scope is a `Tabs` strip that cycles on Tab.
  - The highlight event resets the preview offset.
- **Exposure picker:**
  - `Frame` contains `Tabs(kind)`, `Tabs(scope, disabled states)`, `Input`, a `List` whose row action is "cycle", a status line and `HelpBar`.
  - Today Enter swaps the whole view to a Markdown preview (`preview.ts`), not a side pane. With a `Split`, the same `Preview` widget can become an always-on pane.
  - The async save stays in the consumer. The picker exposes `busy` and status text.

## Recommended shape

```text
pi-ui (one package, `exports`: ".", "./core", "./widgets/*"; peerDep @earendil-works/pi-tui)
core/  pure, no Pi runtime state; every fn takes (width, height) and returns exactly height lines
  text     fit/pad/truncate/sanitize (wraps pi-tui visibleWidth, truncateToWidth, wrapTextWithAnsi)
  layout   split(total, Constraint[], gap) → sizes; columns(parts, widths, sep); rows(parts, heights)
  box      box(content, {title, footer}, theme) + inner(w, h); owns border drawing and bg/SGR repair
  theme    UiTheme semantic tokens (state-aware fns) + fromPiTheme(theme) + toSelectListTheme/…
  keys     Binding {id, keys | {pi: id}, help {key?, desc}, enabled?}; matches(data, b, kb);
           helpLine(bindings, width, theme) with … truncation; labels from kb.getKeys()
widgets/<name>/{state.ts pure data + transitions, render.ts pure, component.ts Pi adapter}
  list     ListState{selected, offset}; moveBy/page/home/end; render keeps offset (ratatui-style)
  picker   Picker<T>{items, key, filter(q) → {item, ranges}[], renderRow, actions: Binding[]}; onHighlight
  tabs     render(labels, active, {disabled}); cycle(dir)
  preview  ViewportState{offset}; content = string[] | Component (Markdown/Text) rendered at width
  help     collects bindings() from the focused child + composite → footer line(s)
overlay/   Frame: the only Pi Component; height from rows()/maxHeight; reserves footer rows;
           view stack (list ↔ full preview); routes keys via child handleInput(): boolean;
           error-safe render; calls requestRender; dispose
Rules: options objects; attributes down via setters, events up via on*; theme + keybindings injected,
       never global; no public mutable fields; new options optional; widgets never read terminal size.
Tests: identity-theme snapshots per widget at 60/100/140 cols × 2 heights (bun snapshots on stripped
       lines) + one coloured snapshot; invariant suite (≤height lines, ≤width cells); key-script tests.
```
