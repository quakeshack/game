import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import Vector from '../../../../shared/Vector.ts';
import type BaseEntity from '../../entity/BaseEntity.ts';
import { createInertEdict, createInertGameApi, createMutableEngineApi, recordSpawns, type EntityConstructor, type WithMutableEngine } from '../../../../../test/support/entityMocks.ts';
import { clientEvent, damage, moveType, solid } from '../../Defs.ts';

import { statesOf } from '../../../../../test/support/entityStates.ts';
import { serializableFieldsOf } from '../../../../../test/support/serialization.ts';

await import('../../GameAPI.ts');

const { default: OldOneMonster } = await import('../../entity/monster/OldOne.ts');

OldOneMonster._initStates();

/** An old one that lets a test replace the animation state machine. */
class TestOldOne extends OldOneMonster {
  stubRunState(handler: (nextState: string | null) => boolean): void {
    this._runState = handler;
  }
}

/**
 * Create a minimal OldOne fixture for focused behavior tests.
 * @param MonsterClass Monster constructor under test.
 * @param gameOverrides Optional game API overrides.
 * @returns Monster fixture instance.
 */
function createMonsterFixture<T extends BaseEntity>(MonsterClass: EntityConstructor<T>, gameOverrides: object = {}): WithMutableEngine<T> {
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
    FindByFieldAndValue() {
      return null;
    },
    FindAllByFieldAndValue() {
      return [];
    },
    DispatchTempEntityEvent() {},
    Lightstyle() {},
    PlayTrack() {},
    eventBus: {
      publish() {},
    },
  });

  const gameAPI = createInertGameApi({
    time: 10,
    deathmatch: 0,
    nomonsters: 0,
    intermission_running: 0,
    intermission_exittime: 0,
    ...gameOverrides,
  }, engine);

  const entity = new MonsterClass(edict, gameAPI).initializeEntity();
  edict.entity = entity;
  entity.origin = new Vector(10, 20, 30);
  entity.angles = new Vector();

  return entity;
}

void describe('OldOneMonster metadata', () => {
  void test('class metadata matches the original monster', () => {
    assert.equal(OldOneMonster.classname, 'monster_oldone');
    assert.equal(OldOneMonster._modelDefault, 'progs/oldone.mdl');
    assert.ok(Array.isArray(serializableFieldsOf(OldOneMonster)));
    assert.ok(Object.isFrozen(serializableFieldsOf(OldOneMonster)));
  });

  void test('thrash light levels preserve the QuakeC sequence', () => {
    assert.deepEqual(OldOneMonster._thrashLightLevels, ['m', 'k', 'k', 'i', 'g', 'e', 'c', 'a', 'c', 'e', 'g', 'i', 'k', 'm', 'm', 'g', 'c', 'b', 'a', 'a']);
  });
});

void describe('OldOneMonster state machine', () => {
  void test('idle sequence keeps all 46 frames and loops', () => {
    const states = statesOf(OldOneMonster);

    for (let i = 1; i <= 46; i++) {
      assert.equal(states[`old_idle${i}`].keyframe, `old${i}`);
    }
    assert.equal(states.old_idle46.nextState, 'old_idle1');
  });

  void test('thrash sequence keeps the duplicate shake12 frame and terminal loop', () => {
    const states = statesOf(OldOneMonster);

    for (let i = 1; i <= 11; i++) {
      assert.equal(states[`old_thrash${i}`].keyframe, `shake${i}`);
    }
    assert.equal(states.old_thrash12.keyframe, 'shake12');
    assert.equal(states.old_thrash13.keyframe, 'shake13');
    assert.equal(states.old_thrash20.keyframe, 'shake20');
    assert.equal(states.old_thrash20.nextState, 'old_thrash20');
  });
});

void describe('OldOneMonster QC fixes', () => {
  void test('pain resets health so only the telefrag finale can kill the boss', () => {
    const oldOne = createMonsterFixture(TestOldOne);

    oldOne.health = 1;
    oldOne.thinkPain();

    assert.equal(oldOne.health, 40000);
  });

  void test('thrash15 restarts the cycle until the third pass', () => {
    const oldOne = createMonsterFixture(TestOldOne);
    const lightStyles: string[] = [];
    let stateName = null;

    oldOne.engine.Lightstyle = (_style: number, level: string) => {
      lightStyles.push(level);
    };
    oldOne.stubRunState((nextState: string | null) => {
      stateName = nextState;
      return true;
    });

    oldOne._thrash15Callback();
    assert.equal(oldOne.cnt, 1);
    assert.deepEqual(lightStyles, ['m']);
    assert.equal(stateName, 'old_thrash1');

    stateName = null;
    oldOne.cnt = 2;
    oldOne._thrash15Callback();
    assert.equal(oldOne.cnt, 3);
    assert.equal(stateName, null);
  });

  void test('spawn sets the classic boss bounds and telefrag-only health', () => {
    const oldOne = createMonsterFixture(TestOldOne);
    let stateName = null;
    let published = null;

    oldOne.stubRunState((nextState: string | null) => {
      stateName = nextState;
      return true;
    });
    oldOne.engine.eventBus.publish = (eventName: string, entity: unknown) => {
      published = { eventName, entity };
    };

    oldOne.spawn();

    assert.equal(oldOne.movetype, moveType.MOVETYPE_STEP);
    assert.equal(oldOne.solid, solid.SOLID_MESH);
    assert.equal(oldOne.health, 40000);
    assert.equal(oldOne.takedamage, damage.DAMAGE_YES);
    assert.equal(stateName, 'old_idle1');
    assert.deepEqual(published, { eventName: 'game.monster.spawned', entity: oldOne });
  });

  void test('finale4 tolerates a stand-in edict without an entity', () => {
    const oldOne = createMonsterFixture(TestOldOne);
    let playTrack: number | null = null;
    const lightStyles: string[] = [];
    let removed = false;
    const gibEvents: Array<{ eventCode: clientEvent; model: string; origin: Vector; velocity: Vector }> = [];

    oldOne.engine.BroadcastClientEvent = (_expedited: boolean, eventCode: clientEvent, model: string, origin: Vector, velocity: Vector) => {
      gibEvents.push({ eventCode, model, origin, velocity });
    };
    recordSpawns(oldOne.engine);
    oldOne.engine.PlayTrack = (track: number) => {
      playTrack = track;
    };
    oldOne.engine.Lightstyle = (_style: number, level: string) => {
      lightStyles.push(level);
    };
    oldOne.remove = () => {
      removed = true;
    };

    assert.doesNotThrow(() => {
      oldOne._finale4();
    });

    assert.equal(playTrack, 3);
    assert.deepEqual(lightStyles, ['m']);
    assert.equal(removed, true);

    assert.ok(gibEvents.length > 0);
    assert.ok(gibEvents.every((event) => event.eventCode === clientEvent.EMIT_GIB));
    assert.ok(gibEvents.every((event) => /^progs\/gib[123]\.mdl$/.test(event.model)));
    // every gib gets its own origin snapshot, not a reference to the monster's moving origin
    assert.ok(new Set(gibEvents.map((event) => event.origin.toString())).size > 1);
  });
});
