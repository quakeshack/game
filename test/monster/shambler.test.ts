import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import Vector from '../../../../shared/Vector.ts';
import type BaseEntity from '../../entity/BaseEntity.ts';
import { createEntityStub, createGameTrace, createInertEdict, createInertGameApi, createMutableEngineApi, type EntityConstructor, type WithMutableEngine } from '../../../../../test/support/entityMocks.ts';

import { statesOf } from '../../../../../test/support/entityStates.ts';

await import('../../GameAPI.ts');

const { default: ShamblerMonsterEntity } = await import('../../entity/monster/Shambler.ts');

ShamblerMonsterEntity._initStates();

/**
 * Create a minimal Shambler fixture for focused behavior tests.
 * @param MonsterClass Monster constructor under test.
 * @returns Monster fixture instance.
 */
function createMonsterFixture<T extends BaseEntity>(MonsterClass: EntityConstructor<T>): WithMutableEngine<T> {
  const edict = createInertEdict();

  const engine = createMutableEngineApi({
    IsLoading() {
      return false;
    },
    PrecacheModel() {},
    PrecacheSound() {},
    ParseQC() {
      return null;
    },
    StartSound() {},
    SpawnEntity() {
      return { entity: null };
    },
    DispatchTempEntityEvent() {},
    eventBus: {
      publish() {},
    },
  });

  const gameAPI = createInertGameApi({
    time: 0,
    skill: 1,
    deathmatch: 0,
    nomonsters: 0,
  }, engine);

  const entity = new MonsterClass(edict, gameAPI).initializeEntity();
  edict.entity = entity;
  entity.origin = new Vector();
  entity.angles = new Vector();
  entity.enemy = null;

  return entity as WithMutableEngine<T>;
}

void describe('ShamblerMonsterEntity state machine', () => {
  void test('melee chains return to the run loop', () => {
    const states = statesOf(ShamblerMonsterEntity);

    assert.equal(states.sham_smash12.nextState, 'sham_run1');

    assert.equal(states.sham_swingl9.nextState, 'sham_run1');
    assert.equal(states.sham_swingr9.nextState, 'sham_run1');
  });

  void test('magic sequence keeps the legacy extra magic3 state and skips directly to magic9', () => {
    const states = statesOf(ShamblerMonsterEntity);

    assert.equal(states.sham_magic1.keyframe, 'magic1');
    assert.equal(states.sham_magic2.keyframe, 'magic2');
    assert.equal(states.sham_magic3.keyframe, 'magic3');
    assert.equal(states.sham_magic3.nextState, 'sham_magic3b');
    assert.equal(states.sham_magic3b.keyframe, 'magic3');
    assert.equal(states.sham_magic3b.nextState, 'sham_magic4');
    assert.equal(states.sham_magic4.keyframe, 'magic4');
    assert.equal(states.sham_magic5.keyframe, 'magic5');
    assert.equal(states.sham_magic6.keyframe, 'magic6');
    assert.equal(states.sham_magic6.nextState, 'sham_magic9');
    assert.equal(states.sham_magic9.keyframe, 'magic9');
    assert.equal(states.sham_magic10.keyframe, 'magic10');
    assert.equal(states.sham_magic11.keyframe, 'magic11');
    assert.equal(states.sham_magic12.keyframe, 'magic12');
    assert.equal(states.sham_magic12.nextState, 'sham_run1');
  });

  void test('pain and death sequences transition correctly', () => {
    const states = statesOf(ShamblerMonsterEntity);

    assert.equal(states.sham_pain6.nextState, 'sham_run1');

    assert.equal(states.sham_death11.nextState, null);
  });
});

void describe('ShamblerMonsterEntity QC fixes', () => {
  void test('castLightning does not replay the boom sound on every pulse', () => {
    const shambler = createMonsterFixture(ShamblerMonsterEntity);
    let soundCalls = 0;
    let beamCalls = 0;

    shambler.enemy = createEntityStub({
      origin: new Vector(64, 0, 0),
    });
    shambler._ai.face = () => {};
    shambler.startSound = () => {
      soundCalls += 1;
    };
    shambler.traceline = () => createGameTrace({
      point: new Vector(64, 0, 0),
    });
    // The beam reaches the engine through the shambler's own damage inflictor.
    shambler.engine.DispatchBeamEvent = () => {
      beamCalls += 1;
    };

    shambler.castLightning();

    assert.equal(soundCalls, 0);
    assert.equal(beamCalls, 1);
  });
});
