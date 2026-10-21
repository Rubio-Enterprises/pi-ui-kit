# Shared Pi extension code lives in two libraries split by dependency

pi-prompt-recall and pi-capability-exposure needed the same overlay, and other extensions
already duplicate config stores and shortcut lookups. Rather than copying, shared code moves
into libraries. We split them by what they depend on: pi-core-kit (formerly
pi-session-cache) imports only `node:` built-ins and never Pi, and pi-ui-kit needs Pi's TUI as
a host peer. pi-ui-kit may depend on pi-core-kit; pi-core-kit never depends on pi-ui-kit.

## Considered Options

- **Copy the overlay into each extension.** No new repository, but every copy drifts and each
  new component is written again.
- **One library with subpath modules.** One repository and one version, but every UI release
  would bump the pins of cache-only consumers, and "core never imports Pi" would be a
  per-folder convention instead of a property of the package.
- **Split strictly UI versus non-UI.** Non-drawing helpers that call Pi's API would force the
  core to take Pi as a peer and lose its host independence.

## Consequences

- Two repositories, each rendered from standards with its own CI, release-please and Renovate.
- Each library publishes subpath modules and no root entry point, so adding a module never
  changes another module's surface.
- A helper goes in the core only if it needs nothing from Pi; otherwise here, or in the
  extension until a second extension needs it.
