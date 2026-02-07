# QuakeJS Game Code

In general the game code is completely object-oriented and it has *no global state*, therefore we need to carry around both engine interface as well as game interface. This allows the dedicated server to handle multiple servers at the same time enabling dynamic game lobbies etc. The most global state must be the variables on the `ServerGameAPI` object or on the `WorldspawnEntity`.

This repository provides a clean, modern framework to build Quake mods using JavaScript/ES6 modules.

## Quick Start for Modders

**Want to create a mod?** Here's what you need to know:

1. **Everything is an Entity** - Players, monsters, items, doors, triggers - all extend `BaseEntity`
2. **No Global State** - All game state lives in `ServerGameAPI` or individual entities
3. **Object-Oriented** - Use classes, inheritance, and composition (helper classes)
4. **Type-Safe** - JSDoc comments provide autocomplete and type checking
5. **Modern JavaScript** - ES6 modules, classes, arrow functions

**Common modding tasks:**

- **Create a new monster** → Extend `BaseMonster` (see `entity/monster/` for examples)
- **Create a new weapon** → Add to `entity/Weapons.mjs` and `weaponConfig`
- **Create a new item** → Extend `BaseItemEntity` (see `entity/Items.mjs`)
- **Create a new trigger** → Extend `BaseTriggerEntity` (see `entity/Triggers.mjs`)
- **Create a custom entity** → Just pick one of the misc entities, they are an easy start.

**File structure:**
```
source/game/id1/
├── entity/           # All entity classes
│   ├── monster/      # Monster AI and behaviors
│   ├── props/        # Doors, platforms, buttons
│   ├── BaseEntity.mjs
│   ├── Items.mjs
│   ├── Weapons.mjs
│   ├── Triggers.mjs
│   └── ...
├── helper/           # Helper classes (AI, utilities)
├── client/           # Client-side code (HUD, effects)
├── GameAPI.mjs       # Server game state and entity registry
└── Defs.mjs          # Constants and enums
```

## Game

Right now QuakeJS is a clean reimplementation of the Quake game logic.
It might not be perfect though, some idiosyncrasis will be sorted out as part of the code restructuring. Some idiosyncrasis will remain due to compatibility.

During the reimplementation I noticed some bugs/issues within the original Quake game logic that I sorted out. Always trying to keep the actual game play unaffected.

## Client-side Game

Originally, Quake did not support client-side game code. In this project we also move game related logic from the engine to the game code. However, this APIs are not fully specified yet and change as the client-side game code is being ported over from the engine.

## Todos

### General

A couple of things I spotted or I’m unhappy with

* [X] applyBackpack: currentammo not updated --> fixed by the new client code
* [ ] cvars: move game related cvars to PR and QuakeJS game, less game duties on the engine
* [X] BaseEntity: make state definitions static, right now it’s bloating up the memory footprint

### Entities

A few NPCs and features from the original game are still missing and yet to be implemented:

* [X] player: Finale screen
* [X] monster_fish
* [X] monster_oldone
* [X] monster_tarbaby
* [X] monster_wizard
* [X] monster_boss
* [X] monster_boss: event_lightning

#### Bugs

* [ ] telefragging moster_oldone does not work? might be a bug over at the engine

**Note:** Most monsters are now implemented! Only the final bosses (`monster_oldone` and `monster_boss`) remain.

### Client-side

* [X] implement a more lean Sbar/HUD
  * [X] implement intermission, finale etc. screens
* [X] move more of the effect handling from the engine to the game code
* [X] implement damage effects (red flash)
* [X] implement powerup effects (quad, invis etc.)
* [ ] handle things like gibbing, bubbles etc. on the client-side only
  * [X] air_bubbles (implemented as `StaticBubbleSpawnerEntity`)
  * [X] GibEntity (implemented in `Player.mjs`)
  * [X] MeatSprayEntity (implemented in `monster/BaseMonster.mjs`)
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
* Entities must declare properties in the `_declareFields()` method only.
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
| `BaseEntity` |  Every entity derives from this class. It provides all necessary information for the engine to place objects in the world. Also the engine will write back certain information directly into an entity. This class provides _lots_ of helpers such as the state machine, thinking scheduler and also provides core concepts of for instance damage handling. |
| `PlayerEntity` | The player entity not just represents a player in the world, but it also handles impulse commands, weapon interaction, jumping, partially swimming, effects of having certain items. Some logic is outsourced to helper classes such as the `PlayerWeapons` class. |
| `WorldspawnEntity` | Defines the world, but is mainly used to precache resources that can be used from anywhere. |

### Helper Classes

Helper classes extend `EntityWrapper` and are found in `entity/Weapons.mjs` and `entity/Subs.mjs`.

| Class | Purpose | Location |
|-|-|-|
| `EntityWrapper` | Base wrapper for a `BaseEntity`. Adds shortcuts for engine API and game API instances. All helpers below extend this. | `helper/MiscHelpers.mjs` |
| `Sub` | Brings all the `target`/`killtarget`/`targetname` handling to an entity. Also provides movement related helpers. The name is based on the `SUB_CalcMove`, `SUB_UseTargets` etc. prefix from QuakeC. | `entity/Subs.mjs` |
| `DamageHandler` | Brings all logic related to receiving and handling damage to an entity. Used by monsters, players, and breakable objects. | `entity/Weapons.mjs` |
| `DamageInflictor` | Brings more complex logic related to giving out damage. This is optional - every entity will expose `damage()` to inflict basic damage to another entity. | `entity/Weapons.mjs` |
| `Explosions` | A streamlined way to turn any entity into an explosion with proper effects and damage radius. | `entity/Weapons.mjs` |

### Base Classes

These base classes make it easy to create new entities with common behaviors:

| Class | Purpose | Location |
|-|-|-|
| `BaseItemEntity` | Allows easily creating entities containing an item or ammo. This base class provides all logic connected to target handling, respawning (multiplayer games), sound effects etc. | `entity/Items.mjs` |
| `BaseKeyEntity` | Base for keys. Main differences from items are sounds, regeneration behavior, and keys not being removed after pickup. | `entity/Items.mjs` |
| `BaseWeaponEntity` | Weapons are based on items, only the sound is different. | `entity/Items.mjs` |
| `BaseAmmoEntity` | Base class for ammunition pickups (shells, nails, rockets, cells). | `entity/Items.mjs` |
| `BaseProjectile` | A moving object that will cause something upon impact. Used for spikes, rockets, grenades. | `entity/Weapons.mjs` |
| `BaseTriggerEntity` | Convenient base class to make any kind of triggers. | `entity/Triggers.mjs` |
| `BaseLightEntity` | Handles anything related to light entities (torches, globes, fluorescent lights, etc.). | `entity/Misc.mjs` |
| `BasePropEntity` | Base class to support platforms, doors, trains etc. Provides movement state machine. | `entity/props/BasePropEntity.mjs` |
| `BaseDoorEntity` | Base class to handle doors and secret doors with key support and linking. | `entity/props/Doors.mjs` |
| `BaseMonster` | Base class for all monsters. Provides AI, damage handling, gibbing, and common monster behaviors. | `entity/monster/BaseMonster.mjs` |

### Engine <-> Game

* Access through properties
  * Engine may write to things like `groundentity`, `effects` etc.
  * Engine will read from things like `origin`, `angles` etc.
* Access through methods
  * Engine will communicate with the game through `ServerGameAPI` calling methods like `ClientConnect` and `ClientDisconnect`, but also with entities directly through methods such as `touch` and `think`.
  * Game will communicate mainly through the `ServerEngineAPI` object which is augmented by lots of methods declared on `BaseEntity`.

### Loading QuakeJS

**Server-side initialization:**
1. `PR.Init` imports the server game code
2. `ServerGameAPI.Init()` is called (static) - register console variables here
3. When server spawns, `new ServerGameAPI(engineAPI)` is instantiated
4. Map loads, entities spawn via `entityRegistry`

**Client-side initialization:**
1. `CL.Init` imports the client game code
2. `ClientGameAPI.Init()` is called (static) - client-side setup
3. When connecting, `new ClientGameAPI(engineAPI)` is instantiated
4. HUD and effects are initialized


### Porting QuakeC Monsters

When porting monsters from QuakeC to JavaScript, follow these patterns:

#### Standard Monsters (using AI)

Most monsters extend `WalkMonster`, `FlyMonster`, or `SwimMonster` (which all extend `BaseMonster`):

```javascript
import { WalkMonster } from './BaseMonster.mjs';

export class MyMonster extends WalkMonster {
  static classname = 'monster_mymonster';
  static _health = 100;
  static _size = [new Vector(-16, -16, -24), new Vector(16, 16, 40)];
  static _modelDefault = 'progs/mymonster.mdl';
}
```

Key requirements:
- Always call `super._declareFields()` at the start of `_declareFields()`
- Use `_defineState()` in `static _initStates()` to define animation states
- Use `_runState('statename')` to transition between states

#### Boss Monsters (no AI, state machine only)

Bosses like Chthon and Shub-Niggurath don't use the standard AI system. They are purely state-machine driven:

```javascript
import BaseEntity from '../BaseEntity.mjs';
import BaseMonster from './BaseMonster.mjs';

export class MyBoss extends BaseMonster {
  static classname = 'monster_myboss';

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

Add your entity class to `GameAPI.mjs`:

```javascript
import { MyBoss } from './entity/monster/MyBoss.mjs';

const entityClasses = [
  // ... existing entities
  MyBoss,
];
```

### Spawn Parameters

There’s a way to store information across maps. This is done by Spawn Parameters. Classic Quake uses `SetSpawnParms`, `SetNewParms`, `SetChangeParms, `parm0..15`.

By enabling the `CAP_SPAWNPARMS_DYNAMIC` flag, the engine will not use the classic API, but a modern API:

* Engine can call:
  * `saveSpawnParameters(): string` for clients
  * `restoreSpawnParameters(data: string)` for clients

That API will allow for more complex serialization/deserialization of spawn parameters.

### Game Lifecycle

A game is limited by a map. Every map starts a new game. The engine may prepare the game state by filling `parm0` to `parm15` and calling `SetSpawnParms`.

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
