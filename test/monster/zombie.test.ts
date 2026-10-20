import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import Vector from '../../../../shared/Vector.ts';
import type BaseEntity from '../../entity/BaseEntity.ts';
import { createEntityStub, createInertEdict, createInertGameApi, createMutableEngineApi, type EntityConstructor } from '../../../../../test/support/entityMocks.ts';
import { damage, moveType, solid } from '../../Defs.ts';

import { statesOf } from '../../../../../test/support/entityStates.ts';

await import('../../GameAPI.ts');

const { default: ZombieMonster } = await import('../../entity/monster/Zombie.ts');

ZombieMonster._initStates();

/** A zombie that lets a test replace the animation state machine and run its protected steps. */
class TestZombie extends ZombieMonster {
  stubRunState(handler: (nextState: string | null) => boolean): void {
    this._runState = handler;
  }

  postSpawn(): void {
    this._postSpawn();
  }

  standUp(): void {
    this._standUp();
  }
}

/**
 * Create a minimal Zombie fixture for focused behavior tests.
 * @param MonsterClass Monster constructor under test.
 * @returns Monster fixture instance.
 */
function createMonsterFixture<T extends BaseEntity>(MonsterClass: EntityConstructor<T>) {
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
    eventBus: {
      publish() {},
    },
  });

  const gameAPI = createInertGameApi({
    time: 10,
    skill: 1,
    deathmatch: 0,
    nomonsters: 0,
  }, engine);

  const entity = new MonsterClass(edict, gameAPI).initializeEntity();
  edict.entity = entity;
  entity.origin = new Vector();
  entity.angles = new Vector();
  entity.enemy = createEntityStub({
    origin: new Vector(128, 0, 0),
  });

  return entity;
}

void describe('ZombieMonster metadata', () => {
  void test('class metadata matches the original monster', () => {
    assert.equal(ZombieMonster.classname, 'monster_zombie');
    assert.equal(ZombieMonster._health, 60);
    assert.equal(ZombieMonster._modelDefault, 'progs/zombie.mdl');
    assert.equal(ZombieMonster._modelHead, 'progs/h_zombie.mdl');
  });

  void test('size vectors are correct', () => {
    const [mins, maxs] = ZombieMonster._size;
    assert.deepEqual([mins[0], mins[1], mins[2]], [-16, -16, -24]);
    assert.deepEqual([maxs[0], maxs[1], maxs[2]], [16, 16, 40]);
  });
});

void describe('ZombieMonster state machine', () => {
  void test('stand, walk, and run loops match the QuakeC frame counts', () => {
    const states = statesOf(ZombieMonster);

    for (let i = 1; i <= 15; i++) {
      assert.equal(states[`zombie_stand${i}`].keyframe, `stand${i}`);
    }
    assert.equal(states.zombie_stand15.nextState, 'zombie_stand1');

    for (let i = 1; i <= 19; i++) {
      assert.equal(states[`zombie_walk${i}`].keyframe, `walk${i}`);
    }
    assert.equal(states.zombie_walk19.nextState, 'zombie_walk1');

    for (let i = 1; i <= 18; i++) {
      assert.equal(states[`zombie_run${i}`].keyframe, `run${i}`);
    }
    assert.equal(states.zombie_run18.nextState, 'zombie_run1');
  });

  void test('grenade and pain sequences return to the run loop', () => {
    const states = statesOf(ZombieMonster);

    assert.equal(states.zombie_atta13.nextState, 'zombie_run1');
    assert.equal(states.zombie_attb14.nextState, 'zombie_run1');
    assert.equal(states.zombie_attc12.nextState, 'zombie_run1');

    assert.equal(states.zombie_paina12.nextState, 'zombie_run1');
    assert.equal(states.zombie_painb28.nextState, 'zombie_run1');
    assert.equal(states.zombie_painc18.nextState, 'zombie_run1');
    assert.equal(states.zombie_paind13.nextState, 'zombie_run1');
    assert.equal(states.zombie_paine30.nextState, 'zombie_run1');
  });

  void test('crucified idle loop keeps all six frames', () => {
    const states = statesOf(ZombieMonster);

    for (let i = 1; i <= 6; i++) {
      assert.equal(states[`zombie_cruc${i}`].keyframe, `cruc_${i}`);
    }
    assert.equal(states.zombie_cruc6.nextState, 'zombie_cruc1');
  });
});

void describe('ZombieMonster QC fixes', () => {
  void test('crucified spawn disables damage and collision', () => {
    const zombie = createMonsterFixture(TestZombie);
    let stateName = null;

    zombie.spawnflags = ZombieMonster.SPAWN_CRUCIFIED;
    zombie.stubRunState((nextState: string | null) => {
      stateName = nextState;
      return true;
    });

    zombie.postSpawn();

    assert.equal(zombie.movetype, moveType.MOVETYPE_NONE);
    assert.equal(zombie.takedamage, damage.DAMAGE_NO);
    assert.equal(zombie.solid, solid.SOLID_NOT);
    assert.equal(zombie._damageHandler, null);
    assert.equal(stateName, 'zombie_cruc1');
  });

  void test('major pain hits reset health to 60 and knock the zombie down', () => {
    const zombie = createMonsterFixture(TestZombie);
    let stateName = null;

    zombie.health = 5;
    zombie.stubRunState((nextState: string | null) => {
      stateName = nextState;
      return true;
    });
    zombie._ai.foundTarget = () => {};

    zombie.thinkPain(createEntityStub({ origin: new Vector() }), 25);

    assert.equal(zombie.health, 60);
    assert.equal(zombie.inpain, 2);
    assert.equal(stateName, 'zombie_paine1');
  });

  void test('blocked stand-up retries the paine11 recovery frame', () => {
    const zombie = createMonsterFixture(TestZombie);
    let stateName = null;

    zombie.walkMove = () => false;
    zombie.stubRunState((nextState: string | null) => {
      stateName = nextState;
      return true;
    });
    zombie.startSound = () => {};

    zombie.standUp();

    assert.equal(zombie.health, 60);
    // Only turn back into a slidebox once it's actually safe to move around, otherwise the
    // zombie would get stuck solid inside whatever is blocking it.
    assert.equal(zombie.solid, solid.SOLID_NOT);
    assert.equal(stateName, 'zombie_paine11');
  });

  void test('missile choice keeps the original attack thresholds', () => {
    const zombie = createMonsterFixture(TestZombie);
    const originalRandom = Math.random;
    let stateName = null;

    zombie.stubRunState((nextState: string | null) => {
      stateName = nextState;
      return true;
    });

    try {
      Math.random = () => 0.2;
      zombie.thinkMissile();
      assert.equal(stateName, 'zombie_atta1');

      Math.random = () => 0.5;
      zombie.thinkMissile();
      assert.equal(stateName, 'zombie_attb1');

      Math.random = () => 0.9;
      zombie.thinkMissile();
      assert.equal(stateName, 'zombie_attc1');
    } finally {
      Math.random = originalRandom;
    }
  });
});
