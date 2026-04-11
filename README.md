# id1 Game Module

In general the game code is completely object-oriented and it has *no global state*, therefore we need to carry around both engine interface as well as game interface. This allows the dedicated server to handle multiple servers at the same time enabling dynamic game lobbies etc. The most global state must be the variables on the `ServerGameAPI` object or on the `WorldspawnEntity`.

This repository provides a clean, modern framework to build Quake mods using JavaScript/ES6 modules.

## Quick Start for Modders

**Want to create a mod?** Here's what you need to know:

1. **Everything is an Entity** - Players, monsters, items, doors, triggers - all extend `BaseEntity`
2. **No Global State** - All game state lives in `ServerGameAPI` or individual entities
3. **Object-Oriented** - Use classes, inheritance, and composition (helper classes)
4. **Type-Safe** - TypeScript with TC39 decorators for serialization
5. **Modern TypeScript** - ES modules, classes, decorators, compiled through esbuild

**Common modding tasks:**

- **Create a new monster** → Extend `BaseMonster` (see `entity/monster/` for examples)
- **Create a new weapon** → Add to `entity/Weapons.ts` and `weaponConfig`
- **Create a new item** → Extend `BaseItemEntity` (see `entity/Items.ts`)
- **Create a new trigger** → Extend `BaseTriggerEntity` (see `entity/Triggers.ts`)
- **Create a custom entity** → Just pick one of the misc entities, they are an easy start.

### Vendored Mod Test Config

If a mod repository is vendored into the engine under `source/game/<mod>`, it should ship a module-root `tsconfig.json` when it wants typed linting for its own tests. The engine lint config intentionally does not try to predict arbitrary mod test folder layouts.

Use `source/game/tsconfig.vendored.json` as the base config and keep the module's `include` list local to that repo. A minimal setup looks like this:

```json
{
  "extends": "../tsconfig.vendored.json",
  "include": [
    "./**/*.mjs",
    "./**/*.cjs",
    "./**/*.ts",
    "./**/*.mts",
    "./**/*.cts",
    "./**/*.d.ts"
  ]
}
```

If the mod depends on another vendored game repo, add that sibling repo to `include` as well. For example, `hellwave` includes `../id1/**` because its tests and game code build on top of the id1 implementation.

**File structure:**
```
source/game/id1/
├── entity/           # All entity classes
│   ├── monster/      # Monster AI and behaviors
│   ├── props/        # Doors, platforms, buttons
│   ├── BaseEntity.ts # Root entity class (decorators)
│   ├── Items.ts
│   ├── Weapons.ts
│   ├── Triggers.ts
│   └── ...
├── helper/           # Helper classes (AI, utilities)
│   └── MiscHelpers.ts # Serializer, decorators, EntityWrapper
├── client/           # Client-side code (HUD, effects)
├── GameAPI.ts        # Server game state and entity registry
└── Defs.ts           # Constants and enums
```

## Game

Right now the id1 GameModule is a clean reimplementation of the Quake game logic.
It might not be perfect though, some idiosyncrasis will be sorted out as part of the code restructuring. Some idiosyncrasis will remain due to compatibility.

During the reimplementation I noticed some bugs/issues within the original Quake game logic that I sorted out. Always trying to keep the actual game play unaffected.

### New Features & Extensions (vs Original QuakeC)

Beyond bugfixes and modernizing the architecture, this port introduces several new gameplay capabilities and modding enhancements out of the box, pushing beyond the limits of vanilla QuakeC:

* **Player Interaction (`+use`)**: Built-in support for a dedicated `+use` (interact) button. Entities can be flagged with `FL_USEABLE`, enabling a Half-Life-style direct player interaction mechanism instead of just relying on proximity triggers (`touch`) or shooting.
* **Custom Blood Colors**: Entities that take damage (`takedamage`) can define custom color indices for their "blood" particles or spray via the `bloodcolor` field (e.g., buttons and doors use `colors.DUST` instead of red blood).
* **Client-Side Game Code Capabilities**: Unlike QuakeC, this port has an entire client-side framework (`ClientGameAPI`) that handles logic like drawing dynamic HUD elements, managing intermission screens, and rendering effects (e.g., screen flashes, decals, or gibbing models) independently of the server.
* **Complex Serialization (`Serializer` + Decorators)**: The game state management supports detailed object serialization via `@entity`/`@serializable` TC39 decorators that automatically track which fields to serialize, going far beyond QuakeC's simple `parm0...15` spawn parameters.
* **Feature Flags**: Built-in toggles (`featureFlags` array in `GameAPI.ts`) to enable modernized physics and gameplay behaviors that alter standard Quake conventions:
  * `improved-gib-physics`: Instead of a simple upward throw, gibs and player heads properly calculate momentum from the incoming impact, resulting in realistic physical forces applied correctly during explosions or deaths. Additionally applies blast momentum realistically to all entities (not just those walking).
  * `correct-ballistic-grenades`: Replaces hard-coded trajectories for Ogre grenades and Zombie gibs. It uses actual physics equations, gravity settings, and travel-time formulas to calculate perfect parabolic arcs towards the target limits.
  * `draw-bullet-hole-decals`: Enables a robust client-side event listener that automatically maps decal sprites (like `gfx/bhole1.png`) to surfaces hit by player bullet/hitscan attacks.

### Serializable Field Decorators

TypeScript entity classes use TC39 decorators to declare which fields are part of the serialized game state (save/load, spawn parameters). Two decorators from `helper/MiscHelpers.ts` work together:

| Decorator | Target | Purpose |
|-|-|-|
| `@serializable` | Field | Marks a class field for serialization |
| `@entity` | Class | Finalizes all `@serializable` fields into a frozen `static serializableFields` array |

**Usage:**

```typescript
import { entity, serializable, Serializer } from '../helper/MiscHelpers.ts';

@entity
class MyMonster extends BaseEntity {
  @serializable health = 100;
  @serializable enemy: BaseEntity | null = null;
  @serializable pausetime = 0;

  // Not decorated → not serialized
  protected readonly _damageHandler = new DamageHandler(this);
}
```

**How it works:**
1. `@serializable` field decorators accumulate field names during class definition.
2. `@entity` class decorator freezes them into `static serializableFields` on the class.
3. At runtime, `collectSerializableFields()` walks the prototype chain and merges fields from every class in the hierarchy — parent fields are included automatically.

**Backward compatibility:** Legacy `.mjs` subclasses can still use `static serializableFields` arrays or the `startFields()`/`endFields()` pattern. A decorated parent and a legacy child work correctly together.

## Client-side Game

Originally, Quake did not support client-side game code. In this project we also move game related logic from the engine to the game code. However, this APIs are not fully specified yet and change as the client-side game code is being ported over from the engine.

## Todos

### General

A couple of things I spotted or I’m unhappy with

* [X] applyBackpack: currentammo not updated --> fixed by the new client code
* [ ] cvars: move game related cvars fully into the GameModule, less game duties on the engine
* [X] BaseEntity: make state definitions static, right now it’s bloating up the memory footprint

### Entities

#### Bugs

* [ ] fix bobbing and moving around when boss monster is killed

### Client-side

* [X] implement a more lean Sbar/HUD
  * [X] implement intermission, finale etc. screens
* [X] move more of the effect handling from the engine to the game code
* [X] implement damage effects (red flash)
* [X] implement powerup effects (quad, invis etc.)
* [ ] handle things like gibbing, bubbles etc. on the client-side only
  * [X] air_bubbles (implemented as `StaticBubbleSpawnerEntity`)
  * [X] GibEntity (implemented in `Player.ts`)
  * [X] MeatSprayEntity (implemented in `monster/BaseMonster.ts`)
* [X] handle screen flashes like bonus flash (`bf`) through events

**Note:** Most client-side entities are implemented. Consider moving more visual-only effects to client-side code.

## Core concepts

### Conventions

RFC 2119 applies.

* Every entity must have a unique classname.
* Every entity class should end with “Entity” in their name.
* Every entity class must not change their `classname` during their lifetime.
* Every entity class must have a `QUAKED` jsdoc.
* The game code must not spawn “naked” entities using `spawn()` and simply setting fields during runtime.
* The game code must not assume internal structures of the engine.
* The game code must not use global variables.
* The game code should not hardcode `classname` when used for spawning entities, the game code should use `ExampleEntity.classname` instead of `'misc_example'`.
* Entity properties starting with `_` are considered protected and must and will not be set by the map loading code. If you intend to modify these properties outside of the class defining it, you must mark with with jsdoc’s `@public` annotation.
* Entity properties intended to be read-only must be annotated with jsdoc’s `@readonly` annotation and should be declared throw a getter without a setter.
* TypeScript entities must declare serializable properties with the `@serializable` field decorator and `@entity` class decorator.
* Legacy JS entities may still declare properties in the `_declareFields()` method.
* Entities must declare assets to be precached in the `_precache()` method only.
* Entities must declare states in the `_initStates()` method only.
* Assets required during run-time must be precached by the `WorldspawnEntity`.
* Numbers related to map units should be formated like this: `1234.5`.
* Do not use private methods. Allow mods to extend and reuse entities by extending the classes.

#### Related Quake Game Porting

* When porting over QuakeC almost verbatim, comments must be copied over as well in order to give context.
* Settings and/or properties that are considered extensions to the original should be prefixed with `qs_`.

### Server Edict

The server keeps a list of things in the world in a structure called an Edict.

Edicts will hold information only relevant to the engine such as position in the world data tree.

Furthermore, an Edict provides many methods to interact with the world and the game engine related to that Edict. See ServerEdict in the engine code.

### Server Entities

An Entity is sitting on top of an Edict. The Entity class will provide logic and keeps track of states. There are also client entities which are not related to these Entity structures.

Entities have a `classname` apart from the JavaScript class name. This classname will be used by the editor to place entities into the world.

However, the engine reads from a set of must be defined properties. `BaseEntity` is defining all of them.

### Core Classes

| Class | Purpose |
|-|-|
| `ServerGameAPI` | Holds the whole server game state. It will be instantiated by the engine’s spawn server code and only lasts exactly one level. The class holds information such as the skill level and exposes methods for engine game updates. Also the engine asks the `ServerGameAPI` to spawn map objects. |
| `ClientGameAPI` | _Not completely designed yet._ It is supposed to handle anything supposed to run on the client side such as HUD, temporary entities, etc. |
| `BaseEntity` |  Every entity derives from this class. It provides all necessary information for the engine to place objects in the world. Also the engine will write back certain information directly into an entity. This class provides _lots_ of helpers such as the state machine, thinking scheduler and also provides core concepts of for instance damage handling. Uses `@entity`/`@serializable` decorators for field serialization. |
| `PlayerEntity` | The player entity not just represents a player in the world, but it also handles impulse commands, weapon interaction, jumping, partially swimming, effects of having certain items. Some logic is outsourced to helper classes such as the `PlayerWeapons` class. |
| `WorldspawnEntity` | Defines the world, but is mainly used to precache resources that can be used from anywhere. |

### Helper Classes

Helper classes extend `EntityWrapper` and are found in `entity/Weapons.ts` and `entity/Subs.ts`.

| Class | Purpose | Location |
|-|-|-|
| `EntityWrapper` | Base wrapper for a `BaseEntity`. Adds shortcuts for engine API and game API instances. All helpers below extend this. | `helper/MiscHelpers.ts` |
| `Sub` | Brings all the `target`/`killtarget`/`targetname` handling to an entity. Also provides movement related helpers. The name is based on the `SUB_CalcMove`, `SUB_UseTargets` etc. prefix from QuakeC. | `entity/Subs.ts` |
| `DamageHandler` | Brings all logic related to receiving and handling damage to an entity. Used by monsters, players, and breakable objects. | `entity/Weapons.ts` |
| `DamageInflictor` | Brings more complex logic related to giving out damage. This is optional - every entity will expose `damage()` to inflict basic damage to another entity. | `entity/Weapons.ts` |
| `Explosions` | A streamlined way to turn any entity into an explosion with proper effects and damage radius. | `entity/Weapons.ts` |

### Base Classes

These base classes make it easy to create new entities with common behaviors:

| Class | Purpose | Location |
|-|-|-|
| `BaseItemEntity` | Allows easily creating entities containing an item or ammo. This base class provides all logic connected to target handling, respawning (multiplayer games), sound effects etc. | `entity/Items.ts` |
| `BaseKeyEntity` | Base for keys. Main differences from items are sounds, regeneration behavior, and keys not being removed after pickup. | `entity/Items.ts` |
| `BaseWeaponEntity` | Weapons are based on items, only the sound is different. | `entity/Items.ts` |
| `BaseAmmoEntity` | Base class for ammunition pickups (shells, nails, rockets, cells). | `entity/Items.ts` |
| `BaseProjectile` | A moving object that will cause something upon impact. Used for spikes, rockets, grenades. | `entity/Weapons.ts` |
| `BaseTriggerEntity` | Convenient base class to make any kind of triggers. | `entity/Triggers.ts` |
| `BaseLightEntity` | Handles anything related to light entities (torches, globes, fluorescent lights, etc.). | `entity/Misc.ts` |
| `BasePropEntity` | Base class to support platforms, doors, trains etc. Provides movement state machine. | `entity/props/BasePropEntity.ts` |
| `BaseDoorEntity` | Base class to handle doors and secret doors with key support and linking. | `entity/props/Doors.ts` |
| `BaseMonster` | Base class for all monsters. Provides AI, damage handling, gibbing, and common monster behaviors. | `entity/monster/BaseMonster.ts` |

### Engine <-> Game

* Access through properties
  * Engine may write to things like `groundentity`, `effects` etc.
  * Engine will read from things like `origin`, `angles` etc.
* Access through methods
  * Engine will communicate with the game through `ServerGameAPI` calling methods like `ClientConnect` and `ClientDisconnect`, but also with entities directly through methods such as `touch` and `think`.
  * Game will communicate mainly through the `ServerEngineAPI` object which is augmented by lots of methods declared on `BaseEntity`.

### Loading the GameModule

**Server-side initialization:**
1. `GameModule.Init` imports the active server game module
2. `ServerGameAPI.Init()` is called (static) - register console variables here
3. When server spawns, `new ServerGameAPI(engineAPI)` is instantiated
4. Map loads, entities spawn via `entityRegistry`

**Client-side initialization:**
1. `CL.Init` imports the client game code
2. `ClientGameAPI.Init()` is called (static) - client-side setup
3. When connecting, `new ClientGameAPI(engineAPI)` is instantiated
4. HUD and effects are initialized


### Porting QuakeC Monsters

When porting monsters from QuakeC to TypeScript, follow these patterns:

#### Standard Monsters (using AI)

Most monsters extend `WalkMonster`, `FlyMonster`, or `SwimMonster` (which all extend `BaseMonster`):

```typescript
import { WalkMonster } from './BaseMonster.ts';
import { entity, serializable } from '../../helper/MiscHelpers.ts';

@entity
export class MyMonster extends WalkMonster {
  static classname = 'monster_mymonster';
  static _health = 100;
  static _size = [new Vector(-16, -16, -24), new Vector(16, 16, 40)];
  static _modelDefault = 'progs/mymonster.mdl';

  @serializable customField = 0;
}
```

Key requirements:
- Use `@entity` on the class and `@serializable` on fields that need to survive save/load
- Use `_defineState()` in `static _initStates()` to define animation states
- Use `_runState('statename')` to transition between states

#### Boss Monsters (no AI, state machine only)

Bosses like Chthon and Shub-Niggurath don't use the standard AI system. They are purely state-machine driven:

```typescript
import BaseEntity from '../BaseEntity.ts';
import BaseMonster from './BaseMonster.ts';
import { entity, serializable } from '../../helper/MiscHelpers.ts';

@entity
export class MyBoss extends BaseMonster {
  static classname = 'monster_myboss';

  @serializable bossPhase = 0;

  // Disable the AI system
  _newEntityAI() {
    return null;
  }

  // Skip AI think but still process scheduled thinks for state machine
  think() {
    BaseEntity.prototype.think.call(this);
  }

  // Custom spawn - don't call _postSpawn() which sets up AI
  spawn() {
    if (this.game.deathmatch) {
      this.remove();
      return;
    }
    this.engine.eventBus.publish('game.monster.spawned', this);
    // Boss starts inactive until triggered via use()
  }
}
```

**Important**: The `think()` override must call `BaseEntity.prototype.think.call(this)` directly (not `super.think()`) to:
- Skip `BaseMonster.think()` which calls `this._ai.think()`
- Still process `_scheduledThinks` which the state machine relies on

#### State Machine Pattern

Define states using `_defineState(stateName, frameId, nextState, callback)`:

```javascript
static _initStates() {
  this._states = {};

  // Simple state
  this._defineState('boss_idle1', 'walk1', 'boss_idle2', function () {});

  // State with callback
  this._defineState('boss_attack1', 'attack1', 'boss_attack2', function () {
    this._bossFace();  // 'this' is the entity instance
  });

  // Looping state (nextState points to itself)
  this._defineState('boss_wait', 'idle1', 'boss_wait', function () {});
}
```

#### Registering New Entities

Add your entity class to `GameAPI.ts`:

```javascript
import { MyBoss } from './entity/monster/MyBoss.ts';

const entityClasses = [
  // ... existing entities
  MyBoss,
];
```

### Spawn Parameters

There’s a way to store information across maps. This is done by Spawn Parameters. Classic Quake uses `SetSpawnParms`, `SetNewParms`, `SetChangeParms, `parm0..15`.

QuakeShack uses a modern spawn-parameter API instead of the classic flow:

* Engine can call:
  * `saveSpawnParameters(): string` for clients
  * `restoreSpawnParameters(data: string)` for clients

That API will allow for more complex serialization/deserialization of spawn parameters.

### Game Lifecycle

A game is limited by a map. Every map starts a new game. The engine may restore saved spawn parameters for the connecting player before the normal client lifecycle continues.

### Frame Lifecyle

The server has to run every edict and it will run every edict, when certain conditions are met (e.g. `nextthink` is due).

#### Server Think

* `ServerGameAPI.StartFrame`
* Server goes over all active entities, for each of them:
  * if it’s a player, it will go the Player Think route instead
  * it will execute physics engine code
  * invoke `entity.think()` afterwards.

##### Player Think

* `ServerGameAPI.PlayerPreThink`
* Server executes the physics engine code.
* `ServerGameAPI.PlayerPostThink`

#### Client Think

* `ClientEntities.think` execute client-side thinking
* `ClientEntities.emit` entity is staged for rendering in this frame

### Client Connect/Disconnect

* Whenever a client connects, the server is calling:
  * Set a new `player` entity, setting `netname` (player name), `colormap`, `team`. (Subject to change)
  * ~~Spawn parameters (`parm0..15`) are copied from client to the game object. (Subject to change)~~
  * Spawn parameters are restored by invoking `restoreSpawnParameters`.
  * `ServerGameAPI.ClientConnect`
  * `ServerGameAPI.PutClientInServer`

* When a client disconnects or drops, the server is calling:
  * `ServerGameAPI.ClientDisconnect`
