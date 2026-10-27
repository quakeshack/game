# id1 Game Module

This is the `id1` game logic module for QuakeShack: a clean TypeScript reimplementation of the original Quake 1 game code. It is vendored into the `quakeshack/engine` repo as a git submodule at `source/game/id1`, but is also its own repo (`game.git`) with its own history.

`README.md` documents the architecture and core concepts (entities, serialization, feature flags, spawn parameters, game and frame lifecycle). It is long: read the section you need (`grep -n '^#' README.md`), not the whole file. Inside the full engine checkout, follow the parent repo's general conventions (`.github/instructions/code-style-guide.instructions.md`, `typescript-port.instructions.md`, `.claude/rules/unit-tests.md`); this module does not duplicate them.

Game code here must never import files from the engine directly, only the public API exposed by `ServerEngineAPI`/`ClientEngineAPI` (see the engine's `source-directories.instructions.md`).

## Imported Guidelines

@.github/instructions/game-logic-conventions.instructions.md
