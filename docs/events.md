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
| game.monster.killed | 1. entity (the killed monster), 2. attacker entity (a boss with no enemy is its own killer) | A monster (`flags & FL_MONSTER`) died from damage. |
| game.player.died | 1. player entity, 2. attacker entity (may equal the player on a self-inflicted/environmental death) | A player died. |
| game.secret.found | 1. secret trigger entity, 2. triggering entity | A `trigger_secret` was triggered for the first time. |
| game.secret.spawned | 1. secret trigger entity | A `trigger_secret` was spawned into the level (used for level secret counts). |

## Client events

The server sends these with `BroadcastClientEvent`/`DispatchClientEvent`; the client game republishes each as
`client.event-received.<opcode>` on `ClientEngineAPI.eventBus` (`ClientGameAPI.handleClientEvent`). The opcodes are the
`clientEvent` enum in `Defs.ts`, their arguments are declared by `Id1ClientEventArguments` in `Events.ts`, and
`clientEventName(opcode)` builds the topic. Opcodes above 100 are for modules built on top of id1 (see
[`hellwave` events](../../hellwave/docs/events.md)).

| Event | Arguments | Description |
| - | - | - |
| client.event-received.1 | - | `BONUS_FLASH`: a brief HUD bonus flash. |
| client.event-received.2 | - | `DAMAGE_FLASH`: HUD damage flash. Deprecated, `DAMAGE_RECEIVED` replaces it. |
| client.event-received.3 | 1. slot (string), 2. value | `STATS_UPDATED`: a stat of the level changed (monsters killed, secrets found). |
| client.event-received.4 | 1. slot (string), 2. value | `STATS_INIT`: a stat was initialized, sent to a client that joined. |
| client.event-received.5 | 1. item entity or `null`, 2. item names, 3. `netname` or `null`, 4. picked-up item bits | `ITEM_PICKED`: the player picked an item up. |
| client.event-received.6 | 1. weapon | `WEAPON_SELECTED`: the active weapon changed. |
| client.event-received.7 | 1. victim edict id or `null`, 2. attacker edict id or `null`, 3. weapon, 4. items | `OBITUARY`: a player was killed. The HUD does not show it yet. |
| client.event-received.8 | 1. message or `null`, 2. origin, 3. angles | `INTERMISSION_START`: the intermission starts. |
| client.event-received.9 | 1. origin, 2. normal, 3. decal (`decals`) | `EMIT_DECAL`: place a decal. |
| client.event-received.10 | 1. message, 2. color, 3. duration in seconds | `HUD_MESSAGE`: an arbitrary HUD message. |
| client.event-received.11 | 1. damage received, 2. armor lost, 3. attack origin | `DAMAGE_RECEIVED`: damage received. |
| client.event-received.12 | 1. model, 2. origin, 3. velocity | `EMIT_GIB`: launch a client-only gib. |
| client.event-received.13 | 1. origin, 2. count | `EMIT_BUBBLES`: release a burst of client-only bubbles. |
| client.event-received.254 | any | `TEST_EVENT`: a test hook. |

