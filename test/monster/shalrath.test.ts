import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import Vector from '../../../../shared/Vector.ts';
import type BaseEntity from '../../entity/BaseEntity.ts';
import { createEntityStub, createInertEdict, createInertGameApi, createMutableEngineApi, type EntityConstructor, recordSpawns, type WithMutableEngine } from '../../../../../test/support/entityMocks.ts';
import { effect } from '../../Defs.ts';

import { statesOf } from '../../../../../test/support/entityStates.ts';

await import('../../GameAPI.ts');

const { default: ShalrathMonsterEntity, ShalrathMissileEntity } = await import('../../entity/monster/Shalrath.ts');

ShalrathMonsterEntity._initStates();

/**
 * Create a minimal Shalrath fixture for focused behavior tests.
 * @param MonsterClass Monster constructor under test.
 * @returns Monster fixture instance.
 */
function createMonsterFixture<T extends BaseEntity>(MonsterClass: EntityConstructor<T>): WithMutableEngine<T> {
  const edict = createInertEdict();
  edict.isFree = () => false;

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
    time: 0,
    skill: 1,
    deathmatch: 0,
    nomonsters: 0,
  }, engine);

  const entity = new MonsterClass(edict, gameAPI).initializeEntity();
  edict.entity = entity;
  entity.origin = new Vector(10, 20, 30);
  entity.angles = new Vector();
  entity.enemy = createEntityStub({
    origin: new Vector(90, 20, 30),
    health: 100,
  });

  return entity as WithMutableEngine<T>;
}

void describe('ShalrathMonsterEntity metadata', () => {
  void test('class metadata matches the original monster', () => {
    assert.equal(ShalrathMonsterEntity.classname, 'monster_shalrath');
    assert.equal(ShalrathMonsterEntity._health, 400);
    assert.equal(ShalrathMonsterEntity._modelDefault, 'progs/shalrath.mdl');
    assert.equal(ShalrathMonsterEntity._modelHead, 'progs/h_shal.mdl');
  });

  void test('size vectors are correct', () => {
    const [mins, maxs] = ShalrathMonsterEntity._size;
    assert.deepEqual([mins[0], mins[1], mins[2]], [-32, -32, -24]);
    assert.deepEqual([maxs[0], maxs[1], maxs[2]], [32, 32, 64]);
  });
});

void describe('ShalrathMonsterEntity state machine', () => {
  void test('walk and run loops match the QuakeC frame counts', () => {
    const states = statesOf(ShalrathMonsterEntity);

    assert.equal(states.shal_stand.keyframe, 'walk1');
    assert.equal(states.shal_stand.nextState, 'shal_stand');

    for (let i = 1; i <= 12; i++) {
      assert.ok(states[`shal_walk${i}`], `missing shal_walk${i}`);
      assert.ok(states[`shal_run${i}`], `missing shal_run${i}`);
    }
    assert.equal(states.shal_walk12.nextState, 'shal_walk1');
    assert.equal(states.shal_run12.nextState, 'shal_run1');
  });

  void test('attack, pain, and death chains keep the original frame counts', () => {
    const states = statesOf(ShalrathMonsterEntity);

    for (let i = 1; i <= 11; i++) {
      assert.equal(states[`shal_attack${i}`].keyframe, `attack${i}`);
    }
    assert.equal(states.shal_attack11.nextState, 'shal_run1');

    for (let i = 1; i <= 5; i++) {
      assert.equal(states[`shal_pain${i}`].keyframe, `pain${i}`);
    }
    assert.equal(states.shal_pain5.nextState, 'shal_run1');

    for (let i = 1; i <= 7; i++) {
      assert.equal(states[`shal_death${i}`].keyframe, `death${i}`);
    }
    assert.equal(states.shal_death7.nextState, null);
  });
});

void describe('ShalrathMonsterEntity QC fixes', () => {
  void test('launchMissile adds muzzleflash, plays attack2, and spawns a missile', () => {
    const shalrath = createMonsterFixture(ShalrathMonsterEntity);
    const spawned = recordSpawns(shalrath.engine);
    const sounds: string[] = [];

    shalrath.startSound = (_channel: number, soundName: string) => {
      sounds.push(soundName);
    };

    shalrath.launchMissile();

    assert.equal((shalrath.effects & effect.EF_MUZZLEFLASH) !== 0, true);
    assert.deepEqual(sounds, ['shalrath/attack2.wav']);
    assert.equal(spawned.length, 1);
    assert.equal(spawned[0].classname, ShalrathMissileEntity.classname);
    assert.equal(spawned[0].initialData.owner, shalrath);
  });

  void test('missile spawn starts above the owner and adds the classic spin', () => {
    const owner = createMonsterFixture(ShalrathMonsterEntity);
    const edict = createInertEdict();

    const missile = new ShalrathMissileEntity(edict, owner.game).initializeEntity();
    edict.entity = missile;
    missile.owner = owner;
    owner.movedir = new Vector(1, 0, 0);

    missile.spawn();

    assert.deepEqual([missile.origin[0], missile.origin[1], missile.origin[2]], [10, 20, 40]);
    assert.deepEqual([missile.avelocity[0], missile.avelocity[1], missile.avelocity[2]], [300, 300, 300]);
    assert.equal(Math.round(missile.velocity.len()), 400);
  });
});
