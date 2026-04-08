import type BaseEntity from '../BaseEntity.ts';

import Vector from '../../../../shared/Vector.ts';

import { channel, moveType, solid } from '../../Defs.ts';
import { entity, serializable } from '../../helper/MiscHelpers.ts';
import { PathCornerEntity } from '../Misc.ts';
import { PlayerEntity } from '../Player.ts';
import BaseEntityClass from '../BaseEntity.ts';
import BasePropEntity, { state } from './BasePropEntity.ts';

const PLATFORM_GO_DOWN_THINK = 'plat-go-down';

type PlatformSoundPair = readonly [string | null, string | null];

/**
 * QUAKED func_plat (0 .5 .8) ? PLAT_LOW_TRIGGER
 * "speed" default 150
 *
 * Plats are always drawn in the extended position so they light correctly.
 *
 * If the plat is the target of another trigger or button, it starts out disabled
 * in the extended position until it is triggered, when it lowers and becomes a
 * normal plat.
 *
 * If the "height" key is set, that determines the amount the plat moves instead of
 * using the model height.
 * "sounds"
 * 1) base fast
 * 2) chain slow
 */
@entity
export class PlatformEntity extends BasePropEntity {
  static classname = 'func_plat';

  static readonly PLAT_LOW_TRIGGER = 1;

  protected static readonly _sounds = [
    [null, null],
    ['plats/plat1.wav', 'plats/plat2.wav'],
    ['plats/medplat1.wav', 'plats/medplat2.wav'],
  ] as const satisfies readonly PlatformSoundPair[];

  @serializable mangle = new Vector();
  @serializable t_length = 0;
  @serializable t_width = 0;
  @serializable _trigger: PlatformTriggerEntity | null = null;
  @serializable _remoteUseConsumed = false;

  protected override _precache(): void {
    const ctor = this.constructor as typeof PlatformEntity;
    const sounds = ctor._sounds[this.sounds || 2] ?? ctor._sounds[2];

    for (const soundName of sounds) {
      if (soundName !== null) {
        this.engine.PrecacheSound(soundName);
      }
    }
  }

  protected _spawnInsideTrigger(): void {
    const edict = this.engine.SpawnEntity(PlatformTriggerEntity.classname, { owner: this });
    this._trigger = edict?.entity instanceof PlatformTriggerEntity ? edict.entity : null;
  }

  _hitBottom(): void {
    const stopSound = this.noise1;

    console.assert(stopSound !== null, 'PlatformEntity requires a stop sound');
    if (stopSound === null) {
      return;
    }

    this.state = state.STATE_BOTTOM;
    this.startSound(channel.CHAN_VOICE, stopSound);
  }

  _hitTop(): void {
    const stopSound = this.noise1;

    console.assert(stopSound !== null, 'PlatformEntity requires a stop sound');
    if (stopSound === null) {
      return;
    }

    this.state = state.STATE_TOP;
    this.startSound(channel.CHAN_VOICE, stopSound);
    this._scheduleThink(this.ltime + 3.0, () => {
      this._goDown();
    }, PLATFORM_GO_DOWN_THINK);
  }

  _goDown(): void {
    const moveSound = this.noise;
    const sub = this._sub;
    console.assert(sub !== null, 'PlatformEntity requires Sub helper');
    console.assert(moveSound !== null, 'PlatformEntity requires a move sound');
    if (sub === null || moveSound === null) {
      return;
    }

    this.state = state.STATE_DOWN;
    this.startSound(channel.CHAN_VOICE, moveSound);
    sub.calcMove(this.pos2, this.speed, () => {
      this._hitBottom();
    });
  }

  _goUp(): void {
    const moveSound = this.noise;
    const sub = this._sub;
    console.assert(sub !== null, 'PlatformEntity requires Sub helper');
    console.assert(moveSound !== null, 'PlatformEntity requires a move sound');
    if (sub === null || moveSound === null) {
      return;
    }

    this.state = state.STATE_UP;
    this.startSound(channel.CHAN_VOICE, moveSound);
    sub.calcMove(this.pos1, this.speed, () => {
      this._hitTop();
    });
  }

  _keepUp(): void {
    // This intentionally extends the current top wait by rescheduling the descent.
    this._scheduleThink(this.ltime + 1.0, () => {
      this._goDown();
    }, PLATFORM_GO_DOWN_THINK);
  }

  override blocked(blockedByEntity: BaseEntity): void {
    this.damage(blockedByEntity, 1);

    if (this.state === state.STATE_UP) {
      this._goDown();
    } else if (this.state === state.STATE_DOWN) {
      this._goUp();
    } else {
      console.assert(false, 'PlatformEntity.blocked: invalid state');
    }
  }

  override use(_usedByEntity: BaseEntity): void {
    if (this.targetname === null) {
      if (this.state === state.STATE_UP || this.state === state.STATE_DOWN) {
        return;
      }

      this._goDown();
      return;
    }

    if (this._remoteUseConsumed || this.state !== state.STATE_UP) {
      return;
    }

    this._remoteUseConsumed = true;
    this._goDown();
  }

  override spawn(): void {
    const ctor = this.constructor as typeof PlatformEntity;

    if (this.t_length === 0) {
      this.t_length = 80;
    }

    if (this.t_width === 0) {
      this.t_width = 10;
    }

    if (this.speed === 0) {
      this.speed = 150;
    }

    if (this.sounds === 0) {
      this.sounds = 2;
    }

    const resolvedSounds = ctor._sounds[this.sounds] ?? ctor._sounds[2];
    [this.noise, this.noise1] = resolvedSounds;

    this.mangle.set(this.angles);
    this.angles.clear();

    this.solid = solid.SOLID_BSP;
    this.movetype = moveType.MOVETYPE_PUSH;

    // Preserve the classic plat spawn setup order.
    this.setOrigin(this.origin);
    this.setModel(this.model);
    this.setSize(this.mins, this.maxs);

    this.pos1.set(this.origin);
    this.pos2.set(this.origin);
    this.pos2[2] = this.origin[2] - (this.height !== 0 ? this.height : this.size[2] - 8.0);

    this._spawnInsideTrigger();

    if (this.targetname !== null) {
      this.state = state.STATE_UP;
    } else {
      this.setOrigin(this.pos2);
      this.state = state.STATE_BOTTOM;
    }
  }
}

@entity
export class PlatformTriggerEntity extends BaseEntityClass {
  static classname = 'func_plat_trigger';

  override spawn(): void {
    const owner = this.owner;
    console.assert(owner instanceof PlatformEntity, 'owner must be a PlatformEntity');
    if (!(owner instanceof PlatformEntity)) {
      return;
    }

    this.movetype = moveType.MOVETYPE_NONE;
    this.solid = solid.SOLID_TRIGGER;

    const tmin = owner.mins.copy().add(new Vector(25.0, 25.0, 0.0));
    const tmax = owner.maxs.copy().subtract(new Vector(25.0, 25.0, -8.0));
    tmin[2] = tmax[2] - (owner.pos1[2] - owner.pos2[2] + 8.0);

    if (owner.spawnflags & PlatformEntity.PLAT_LOW_TRIGGER) {
      tmax[2] = tmin[2] + 8.0;
    }

    if (owner.size[0] <= 50.0) {
      tmin[0] = (owner.mins[0] + owner.maxs[0]) / 2;
      tmax[0] = tmin[0] + 1.0;
    }

    if (owner.size[1] <= 50.0) {
      tmin[1] = (owner.mins[1] + owner.maxs[1]) / 2;
      tmax[1] = tmin[1] + 1.0;
    }

    this.setSize(tmin, tmax);
  }

  override touch(touchedByEntity: BaseEntity): void {
    if (!(touchedByEntity instanceof PlayerEntity)) {
      return;
    }

    if (touchedByEntity.health <= 0) {
      return;
    }

    const platform = this.owner;
    console.assert(platform instanceof PlatformEntity, 'PlatformTriggerEntity owner must be a PlatformEntity');
    if (!(platform instanceof PlatformEntity)) {
      return;
    }

    switch (platform.state) {
      case state.STATE_BOTTOM:
        platform._goUp();
        break;

      case state.STATE_TOP:
        platform._keepUp();
        break;
    }
  }
}

/**
 * QUAKED func_train (0 .5 .8) ?
 * Trains are moving platforms that players can ride.
 * The target origin specifies the min point of the train at each corner.
 * The train spawns at the first target it is pointing at.
 * If the train is the target of a button or trigger, it will not begin moving until activated.
 * "speed" default 100
 * "dmg" default 2
 * "sounds"
 * 1) ratchet metal
 */
@entity
export class TrainEntity extends BasePropEntity {
  static classname = 'func_train';

  @serializable _awaitingActivation = false;

  protected override _precache(): void {
    if (this.sounds === 0) {
      this.engine.PrecacheSound('misc/null.wav');
    } else if (this.sounds === 1) {
      this.engine.PrecacheSound('plats/train2.wav');
      this.engine.PrecacheSound('plats/train1.wav');
    }
  }

  override spawn(): void {
    if (this.speed === 0) {
      this.speed = 100;
    }

    console.assert(this.target !== null, 'func_train requires a target');
    if (this.target === null) {
      return;
    }

    if (this.dmg === 0) {
      this.dmg = 2;
    }

    if (this.sounds === 0) {
      this.noise = 'misc/null.wav';
      this.noise1 = 'misc/null.wav';
    } else if (this.sounds === 1) {
      this.noise = 'plats/train2.wav';
      this.noise1 = 'plats/train1.wav';
    }

    this.solid = solid.SOLID_BSP;
    this.movetype = moveType.MOVETYPE_PUSH;

    this.setModel(this.model);
    this.setSize(this.mins, this.maxs);
    this.setOrigin(this.origin);

    this._awaitingActivation = this.targetname !== null;
    this._scheduleThink(this.ltime + 0.1, () => {
      // Start by finding the first target after every path_corner has spawned.
      this._trainFind();
    });
  }

  _trainFind(): void {
    const target = this.target;
    console.assert(target !== null, 'func_train requires a target');
    if (target === null) {
      return;
    }

    const targetEntity = this.findFirstEntityByFieldAndValue('targetname', target);
    console.assert(targetEntity !== null, 'func_train: target not found');
    if (targetEntity === null) {
      return;
    }

    // Position the train at the first target origin, offset by our mins.
    this.target = targetEntity.target;
    this.setOrigin(targetEntity.origin.copy().subtract(this.mins));

    if (this.targetname === null) {
      this._scheduleThink(this.ltime + 0.1, () => {
        this._trainNext();
      });
    }
  }

  _trainNext(): void {
    const target = this.target;
    const stopSound = this.noise1;
    const sub = this._sub;
    console.assert(sub !== null, 'TrainEntity requires Sub helper');
    console.assert(target !== null, 'func_train requires a target');
    console.assert(stopSound !== null, 'func_train requires a stop sound');
    if (sub === null || target === null || stopSound === null) {
      return;
    }

    const targetEntity = this.findFirstEntityByFieldAndValue('targetname', target);
    console.assert(targetEntity !== null && targetEntity.target !== null, 'func_train: no next target');
    if (targetEntity === null || targetEntity.target === null) {
      return;
    }

    // Move toward the next target point, again using mins for alignment.
    this.target = targetEntity.target;
    this.wait = targetEntity instanceof PathCornerEntity ? targetEntity.wait : 0;
    this.startSound(channel.CHAN_VOICE, stopSound);
    sub.calcMove(targetEntity.origin.copy().subtract(this.mins), this.speed, () => {
      this._trainWait();
    });
  }

  _trainWait(): void {
    if (this.wait !== 0) {
      const moveSound = this.noise;

      console.assert(moveSound !== null, 'func_train requires a move sound');
      if (moveSound === null) {
        return;
      }

      this.startSound(channel.CHAN_VOICE, moveSound);
    }

    // Default to a minimal delay when the path corner does not specify one.
    const delay = this.wait !== 0 ? this.wait : 0.1;
    this._scheduleThink(this.ltime + delay, () => {
      this._trainNext();
    });
  }

  override blocked(blockingEntity: BaseEntity): void {
    if (this.game.time < this.attack_finished) {
      return;
    }

    // Short cooldown to avoid repeated blockage processing every frame.
    this.attack_finished = this.game.time + 0.5;
    this.damage(blockingEntity, this.dmg);
  }

  override use(_activatorEntity: BaseEntity): void {
    if (!this._awaitingActivation) {
      return;
    }

    this._awaitingActivation = false;
    this._trainNext();
  }
}

@entity
export class RotatingEntity extends BasePropEntity {
  static classname = 'func_rotating';

  static readonly START_ON = 1;
  static readonly REVERSE = 2;
  static readonly X_AXIS = 4;
  static readonly Y_AXIS = 8;
  static readonly TOUCH_PAIN = 16;
  static readonly STOP = 32;

  @serializable _isRotating = false;

  protected _getAngularVelocity(): Vector {
    const signedSpeed = this.speed * ((this.spawnflags & RotatingEntity.REVERSE) !== 0 ? -1.0 : 1.0);

    if (this.spawnflags & RotatingEntity.X_AXIS) {
      return new Vector(0.0, 0.0, signedSpeed);
    }

    if (this.spawnflags & RotatingEntity.Y_AXIS) {
      return new Vector(signedSpeed, 0.0, 0.0);
    }

    return new Vector(0.0, signedSpeed, 0.0);
  }

  protected _startRotating(): void {
    this.avelocity.set(this._getAngularVelocity());
    this._isRotating = !this.avelocity.isOrigin();
  }

  protected _stopRotating(): void {
    this.avelocity.clear();
    this._isRotating = false;
  }

  protected _toggleRotating(): void {
    if (this._isRotating) {
      this._stopRotating();
      return;
    }

    this._startRotating();
  }

  override spawn(): void {
    if (this.speed === 0) {
      this.speed = 100.0;
    }

    if (this.dmg === 0) {
      this.dmg = 2.0;
    }

    this.movetype = moveType.MOVETYPE_PUSH;
    this.solid = solid.SOLID_BSP;

    this.setModel(this.model);
    this.setSize(this.mins, this.maxs);
    this.setOrigin(this.origin);

    this._stopRotating();

    if (this.spawnflags & RotatingEntity.START_ON) {
      this._startRotating();
    }
  }

  override use(_usedByEntity: BaseEntity): void {
    this._toggleRotating();
  }

  override blocked(blockedByEntity: BaseEntity): void {
    if (this.dmg > 0) {
      this.damage(blockedByEntity, this.dmg, null, blockedByEntity.centerPoint);
    }

    if (this.spawnflags & RotatingEntity.STOP) {
      this._stopRotating();
    }
  }

  override touch(touchedByEntity: BaseEntity): void {
    if (!this._isRotating || (this.spawnflags & RotatingEntity.TOUCH_PAIN) === 0 || this.dmg <= 0) {
      return;
    }

    this.damage(touchedByEntity, this.dmg, null, touchedByEntity.centerPoint);
  }
}

/**
 * QUAKED misc_teleporttrain (0 .5 .8) (-8 -8 -8) (8 8 8)
 * This is used for the final boss.
 */
@entity
export class TeleportTrainEntity extends TrainEntity {
  static classname = 'misc_teleporttrain';

  protected override _precache(): void {
    this.engine.PrecacheSound('misc/null.wav');
    this.engine.PrecacheModel('progs/teleport.mdl');
  }

  override spawn(): void {
    if (this.speed === 0) {
      this.speed = 100;
    }

    console.assert(this.target !== null, 'func_train requires a target');
    if (this.target === null) {
      return;
    }

    this.solid = solid.SOLID_NOT;
    this.movetype = moveType.MOVETYPE_PUSH;
    this.avelocity.setTo(100, 200, 300);

    this.noise = 'misc/null.wav';
    this.noise1 = 'misc/null.wav';

    this.setModel('progs/teleport.mdl');
    this.setSize(this.mins, this.maxs);
    this.setOrigin(this.origin);

    this._awaitingActivation = this.targetname !== null;
    this._scheduleThink(this.ltime + 0.1, () => {
      this._trainFind();
    });
  }
}
