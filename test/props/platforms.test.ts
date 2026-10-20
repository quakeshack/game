import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import Vector from '../../../../shared/Vector.ts';
import type { ServerEdict } from '../../../../engine/server/Edict.ts';
import type BaseEntity from '../../entity/BaseEntity.ts';
import type { ScheduledThinkCallback } from '../../entity/BaseEntity.ts';
import type { Sub } from '../../entity/Subs.ts';
import { createInertEdict, createInertEngineApi, createInertGameApi, createSubStub, type CalcMoveCall } from '../../../../../test/support/entityMocks.ts';
import { moveType, solid } from '../../Defs.ts';

await import('../../GameAPI.ts');

const { PathCornerEntity } = await import('../../entity/Misc.ts');
const { PlatformEntity, PlatformTriggerEntity, TrainEntity, TeleportTrainEntity } = await import('../../entity/props/Platforms.ts');
const { state } = await import('../../entity/props/BasePropEntity.ts');

/** A platform whose movement helper a test replaces, which the entity keeps to itself. */
class TestPlatform extends PlatformEntity {
  useSub(sub: Sub): void {
    this._sub = sub;
  }
}

/** A train whose movement helper a test replaces, which the entity keeps to itself. */
class TestTrain extends TrainEntity {
  useSub(sub: Sub): void {
    this._sub = sub;
  }
}

interface SpawnRequest {
  readonly classname: string;
  readonly initialData: object;
}

interface RecordedThink {
  readonly nextThink: number;
  readonly callback: ScheduledThinkCallback;
  readonly identifier: string | null;
}

/**
 * Create a minimal mover harness for platform-family entity tests.
 * @returns Harness data.
 */
function createMoverHarness() {
  const precachedSounds: string[] = [];
  const precachedModels: string[] = [];
  const setModelCalls: Array<string | null> = [];
  const spawnRequests: SpawnRequest[] = [];
  const scheduledThinks: RecordedThink[] = [];
  let boundEntity: BaseEntity | null = null;

  const edict: ServerEdict = createInertEdict();
  edict.setOrigin = (origin: Vector): void => {
    boundEntity?.origin.set(origin);
  };
  edict.setModel = (model: string | null): void => {
    setModelCalls.push(model);
    if (boundEntity !== null) {
      boundEntity.model = model;
      boundEntity.modelindex = model ? 1 : 0;
    }
  };
  edict.setMinMaxSize = (mins: Vector, maxs: Vector): void => {
    if (boundEntity !== null) {
      boundEntity.mins.set(mins);
      boundEntity.maxs.set(maxs);
      boundEntity.size = maxs.copy().subtract(mins);
    }
  };

  const engine = createInertEngineApi({
    PrecacheModel(model: string): void {
      precachedModels.push(model);
    },
    PrecacheSound(sound: string): void {
      precachedSounds.push(sound);
    },
    SpawnEntity(classname: string, initialData: object = {}) {
      spawnRequests.push({ classname, initialData });
      return { entity: null };
    },
  });

  const gameAPI = createInertGameApi({ time: 0 }, engine);

  return {
    edict,
    engine,
    gameAPI,
    precachedSounds,
    precachedModels,
    setModelCalls,
    spawnRequests,
    scheduledThinks,
    bindEntity(entity: BaseEntity): void {
      boundEntity = entity;
      edict.entity = entity;
      entity._scheduleThink = (nextThink, callback, identifier = null) => {
        scheduledThinks.push({ nextThink, callback, identifier });
      };
    },
  };
}

/**
 * Build a platform fixture for focused gameplay tests.
 * @returns Fixture data.
 */
function createPlatformFixture() {
  const harness = createMoverHarness();
  const entity = new TestPlatform(harness.edict, harness.gameAPI).initializeEntity().precacheEntity();
  harness.bindEntity(entity);
  return { entity, ...harness };
}

/**
 * Build a train-family fixture for focused gameplay tests.
 * @param EntityClass Constructor under test.
 * @returns Fixture data.
 */
function createTrainFixture<T extends InstanceType<typeof TrainEntity>>(EntityClass: new (edict: ServerEdict, gameAPI: ReturnType<typeof createInertGameApi>) => T) {
  const harness = createMoverHarness();
  const entity = new EntityClass(harness.edict, harness.gameAPI).initializeEntity().precacheEntity();
  harness.bindEntity(entity);
  return { entity, ...harness };
}

void describe('PlatformEntity', () => {
  void test('spawn applies QC defaults, positions the plat, and spawns its trigger', () => {
    const { entity, spawnRequests, setModelCalls, precachedSounds } = createPlatformFixture();

    entity.origin = new Vector(10, 20, 30);
    entity.model = 'progs/plat.bsp';
    entity.mins = new Vector(-32, -32, 0);
    entity.maxs = new Vector(32, 32, 64);
    entity.size = new Vector(64, 64, 64);

    entity.spawn();

    assert.deepEqual(precachedSounds, ['plats/medplat1.wav', 'plats/medplat2.wav']);
    assert.equal(entity.speed, 150);
    assert.equal(entity.t_length, 80);
    assert.equal(entity.t_width, 10);
    assert.equal(entity.movetype, moveType.MOVETYPE_PUSH);
    assert.equal(entity.solid, solid.SOLID_BSP);
    assert.equal(entity.state, state.STATE_BOTTOM);
    assert.equal(entity.noise, 'plats/medplat1.wav');
    assert.equal(entity.noise1, 'plats/medplat2.wav');
    assert.ok(entity.pos1.equalsTo(10, 20, 30));
    assert.ok(entity.pos2.equalsTo(10, 20, -26));
    assert.ok(entity.origin.equalsTo(10, 20, -26));
    assert.deepEqual(setModelCalls, ['progs/plat.bsp']);
    assert.deepEqual(spawnRequests, [{ classname: PlatformTriggerEntity.classname, initialData: { owner: entity } }]);
  });

  void test('targeted plats only honor the remote use once, matching QC plat_use', () => {
    const { entity } = createPlatformFixture();
    const calcMoveCalls: CalcMoveCall[] = [];

    entity.origin = new Vector();
    entity.model = 'progs/plat_targeted.bsp';
    entity.mins = new Vector(-16, -16, 0);
    entity.maxs = new Vector(16, 16, 32);
    entity.size = new Vector(32, 32, 32);
    entity.targetname = 'remote_plat';
    entity.useSub(createSubStub({
      calcMove(target, speed, callback) {
        calcMoveCalls.push({ target: target.copy(), speed, callback });
      },
    }));

    entity.spawn();
    entity.use(entity);
    entity.state = state.STATE_UP;
    entity.use(entity);

    assert.equal(calcMoveCalls.length, 1);
    assert.equal(entity.state, state.STATE_UP);
  });
});

void describe('TrainEntity', () => {
  void test('finds the first corner, updates target to the next corner, and only activates once when targeted', () => {
    const { entity } = createTrainFixture(TestTrain);
    const calcMoveCalls: CalcMoveCall[] = [];
    const firstCorner = Object.assign(Object.create(PathCornerEntity.prototype) as InstanceType<typeof PathCornerEntity>, {
      origin: new Vector(100, 200, 300),
      target: 'corner_2',
      wait: 0,
    });
    const secondCorner = Object.assign(Object.create(PathCornerEntity.prototype) as InstanceType<typeof PathCornerEntity>, {
      origin: new Vector(400, 500, 600),
      target: 'corner_3',
      wait: 1.5,
    });

    entity.model = 'progs/train.bsp';
    entity.target = 'corner_1';
    entity.targetname = 'remote_train';
    entity.mins = new Vector(-16, -16, -16);
    entity.maxs = new Vector(16, 16, 16);
    entity.size = new Vector(32, 32, 32);
    entity.useSub(createSubStub({
      calcMove(target, speed, callback) {
        calcMoveCalls.push({ target: target.copy(), speed, callback });
      },
    }));
    entity.findFirstEntityByFieldAndValue = (_field, value) => {
      if (value === 'corner_1') {
        return firstCorner;
      }
      if (value === 'corner_2') {
        return secondCorner;
      }
      return null;
    };

    entity.spawn();
    entity._trainFind();

    assert.ok(entity.origin.equalsTo(116, 216, 316));
    assert.equal(entity.target, 'corner_2');

    entity.use(entity);
    entity.use(entity);

    assert.equal(calcMoveCalls.length, 1);
    assert.ok(calcMoveCalls[0].target.equalsTo(416, 516, 616));
    assert.equal(calcMoveCalls[0].speed, 100);
    assert.equal(entity.target, 'corner_3');
    assert.equal(entity.wait, 1.5);
  });
});

void describe('TeleportTrainEntity', () => {
  void test('spawns with the teleport model, no collision, and the initial find think', () => {
    const { entity, setModelCalls, precachedModels, precachedSounds, scheduledThinks } = createTrainFixture(TeleportTrainEntity);

    entity.target = 'tele_corner';
    entity.mins = new Vector(-8, -8, -8);
    entity.maxs = new Vector(8, 8, 8);
    entity.size = new Vector(16, 16, 16);

    entity.spawn();

    assert.deepEqual(precachedSounds, ['misc/null.wav']);
    assert.deepEqual(precachedModels, ['progs/teleport.mdl']);
    assert.deepEqual(setModelCalls, ['progs/teleport.mdl']);
    assert.equal(entity.movetype, moveType.MOVETYPE_PUSH);
    assert.equal(entity.solid, solid.SOLID_NOT);
    assert.ok(entity.avelocity.equalsTo(100, 200, 300));
    assert.equal(scheduledThinks.length, 1);
    assert.equal(scheduledThinks[0].nextThink, 0.1);
  });
});
