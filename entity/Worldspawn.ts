import { serializableObject, serializable } from '../helper/MiscHelpers.ts';
import type { ServerGameAPI } from '../GameAPI.ts';
import BaseEntity from './BaseEntity.ts';
import type { PlayerEntity } from './Player.ts';

import { Precache as WeaponsPrecache } from './Weapons.ts';

@serializableObject
export class BodyqueEntity extends BaseEntity {
  static classname = 'bodyque';

  @serializable colormap = 0;
}

/**
 * Spawn one body queue entry through the entity registry.
 * @returns Spawned body queue entity or null when allocation fails.
 */
function spawnBodyqueEntity(game: ServerGameAPI): BodyqueEntity | null {
  const edict = game.engine.SpawnEntity<BodyqueEntity>(BodyqueEntity.classname);
  const entity = edict?.entity;

  if (!(entity instanceof BodyqueEntity)) {
    return null;
  }

  return entity;
}

/**
 * Build the circular corpse queue used by player deaths.
 */
function InitBodyQue(game: ServerGameAPI): void {
  const head = spawnBodyqueEntity(game);
  game.bodyque_head = head;

  if (!(head instanceof BodyqueEntity)) {
    return;
  }

  let current = head;

  for (let i = 0; i < 3; i++) {
    const next = spawnBodyqueEntity(game);
    if (!(next instanceof BodyqueEntity)) {
      current.owner = head;
      return;
    }

    current.owner = next;
    current = next;
  }

  current.owner = head;
}

/**
 * Copy a player corpse into the next body queue slot.
 */
export function CopyToBodyQue(game: ServerGameAPI, entity: PlayerEntity): void {
  const bodyqueHead = game.bodyque_head;
  console.assert(bodyqueHead instanceof BodyqueEntity, 'bodyque_head must exist before copying corpses');
  if (!(bodyqueHead instanceof BodyqueEntity)) {
    return;
  }

  bodyqueHead.angles.set(entity.angles);
  bodyqueHead.setModel(entity.model);
  bodyqueHead.frame = entity.frame;
  bodyqueHead.colormap = entity.colormap;
  bodyqueHead.movetype = entity.movetype;
  bodyqueHead.velocity.set(entity.velocity);
  bodyqueHead.flags = 0;
  bodyqueHead.setOrigin(entity.origin);
  bodyqueHead.setSize(entity.mins, entity.maxs);

  const nextBody = bodyqueHead.owner;
  console.assert(nextBody instanceof BodyqueEntity, 'bodyque ring must be linked');
  game.bodyque_head = nextBody instanceof BodyqueEntity ? nextBody : bodyqueHead;
}

@serializableObject
export class WorldspawnEntity extends BaseEntity {
  static classname = 'worldspawn';

  /**
   * WAD file containing textures, only used by compiler tools.
   */
  @serializable wad: string | null = null;
  /**
   * 0 = medieval, 1 = runes, 2 = techbase.
   */
  @serializable worldtype = 0;
  /**
   * CD track.
   */
  @serializable sounds = 0;
  /**
   * Skybox name.
   */
  @serializable skyname: string | null = null;

  /**
   * Precache the worldspawn resources still owned by game code.
   */
  protected override _precache(): void {
    WeaponsPrecache(this.engine);

    this.engine.PrecacheSound('demon/dland2.wav');
    this.engine.PrecacheSound('misc/h2ohit1.wav');
    this.engine.PrecacheSound('misc/talk.wav');
    this.engine.PrecacheModel('progs/bolt3.mdl');
  }

  override spawn(): void {
    this.game.lastspawn = this.game.worldspawn;
    this.game.worldspawn = this;

    InitBodyQue(this.game);

    // e1m8 lowers gravity for the finale fight.
    this.engine.SetCvar('sv_gravity', this.model === 'maps/e1m8.bsp' ? '100' : '800');

    // Setup light animation tables. 'a' is total darkness, 'z' is maxbright.

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
    // 63 testing
    this.engine.Lightstyle(63, 'a');
  }
}
