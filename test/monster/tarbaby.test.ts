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

void describe('TarbabyMonsterEntity state machine', () => {
  void test('stand and hang states loop on a single frame', () => {
    const states = statesOf(TarbabyMonsterEntity);

    assert.equal(states.tbaby_stand1.keyframe, 'walk1');
    assert.equal(states.tbaby_stand1.nextState, 'tbaby_stand1');
    assert.equal(states.tbaby_hang1.keyframe, 'walk1');
    assert.equal(states.tbaby_hang1.nextState, 'tbaby_hang1');
  });

  void test('jump and fly chains follow the legacy bounce cycle', () => {
    const states = statesOf(TarbabyMonsterEntity);

    assert.equal(states.tbaby_jump6.nextState, 'tbaby_fly1');

    assert.equal(states.tbaby_fly4.nextState, 'tbaby_fly1');
  });

  void test('death sequence terminates after the explosion frame', () => {
    const states = statesOf(TarbabyMonsterEntity);

    assert.equal(states.tbaby_die1.keyframe, 'exp');
    assert.equal(states.tbaby_die1.nextState, 'tbaby_die2');
    assert.equal(states.tbaby_die2.keyframe, 'exp');
    assert.equal(states.tbaby_die2.nextState, null);
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
