import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type Vector from '../../../../shared/Vector.ts';
import type { PlayerEntity as Player } from '../../entity/Player.ts';
import { createInertGameApi } from '../../../../../test/support/entityMocks.ts';

await import('../../GameAPI.ts');

const defsModule = await import('../../Defs.ts');
const playerModule = await import('../../entity/Player.ts');
const worldspawnModule = await import('../../entity/Worldspawn.ts');
const vectorModule = await import('../../../../shared/Vector.ts');

const { clientEvent, items } = defsModule;
const { PlayerEntity } = playerModule;
const { BodyqueEntity } = worldspawnModule;
const { default: VectorClass } = vectorModule;

/**
 * Runs methods of the player on a stand-in that has just the members the method reads. The methods run here are
 * protected, which a subclass may reach.
 */
class PlayerMethods extends PlayerEntity {
  static respawn(player: object): void {
    PlayerMethods.prototype._respawn.call(PlayerMethods.#asPlayer(player));
  }

  static intermissionExit(player: object): void {
    PlayerMethods.prototype._intermissionExit.call(PlayerMethods.#asPlayer(player));
  }

  static powerupFrame(player: object): void {
    PlayerMethods.prototype._powerupFrame.call(PlayerMethods.#asPlayer(player));
  }

  static #asPlayer(player: object): Player {
    // The methods are run on objects that carry only what they read; a real player needs an edict and a whole game.
    return player as unknown as Player;
  }
}

/**
 * Create a body queue node with edict-bound methods stubbed for unit tests.
 * @returns Stubbed body queue entity.
 */
function createBodyqueNode(): InstanceType<typeof BodyqueEntity> {
  const body = new BodyqueEntity(null, createInertGameApi()).initializeEntity();

  body.setModel = function setModel(this: typeof body, model: string | null): void {
    this.model = model;
  };

  body.setOrigin = function setOrigin(this: typeof body, origin: Vector): void {
    this.origin = origin.copy();
  };

  body.setSize = function setSize(this: typeof body, mins: Vector, maxs: Vector): void {
    this.mins = mins.copy();
    this.maxs = maxs.copy();
  };

  return body;
}

void describe('PlayerEntity respawn flow', () => {
  void test('singleplayer respawn restarts the map', () => {
    const appendedConsoleText: string[] = [];
    const player = {
      game: {
        coop: false,
        deathmatch: false,
      },
      engine: {
        AppendConsoleText(command: string) {
          appendedConsoleText.push(command);
        },
      },
    };

    PlayerMethods.respawn(player);

    assert.deepEqual(appendedConsoleText, ['restart\n']);
  });

  void test('deathmatch respawn refreshes spawn state and advances the body queue ring', () => {
    const bodyA = createBodyqueNode();
    const bodyB = createBodyqueNode();
    bodyA.owner = bodyB;
    bodyB.owner = bodyA;

    const calls: string[] = [];
    const player = {
      game: {
        coop: false,
        deathmatch: true,
        bodyque_head: bodyA,
      },
      angles: new VectorClass(1, 2, 3),
      model: 'progs/player.mdl',
      frame: 4,
      colormap: 16,
      movetype: 7,
      velocity: new VectorClass(10, 20, 30),
      origin: new VectorClass(100, 200, 300),
      mins: new VectorClass(-16, -16, -24),
      maxs: new VectorClass(16, 16, 32),
      clear() {
        calls.push('clear');
      },
      putPlayerInServer() {
        calls.push('putPlayerInServer');
      },
      _freshSpawnParameters() {
        calls.push('freshSpawnParameters');
      },
    };

    PlayerMethods.respawn(player);

    assert.deepEqual(calls, ['freshSpawnParameters', 'clear', 'putPlayerInServer']);
    assert.equal(player.game.bodyque_head, bodyB);
    assert.equal(bodyA.model, 'progs/player.mdl');
    assert.deepEqual(bodyA.origin, new VectorClass(100, 200, 300));
    assert.deepEqual(bodyA.velocity, new VectorClass(10, 20, 30));
  });
});

void describe('PlayerEntity intermission flow', () => {
  void test('deathmatch intermission exits directly to the next map', () => {
    let loadNextMapCalls = 0;
    const player = {
      game: {
        deathmatch: true,
        intermission_exittime: 0,
        intermission_running: 1,
        time: 10,
        loadNextMap() {
          loadNextMapCalls++;
        },
      },
    };

    PlayerMethods.intermissionExit(player);

    assert.equal(loadNextMapCalls, 1);
  });

  void test('episode-ending intermission prints finale text before loading the next map', () => {
    const centerPrints: string[] = [];
    let trackPlayed: number | null = null;
    let loadNextMapCalls = 0;
    const player = {
      game: {
        deathmatch: false,
        intermission_exittime: 0,
        intermission_running: 1,
        time: 42,
        mapname: 'e1m7',
        serverflags: 0,
        loadNextMap() {
          loadNextMapCalls++;
        },
      },
      engine: {
        registered: true,
        PlayTrack(track: number) {
          trackPlayed = track;
        },
      },
      centerPrint(message: string) {
        centerPrints.push(message);
      },
      // The stand-in has no prototype of a player, so it brings the method it calls.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      _getEpisodeFinaleText: PlayerEntity.prototype._getEpisodeFinaleText,
    };

    PlayerMethods.intermissionExit(player);

    assert.equal(player.game.intermission_running, 2);
    assert.equal(player.game.intermission_exittime, 43);
    assert.equal(trackPlayed, 2);
    assert.equal(centerPrints.length, 1);
    assert.equal(centerPrints[0].includes('Rune of Earth'), true);
    assert.equal(loadNextMapCalls, 0);
  });
});

void describe('PlayerEntity powerup timers', () => {
  void test('expired invisibility restores the player model and clears the item flag', () => {
    const dispatchedEvents: number[] = [];
    const sounds: string[] = [];
    const player = {
      health: 100,
      game: { time: 20 },
      items: items.IT_INVISIBILITY,
      invisible_finished: 19,
      invisible_time: 5,
      invisible_sound: 0,
      invincible_finished: 0,
      super_damage_finished: 0,
      radsuit_finished: 0,
      air_finished: 0,
      modelindex: 5,
      _modelIndex: {
        player: 11,
        eyes: 22,
      },
      frame: 3,
      dispatchEvent(eventType: number) {
        dispatchedEvents.push(eventType);
      },
      consolePrint() {
      },
      startSound(_channel: number, soundName: string) {
        sounds.push(soundName);
      },
    };

    PlayerMethods.powerupFrame(player);

    assert.equal(player.items & items.IT_INVISIBILITY, 0);
    assert.equal(player.invisible_finished, 0);
    assert.equal(player.invisible_time, 0);
    assert.equal(player.modelindex, 11);
    assert.deepEqual(dispatchedEvents, [clientEvent.BONUS_FLASH]);
    assert.deepEqual(sounds, ['items/inv3.wav']);
  });

  void test('expired invulnerability clears cached attacker sound gates', () => {
    const player = {
      health: 100,
      game: { time: 20 },
      items: items.IT_INVULNERABILITY,
      invisible_finished: 0,
      invincible_finished: 19,
      invincible_time: 5,
      invincible_sound_time: new Map([[1, 9], [7, 15]]),
      super_damage_finished: 0,
      radsuit_finished: 0,
      air_finished: 0,
      dispatchEvent() {
      },
      consolePrint() {
      },
      startSound() {
      },
    };

    PlayerMethods.powerupFrame(player);

    assert.equal(player.items & items.IT_INVULNERABILITY, 0);
    assert.equal(player.invincible_finished, 0);
    assert.equal(player.invincible_time, 0);
    assert.equal(player.invincible_sound_time.size, 0);
  });

  void test('expiring biosuit keeps resetting air supply until the suit ends', () => {
    const player = {
      health: 100,
      game: { time: 10 },
      items: items.IT_SUIT,
      invisible_finished: 0,
      invincible_finished: 0,
      super_damage_finished: 0,
      radsuit_finished: 11,
      rad_time: 0,
      air_finished: 0,
      dispatchEvent() {
      },
      consolePrint() {
      },
      startSound() {
      },
    };

    PlayerMethods.powerupFrame(player);

    assert.equal(player.air_finished, 22);
    assert.equal(player.items & items.IT_SUIT, items.IT_SUIT);
  });
});
