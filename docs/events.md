# id1 Events

Events published by the `id1` game module (client and server code under `source/game/id1/`)
through the engine's event bus — `ClientEngineAPI.eventBus`/`ServerEngineAPI.eventBus` on the
side that publishes them. These are game-published events, not engine-published ones; see the
engine's own [docs/events.md](../../../../docs/events.md) for events the engine itself
publishes, and for the event bus mechanism (buses, lifetimes, subscribe/unsubscribe rules).

| Event | Arguments | Description |
| - | - | - |
| hud.showscores | 1. boolean | Published by the `+showscores`/`-showscores` commands (`Q1HUD.Init`). The live HUD instance (any `Q1HUD` subclass) subscribes to update its own scoreboard-visibility flag. |
| game.monster.spawned | 1. entity (`BaseMonster`) | A monster entity finished its post-spawn setup. |
| game.monster.injured | 1. entity (the injured monster), 2. attacker entity, 3. inflictor entity | A monster (`flags & FL_MONSTER`) took non-lethal damage. |
| game.monster.killed | 1. entity (the killed monster), 2. attacker entity | A monster (`flags & FL_MONSTER`) died from damage. |
| game.player.died | 1. player entity, 2. attacker entity (may equal the player on a self-inflicted/environmental death) | A player died. |
| game.secret.found | 1. secret trigger entity, 2. triggering entity | A `trigger_secret` was triggered for the first time. |
| game.secret.spawned | 1. secret trigger entity | A `trigger_secret` was spawned into the level (used for level secret counts). |
