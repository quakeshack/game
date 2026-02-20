// monster_oldone (Shub-Niggurath) implementation
// Original QuakeC: oldone.qc

import Vector from '../../../../shared/Vector.mjs';

import { attn, channel, damage, flags, moveType, solid, tentType } from '../../Defs.mjs';
import BaseEntity from '../BaseEntity.mjs';
import BaseMonster from './BaseMonster.mjs';
import { GibEntity, PlayerEntity } from '../Player.mjs';
import { IntermissionCameraEntity } from '../Misc.mjs';

/**
 * The Old One - Shub-Niggurath, final boss of episode 4.
 * Killed by telefragging via the misc_teleporttrain.
 */
export class OldOneMonster extends BaseMonster {
  /** @type {string} */
  static classname = 'monster_oldone';

  static _modelQC = `
$cd id1/models/old_one
$origin 0 0 24
$base base
$skin skin
$scale 1

$frame old1 old2 old3 old4 old5 old6 old7 old8 old9
$frame old10 old11 old12 old13 old14 old15 old16 old17 old18 old19
$frame old20 old21 old22 old23 old24 old25 old26 old27 old28 old29
$frame old30 old31 old32 old33 old34 old35 old36 old37 old38 old39
$frame old40 old41 old42 old43 old44 old45 old46

$frame shake1 shake2 shake3 shake4 shake5 shake6 shake7 shake8
$frame shake9 shake10 shake11 shake12 shake12 shake13 shake14
$frame shake15 shake16 shake17 shake18 shake19 shake20
`;

  // OldOne doesn't use the standard AI system, skip AI think
  _newEntityAI() {
    return null;
  }

  // Override think to skip AI but still process scheduled thinks
  think() {
    // Skip BaseMonster.think() which calls _ai.think()
    // Call BaseEntity.think() directly for scheduled thinks
    BaseEntity.prototype.think.call(this);
  }

  _declareFields() {
    super._declareFields();
    this._serializer.startFields();
    /** @type {number} counter for thrashing cycles */
    this.cnt = 0;
    this._serializer.endFields();
  }

  _precache() {
    this.engine.PrecacheModel('progs/oldone.mdl');
    this.engine.PrecacheModel('progs/player.mdl');
    this.engine.PrecacheSound('boss2/death.wav');
    this.engine.PrecacheSound('boss2/idle.wav');
    this.engine.PrecacheSound('boss2/sight.wav');
    this.engine.PrecacheSound('boss2/pop2.wav');
    this.engine.PrecacheSound('misc/r_tele1.wav');
  }

  /** Light level map for thrash frames. */
  static _thrashLightLevels = ['m', 'k', 'k', 'i', 'g', 'e', 'c', 'a', 'c', 'e', 'g', 'i', 'k', 'm', 'm', 'g', 'c', 'b', 'a', 'a'];

  /**
   * Creates a light callback for a thrash frame.
   * @param {string} level light level character
   * @returns {function(this:OldOneMonster): void} callback
   */
  static _makeLightCallback(level) {
    return function () {
      this.engine.Lightstyle(0, level);
    };
  }

  /**
   * Callback for thrash frame 15 - checks cycle count.
   * @this {OldOneMonster}
   */
  _thrash15Callback() {
    const lightLevel = OldOneMonster._thrashLightLevels[14];
    this.engine.Lightstyle(0, lightLevel);
    this.cnt = this.cnt + 1;
    if (this.cnt !== 3) {
      // Go back to thrash1 for another cycle
      this._runState('old_thrash1');
    }
  }

  /**
   * Callback for thrash frame 20 - triggers finale.
   * @this {OldOneMonster}
   */
  _thrash20Callback() {
    this._finale4();
  }

  static _initStates() {
    this._states = {};

    // Idle animation: frames old1-old46 looping
    for (let i = 1; i <= 46; i++) {
      const frameId = `old${i}`;
      const nextState = i < 46 ? `old_idle${i + 1}` : 'old_idle1';
      this._defineState(`old_idle${i}`, frameId, nextState, null);
    }

    // Thrashing/death animation: frames shake1-shake20
    for (let i = 1; i <= 20; i++) {
      const frameId = i === 12 ? 'shake12' : `shake${i}`; // handle duplicate frame in QC
      const nextState = i < 20 ? `old_thrash${i + 1}` : 'old_thrash20';
      const lightLevel = OldOneMonster._thrashLightLevels[i - 1];

      if (i === 15) {
        this._defineState(`old_thrash${i}`, frameId, nextState, OldOneMonster.prototype._thrash15Callback);
      } else if (i === 20) {
        this._defineState(`old_thrash${i}`, frameId, nextState, OldOneMonster.prototype._thrash20Callback);
      } else {
        this._defineState(`old_thrash${i}`, frameId, nextState, OldOneMonster._makeLightCallback(lightLevel));
      }
    }
  }

  /**
   * Pain callback - Shub-Niggurath is immune to normal damage.
   * Resets health so only a one-shot telefrag (50000 dmg) can kill her.
   */
  thinkPain() {
    this.health = 40000;
  }

  /**
   * Death callback - triggers the finale sequence.
   * This is called when the player telefrag-touches Shub.
   * @param {BaseEntity} attackerEntity attacker entity
   */
  // eslint-disable-next-line no-unused-vars
  thinkDie(attackerEntity) {
    this._finale1();
  }

  /**
   * Finale stage 1: Setup intermission and move players.
   */
  _finale1() {
    this.game.intermission_exittime = this.game.time + 10000000; // never allow exit
    this.game.intermission_running = 1;

    // Find the intermission spot
    const pos = /** @type {IntermissionCameraEntity} */ (this.findFirstEntityByFieldAndValue('classname', 'info_intermission'));

    console.assert(pos instanceof IntermissionCameraEntity);

    if (!pos) {
      console.warn('no info_intermission');
    }

    // Remove the teleport train
    const train = this.findFirstEntityByFieldAndValue('classname', 'misc_teleporttrain');
    if (train) {
      train.remove();
    }

    // Move all players to intermission
    let pl = /** @type {PlayerEntity} */ (this.findFirstEntityByFieldAndValue('classname', 'player'));
    while (pl) {
      pl.view_ofs.clear();
      if (pos) {
        const mangle = pos.mangle;
        pl.angles.set(mangle || pos.angles);
        pl.v_angle.set(mangle || pos.angles);
      }
      pl.fixangle = true;
      pl.takedamage = damage.DAMAGE_NO;
      pl.solid = solid.SOLID_NOT;
      pl.movetype = moveType.MOVETYPE_NONE;
      pl.weapon = 0;
      pl.unsetModel();
      if (pos) {
        pl.setOrigin(pos.origin);
      }
      pl = /** @type {PlayerEntity} */ (this.findNextEntityByFieldAndValue('classname', 'player', pl));
    }

    // Wait 1 second then go to finale_2
    this._scheduleThink(this.game.time + 1, () => this._finale2());
  }

  /**
   * Finale stage 2: Teleport splash inside Shub.
   */
  _finale2() {
    const o = this.origin.copy();
    o[1] -= 100;

    this.engine.DispatchTempEntityEvent(tentType.TE_TELEPORT, o);
    this.startSound(channel.CHAN_VOICE, 'misc/r_tele1.wav', 1.0, attn.ATTN_NORM);

    this._scheduleThink(this.game.time + 2, () => this._finale3());
  }

  /**
   * Finale stage 3: Start Shub thrashing.
   */
  _finale3() {
    this.startSound(channel.CHAN_VOICE, 'boss2/death.wav', 1.0, attn.ATTN_NORM);
    this.engine.Lightstyle(0, 'abcdefghijklmlkjihgfedcb');
    this.cnt = 0;
    this._runState('old_thrash1');
  }

  /**
   * Finale stage 4: Gib Shub and show victory message.
   */
  _finale4() {
    this.startSound(channel.CHAN_VOICE, 'boss2/pop2.wav', 1.0, attn.ATTN_NORM);

    const oldo = this.origin.copy();

    // Throw lots of gibs in a grid pattern
    for (let z = 16; z <= 144; z += 96) {
      for (let x = -64; x <= 64; x += 32) {
        for (let y = -64; y <= 64; y += 32) {
          this.origin[0] = oldo[0] + x;
          this.origin[1] = oldo[1] + y;
          this.origin[2] = oldo[2] + z;

          const r = Math.random();
          let model;
          if (r < 0.3) {
            model = 'progs/gib1.mdl';
          } else if (r < 0.6) {
            model = 'progs/gib2.mdl';
          } else {
            model = 'progs/gib3.mdl';
          }

          this.engine.SpawnEntity(GibEntity.classname, {
            origin: this.origin.copy(),
            velocity: new Vector(
              (Math.random() - 0.5) * 600,
              (Math.random() - 0.5) * 600,
              Math.random() * 400 + 200,
            ),
            model,
          });
        }
      }
    }

    // Show finale text to all players
    const finaleText = 'Congratulations and well done! You have\n' +
      'beaten the hideous Shub-Niggurath, and\n' +
      'her hundreds of ugly changelings and\n' +
      'monsters. You have proven that your\n' +
      'skill and your cunning are greater than\n' +
      'all the powers of Quake. You are the\n' +
      'master now. Id Software salutes you.';

    // Dispatch finale message to all players
    let pl = this.findFirstEntityByFieldAndValue('classname', 'player');
    while (pl) {
      console.assert(pl instanceof PlayerEntity);
      const playerEntity = /** @type {PlayerEntity} */(pl);
      playerEntity.centerPrint(finaleText);
      pl = this.findNextEntityByFieldAndValue('classname', 'player', pl);
    }

    // Spawn a player model stand-in
    const standInOrigin = oldo.copy().subtract(new Vector(32, 264, 0));
    const standInEdict = this.engine.SpawnEntity('misc_null', {
      origin: standInOrigin,
      angles: new Vector(0, 290, 0),
    });

    if (standInEdict && standInEdict.entity) {
      standInEdict.entity.setModel('progs/player.mdl');
      standInEdict.entity.frame = 1;
    }

    // Switch CD track
    this.engine.PlayTrack(3);

    // Restore light style
    this.engine.Lightstyle(0, 'm');

    // Remove Shub
    this.remove();
  }

  spawn() {
    if (this.game.deathmatch) {
      this.remove();
      return;
    }

    this.solid = solid.SOLID_SLIDEBOX;
    this.movetype = moveType.MOVETYPE_STEP;

    this.setModel('progs/oldone.mdl');
    this.setSize(new Vector(-160, -128, -24), new Vector(160, 128, 256));

    this.health = 40000; // Can only be killed by telefrag
    this.takedamage = damage.DAMAGE_YES;

    // Start idle animation
    this._runState('old_idle1');

    // Pretend this is a monster
    this.engine.eventBus.publish('game.monster.spawned', this);
  }
}

export default OldOneMonster;
