import type { ServerEdict } from '../../../../shared/GameInterfaces.ts';

import Vector from '../../../../shared/Vector.ts';

import { channel, colors, damage, moveType, solid } from '../../Defs.ts';
import type { ServerGameAPI } from '../../GameAPI.ts';
import { entity, serializable } from '../../helper/MiscHelpers.ts';
import type BaseEntity from '../BaseEntity.ts';
import { PlayerEntity } from '../Player.mjs';
import { DamageHandler } from '../Weapons.ts';
import BasePropEntity, { state } from './BasePropEntity.ts';

/**
 * QUAKED func_button (0 .5 .8) ?
 * When a button is touched, it moves some distance in the direction of its angle,
 * triggers all of its targets, waits some time, then returns to its original
 * position where it can be triggered again.
 *
 * "angle" determines the opening direction
 * "target" all entities with a matching targetname will be used
 * "speed" override the default 40 speed
 * "wait" override the default 1 second wait (-1 = never return)
 * "lip" override the default 4 pixel lip remaining at end of move
 * "health" if set, the button must be killed instead of touched
 * "sounds"
 * 0) steam metal
 * 1) wooden clunk
 * 2) metallic click
 * 3) in-out
 */
@entity
export class ButtonEntity extends BasePropEntity {
  static classname = 'func_button';

  protected static readonly _sounds = [
    'buttons/airbut1.wav',
    'buttons/switch21.wav',
    'buttons/switch02.wav',
    'buttons/switch04.wav',
  ];

  @serializable health = 0;
  @serializable max_health = 0;
  @serializable bloodcolor = colors.DUST;

  constructor(edict: ServerEdict | null, gameAPI: ServerGameAPI) {
    super(edict, gameAPI);
    this._damageHandler = new DamageHandler(this);
  }

  protected override _precache(): void {
    const ctor = this.constructor as typeof ButtonEntity;
    const soundName = ctor._sounds[this.sounds ?? 0] ?? ctor._sounds[0];
    this.engine.PrecacheSound(soundName);
  }

  private _buttonDone(): void {
    this.state = state.STATE_BOTTOM;
  }

  private _buttonReturn(): void {
    const sub = this._sub;
    console.assert(sub !== null, 'ButtonEntity requires Sub helper');
    if (sub === null) {
      return;
    }

    this.state = state.STATE_DOWN;
    sub.calcMove(this.pos1, this.speed, () => {
      this._buttonDone();
    });
    // Use normal textures.
    this.frame = 0;

    if (this.health > 0) {
      this.takedamage = damage.DAMAGE_YES;
    }
  }

  private _buttonWait(userEntity: BaseEntity): void {
    const sub = this._sub;
    console.assert(sub !== null, 'ButtonEntity requires Sub helper');
    if (sub === null) {
      return;
    }

    this.state = state.STATE_TOP;
    sub.useTargets(userEntity);
    // Use alternate textures.
    this.frame = 1;
    this._scheduleThink(this.ltime + this.wait, () => {
      this._buttonReturn();
    });
  }

  private _buttonFire(userEntity: BaseEntity): void {
    const sub = this._sub;
    console.assert(sub !== null, 'ButtonEntity requires Sub helper');
    if (sub === null) {
      return;
    }

    if (this.state === state.STATE_UP || this.state === state.STATE_TOP) {
      return;
    }

    const noise = this.noise;
    console.assert(noise !== null, 'ButtonEntity noise must be initialized during spawn');
    if (noise === null) {
      return;
    }

    this.startSound(channel.CHAN_VOICE, noise);
    this.state = state.STATE_UP;

    sub.calcMove(this.pos2, this.speed, () => {
      this._buttonWait(userEntity);
    });
  }

  override use(usedByEntity: BaseEntity): void {
    this._buttonFire(usedByEntity);
  }

  override touch(touchedByEntity: BaseEntity, _pushVector: Vector): void {
    if (!(touchedByEntity instanceof PlayerEntity)) {
      return;
    }

    // Do not handle touch for buttons supposed to be shot at.
    if (this.max_health > 0) {
      return;
    }

    this._buttonFire(touchedByEntity);
  }

  thinkDie(killedByEntity: BaseEntity): void {
    this.health = this.max_health;
    this.takedamage = damage.DAMAGE_NO;
    this._buttonFire(killedByEntity);
  }

  override spawn(): void {
    const ctor = this.constructor as typeof ButtonEntity;
    const sub = this._sub;
    console.assert(sub !== null, 'ButtonEntity requires Sub helper');
    if (sub === null) {
      return;
    }

    this.noise = ctor._sounds[this.sounds] ?? ctor._sounds[0];

    sub.setMovedir();

    this.movetype = moveType.MOVETYPE_PUSH;
    this.solid = solid.SOLID_BSP;
    this.setModel(this.model);

    if (this.health > 0) {
      this.max_health = this.health;
      this.takedamage = damage.DAMAGE_YES;
    }

    if (this.speed === 0) {
      this.speed = 40.0;
    }

    if (this.wait === 0) {
      this.wait = 1.0;
    }

    if (this.lip === null || this.lip === 0) {
      this.lip = 4.0;
    }

    this.state = state.STATE_BOTTOM;

    this.pos1 = this.origin.copy();
    this.pos2 = this.pos1.copy().add(this.movedir.copy().multiply(Math.abs(this.movedir.dot(this.size)) - this.lip));
  }
}
