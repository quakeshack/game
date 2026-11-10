import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import Vector from '../../../../shared/Vector.ts';
import type BaseEntity from '../../entity/BaseEntity.ts';
import { createEntityStub, createInertEdict, createInertGameApi, createMutableEngineApi, type EntityConstructor, type SpawnRequest } from '../../../../../test/support/entityMocks.ts';

import { statesOf } from '../../../../../test/support/entityStates.ts';

await import('../../GameAPI.ts');

const { channel } = await import('../../Defs.ts');
const { HellKnightMonster, KnightMonster, KnightSpike } = await import('../../entity/monster/Knights.ts');

KnightMonster._initStates();
HellKnightMonster._initStates();

/** A knight that lets a test replace the animation state machine. */
class TestKnight extends KnightMonster {
  stubRunState(handler: (nextState: string | null) => boolean): void {
    this._runState = handler;
  }
}

/**
 * Create a knight-family monster fixture with a minimal mock game API.
 * @param MonsterClass Monster constructor under test.
 * @param gameOverrides Overrides for the mock game API.
 * @returns Fixture state for the spawned monster.
 */
function createMonsterFixture<T extends BaseEntity>(MonsterClass: EntityConstructor<T>, gameOverrides: object = {}) {
  const soundCalls: unknown[][] = [];
  const spawnRequests: SpawnRequest[] = [];
  const edict = createInertEdict();
  const engine = createMutableEngineApi({
    IsLoading() {
      return false;
    },
    ParseQC() {
      return null;
    },
    PrecacheSound() {
    },
    PrecacheModel() {
    },
    SpawnEntity(classname: string, initialData: Record<string, unknown> = {}) {
      spawnRequests.push({ classname, initialData });
      return { entity: null };
    },
    DispatchTempEntityEvent() {
    },
    FindByFieldAndValue() {
      return null;
    },
    FindAllByFieldAndValue() {
      return [];
    },
    eventBus: {
      publish() {
      },
    },
  });
  const gameAPI = createInertGameApi({
    time: 10,
    skill: 1,
    deathmatch: 0,
    nomonsters: 0,
    gravity: 800,
    hasFeature() {
      return false;
    },
    ...gameOverrides,
  }, engine);

  const entity = new MonsterClass(edict, gameAPI).initializeEntity();
  edict.entity = entity;
  entity.origin = new Vector();
  entity.view_ofs = new Vector();
  entity.movedir = new Vector();
  entity.startSound = (...args: unknown[]) => {
    soundCalls.push(args);
  };

  return { entity, gameAPI, soundCalls, spawnRequests };
}

/**
 * Assert that two vectors are equal within a tolerance.
 * @param actual Actual vector.
 * @param expected Expected vector.
 * @param epsilon Allowed floating-point tolerance.
 */
function assertVectorNear(actual: Vector, expected: Vector, epsilon = 1e-6): void {
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(actual[i] - expected[i]) <= epsilon, `component ${i} mismatch: ${actual[i]} !== ${expected[i]}`);
  }
}

void describe('KnightMonster state machine', () => {
  void test('combat and death chains return or terminate correctly', () => {
    const states = statesOf(KnightMonster);

    assert.equal(states.knight_runatk11.nextState, 'knight_run1');
    assert.equal(states.knight_atk10.nextState, 'knight_run1');
    assert.equal(states.knight_pain3.nextState, 'knight_run1');
    assert.equal(states.knight_painb11.nextState, 'knight_run1');
    assert.equal(states.knight_die10.nextState, null);
    assert.equal(states.knight_dieb11.nextState, null);
  });

  void test('bow states keep the kneel loop and return to walking', () => {
    const states = statesOf(KnightMonster);

    assert.equal(states.knight_bow5.nextState, 'knight_bow5');
    assert.equal(states.knight_bow10.nextState, 'knight_walk1');
  });

  void test('thinkMelee keeps the legacy distance split between melee and run attack', () => {
    const { entity } = createMonsterFixture(TestKnight);
    const runStates: Array<string | null> = [];

    entity.stubRunState((state) => {
      runStates.push(state);
      return true;
    });

    entity.enemy = createEntityStub({
      origin: new Vector(60, 0, 0),
      view_ofs: new Vector(),
    });
    entity.thinkMelee();

    entity.enemy = createEntityStub({
      origin: new Vector(120, 0, 0),
      view_ofs: new Vector(),
    });
    entity.thinkMelee();

    entity.enemy = null;
    entity.thinkMelee();

    assert.deepEqual(runStates, ['knight_atk1', 'knight_runatk1', 'knight_atk1']);
  });
});

void describe('HellKnightMonster state machine', () => {
  void test('missile and charge chains return as expected', () => {
    const states = statesOf(HellKnightMonster);

    assert.equal(states.hknight_magica14.nextState, 'hknight_run1');
    assert.equal(states.hknight_magicb13.nextState, 'hknight_run1');
    assert.equal(states.hknight_magicc11.nextState, 'hknight_run1');
    assert.equal(states.hknight_char_a16.nextState, 'hknight_run1');
    assert.equal(states.hknight_char_b6.nextState, 'hknight_char_b1');
    assert.equal(states.hknight_slice10.nextState, 'hknight_run1');
    assert.equal(states.hknight_smash11.nextState, 'hknight_run1');
    assert.equal(states.hknight_watk22.nextState, 'hknight_run1');
  });

  void test('death chains terminate correctly', () => {
    const states = statesOf(HellKnightMonster);

    assert.equal(states.hknight_die12.nextState, null);
    assert.equal(states.hknight_dieb9.nextState, null);
  });

  void test('attackShot preserves the projectile spawn contract and aimed movedir', () => {
    const { entity, soundCalls, spawnRequests } = createMonsterFixture(HellKnightMonster);
    const originalRandom = Math.random;

    entity.origin = new Vector(5, -10, 20);
    entity.enemy = createEntityStub({
      origin: new Vector(45, 10, 20),
    });

    Math.random = () => 0.5;

    try {
      entity.attackShot(2);
    } finally {
      Math.random = originalRandom;
    }

    assert.ok(entity.enemy);
    const offsetAngles = entity.enemy.origin.copy().subtract(entity.origin).toAngles();
    offsetAngles[1] += 12;
    const { forward } = offsetAngles.angleVectors();
    forward.normalize();
    forward[2] = -forward[2];

    assert.equal(spawnRequests.length, 1);
    assert.equal(spawnRequests[0].classname, KnightSpike.classname);
    assert.equal(spawnRequests[0].initialData.speed, 300);
    assert.equal(spawnRequests[0].initialData.owner, entity);
    assert.equal(soundCalls.length, 1);
    assert.deepEqual(soundCalls[0].slice(0, 2), [channel.CHAN_WEAPON, 'hknight/attack1.wav']);
    assertVectorNear(entity.movedir, forward);
  });
});
