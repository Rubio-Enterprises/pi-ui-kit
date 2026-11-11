---
status: accepted
date: 2026-10-20
---

# Shared Pi extension code lives in two libraries split by dependency

## Context and Problem Statement

Several extensions need the same Picker, config readers and Shortcut lookup.
One library would couple host-independent consumers to UI releases, while a UI/non-UI split would put non-drawing Pi API helpers in the core.
How should shared code be divided without making the core depend on Pi?

## Considered Options

- Two libraries split by dependency: pi-core-kit stays independent of Pi and pi-ui-kit; pi-ui-kit may depend on the core.
- Copy shared code into each extension: rejected because copies drift and components must be written again.
- One library with subpath modules: rejected because UI releases bump core-only consumers and host independence becomes a folder convention.
- Split UI versus non-UI: rejected because non-drawing Pi API helpers would still require Pi in the core.
- Adopt @narumitw/pi-tui-kit: rejected because its RPC-compatible screens cannot provide this Picker's persistent preview pane and in-place actions in an Overlay.

## Decision Outcome

Chosen option: "Two libraries split by dependency", because independent releases keep the core host-independent without duplicating shared code.

## Consequences

- Good, because core-only consumers avoid Pi dependencies and UI release churn.
- Good, because shared Pickers and helpers no longer drift between extensions.
- Bad, because two repositories need separate CI, releases and dependency updates.
