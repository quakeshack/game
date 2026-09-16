## id1 Game Logic TypeScript Conventions

This document covers `source/game/id1`'s entity system conventions: field serialization, the
state machine, entity components, and `Defs` enums. It builds on the engine's general
TypeScript guide (`typescript-port.instructions.md`, in the `quakeshack/engine` repo's
`.github/instructions/`) — all rules there still apply here.

**A note on drift:** a few of the conventions below were originally planned slightly
differently than how they actually ended up (e.g. `Defs` enum naming). Where that happened,
the section below describes what the codebase actually does, not the original plan — check
the real source (`Defs.ts`, `BaseEntity.ts`, `entity/monster/Fish.ts`) if something here ever
looks inconsistent with what you see in an editor; the code is the source of truth, this
document is the explanation.

---

### 1. Serializable Fields — `@serializableObject` / `@serializable` Decorators

Entity classes use the `@serializableObject` class decorator and `@serializable` field
decorator from `helper/MiscHelpers.ts`. `@serializable` marks individual fields, and
`@serializableObject` on the class flushes them into a frozen `static serializableFields`
array at class definition time, which `collectSerializableFields()` reads.

```typescript
import { serializableObject, serializable, Serializer } from '../helper/MiscHelpers.ts';

@serializableObject
class BaseMonster extends BaseEntity {
  @serializable health = 100;
  @serializable enemy: BaseEntity | null = null;
  @serializable pausetime = 0;

  // Components are regular class fields — not decorated, not serialized.
  protected readonly _damageHandler = new DamageHandler(this);
}
```

#### How it works

1. `@serializable` field decorators accumulate field names in a module-level array during class definition.
2. `@serializableObject` class decorator freezes those names into a `static serializableFields` property.
3. `collectSerializableFields()` in `MiscHelpers.ts` walks the constructor chain bottom-up and merges every class's `serializableFields` array. Parent fields are included automatically.

```typescript
@serializableObject
class BaseEntity {
  @serializable ltime = 0.0;
  @serializable origin = new Vector();
  // ...
}

@serializableObject
class BaseMonster extends BaseEntity {
  @serializable health = 100;
  @serializable enemy: BaseEntity | null = null;
}

@serializableObject
class ArmySoldierMonster extends BaseMonster {
  @serializable _aiState = 'idle';
}

// At runtime the Serializer sees all three merged: ['ltime', 'origin', ..., 'health', ..., '_aiState']
```

---

### 2. `Object.seal(this)` — Not Used

There is no `Object.seal(this)` anywhere in entity construction. TypeScript's own strict
property checking and exhaustively-declared class fields already catch stray property
additions at compile time — don't add sealing when writing new entities.

---

### 3. State Machine — Typed Animation Sequences

The state machine defines up to ~200 states per monster via `_defineState()`/
`_defineSequence()` calls with string keys, string frame names, string next-state
references, and typed callbacks.

#### 3a. Typed state key union

Where practical, declare a string literal union of an entity's valid state names so
`_defineState`/`_runState` typos are caught at compile time:

```typescript
type SoldierState =
  | 'army_stand1' | 'army_stand2' | 'army_stand3' | 'army_stand4'
  | 'army_stand5' | 'army_stand6' | 'army_stand7' | 'army_stand8'
  | 'army_run1'   | 'army_run2'   | 'army_run3'   | 'army_run4'
  // ...
  | 'army_die1'   | 'army_die2'   | 'army_die3';
```

`BaseEntity._defineState`/`_runState` are generic on the concrete state key so this typing
flows through without casts. Generating the union is straightforward — it's the set of
first-argument strings across all `_defineState` calls for that entity.

#### 3b. Animation sequence helper — `_defineSequence`

`BaseEntity._defineSequence()` generates a numbered sequence of states from a prefix and
frame array:

```typescript
static _defineSequence<T extends BaseEntity>(
  prefix: string,
  frames: readonly (string | number)[],
  handler: ((this: T, frameIndex: number) => void) | null = null,
  loop = true,
): void;
```

The generic `T` is inferred from the callback's `this` annotation, so subclass callbacks get
full type safety without casts. States are named `${prefix}1`, `${prefix}2`, ... with the
last frame looping back to `${prefix}1` by default. Prefer this over a long chain of
individual `_defineState` calls whenever every frame in the sequence shares the same
callback:

```typescript
this._defineSequence('army_stand',
  ['stand1','stand2','stand3','stand4','stand5','stand6','stand7','stand8'],
  function () { this._ai.stand(); });
```

For sequences where individual frames need different behavior (walk speeds, firing on a
specific frame), use the `frameIndex` parameter or fall back to individual `_defineState`
calls:

```typescript
const walkSpeeds = [1,1,1,1,2,3,4,4,2,2,2,1,0,1,1,1,3,3,3,3,2,1,1,1];
this._defineSequence('army_walk',
  Array.from({length: 24}, (_, i) => `prowl_${i + 1}`),
  function (frameIndex) {
    if (frameIndex === 0) { this.idleSound(); }
    this._ai.walk(walkSpeeds[frameIndex]);
  });
```

#### 3c. Model QC — Static parsing only

The `_modelQC` string and `_parseModelData` pattern is a plain static string parsed at
precache time (see `Fish.ts`'s `static _modelQC`). Keeping the raw QC string inline in the TS
source is the established convention — don't move it to a separate asset file unless it
grows unreasonably large.

#### 3d. Callbacks use the concrete entity `this` type

`_defineState` and `_defineSequence` are generic on `T extends BaseEntity` — the `T` is
inferred from the callback's `this` annotation. Annotate callbacks with the concrete entity
type to get full type safety without casts:

```typescript
this._defineSequence('f_stand', swimFrames,
  function (this: FishMonsterEntity) { this._ai.stand(); });

this._defineState('f_death21', 'death21', null,
  function (this: FishMonsterEntity) { this.solid = solid.SOLID_NOT; });
```

The generic is erased at storage time (`handler as ScheduledThinkCallback`) so the untyped
`_states` record remains compatible, while `_runState` dispatches via `.call(this)` on the
real entity instance.

---

### 4. `Defs` Enums

`Defs.ts` defines game-specific enums and re-exports engine-side ones. Each enum keeps its
original (lowercase) type name and full prefixed member names — **don't** shorten or
PascalCase them:

```typescript
export enum dead {
  DEAD_NO = 0,
  DEAD_DYING = 1,
  DEAD_DEAD = 2,
  DEAD_RESPAWNABLE = 3,
}

export enum damage {
  DAMAGE_NO = 0,
  DAMAGE_YES = 1,
  DAMAGE_AIM = 2,
}
```

Usage: `dead.DEAD_NO`, `damage.DAMAGE_YES`, `items.IT_SHOTGUN`. No code in `id1` or
`hellwave` uses shortened names like `Dead.NO` — don't introduce them piecemeal, since that
would create two spellings for the same enum.

#### Bit-flag enums

For `items`, `spawnflags`, and other bitfields, use a regular `enum` (not `const enum`) since
some are iterated at runtime. Continue using bitwise operators (`|`, `&`, `~`) — TS enums
support this.

```typescript
export enum items {
  IT_AXE = 4096,
  IT_SHOTGUN = 1,
  IT_SUPER_SHOTGUN = 2,
  // ...
}

this.items |= items.IT_QUAD;
this.items &= ~(items.IT_ARMOR1 | items.IT_ARMOR2 | items.IT_ARMOR3);
```

#### Engine re-exports

Enums shared with the engine (`solid`, `moveType`, `flags`, `effect`, `attn`, `channel`,
`content`, `hull`, `modelFlags`, `waterlevel`, ...) are imported from `../../shared/Defs.ts`
and **re-exported through `game/id1/Defs.ts`**, so game code has a single import surface
(`import { solid, moveType } from '../Defs.ts';` rather than reaching past it into
`shared/Defs.ts` directly). Add new re-exports to `Defs.ts` the same way rather than having
individual entity files import the shared engine module directly.

---

### 5. Entity Components — Typed Composition

#### `EntityWrapper` base

`helper/MiscHelpers.ts` implements a generic `EntityWrapper<T>`:

```typescript
export class EntityWrapper<T extends BaseEntity = BaseEntity> {
  readonly #entityReference: WeakRef<T>;

  constructor(entity: T) {
    this.#entityReference = new WeakRef(entity);
    this._assertEntity();
  }

  protected get _entity(): T {
    const entity = this.#entityReference.deref();
    console.assert(entity !== undefined, 'EntityWrapper requires a live entity');
    return entity!;
  }

  protected get _game(): ServerGameAPI {
    return this._entity.game;
  }

  protected get _engine(): ServerEngineAPI {
    return this._entity.engine;
  }

  protected _assertEntity(): void {
  }
}
```

`_assertEntity()` is an overridable hook for subclasses that want to validate the wrapped
entity's runtime type (e.g. `instanceof` a narrower base class) at construction time.

#### `DamageHandler` and `DamageInflictor`

Both extend `EntityWrapper`, parameterized on the entity type so `this._entity` resolves
without casts:

```typescript
class DamageHandler extends EntityWrapper<BaseMonster | PlayerEntity> {
  // this._entity is typed — no casts needed for health, thinkPain, etc.
}
```

#### `Sub` (mover helper)

`entity/Subs.ts`'s `Sub` follows the same pattern. Its internal move/use state is typed —
check `Subs.ts` directly for the current field shapes rather than assuming a fixed interface
here, since it has changed shape more than once as movers gained features.

#### `AI` component

Same pattern — `EntityWrapper<BaseMonster>` (see `helper/AI.ts`). The AI methods (`stand`,
`walk`, `run`, `face`, etc.) have proper signatures.

---

### 6. Entity Base Class — Structural Shape

`entity/BaseEntity.ts` declares its fields directly in the class body instead of assigning
them all in the constructor:

```typescript
@serializableObject
export default abstract class BaseEntity {
  public static classname: string;
  public static clientEdictHandler: typeof BaseClientEdictHandler | null = null;
  public static clientEntityFields: string[] = [];

  private static _modelData: Readonly<ParsedQC> | null = null;
  private static _states: Record<string, EntityStateDefinition<BaseEntity>> = {};
  protected static _modelQC: string | null = null;

  public engine: ServerEngineAPI;
  public game: ServerGameAPI;
  protected _edictRef: WeakRef<ServerEdict> | null;
  protected _serializer: Serializer<BaseEntity>;

  protected _damageHandler: DamageHandler | null = null;
  protected _sub: Sub | null = null;

  @serializable ltime = 0.0;
  @serializable origin = new Vector();
  @serializable oldorigin = new Vector();
  // ... remaining fields, all @serializable
}
```

When adding new core fields, add them as class-body declarations (with `@serializable` if
they need to survive save/load), not in the constructor.

#### `clientEntityFields` — Type-safe with `keyof`

When a subclass declares its own `clientEntityFields`, prefer `keyof` over bare strings so
typos and renames are caught at compile time:

```typescript
static readonly clientEntityFields: readonly (keyof PlayerEntity)[] = [
  'items', 'armortype', 'armorvalue', 'health',
];
```

#### `assignInitialData` — Input validation

Map data arrives as strings and is coerced against each field's current runtime type
(`instanceof Vector`, `typeof === 'number'`, etc.) rather than a static schema. When adding
new coercion cases, extend the existing type-guard logic in `BaseEntity` rather than
duplicating parsing per entity subclass.

---

### 7. `ScheduledThink`

```typescript
@serializableObject
class ScheduledThink {
  @serializable nextThink: number;
  @serializable callback: ScheduledThinkCallback;
  @serializable identifier: string | null;
  @serializable isRequired: boolean;

  _serializer: Serializer<ScheduledThink>;
}
```

`ScheduledThink` has its own small `Serializer` instance (not the parent entity's), and its
`callback` field is genuinely serialized as part of an entity's `_scheduledThinks` array —
closures get serialized via `toString()` and deserialized via `new Function()`. This is a
known sharp edge (arrow functions, closures over locals, and minified code all break it). If
you're adding a new scheduled-think call site, keep the callback as a plain `function` (not
an arrow function) referencing only `this` and its own parameters, so it survives the
`toString()`/`new Function()` round-trip.

---

### 8. Entity Registration & Static Members

#### `static classname` and model statics

Concrete entity classes declare these as plain mutable `static` fields — **not**
`readonly`, not `override`, not `as const`. This matches every existing monster/item/prop
(see `entity/monster/Fish.ts`, `entity/monster/Dog.ts`):

```typescript
export default class ArmySoldierMonster extends WalkMonster {
  static classname = 'monster_army';
  static _health = 30;
  static _size: [Vector, Vector] = [new Vector(-16, -16, -24), new Vector(16, 16, 40)];
  static _modelDefault = 'progs/soldier.mdl';
  static _modelHead = 'progs/h_guard.mdl';
}
```

Don't add `readonly`/`as const` to these — it doesn't match the rest of the codebase and
buys nothing here, since these are per-class configuration values, not values ever
reassigned at runtime.

#### `static _states` typing

```typescript
export interface EntityStateDefinition<T extends BaseEntity = BaseEntity> {
  readonly keyframe: string | number | null;
  readonly nextState: string | null;
  readonly handler: ScheduledThinkCallback<T> | null;
}

// On BaseEntity:
private static _states: Record<string, EntityStateDefinition<BaseEntity>> = {};
```

`_states` is populated by `_defineState`/`_defineSequence` inside each class's
`static override _initStates()`.

---

### 9. Unit Test Considerations

- Serialization behavior must be regression-tested: create an entity, serialize, deserialize, assert field equality.
- State machine tests: verify that `_runState` advances through the expected sequence and invokes handlers. Test with a small synthetic entity, not a full monster.
- `assignInitialData`: test that string-to-type coercion works for Vectors, numbers, and strings. Test that private fields and functions are rejected.
- Mock pattern: use `withMockRegistry` as described in the engine's unit test instructions. Entity construction needs a mock `ServerEngineAPI` and `ServerGameAPI`.

---

### 10. Common Pitfalls When Writing Monster Entities

#### 10a. Callback `this` parameter in `_defineSequence` / `_defineState`

`_defineSequence<T>` and `_defineState<T>` are generic — `T` is inferred from the callback's `this` annotation. Always annotate callbacks with the concrete entity type for full type safety:

```typescript
// ✅ Correct — T is inferred as FishMonsterEntity, full autocomplete on this
this._defineSequence('f_stand', swimFrames,
  function (this: FishMonsterEntity) { this._ai.stand(); });
```

The generic is erased when stored in `_states` (`handler as ScheduledThinkCallback`), which is safe because `_runState` always dispatches via `.call(this)` on the concrete entity instance.

#### 10b. Engine edict interface properties cannot use `override`

Properties like `netname`, `classname`, and other edict fields exist on the engine's `BaseEntity` **interface** (defined in `Edict.ts`), not on the game-side `BaseEntity` class. TypeScript `override` only applies to members declared in a parent class. Implementing an interface property is not an override.

```typescript
// ❌ Compile error — netname is not in the class hierarchy
override get netname(): string { return 'a fish'; }

// ✅ Correct — plain getter (implements the interface property)
get netname(): string { return 'a fish'; }
```

#### 10c. Vector uses indexed access, not named properties

The `Vector` class uses `[0]`, `[1]`, `[2]` for component access — **not** `.x`, `.y`, `.z`. There is no `Vector.of()` static factory either.

```typescript
// ❌ Wrong
Vector.of(-16, -16, -24)
vector.x

// ✅ Correct
new Vector(-16, -16, -24)
vector[0]
```

#### 10d. Static `_size` must not use `as const`

The parent class declares `_size` as `[Vector | null, Vector | null]` (a mutable tuple). Using `as const` on the child declaration creates a `readonly` tuple that is not assignable to the mutable parent type.

```typescript
// ❌ Compile error — readonly tuple not assignable to mutable
static _size = [new Vector(-16, -16, -24), new Vector(16, 16, 24)] as const;

// ✅ Correct — explicit mutable tuple type
static _size: [Vector, Vector] = [new Vector(-16, -16, -24), new Vector(16, 16, 24)];
```

#### 10e. ESM circular dependency in tests

Entity `.ts` files import from each other and from `GameAPI.ts`, creating circular module dependencies. In production the entry point (`GameAPI.ts`) evaluates first, establishing all bindings. In tests, importing a specific entity file directly may invert the evaluation order, causing TDZ errors.

**Always `await import('../../GameAPI.ts')` before importing any entity class in tests** (path relative to `test/<subdir>/`):

```javascript
// In test file — must be top-level await
await import('../../GameAPI.ts');
const { default: FishMonsterEntity } = await import('../../entity/monster/Fish.ts');
```

#### 10f. `_initStates` must be called explicitly in tests

The game registry calls `_initStates()` on each entity class during bootstrap. In unit tests without the full registry, call it manually before testing state machine properties:

```javascript
FishMonsterEntity._initStates();
```

#### 10g. Reference entity: Fish.ts

`entity/monster/Fish.ts` serves as a canonical example of a clean monster entity. It demonstrates:

- `@serializableObject` class decorator (no `@serializable` fields needed — Fish has none beyond inherited)
- `_defineSequence` to collapse repetitive state definitions
- Callback `this: FishMonsterEntity` with generic inference (no casts needed)
- Non-looping sequences (`loop = false` for death)
- Override of `_defineState` for terminal frames (attack→run, pain→run, death→null)
- `override` on methods, `protected` on `_newEntityAI` and `hasMeleeAttack`
- `private` on helper methods (`_fishMelee`)

#### 10h. `SpawnEntity<T>` — Generic Entity Spawning

`ServerEngineAPI.SpawnEntity` accepts an optional generic type parameter `T` that narrows the returned edict's `.entity` to the expected entity class. Since TypeScript generics are erased at runtime, the generic is a caller-side assertion — always pair it with a `console.assert(… instanceof …)` to validate at runtime.

```typescript
// ❌ Avoid — manual `as` cast, no runtime check
const backpack = this.engine.SpawnEntity(BackpackEntity.classname, {
  origin: this.origin.copy(),
  regeneration_time: 0,
})?.entity as BackpackEntity | undefined;

backpack?.toss();

// ✅ Prefer — generic + instanceof assert
const backpack = this.engine.SpawnEntity<BackpackEntity>(BackpackEntity.classname, {
  origin: this.origin.copy(),
  regeneration_time: 0,
})?.entity!;

console.assert(backpack instanceof BackpackEntity);

backpack.toss();
```

Key rules:

- **Always pass the concrete entity class** as the generic argument: `SpawnEntity<BackpackEntity>(…)`.
- **Always follow with `console.assert(result instanceof EntityClass)`** — the generic cannot be checked at runtime by the engine, so the call site must verify.
- **Use `!` (non-null assertion) on `.entity`** when the spawn is expected to succeed. If failure is a possibility, use `?.` and guard accordingly.
- **Never use `as EntityClass | undefined`** to narrow the result — prefer the generic parameter instead.
