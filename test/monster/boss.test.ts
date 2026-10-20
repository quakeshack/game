import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import Vector from '../../../../shared/Vector.ts';
import type BaseEntity from '../../entity/BaseEntity.ts';
import { createEntityStub, createInertEdict, createInertGameApi, createMutableEngineApi, type EntityConstructor, type WithMutableEngine } from '../../../../../test/support/entityMocks.ts';
import { effect, moveType, solid, tentType } from '../../Defs.ts';

import { statesOf } from '../../../../../test/support/entityStates.ts';

await import('../../GameAPI.ts');

const { BossLavaball, BossMonster, EventLightningEntity } = await import('../../entity/monster/Boss.ts');
const { DoorEntity } = await import('../../entity/props/Doors.ts');

const ELECTRODE_STATE_TOP = 0;

BossMonster._initStates();

/** A boss that lets a test replace the animation state machine. */
class TestBoss extends BossMonster {
  stubRunState(handler: (nextState: string | null) => boolean): void {
    this._runState = handler;
  }
}

/**
 * Create a minimal boss fixture for focused behavior tests.
 * @param MonsterClass Monster constructor under test.
 * @param gameOverrides Optional game API overrides.
 * @returns Monster fixture instance.
 */
function createBossFixture<T extends BaseEntity>(MonsterClass: EntityConstructor<T>, gameOverrides: object = {}): WithMutableEngine<T> {
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
    DispatchBeamEvent() {},
    eventBus: {
      publish() {},
    },
  });

  const gameAPI = createInertGameApi({
    time: 3,
    skill: 1,
    deathmatch: 0,
    nomonsters: 0,
    ...gameOverrides,
  }, engine);

  const entity = new MonsterClass(edict, gameAPI).initializeEntity();
  edict.entity = entity;
  entity.origin = new Vector(10, 20, 30);
  entity.angles = new Vector();
  entity.enemy = createEntityStub({
    origin: new Vector(90, 20, 30),
    velocity: new Vector(20, 0, 0),
    health: 100,
  });

  return entity as WithMutableEngine<T>;
}

/**
 * Create a minimal event_lightning fixture.
 * @returns Lightning fixture instance.
 */
function createLightningFixture(): WithMutableEngine<InstanceType<typeof EventLightningEntity>> {
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
    DispatchBeamEvent() {},
    ConsoleWarning() {},
    eventBus: {
      publish() {},
    },
  });

  const gameAPI = createInertGameApi({
    time: 5,
    skill: 1,
    deathmatch: 0,
    nomonsters: 0,
  }, engine);

  const entity = new EventLightningEntity(edict, gameAPI).initializeEntity();
  edict.entity = entity;
  return entity as WithMutableEngine<InstanceType<typeof EventLightningEntity>>;
}

void describe('Boss module metadata', () => {
  void test('exports the boss, lavaball, and lightning classes', () => {
    assert.equal(BossMonster.classname, 'monster_boss');
    assert.equal(BossLavaball.classname, 'monster_boss_lavaball');
    assert.equal(EventLightningEntity.classname, 'event_lightning');
  });
});

void describe('BossMonster state machine', () => {
  void test('rise, idle, missile, and shock loops keep the QuakeC transitions', () => {
    const states = statesOf(BossMonster);

    assert.equal(states.boss_rise17.nextState, 'boss_missile1');
    assert.equal(states.boss_idle31.nextState, 'boss_idle1');
    assert.equal(states.boss_missile23.nextState, 'boss_missile1');
    assert.equal(states.boss_shocka10.nextState, 'boss_missile1');
    assert.equal(states.boss_shockb7.keyframe, 'shockb1');
    assert.equal(states.boss_shockb10.nextState, 'boss_missile1');
    assert.equal(states.boss_shockc10.nextState, 'boss_death1');
    assert.equal(states.boss_death10.nextState, 'boss_death10');
  });
});

void describe('BossMonster QC fixes', () => {
  void test('spawn keeps the boss dormant but mesh-solid until awakened', () => {
    const boss = createBossFixture(TestBoss);
    let published = null;

    boss.engine.eventBus.publish = (eventName: string, entity: unknown) => {
      published = { eventName, entity };
    };

    boss.spawn();

    assert.equal(boss.solid, solid.SOLID_MESH);
    assert.deepEqual(published, { eventName: 'game.monster.spawned', entity: boss });
  });

  void test('use wakes the boss with the skill-scaled health and lava splash', () => {
    const boss = createBossFixture(TestBoss, { skill: 0 });
    let stateName = null;
    const tempEvents: Array<{ eventType: number; origin: Vector }> = [];

    boss.stubRunState((nextState: string | null) => {
      stateName = nextState;
      return true;
    });
    boss.engine.DispatchTempEntityEvent = (eventType: number, origin: Vector) => {
      tempEvents.push({ eventType, origin });
    };

    boss.use(createEntityStub({ classname: 'player', origin: new Vector() }));

    assert.equal(boss.health, 1);
    assert.equal(boss.movetype, moveType.MOVETYPE_STEP);
    assert.equal(boss.solid, solid.SOLID_SLIDEBOX);
    assert.equal(stateName, 'boss_rise1');
    assert.deepEqual(tempEvents, [{ eventType: tentType.TE_LAVASPLASH, origin: boss.origin }]);
  });

  void test('takeLightningDamage steps through the classic shock states', () => {
    const boss = createBossFixture(TestBoss);
    let stateName = null;

    boss.stubRunState((nextState: string | null) => {
      stateName = nextState;
      return true;
    });
    boss.health = 3;

    boss.takeLightningDamage(createEntityStub({ classname: 'player', origin: new Vector() }));
    assert.equal(boss.health, 2);
    assert.equal(stateName, 'boss_shocka1');

    boss.takeLightningDamage(createEntityStub({ classname: 'player', origin: new Vector() }));
    assert.equal(boss.health, 1);
    assert.equal(stateName, 'boss_shockb1');

    boss.takeLightningDamage(createEntityStub({ classname: 'player', origin: new Vector() }));
    assert.equal(boss.health, 0);
    assert.equal(stateName, 'boss_shockc1');
  });
});

void describe('BossLavaball', () => {
  void test('spawn keeps the classic lavaball movement and fullbright effect', () => {
    const boss = createBossFixture(TestBoss);
    const edict = createInertEdict();

    const lavaball = new BossLavaball(edict, boss.game).initializeEntity();
    edict.entity = lavaball;
    lavaball.movedir = new Vector(1, 0, 0);

    lavaball.spawn();

    assert.equal(lavaball.movetype, moveType.MOVETYPE_FLYMISSILE);
    assert.equal(lavaball.solid, solid.SOLID_BBOX);
    assert.equal((lavaball.effects & effect.EF_FULLBRIGHT) !== 0, true);
    assert.deepEqual([lavaball.avelocity[0], lavaball.avelocity[1], lavaball.avelocity[2]], [200, 100, 300]);
    assert.equal(Math.round(lavaball.velocity.len()), 300);
  });
});

void describe('EventLightningEntity', () => {
  void test('fires aligned top electrodes and damages the boss once', () => {
    const lightning = createLightningFixture();
    const beams: Array<{ eventType: number; edictId: number; start: Vector; end: Vector }> = [];
    const sounds: string[] = [];
    const activator = createEntityStub({ classname: 'player', origin: new Vector() });
    let damageCalls = 0;
    const boss = createBossFixture(TestBoss);
    boss.health = 3;

    // Use Object.create so the electrodes pass instanceof DoorEntity checks inside use().
    const electrode1 = Object.create(DoorEntity.prototype) as InstanceType<typeof DoorEntity>;
    electrode1.state = ELECTRODE_STATE_TOP;
    electrode1.nextthink = 0;
    electrode1.mins = new Vector(-16, -16, -16);
    electrode1.maxs = new Vector(16, 16, 16);
    electrode1.absmin = new Vector(0, 0, 40);

    const electrode2 = Object.create(DoorEntity.prototype) as InstanceType<typeof DoorEntity>;
    electrode2.state = ELECTRODE_STATE_TOP;
    electrode2.nextthink = 0;
    electrode2.mins = new Vector(-16, -16, -16);
    electrode2.maxs = new Vector(16, 16, 16);
    electrode2.absmin = new Vector(200, 0, 40);

    boss.takeLightningDamage = (entity: BaseEntity) => {
      damageCalls += 1;
      assert.equal(entity, activator);
    };

    lightning.findAllEntitiesByFieldAndValue = function*(fieldName: string, value: unknown) {
      if (fieldName === 'target' && value === 'lightning') {
        yield electrode1;
        yield electrode2;
      }
    };
    lightning.findFirstEntityByFieldAndValue = (fieldName: string, value: unknown) => {
      if (fieldName === 'classname' && value === BossMonster.classname) {
        return boss;
      }
      return null;
    };
    lightning.engine.DispatchBeamEvent = (eventType: number, edictId: number, start: Vector, end: Vector) => {
      beams.push({ eventType, edictId, start, end });
    };
    lightning.startSound = (_channel: number, soundName: string) => {
      sounds.push(soundName);
    };

    lightning.use(activator);

    assert.equal(lightning.lightning_end, 6);
    assert.equal(electrode1.nextthink, -1);
    assert.equal(electrode2.nextthink, -1);
    assert.deepEqual(sounds, ['misc/power.wav']);
    assert.equal(beams.length, 1);
    assert.equal(beams[0].eventType, tentType.TE_LIGHTNING3);
    assert.equal(damageCalls, 1);
  });
});
