# pi-core-kit may take third-party libraries an ADR justifies; TypeBox is the first

ADR 0001 made pi-core-kit import only `node:` built-ins. Moving five extensions' hand-written
config readers into `pi-core-kit/config-file` raised schema validation: each reader checked its
fields by hand, with its own wording and gaps. We kept the part of the rule that matters (the
core never imports Pi or pi-ui-kit, so it stays host-independent) and relaxed the rest:
pi-core-kit may depend on a third-party library when an ADR here justifies it, and its boundary
test lists every allowed library. The first is TypeBox, for config schemas.

## Considered Options

- **Keep `node:` only and validate by hand.** No dependency, but every extension keeps writing
  and wording its own field checks, which is the duplication this library exists to remove.
- **Zod or Valibot.** Mature and popular, but Pi already ships TypeBox for tool parameters, so
  extension authors know it and its schemas are plain JSON Schema objects.
- **TypeBox as a peer taken from the host.** One copy at run time, but it would tie the core to
  a Pi host again; a pi-core-kit consumer without Pi would have to install it itself.

## Consequences

- `typebox` is a normal `^1` dependency of pi-core-kit. An extension that also uses TypeBox
  shares the copy when the versions are compatible; schemas are plain objects, so a schema from
  one copy checks against another.
- `tests/boundary.test.ts` in pi-core-kit allows `node:`, sibling modules and listed libraries,
  and fails if `package.json` declares anything else. Adding a library means a new ADR plus a
  boundary-test entry.
- Libraries stay justified, not convenient: a library the core takes is one every consumer
  installs.
