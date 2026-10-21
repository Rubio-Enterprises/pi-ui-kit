# The kit imports Pi's TUI as a peer from inside an extension's dependencies

pi-ui-kit is installed as a git dependency of each extension, so it sits in the extension's
`node_modules`, yet it imports `@earendil-works/pi-tui` directly and declares it only as a `*`
peer. Pi's extension loader maps host packages for every module it loads, including nested
dependencies. A live probe on Pi 1.3.0 loaded an extension whose nested library imported
`pi-tui`; the library's `Text` was the same class as the extension's. Bundling `pi-tui` instead
would duplicate classes and registries, which Pi's package docs warn against.

## Consequences

- Never list `@earendil-works/pi-tui` in `dependencies`; keep the exact version only as a
  development pin.
- `@earendil-works/pi-coding-agent` is not imported at runtime. Its theme, keybindings and UI
  context are typed structurally, so the kit does not depend on the agent's module layout.
- Re-check the probe when Pi changes how it loads extensions.
