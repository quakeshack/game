## id1 Game Logic Conventions

Rules for entity code in `source/game/id1`, on top of the engine's `typescript-port.instructions.md` (TypeScript conventions). The code is the source of truth; `README.md` explains the architecture and has the long examples (serialization, boss monsters, the state machine, registering entities). `entity/monster/Fish.ts` is the reference for a clean monster.

### Serialization

- Mark saved fields with `@serializable` and the class with `@serializableObject` (`helper/MiscHelpers.ts`). `collectSerializableFields()` walks the constructor chain, so parent fields come along. Components (`_damageHandler`, `_ai`, ...) are plain class fields, not decorated.
- Declare new core fields in the class body, with `@serializable` when they must survive save/load, never in the constructor.
- **Scheduled-think callbacks are serialized** with `toString()` and restored with `new Function()`. Pass a plain `function` that references only `this` and its own parameters. Arrow functions, closures over locals and minified code break the round-trip.
- `assignInitialData` coerces map strings against each field's current runtime type. Extend its type-guard logic for a new case instead of parsing in an entity.
- `clientEntityFields` is a plain `string[]` static naming the fields mirrored to the client (`static clientEntityFields = ['items'];` in `Player.ts`). `BaseEntity` and `EntityClass` declare it as a mutable `string[]`, so a readonly or `keyof`-typed array is not assignable.

### State machine

- States are defined only in `static override _initStates()`, after `this._resetStates()`.
- Use `_defineSequence(prefix, frames, handler, loop)` whenever the frames share a callback (states become `${prefix}1`, `${prefix}2`, ..., the last one loops unless `loop` is `false`). Use the `frameIndex` argument for per-frame behavior, or single `_defineState` calls.
- Annotate callbacks with the concrete entity type, `function (this: FishMonsterEntity) { ... }`: the generic `T` is inferred from it and no cast is needed.
- The model QC stays an inline `static _modelQC` string, parsed at precache time.

### Static members

- Concrete entity classes declare `static classname`, `_health`, `_size`, `_modelDefault`, ... as plain mutable statics: no `readonly`, no `override`, no `as const`.
- `_size` is an explicit mutable tuple, `static _size: [Vector, Vector] = [...]`; `as const` makes it a readonly tuple that the parent's `[Vector | null, Vector | null]` rejects.
- Spawn through the class, `ExampleEntity.classname`, not a hard-coded string.

### `Defs` enums

- `Defs.ts` keeps the original lowercase enum names and fully prefixed members: `dead.DEAD_NO`, `damage.DAMAGE_YES`, `items.IT_SHOTGUN`. Do not shorten or PascalCase them (`Dead.NO` would create a second spelling).
- Bit-flag enums (`items`, `spawnflags`) are regular `enum`s, not `const enum`; keep using `|`, `&`, `~`.
- Enums shared with the engine (`solid`, `moveType`, `flags`, `effect`, `attn`, `channel`, ...) are re-exported through `Defs.ts`. Import them from there, not from `shared/Defs.ts`, and add a new one to the re-export list.

### Components

Helpers that wrap an entity extend `EntityWrapper<T>` (`helper/MiscHelpers.ts`), parameterized on the entity type so `this._entity` needs no cast: `DamageHandler`, `DamageInflictor`, `Explosions`, `Sub` (`entity/Subs.ts`), `EntityAI` (`helper/AI.ts`). Override `_assertEntity()` to validate the wrapped entity's runtime type.

### Pitfalls

- **Edict interface properties cannot use `override`.** `netname`, `classname` and other edict fields live on the engine's `BaseEntity` *interface*, not on a parent class: write a plain `get netname()`.
- **`Vector` is indexed**, `vector[0]`, `[1]`, `[2]`, with no `.x`/`.y`/`.z` and no `Vector.of()`: `new Vector(-16, -16, -24)`.
- **`SpawnEntity<T>`**: pass the concrete class, `this.engine.SpawnEntity<BackpackEntity>(BackpackEntity.classname, {...})?.entity!`, and follow it with `console.assert(backpack instanceof BackpackEntity)`; the engine cannot check the generic. Use `?.` and a guard instead of `!` when the spawn may fail. Never narrow with `as EntityClass | undefined`.

### Tests

Tests are `.test.ts` under `test/`, mirroring the source layout, and are type-checked by the engine repo's `npm run typecheck`: a changed signature fails the build. They use the engine's `test/support/` as their shared kit (inert edicts, engine and game APIs, `statesOf`, `serializableFieldsOf`); see the engine's `.claude/rules/unit-tests.md` (including what earns a test) and its `writing-engine-tests` skill for the mock helpers. A protected member is reached by a one-method subclass of the entity under test, a private one through its public path (a state handler, the engine boundary), not by a cast.

- **Import `GameAPI.ts` first.** Entity files and `GameAPI.ts` import each other; importing one entity directly can invert the evaluation order and raise a TDZ error. Put `await import('../../GameAPI.ts');` at the top level before `await import('../../entity/monster/Fish.ts')` (path relative to `test/<subdir>/`).
- **Call `Entity._initStates()` yourself** in a state-machine test; the registry does it during bootstrap.
- Regression-test serialization (create, serialize, deserialize, compare fields), `assignInitialData` coercion (Vectors, numbers, strings; private fields and functions are rejected) and `_runState` sequences with a small synthetic entity, not a full monster. Entity construction needs a mock `ServerEngineAPI` and `ServerGameAPI`.
- **Test what the entity does, not what it declares.** `classname`, `_health`, `_size`, models and the regular stand/walk/run loops are copied from the QuakeC; a test that repeats them only fails when someone changes them on purpose. Test behavior (pain thresholds, attack choice, spawn flags, what a projectile spawns) and, in the state graph, only what is unusual: a transition into another sequence, a skipped or repeated frame, a death that ends. `_defineSequence` and the serializer are tested once in `test/entity/base-entity.test.ts`.

