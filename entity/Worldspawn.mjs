import BaseEntity from './BaseEntity.mjs';
import { PlayerEntity } from './Player.mjs';

import { Precache as WeaponsPrecache } from './Weapons.mjs';

/** @typedef {import("../GameAPI.mjs").ServerGameAPI} ServerGameAPI */

export class BodyqueEntity extends BaseEntity {
  static classname = 'bodyque';

  /** @protected */
  _declareFields() {
    this._serializer.startFields();

    this.colormap = 0;

    this._serializer.endFields();
  }
};

/**
 * @param {ServerGameAPI} game gameAPI
 */
function InitBodyQue(game) {
  game.bodyque_head = /** @type {BodyqueEntity} */(game.engine.SpawnEntity(BodyqueEntity.classname).entity);

  let current = game.bodyque_head;

  for (let i = 0; i < 5; i++, current = /** @type {BodyqueEntity} */(current.owner)) {
    current.owner = /** @type {BodyqueEntity} */(game.engine.SpawnEntity(BodyqueEntity.classname).entity);
  }

  current.owner = game.bodyque_head;
}

/**
 * copies entity to the body que
 * @param {ServerGameAPI} game gameAPI
 * @param {PlayerEntity} entity entity to be copied
 */
export function CopyToBodyQue(game, entity) {
  game.bodyque_head.angles = entity.angles;
  game.bodyque_head.setModel(entity.model);
  game.bodyque_head.frame = entity.frame;
  game.bodyque_head.colormap = entity.colormap;
  game.bodyque_head.movetype = entity.movetype;
  game.bodyque_head.velocity = entity.velocity;
  game.bodyque_head.flags = 0;
  game.bodyque_head.setOrigin(entity.origin);
  game.bodyque_head.setSize(entity.mins, entity.maxs);
  game.bodyque_head = /** @type {BodyqueEntity} */(game.bodyque_head.owner);
};

/**
 * QUAKED worldspawn (0 0 0) ?
 * Only used for the world entity.
 * Set message to the level name.
 * Set sounds to the cd track to play.
 *
 * World Types:
 * 0: medieval
 * 1: metal
 * 2: base
 */
export class WorldspawnEntity extends BaseEntity {
  static classname = 'worldspawn';

  _declareFields() {
    this._serializer.startFields();

    /** @type {string} wad file containing textures, only used by the compiler tools */
    this.wad = null;
    /** @type {string} proper map name */
    this.message = null;
    /** @type {number} 0 = medival, 1 = runes, 2 = techbase */
    this.worldtype = 0;
    /** @type {number} cdtrack */
    this.sounds = 0;

    this._serializer.endFields();
  }

  _precache() {
    // the area based ambient sounds MUST be the first precache_sounds

    // player precaches
    WeaponsPrecache(this.engine);

    // sounds used from C physics code
    this.engine.PrecacheSound('demon/dland2.wav');		// landing thud
    this.engine.PrecacheSound('misc/h2ohit1.wav');		// landing splash
    this.engine.PrecacheSound('misc/talk.wav');			// talk

    // TODO: move these to monster_boss:
    this.engine.PrecacheSound('misc/power.wav');			//lightning for boss
    this.engine.PrecacheModel('progs/bolt3.mdl');		// for boss shock
  }

  spawn() {
    this.game.lastspawn = this.game.worldspawn;
    this.game.worldspawn = this;

    InitBodyQue(this.game);

    // custom map attributes
    this.engine.SetCvar('sv_gravity', this.model === 'maps/e1m8.bsp' ? '100' : '800');

    //
    // Setup light animation tables. 'a' is total darkness, 'z' is maxbright.
    //

    // 0 normal
    this.engine.Lightstyle(0, 'm');

    // 1 FLICKER (first variety)
    this.engine.Lightstyle(1, 'mmnmmommommnonmmonqnmmo');

    // 2 SLOW STRONG PULSE
    this.engine.Lightstyle(2, 'abcdefghijklmnopqrstuvwxyzyxwvutsrqponmlkjihgfedcba');

    // 3 CANDLE (first variety)
    this.engine.Lightstyle(3, 'mmmmmaaaaammmmmaaaaaabcdefgabcdefg');

    // 4 FAST STROBE
    this.engine.Lightstyle(4, 'mamamamamama');

    // 5 GENTLE PULSE 1
    this.engine.Lightstyle(5, 'jklmnopqrstuvwxyzyxwvutsrqponmlkj');

    // 6 FLICKER (second variety)
    this.engine.Lightstyle(6, 'nmonqnmomnmomomno');

    // 7 CANDLE (second variety)
    this.engine.Lightstyle(7, 'mmmaaaabcdefgmmmmaaaammmaamm');

    // 8 CANDLE (third variety)
    this.engine.Lightstyle(8, 'mmmaaammmaaammmabcdefaaaammmmabcdefmmmaaaa');

    // 9 SLOW STROBE (fourth variety)
    this.engine.Lightstyle(9, 'aaaaaaaazzzzzzzz');

    // 10 FLUORESCENT FLICKER
    this.engine.Lightstyle(10, 'mmamammmmammamamaaamammma');

    // 11 SLOW PULSE NOT FADE TO BLACK
    this.engine.Lightstyle(11, 'abcdefghijklmnopqrrqponmlkjihgfedcba');

    // styles 32-62 are assigned by the light program for switchable lights

    // 63 testing
    this.engine.Lightstyle(63, 'a');
  }
};
