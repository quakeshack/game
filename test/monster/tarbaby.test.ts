import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import Vector from '../../../../shared/Vector.ts';
import type BaseEntity from '../../entity/BaseEntity.ts';
import { createInertEdict, createInertGameApi, createMutableEngineApi, type EntityConstructor } from '../../../../../test/support/entityMocks.ts';
import { tentType } from '../../Defs.ts';

import { statesOf } from '../../../../../test/support/entityStates.ts';

await import('../../GameAPI.ts');

const { default: TarbabyMonsterEntity } = await import('../../entity/monster/Tarbaby.ts');

TarbabyMonsterEntity._initStates();

/**
 * Create a minimal Tarbaby fixture for focused behavior tests.
 * @param MonsterClass Monster constructor under test.
 * @returns Monster fixture and captured temp events.
 */
function createMonsterFixture<T extends BaseEntity>(MonsterClass: EntityConstructor<T>) {
  const edict = createInertEdict();

  const events: Array<{ eventType: number; origin: Vector }> = [];

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
    DispatchTempEntityEvent(eventType: number, origin: Vector) {
      events.push({ eventType, origin: origin.copy() });
    },
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
  entity.origin = new Vector(10, 20, 30);
  entity.velocity = new Vector(100, 0, 0);

  return { entity, events };
}

void describe('TarbabyMonsterEntity metadata', () => {
  void test('class metadata matches the original monster', () => {
    assert.equal(TarbabyMonsterEntity.classname, 'monster_tarbaby');
    assert.equal(TarbabyMonsterEntity._health, 80);
    assert.equal(TarbabyMonsterEntity._modelDefault, 'progs/tarbaby.mdl');
  });

  void test('size vectors are correct', () => {
    const [mins, maxs] = TarbabyMonsterEntity._size;
    assert.deepEqual([mins[0], mins[1], mins[2]], [-16, -16, -24]);
    assert.deepEqual([maxs[0], maxs[1], maxs[2]], [16, 16, 40]);
  });
});

void describe('TarbabyMonsterEntity state machine', () => {
  void test('stand and hang states loop on a single frame', () => {
    const states = statesOf(TarbabyMonsterEntity);

    assert.equal(states.tbaby_stand1.keyframe, 'walk1');
    assert.equal(states.tbaby_stand1.nextState, 'tbaby_stand1');
    assert.equal(states.tbaby_hang1.keyframe, 'walk1');
    assert.equal(states.tbaby_hang1.nextState, 'tbaby_hang1');
  });

  void test('walk and run loops match the QuakeC frame counts', () => {
    const states = statesOf(TarbabyMonsterEntity);

    for (let i = 1; i <= 25; i++) {
      assert.equal(states[`tbaby_walk${i}`].keyframe, `walk${i}`);
      assert.equal(states[`tbaby_run${i}`].keyframe, `run${i}`);
    }
    assert.equal(states.tbaby_walk25.nextState, 'tbaby_walk1');
    assert.equal(states.tbaby_run25.nextState, 'tbaby_run1');
  });

  void test('jump and fly chains follow the legacy bounce cycle', () => {
    const states = statesOf(TarbabyMonsterEntity);

    for (let i = 1; i <= 6; i++) {
      assert.equal(states[`tbaby_jump${i}`].keyframe, `jump${i}`);
    }
    assert.equal(states.tbaby_jump6.nextState, 'tbaby_fly1');

    for (let i = 1; i <= 4; i++) {
      assert.equal(states[`tbaby_fly${i}`].keyframe, `fly${i}`);
    }
    assert.equal(states.tbaby_fly4.nextState, 'tbaby_fly1');
  });

  void test('death sequence terminates after the explosion frame', () => {
    const states = statesOf(TarbabyMonsterEntity);

    assert.equal(states.tbaby_die1.keyframe, 'exp');
    assert.equal(states.tbaby_die1.nextState, 'tbaby_die2');
    assert.equal(states.tbaby_die2.keyframe, 'exp');
    assert.equal(states.tbaby_die2.nextState, null);
  });

  void test('all tarbaby states currently carry handlers', () => {
    const states = statesOf(TarbabyMonsterEntity);

    for (const name of ['tbaby_stand1', 'tbaby_hang1', 'tbaby_walk1', 'tbaby_walk25', 'tbaby_run1', 'tbaby_run25', 'tbaby_jump5', 'tbaby_jump6', 'tbaby_fly1', 'tbaby_fly4', 'tbaby_die1', 'tbaby_die2']) {
      assert.equal(typeof states[name].handler, 'function', `${name} handler should be a function`);
    }
  });
});

void describe('TarbabyMonsterEntity QC fixes', () => {
  void test('death explosion emits TE_TAREXPLOSION and removes the entity', () => {
    const { entity, events } = createMonsterFixture(TarbabyMonsterEntity);
    let removed = false;

    entity.startSound = () => {};
    entity.remove = () => {
      removed = true;
    };

    // The explosion is the last frame of the death sequence.
    const dieInAnExplosion = statesOf(TarbabyMonsterEntity).tbaby_die2.handler;
    assert.ok(dieInAnExplosion);
    dieInAnExplosion.call(entity, entity);

    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, tentType.TE_TAREXPLOSION);
    assert.equal(removed, true);
  });
});
