# Shared Pi extension code lives in two libraries split by dependency

pi-prompt-recall and pi-capability-exposure needed the same overlay, and other extensions
already duplicate config stores and shortcut lookups. Rather than copying, shared code moves
into libraries. We split them by what they depend on: pi-core-kit (formerly
pi-session-cache) imports only `node:` built-ins and never Pi, and pi-ui-kit needs Pi's TUI as
a host peer. pi-ui-kit may depend on pi-core-kit; pi-core-kit never depends on pi-ui-kit.
ADR 0003 later let pi-core-kit take third-party libraries an ADR justifies; it still never
imports Pi.

## Considered Options

- **Copy the overlay into each extension.** No new repository, but every copy drifts and each
  new component is written again.
- **One library with subpath modules.** One repository and one version, but every UI release
  would bump the pins of cache-only consumers, and "core never imports Pi" would be a
  per-folder convention instead of a property of the package.
- **Adopt @narumitw/pi-tui-kit (0.59–0.66), reviewed after the fact.** MIT, well tested and
  active, but it does not fit this overlay. Its `browse` screen swaps between the list and a
  full-screen detail instead of keeping a preview beside the list. Its search is pi-tui's
  unranked fuzzy filter, which does not fold accents or return highlight ranges. It has no
  header tab strips, its shortcuts end the interaction instead of acting in place under a busy
  guard, and it renders in the editor slot, not an overlay. Every screen must degrade to RPC
  select and input, which rules out a two-pane picker upstream. One maintainer changed its menu
  API contract eight times in eight weeks, and it ships highlight.js and mermaid (about 9 MB) as
  runtime dependencies. We reuse its ideas where they overlap (key hints derived from bindings,
  pi-tui's fuzzy match as the last match tier). For questionnaires, document review or task
  screens, depend on it rather than growing this kit.
- **Split strictly UI versus non-UI.** Non-drawing helpers that call Pi's API would force the
  core to take Pi as a peer and lose its host independence.

## Consequences

- Two repositories, each rendered from standards with its own CI, release-please and Renovate.
- Each library publishes subpath modules and no root entry point, so adding a module never
  changes another module's surface.
- A helper goes in the core only if it needs nothing from Pi; otherwise here, or in the
  extension until a second extension needs it.
