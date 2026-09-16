# id1 Game Module

This is the `id1` game logic module for QuakeShack — a clean TypeScript reimplementation of
the original Quake 1 game code. It is vendored into the `quakeshack/engine` repo as a git
submodule at `source/game/id1`, but is also its own repo (`game.git`) with its own history.

See `README.md` for the module's architecture, conventions, and core concepts (entities,
serialization, feature flags, spawn parameters, game/frame lifecycle). Follow the parent
`quakeshack/engine` repo's general engine conventions
(`.github/instructions/code-style-guide.instructions.md`,
`.github/instructions/typescript-port.instructions.md`,
`.github/instructions/unit-tests.instructions.md`) when they are available (i.e. when working
inside the full engine checkout); this module does not duplicate them.

Game code here must never import files from the engine directly — only use the public API
exposed by `ServerEngineAPI`/`ClientEngineAPI` (see the engine's
`source-directories.instructions.md`).

## Imported Guidelines

@.github/instructions/game-logic-conventions.instructions.md
