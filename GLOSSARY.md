# UI kit

Shared vocabulary for the overlays and panes Pi extensions draw with this kit.

## Language

### Surfaces

**Overlay**:
Pi's floating layer drawn over the transcript and editor. Pi owns it; the kit draws inside it.
_Avoid_: popup, modal, dialog, window

**Frame**:
The bordered, tinted box that fills an overlay and keeps its header and footer visible.
_Avoid_: box, panel, chrome, border

**Picker**:
A framed overlay for finding items in a searchable list and acting on the selected one, with an optional preview pane.
_Avoid_: menu, selector, chooser, popup menu

**Pane**:
A region of a picker's body: the list pane or the preview pane.
_Avoid_: panel, column, section

### Content

**Row**:
One item as the list pane shows it: an optional marker, a label and dim meta.
_Avoid_: line, entry, cell

**Marker**:
A one-column glyph before a row's label that shows the item's state.
_Avoid_: icon, badge, bullet

**Preview**:
What the preview pane shows for the selected item.
_Avoid_: detail view, inspector

**Tab strip**:
A row of mutually exclusive choices in the picker header, one of them active, such as a scope.
_Avoid_: segmented control, toggle, filter

### Input

**Binding**:
A set of keys that triggers one user-facing action inside a picker, named by raw key or by Pi keybinding ID.
_Avoid_: shortcut, hotkey, keymap

**Shortcut**:
A key an extension registers with Pi to act from anywhere in the session, which the user can remap under the extension's keybinding ID. Pi's own term.
_Avoid_: hotkey, global binding

**Action**:
What a binding does to the selected item, supplied by the extension.
_Avoid_: command, handler

**Key hint**:
The footer text that tells the user which keys do what, generated from bindings.
_Avoid_: help line, legend, footer text

**Match**:
How well a query fits an item, from exact phrase down to fuzzy subsequence, with the ranges to highlight.
_Avoid_: score, hit
