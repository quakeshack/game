import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import Vector from '../../../../shared/Vector.ts';
import type BaseEntity from '../../entity/BaseEntity.ts';
import { createAiStub, createEntityStub, createInertEdict, createInertGameApi, createMutableEngineApi, recordSpawns, type EntityConstructor, type SpawnRequest, type WithMutableEngine } from '../../../../../test/support/entityMocks.ts';

import { statesOf } from '../../../../../test/support/entityStates.ts';
import { serializableFieldsOf } from '../../../../../test/support/serialization.ts';

await import('../../GameAPI.ts');

const { ArmySoldierMonster, ArmyEnforcerMonster } = await import('../../entity/monster/Soldier.ts');
const { DamageInflictor, Laser } = await import('../../entity/Weapons.ts');

ArmySoldierMonster._initStates();
ArmyEnforcerMonster._initStates();

/** A soldier that lets a test read its serialized AI state. */
class TestSoldier extends ArmySoldierMonster {
  get aiState(): unknown {
    return this._aiState;
  }
}

/**
 * Create a soldier-family monster fixture with a minimal mock game API.
 * @param MonsterClass Monster constructor under test.
 * @param gameOverrides Overrides for the mock game API.
 * @returns Fixture state for the spawned monster.
 */
function createMonsterFixture<T extends BaseEntity>(MonsterClass: EntityConstructor<T>, gameOverrides: object = {}) {
  const spawnRequests: SpawnRequest[] = [];
  const edict = createInertEdict();
  const engine = createMutableEngineApi({
    IsLoading() {
      return false;
    },
    ParseQC() {
      return null;
    },
    PrecacheModel() {
    },
    PrecacheSound() {
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

  return { entity: entity as WithMutableEngine<T>, gameAPI, spawnRequests };
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

void describe('ArmySoldierMonster class metadata', () => {
  void test('preserves the legacy serialized AI state field and keeps helpers runtime-only', () => {
    const { entity } = createMonsterFixture(TestSoldier);
    const serialized = entity.serialize();

    assert.deepEqual(serializableFieldsOf(ArmySoldierMonster), ['_aiState']);
    assert.equal(entity.aiState, null);
    assert.ok('_aiState' in serialized);
    assert.ok(!('_damageInflictor' in serialized));
  });

  void test('fire keeps the QuakeC lead target calculation and spread values', (t) => {
    const { entity } = createMonsterFixture(ArmySoldierMonster);
    const shots: Array<{ count: number; direction: Vector; spread: Vector }> = [];
    let faceCalls = 0;

    entity.enemy = createEntityStub({
      origin: new Vector(100, 20, 40),
      velocity: new Vector(15, -10, 0),
    });
    entity._ai = createAiStub({
      face() {
        faceCalls++;
      },
    });
    entity.attackSound = () => {
    };
    t.mock.method(DamageInflictor.prototype, 'fireBullets', (count: number, direction: Vector, spread: Vector) => {
      shots.push({ count, direction: direction.copy(), spread: spread.copy() });
    });

    // The shot is fired by the fourth frame of the attack sequence, which turns to face the enemy first.
    const fireFrame = statesOf(ArmySoldierMonster).army_atk4.handler;
    assert.ok(fireFrame);
    fireFrame.call(entity, entity);

    assert.ok(entity.enemy);
    const expectedDirection = entity.enemy.origin.copy()
      .subtract(entity.enemy.velocity.copy().multiply(0.2))
      .subtract(entity.origin);
    expectedDirection.normalize();

    // One turn by the frame and one by the shot itself.
    assert.equal(faceCalls, 2);
    assert.equal(shots.length, 1);
    assert.equal(shots[0].count, 4);
    assertVectorNear(shots[0].direction, expectedDirection);
    assertVectorNear(shots[0].spread, new Vector(0.1, 0.1, 0));
  });
});

void describe('ArmySoldierMonster state machine', () => {
  void test('attack, pain, and death transitions match the QuakeC flow', () => {
    const states = statesOf(ArmySoldierMonster);

    assert.equal(states.army_atk9.nextState, 'army_run1');
    assert.equal(states.army_pain6.nextState, 'army_run1');
    assert.equal(states.army_painb14.nextState, 'army_run1');
    assert.equal(states.army_painc13.nextState, 'army_run1');
    assert.equal(states.army_die10.nextState, null);
    assert.equal(states.army_cdie11.nextState, null);
  });
});

void describe('ArmyEnforcerMonster class metadata', () => {
  void test('saves nothing beyond the base monster state', () => {
    assert.deepEqual(serializableFieldsOf(ArmyEnforcerMonster), []);
  });
  void test('fire spawns a laser from the muzzle origin and updates movedir', () => {
    const { entity } = createMonsterFixture(ArmyEnforcerMonster);
    let laserOrigin: Vector | null = null;
    const laser = Object.create(Laser.prototype) as InstanceType<typeof Laser>;

    laser.setOrigin = (origin: Vector) => {
      laserOrigin = origin.copy();
    };

    entity.origin = new Vector(10, 20, 30);
    entity.angles = new Vector();
    entity.enemy = createEntityStub({
      origin: new Vector(70, 60, 30),
    });
    const spawnRequests = recordSpawns(entity.engine, laser);

    // The laser is fired by the sixth frame of the attack sequence.
    const fireFrame = statesOf(ArmyEnforcerMonster).enf_atk6.handler;
    assert.ok(fireFrame);
    fireFrame.call(entity, entity);

    assert.ok(entity.enemy);
    const movedir = entity.enemy.origin.copy().subtract(entity.origin);
    movedir.normalize();
    const { forward, right } = entity.angles.angleVectors();
    const expectedOrigin = entity.origin.copy().add(forward.multiply(30)).add(right.multiply(8.5)).add(new Vector(0, 0, 16));

    assert.equal(spawnRequests.length, 1);
    assert.equal(spawnRequests[0].initialData.owner, entity);
    assertVectorNear(entity.movedir, movedir);
    assert.ok(laserOrigin);
    assertVectorNear(laserOrigin, expectedOrigin);
  });
});

void describe('ArmyEnforcerMonster state machine', () => {
  void test('attack and pain sequences transition back to run', () => {
    const states = statesOf(ArmyEnforcerMonster);
    const attackFrames = ['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'attack6', 'attack7', 'attack8', 'attack5', 'attack6', 'attack7', 'attack8', 'attack9', 'attack10'];

    for (let i = 0; i < attackFrames.length; i++) {
      assert.equal(states[`enf_atk${i + 1}`].keyframe, attackFrames[i]);
    }

    assert.equal(states.enf_atk14.nextState, 'enf_run1');
    assert.equal(states.enf_paina4.nextState, 'enf_run1');
    assert.equal(states.enf_painb5.nextState, 'enf_run1');
    assert.equal(states.enf_painc8.nextState, 'enf_run1');
    assert.equal(states.enf_paind19.nextState, 'enf_run1');
  });

  void test('death sequences remain terminal', () => {
    const states = statesOf(ArmyEnforcerMonster);

    assert.equal(states.enf_die14.nextState, 'enf_die14');
    assert.equal(states.enf_fdie11.nextState, 'enf_fdie11');
  });
});
