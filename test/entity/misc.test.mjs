import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { effect, moveType, solid } from '../../Defs.ts';

await import('../../GameAPI.ts');

const { default: BaseEntity } = await import('../../entity/BaseEntity.ts');
const { default: BaseMonster } = await import('../../entity/monster/BaseMonster.ts');
const {
  IntermissionCameraEntity,
  LightEntity,
  MiscModelEntity,
  PathCornerEntity,
  StaticBubbleSpawnerEntity,
} = await import('../../entity/Misc.ts');

/**
 * Create a minimal mock game API for Misc entity tests.
 * @param {object} overrides Optional engine and game overrides.
 * @returns {object} Mock game API object.
 */
function createMockGameAPI(overrides = {}) {
  const engine = {
    IsLoading() {
      return false;
    },
    Lightstyle() {},
    SpawnEntity() {
      return null;
    },
    PrecacheModel() {},
    PrecacheSound() {},
    SpawnAmbientSound() {},
    StartSound() {},
    DispatchTempEntityEvent() {},
    DeterminePointContents() {
      return 0;
    },
    eventBus: {
      publish() {},
    },
    ...overrides.engine,
  };

  return {
    time: 0,
    engine,
    deathmatch: 0,
    nomonsters: 0,
    serverflags: 0,
    worldspawn: overrides.worldspawn ?? null,
    ...overrides,
  };
}

/**
 * Create a fixture for misc_model spawn behavior.
 * @param {string} model Path to the OBJ mesh.
 * @returns {{ entity: MiscModelEntity, precachedModels: string[], setModelCalls: string[] }} Fixture data.
 */
function createMiscModelFixture(model = 'models/test/blocker.obj') {
  const precachedModels = [];
  const setModelCalls = [];
  let boundEntity = null;

  const edict = {
    entity: null,
    freeEdict() {},
    setOrigin() {},
    setModel(modelName) {
      setModelCalls.push(modelName);
      if (boundEntity !== null) {
        boundEntity.model = modelName;
      }
    },
    setMinMaxSize() {},
    walkMove() {
      return false;
    },
    changeYaw() {
      return 0;
    },
    dropToFloor() {
      return true;
    },
    isOnTheFloor() {
      return false;
    },
    makeStatic() {},
    aim() {
      return null;
    },
    moveToGoal() {
      return false;
    },
    isInPXS() {
      return true;
    },
    getNextBestClient() {
      return null;
    },
  };
  const gameAPI = createMockGameAPI({
    engine: {
      IsLoading() {
        return true;
      },
      PrecacheModel(modelName) {
        precachedModels.push(modelName);
      },
    },
  });
  const entity = new MiscModelEntity(edict, gameAPI).initializeEntity();

  boundEntity = entity;
  edict.entity = entity;
  entity.model = model;

  return { entity, precachedModels, setModelCalls };
}

class TestEntity extends BaseEntity {
  static classname = 'test_misc_entity';

  removed = false;

  remove() {
    this.removed = true;
  }
}

class TestMonster extends BaseMonster {
  static classname = 'test_misc_monster';

  reachedCorner = null;

  moveTargetReached(pathCornerEntity) {
    this.reachedCorner = pathCornerEntity;
  }

  spawn() {}
}

void describe('Misc entity port', () => {
  void test('IntermissionCameraEntity uses decorated defaults', () => {
    const entity = new IntermissionCameraEntity(null, createMockGameAPI()).initializeEntity();

    assert.ok(IntermissionCameraEntity.serializableFields.includes('mangle'));
    assert.ok(entity.mangle.equalsTo(0, 0, 0));
  });

  void test('LightEntity removes inert lights and toggles targeted styles', () => {
    const styles = [];
    const inert = new LightEntity(null, createMockGameAPI()).initializeEntity();
    let removed = false;
    inert.remove = () => {
      removed = true;
    };
    inert.spawn();
    assert.equal(removed, true);

    const active = new LightEntity(null, createMockGameAPI({
      engine: {
        Lightstyle(style, value) {
          styles.push({ style, value });
        },
      },
    })).initializeEntity();
    active.targetname = 'target_light';
    active.style = 35;
    active.spawnflags = LightEntity.START_OFF;

    active.spawn();
    active.use(active);

    assert.deepEqual(styles, [
      { style: 35, value: 'a' },
      { style: 35, value: 'm' },
    ]);
  });

  void test('PathCornerEntity only advances idle monsters at their current movetarget', () => {
    const corner = new PathCornerEntity(null, createMockGameAPI()).initializeEntity();
    const otherCorner = new PathCornerEntity(null, createMockGameAPI()).initializeEntity();
    const monster = new TestMonster(null, createMockGameAPI()).initializeEntity();
    corner.equals = (otherEntity) => otherEntity === corner;

    monster.movetarget = otherCorner;
    corner.touch(monster);
    assert.equal(monster.reachedCorner, null);

    monster.movetarget = corner;
    monster.enemy = new TestEntity(null, createMockGameAPI()).initializeEntity();
    corner.touch(monster);
    assert.equal(monster.reachedCorner, null);

    monster.enemy = null;
    corner.touch(monster);
    assert.equal(monster.reachedCorner, corner);
  });

  void test('StaticBubbleSpawnerEntity turns itself into an invisible static entity and spawns nothing', () => {
    const modelCalls = [];
    let madeStatic = 0;
    let spawned = 0;
    let boundEntity = null;
    const edict = {
      entity: null,
      setModel(modelName) {
        modelCalls.push(modelName);
        boundEntity.model = modelName;
      },
      setMinMaxSize() {},
      makeStatic() {
        madeStatic += 1;
      },
    };
    const gameAPI = createMockGameAPI({
      engine: {
        IsLoading() {
          return true;
        },
        PrecacheModel() {},
        SpawnEntity() {
          spawned += 1;
          return null;
        },
      },
    });
    const entity = new StaticBubbleSpawnerEntity(edict, gameAPI).initializeEntity();
    boundEntity = entity;
    edict.entity = entity;

    entity.spawn();

    assert.deepEqual(modelCalls, ['progs/s_bubble.spr']);
    // the model is only there so makeStatic() has one, the spawner itself must not be drawn
    assert.equal((entity.effects & effect.EF_NODRAW) !== 0, true);
    assert.equal(madeStatic, 1);
    assert.equal(spawned, 0);
  });

  void test('MiscModelEntity spawns as a static SOLID_MESH blocker with its configured OBJ model', () => {
    const { entity, precachedModels, setModelCalls } = createMiscModelFixture('models/test/blocker.obj');

    entity.spawn();

    assert.equal(entity.movetype, moveType.MOVETYPE_NONE);
    assert.equal(entity.solid, solid.SOLID_MESH);
    assert.equal(entity.model, 'models/test/blocker.obj');
    assert.deepEqual(precachedModels, ['models/test/blocker.obj']);
    assert.deepEqual(setModelCalls, ['models/test/blocker.obj']);
  });
});
