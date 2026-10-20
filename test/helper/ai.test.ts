import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import Vector from '../../../../shared/Vector.ts';
import { createGameTrace, createInertEdict, createInertGameApi, createMutableEngineApi, type MutableEngineApi } from '../../../../../test/support/entityMocks.ts';

import { flags, items, worldType } from '../../Defs.ts';

await import('../../GameAPI.ts');
const { QuakeEntityAI } = await import('../../helper/AI.ts');
const { default: OgreEntity } = await import('../../entity/monster/Ogre.ts');
const { PlayerEntity } = await import('../../entity/Player.ts');

/** A monster whose scheduled thinks are recorded instead of queued. */
type ObservedMonster = InstanceType<typeof OgreEntity> & { _scheduledThinkArgs: unknown[]; engine: MutableEngineApi };

/**
 * The AI a monster thinks with.
 * @param monster The monster.
 * @returns Its Quake AI.
 */
function aiOf(monster: ObservedMonster): InstanceType<typeof QuakeEntityAI> {
  assert.ok(monster._ai instanceof QuakeEntityAI);
  return monster._ai;
}

/**
 * Create the minimal engine surface required by the AI harness.
 * @returns Mock engine API, with the members a test replaces writable.
 */
function createMockEngine(): MutableEngineApi {
  return createMutableEngineApi({
    GetPHS() {
      return null;
    },
    GetAreaForPoint() {
      return 0;
    },
    AreasConnected() {
      return true;
    },
    NavigateAsync() {
      return Promise.resolve(null);
    },
    ConsoleDebug() {},
    eventBus: {
      publish() {},
    },
  });
}

/**
 * Create shared game-wide AI state for the harness.
 * @returns Mock game AI state.
 */
function createMockGameAI(): object {
  return {
    _sightEntity: null,
    _sightEntityTime: 0,
    _sightEntityLastOrigin: new Vector(),
  };
}

/**
 * Create a monster fixture with a minimal engine API.
 * @returns The monster.
 */
function createMonsterVisibilityFixture(): ObservedMonster {
  const edict = createInertEdict();
  const engine = createMockEngine();

  const gameAPI = createInertGameApi({
    time: 1,
    coop: 0,
    worldspawn: {
      worldtype: worldType.MEDIEVAL,
    },
    gameAI: createMockGameAI(),
  }, engine);

  const entity = new OgreEntity(edict, gameAPI).initializeEntity() as ObservedMonster;
  edict.entity = entity;

  entity.health = 200;
  entity.origin = new Vector();
  entity.view_ofs = new Vector();
  entity.angles = new Vector();
  entity.enemy = null;
  entity.goalentity = null;
  entity.movetarget = null;
  entity.show_hostile = 0;
  entity.spawnflags = 0;
  entity.effects = 0;
  entity.flags = 0;
  entity.ideal_yaw = 0;
  entity.attack_finished = 0;
  entity.nextthink = 0;
  entity.yaw_speed = 20;
  entity.pausetime = Infinity;
  entity.sightSound = () => {};
  entity.thinkRun = () => {};
  entity.thinkStand = () => {};
  entity.thinkWalk = () => {};
  entity._scheduleThink = (...args: unknown[]) => {
    entity._scheduledThinkArgs = args;
  };
  entity.attackFinished = (delay: number) => {
    entity.attack_finished = gameAPI.time + delay;
  };
  entity.getNextBestClient = () => null;

  return entity;
}

/**
 * Create a player fixture compatible with the monster AI routines.
 * @returns Mock player entity.
 */
function createPlayerFixture(): InstanceType<typeof PlayerEntity> {
  const edict = createInertEdict();
  const engine = createMockEngine();

  const gameAPI = createInertGameApi({
    time: 0,
    coop: 0,
    worldspawn: {
      worldtype: worldType.MEDIEVAL,
    },
    gameAI: createMockGameAI(),
    stats: {
      sendToPlayer() {},
    },
  }, engine);

  const player = new PlayerEntity(edict, gameAPI).initializeEntity();
  edict.entity = player;

  player.health = 100;
  player.origin = new Vector(64, 0, 0);
  player.view_ofs = new Vector(0, 0, 22);
  player.flags = flags.FL_CLIENT;
  player.effects = 0;
  player.items = 0;
  player.show_hostile = 0;

  return player;
}

void describe('QuakeEntityAI._isVisible', () => {
  void test('treats a clear ignoreMonsters traceline as visible even when no entity is returned', () => {
    const entity = createMonsterVisibilityFixture();
    const target = createMonsterVisibilityFixture();

    entity.engine.Traceline = () => createGameTrace({
      fraction: 1.0,
      contents: { inOpen: false, inWater: false },
    });

    assert.equal(aiOf(entity)._isVisible(target), true);
  });

  void test('rejects blocked sight lines when the trace stops short', () => {
    const entity = createMonsterVisibilityFixture();
    const target = createMonsterVisibilityFixture();

    entity.engine.Traceline = () => createGameTrace({
      fraction: 0.5,
      contents: { inOpen: false, inWater: false },
    });

    assert.equal(aiOf(entity)._isVisible(target), false);
  });
});

void describe('QuakeEntityAI.findTarget', () => {
  void test('acquires a visible player and schedules a run state', () => {
    const monster = createMonsterVisibilityFixture();
    const player = createPlayerFixture();

    monster.getNextBestClient = () => player;
    monster.engine.Traceline = () => createGameTrace({
      fraction: 1.0,
      contents: { inOpen: false, inWater: false },
    });

    const found = aiOf(monster).findTarget();

    assert.equal(found, true);
    assert.equal(monster.enemy, player);
    assert.equal(monster.goalentity, player);
    assert.equal(monster.show_hostile, monster.game.time + 1.0);
    assert.deepEqual(monster.game.gameAI._sightEntityLastOrigin, player.origin);
    assert.equal(monster._scheduledThinkArgs[0], monster.game.time + 0.05);
    assert.equal(typeof monster._scheduledThinkArgs[1], 'function');
    assert.equal(monster._scheduledThinkArgs[2], 'animation-state-machine');
  });

  void test('rejects invisible players before visibility and range checks', () => {
    const monster = createMonsterVisibilityFixture();
    const player = createPlayerFixture();

    player.items = items.IT_INVISIBILITY;

    let visibilityChecks = 0;
    monster.getNextBestClient = () => player;
    monster.engine.Traceline = () => {
      visibilityChecks += 1;
      return createGameTrace({
        fraction: 1.0,
        contents: { inOpen: false, inWater: false },
      });
    };

    const found = aiOf(monster).findTarget();

    assert.equal(found, false);
    assert.equal(monster.enemy, null);
    assert.equal(visibilityChecks, 0);
  });

  void test('ignores undefined client lookups without throwing', () => {
    const monster = createMonsterVisibilityFixture();

    // A client lookup that answers undefined instead of null, which the engine's callers may do.
    monster.getNextBestClient = (() => undefined) as unknown as () => null;

    assert.doesNotThrow(() => {
      assert.equal(aiOf(monster).findTarget(), false);
    });
    assert.equal(monster.enemy, null);
  });
});
