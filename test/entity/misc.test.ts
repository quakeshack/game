import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createInertEdict, createInertGameApi, createMutableEngineApi } from '../../../../../test/support/entityMocks.ts';
import { serializableFieldsOf } from '../../../../../test/support/serialization.ts';
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

interface GameOverrides {
  readonly engine?: object;
}

/**
 * Create a minimal mock game API for Misc entity tests.
 * @param overrides Optional engine overrides.
 * @returns Mock game API object.
 */
function createMockGameAPI(overrides: GameOverrides = {}): ReturnType<typeof createInertGameApi> {
  const engine = createMutableEngineApi({
    Lightstyle() {},
    SpawnEntity() {
      return null;
    },
    DispatchTempEntityEvent() {},
    DeterminePointContents() {
      return 0;
    },
    eventBus: {
      publish() {},
    },
    ...overrides.engine,
  });

  return createInertGameApi({
    deathmatch: 0,
    nomonsters: 0,
    serverflags: 0,
    worldspawn: null,
  }, engine);
}

/**
 * Create a fixture for misc_model spawn behavior.
 * @param model Path to the OBJ mesh.
 * @returns Fixture data.
 */
function createMiscModelFixture(model = 'models/test/blocker.obj') {
  const precachedModels: string[] = [];
  const setModelCalls: string[] = [];
  let boundEntity: InstanceType<typeof MiscModelEntity> | null = null;

  const edict = createInertEdict();
  edict.setModel = (modelName: string): void => {
    setModelCalls.push(modelName);
    if (boundEntity !== null) {
      boundEntity.model = modelName;
    }
  };
  const gameAPI = createMockGameAPI({
    engine: {
      IsLoading() {
        return true;
      },
      PrecacheModel(modelName: string): void {
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

  override remove(): void {
    this.removed = true;
  }
}

class TestMonster extends BaseMonster {
  static classname = 'test_misc_monster';

  reachedCorner: InstanceType<typeof PathCornerEntity> | null = null;

  override moveTargetReached(pathCornerEntity: InstanceType<typeof PathCornerEntity>): boolean {
    this.reachedCorner = pathCornerEntity;
    return false;
  }

  spawn(): void {}
}

void describe('Misc entity port', () => {
  void test('IntermissionCameraEntity uses decorated defaults', () => {
    const entity = new IntermissionCameraEntity(null, createMockGameAPI()).initializeEntity();

    assert.ok(serializableFieldsOf(IntermissionCameraEntity)?.includes('mangle'));
    assert.ok(entity.mangle.equalsTo(0, 0, 0));
  });

  void test('LightEntity removes inert lights and toggles targeted styles', () => {
    const styles: Array<{ style: number; value: string }> = [];
    const inert = new LightEntity(null, createMockGameAPI()).initializeEntity();
    let removed = false;
    inert.remove = () => {
      removed = true;
    };
    inert.spawn();
    assert.equal(removed, true);

    const active = new LightEntity(null, createMockGameAPI({
      engine: {
        Lightstyle(style: number, value: string): void {
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
    const modelCalls: string[] = [];
    let madeStatic = 0;
    let spawned = 0;
    let boundEntity: InstanceType<typeof StaticBubbleSpawnerEntity> | null = null;
    const edict = createInertEdict();
    edict.setModel = (modelName: string): void => {
      modelCalls.push(modelName);
      boundEntity!.model = modelName;
    };
    edict.makeStatic = (): void => {
      madeStatic += 1;
    };
    const gameAPI = createMockGameAPI({
      engine: {
        IsLoading() {
          return true;
        },
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
