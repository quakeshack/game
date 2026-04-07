import Vector from '../../../shared/Vector.ts';

import { attn, channel, damage, flags, moveType, solid } from '../Defs.ts';
import { entity, serializable } from '../helper/MiscHelpers.ts';
import BaseEntity from './BaseEntity.ts';
import { TeleportEffectEntity } from './Misc.ts';
import { PlayerEntity, TelefragTriggerEntity } from './Player.ts';
import { TeleportTrainEntity } from './props/Platforms.ts';
import { Sub } from './Subs.ts';
import { DamageHandler } from './Weapons.ts';

@entity
export class BaseTriggerEntity extends BaseEntity {
  /** @protected */
  protected static readonly _sounds = [null, 'misc/secret.wav', 'misc/talk.wav', 'misc/trigger1.wav'] as const;

  static SPAWNFLAG_NOTOUCH = 1;
  static SPAWNFLAG_NOMESSAGE = 1;

  @serializable sounds = 0;
  @serializable noise: string | null = null;
  @serializable health = 0;
  @serializable max_health = 0;
  @serializable wait = 0;
  @serializable delay = 0;

  protected override _declareFields(): void {
    super._declareFields();
    this.takedamage = damage.DAMAGE_NO;
    this._sub ??= new Sub(this);
    this._damageHandler = new DamageHandler(this);
  }

  thinkDie(_attackerEntity: BaseEntity): void {
  }

  protected override _precache(): void {
    const soundName = (this.constructor as typeof BaseTriggerEntity)._sounds[this.sounds];
    if (soundName !== null && soundName !== undefined) {
      this.engine.PrecacheSound(soundName);
    }
  }

  override spawn(): void {
    const soundName = (this.constructor as typeof BaseTriggerEntity)._sounds[this.sounds] ?? null;
    const sub = this._sub;
    console.assert(sub !== null, 'BaseTriggerEntity requires Sub helper');

    // some trigger classes do not have models, they are more like logic nodes
    if (sub === null || this.model === null) {
      return;
    }

    // QuakeC: subs.qc/InitTrigger
    this.noise = soundName;

    if (!this.angles.isOrigin()) {
      sub.setMovedir();
    }

    this.solid = solid.SOLID_TRIGGER;
    this.setModel(this.model);
    this.movetype = moveType.MOVETYPE_NONE;
    this.model = null;
    this.modelindex = 0;
  }
}

/**
 * QUAKED trigger_relay (.5 .5 .5) (-8 -8 -8) (8 8 8)
 * This fixed size trigger cannot be touched, it can only be fired by other events.
 * It can contain killtargets, targets, delays, and messages.
 */
@entity
export class RelayTriggerEntity extends BaseTriggerEntity {
  static classname = 'trigger_relay';

  override use(activatorEntity: BaseEntity): void {
    this._sub?.useTargets(activatorEntity);
  }

  protected override _precache(): void {
  }

  override spawn(): void {
  }
}

/**
 * QUAKED trigger_multiple (.5 .5 .5) ? notouch
 * Variable sized repeatable trigger. Must be targeted at one or more entities.
 * If "health" is set, the trigger must be killed to activate each time.
 * If "delay" is set, the trigger waits some time after activating before firing.
 * "wait": seconds between triggerings (.2 default).
 * If notouch is set, the trigger is only fired by other entities, not by touching.
 * NOTOUCH has been obsoleted by trigger_relay.
 * sounds
 * 1) secret
 * 2) beep beep
 * 3) large switch
 * 4)
 * set "message" to text string
 */
@entity
export class MultipleTriggerEntity extends BaseTriggerEntity {
  static classname = 'trigger_multiple';

  @serializable protected _isActive = false;

  protected _canTrigger(_triggeredByEntity: BaseEntity): boolean {
    return true;
  }

  /**
   * Trigger avenue, can be reached through use, touch, or thinkDie.
   * @returns True when the trigger actually fired.
   */
  protected _trigger(triggeredByEntity: BaseEntity): boolean {
    if (this._isActive) {
      return false;
    }

    if (!this._canTrigger(triggeredByEntity)) {
      return false;
    }

    this._isActive = true;

    if (this.noise) {
      triggeredByEntity.startSound(channel.CHAN_BODY, this.noise);
    }

    this.takedamage = damage.DAMAGE_NO;
    this._sub?.useTargets(triggeredByEntity);

    if (this.wait > 0) {
      this._scheduleThink(this.game.time + this.wait, () => {
        if (this.max_health > 0) {
          this.health = this.max_health;
          this.takedamage = damage.DAMAGE_YES;
          this.solid = solid.SOLID_BBOX;
        }
        this._isActive = false;
      });

      return true;
    }

    // We can't remove directly inside a touch callback because engine area-link
    // iteration may still be in progress, so use the deferred removal path.
    this.lazyRemove();
    return true;
  }

  override touch(touchedByEntity: BaseEntity): void {
    if ((this.spawnflags & BaseTriggerEntity.SPAWNFLAG_NOTOUCH) !== 0) {
      return;
    }

    if (!(touchedByEntity instanceof PlayerEntity)) {
      return;
    }

    if (!this.movedir.isOrigin()) {
      const { forward } = touchedByEntity.angles.angleVectors();
      if (forward.dot(this.movedir) < 0) {
        return;
      }
    }

    this._trigger(touchedByEntity);
  }

  override use(usedByEntity: BaseEntity): void {
    this._trigger(usedByEntity);
  }

  override thinkDie(killedByEntity: BaseEntity): void {
    this._trigger(killedByEntity);
  }

  override spawn(): void {
    super.spawn();

    if (!this.wait) {
      this.wait = 0.2;
    }

    if (this.health > 0) {
      this.max_health = this.health;
      this.takedamage = damage.DAMAGE_YES;
      this.solid = solid.SOLID_BBOX;
      this.setOrigin(this.origin);
    }
  }
}

/**
 * QUAKED trigger_once (.5 .5 .5) ? notouch
 * Variable sized trigger. Triggers once, then removes itself.
 * You must set the key "target" to the name of another object in the level that has a matching
 * "targetname". If "health" is set, the trigger must be killed to activate.
 * If notouch is set, the trigger is only fired by other entities, not by touching.
 * If "killtarget" is set, any objects that have a matching "target" will be removed when the trigger is fired.
 * If "angle" is set, the trigger will only fire when someone is facing the direction of the angle. Use "360" for an angle of 0.
 * sounds
 * 1) secret
 * 2) beep beep
 * 3) large switch
 * 4)
 * set "message" to text string
 */
@entity
export class OnceTriggerEntity extends MultipleTriggerEntity {
  static classname = 'trigger_once';

  override spawn(): void {
    this.wait = -1;
    super.spawn();
  }
}

/**
 * QUAKED trigger_secret (.5 .5 .5) ?
 * Secret counter trigger.
 * sounds
 * 1) secret
 * 2) beep beep
 * 3)
 * 4)
 * set "message" to text string
 */
@entity
export class SecretTriggerEntity extends OnceTriggerEntity {
  static classname = 'trigger_secret';

  protected override _declareFields(): void {
    super._declareFields();
    this.sounds = 1;
    this.message = 'You found a secret area!';
  }

  protected override _canTrigger(triggeredByEntity: BaseEntity): boolean {
    return triggeredByEntity instanceof PlayerEntity;
  }

  protected override _trigger(triggeredByEntity: BaseEntity): boolean {
    if (!super._trigger(triggeredByEntity)) {
      return false;
    }

    this.engine.eventBus.publish('game.secret.found', this, triggeredByEntity);
    return true;
  }

  override spawn(): void {
    this.wait = -1;
    this.engine.eventBus.publish('game.secret.spawned', this);
    super.spawn();
  }
}

/**
 * QUAKED trigger_counter (.5 .5 .5) ? nomessage
 * Acts as an intermediary for an action that takes multiple inputs.
 *
 * If nomessage is not set, it will print "1 more..." etc when triggered and
 * "sequence complete" when finished.
 *
 * Optional "message" key allows customization of the complete message shown to the player.
 *
 * After the counter has been triggered "count" times (default 2), it will fire all of its targets and remove itself.
 */
@entity
export class CountTriggerEntity extends MultipleTriggerEntity {
  static classname = 'trigger_counter';

  @serializable count = 0;

  override use(usedByEntity: BaseEntity): void {
    this.count--;

    if (this.count < 0) {
      return;
    }

    if (this.count > 0) {
      if (usedByEntity instanceof PlayerEntity && (this.spawnflags & BaseTriggerEntity.SPAWNFLAG_NOMESSAGE) === 0) {
        usedByEntity.centerPrint(`Only ${this.count} more to go...`);
      }
      return;
    }

    if (usedByEntity instanceof PlayerEntity && (this.spawnflags & BaseTriggerEntity.SPAWNFLAG_NOMESSAGE) === 0 && this.message === null) {
      usedByEntity.centerPrint('Sequence completed!');
    }

    super.use(usedByEntity);
  }

  override spawn(): void {
    this.wait = -1;
    this.count ||= 2;
    super.spawn();
  }
}

/**
 * QUAKED info_teleport_destination (.5 .5 .5) (-8 -8 -8) (8 8 32)
 * This is the destination marker for a teleporter.
 * It should have a "targetname" field with the same value as a teleporter's "target" field.
 */
@entity
export class InfoTeleportDestination extends BaseEntity {
  static classname = 'info_teleport_destination';

  @serializable mangle = new Vector();

  override spawn(): void {
    console.assert(this.targetname !== null, 'Needs a targetname');
    this.mangle.set(this.angles);
    this.angles.clear();
    this.model = null;
    this.origin[2] += 27.0;
  }
}

/**
 * QUAKED trigger_teleport (.5 .5 .5) ? PLAYER_ONLY SILENT
 * Any object touching this will be transported to the corresponding info_teleport_destination entity.
 * You must set the "target" field, and create an object with a "targetname" field that matches.
 *
 * If the trigger_teleport has a targetname, it will only teleport entities when it has been fired.
 */
@entity
export class TeleportTriggerEntity extends BaseTriggerEntity {
  static classname = 'trigger_teleport';

  static FLAG_PLAYER_ONLY = 1;
  static FLAG_SILENT = 2;

  protected override _precache(): void {
    this.engine.PrecacheSound('ambience/hum1.wav');
  }

  override use(_activatorEntity: BaseEntity): void {
    // Make sure even still objects get hit.
    this.game.force_retouch = 2;
    this._scheduleThink(this.game.time + 0.2, () => {
    });
  }

  override touch(touchedByEntity: BaseEntity): void {
    if (this.targetname !== null && this.nextthink < this.game.time) {
      return;
    }

    if ((this.spawnflags & TeleportTriggerEntity.FLAG_PLAYER_ONLY) !== 0 && !(touchedByEntity instanceof PlayerEntity)) {
      return;
    }

    // Only teleport living creatures.
    if (touchedByEntity.health <= 0 || touchedByEntity.solid !== solid.SOLID_SLIDEBOX) {
      return;
    }

    this._sub?.useTargets(touchedByEntity);

    // Put a tfog where the player was.
    this.engine.SpawnEntity(TeleportEffectEntity.classname, { origin: touchedByEntity.origin });

    console.assert(this.target !== null, 'trigger_teleport requires a target');
    if (this.target === null) {
      return;
    }

    const target = this.findFirstEntityByFieldAndValue('targetname', this.target);
    console.assert(target instanceof InfoTeleportDestination || target instanceof TeleportTrainEntity, 'Target must be an InfoTeleportDestination or TeleportTrainEntity');
    if (!(target instanceof InfoTeleportDestination) && !(target instanceof TeleportTrainEntity)) {
      return;
    }

    const directionAngles = target instanceof InfoTeleportDestination ? target.mangle : target.angles;
    const { forward } = directionAngles.angleVectors();

    // Spawn a tfog flash in front of the destination.
    this.engine.SpawnEntity(TeleportEffectEntity.classname, {
      origin: forward.copy().multiply(32.0).add(target.origin),
    });
    // Spawn an ephemeral telefrag trigger.
    this.engine.SpawnEntity(TelefragTriggerEntity.classname, {
      origin: target.origin,
      owner: touchedByEntity,
    });

    // Move the player and lock him down for a little while.
    if (!touchedByEntity.health) {
      touchedByEntity.origin.set(target.origin);
      touchedByEntity.velocity.set(
        forward.copy().multiply(touchedByEntity.velocity[0]).add(forward.copy().multiply(touchedByEntity.velocity[1])),
      );
      return;
    }

    touchedByEntity.setOrigin(target.origin);
    touchedByEntity.angles.set(directionAngles);
    touchedByEntity.angles[2] = 0.0;

    if (touchedByEntity instanceof PlayerEntity) {
      touchedByEntity.fixangle = true;
      touchedByEntity.teleport_time = this.game.time + 0.7;
      if ((touchedByEntity.flags & flags.FL_ONGROUND) !== 0) {
        touchedByEntity.flags &= ~flags.FL_ONGROUND;
      }
      touchedByEntity.velocity.set(forward.multiply(300));
    }

    touchedByEntity.flags &= ~flags.FL_ONGROUND;
  }

  override spawn(): void {
    console.assert(this.target !== null, 'Teleporter always need a target');
    super.spawn();

    if ((this.spawnflags & TeleportTriggerEntity.FLAG_SILENT) === 0) {
      const origin = this.mins.copy().add(this.maxs).multiply(0.5);
      this.engine.SpawnAmbientSound(origin, 'ambience/hum1.wav', 0.5, attn.ATTN_STATIC);
    }
  }
}

/**
 * QUAKED trigger_onlyregistered (.5 .5 .5) ?
 * Only fires if playing the registered version, otherwise prints a message.
 */
@entity
export class OnlyRegisteredTriggerEntity extends BaseTriggerEntity {
  static classname = 'trigger_onlyregistered';

  protected override _precache(): void {
    this.engine.PrecacheSound('misc/talk.wav');
  }

  override touch(otherEntity: BaseEntity): void {
    if (!(otherEntity instanceof PlayerEntity)) {
      return;
    }

    if (this.attack_finished > this.game.time) {
      return;
    }

    this.attack_finished = this.game.time + 2.0;

    if (this.engine.registered) {
      this.message = null;
      this._sub?.useTargets(otherEntity);
      this.remove();
      return;
    }

    if (this.message) {
      otherEntity.centerPrint(this.message);
      otherEntity.startSound(channel.CHAN_BODY, 'misc/talk.wav');
    }
  }
}

/**
 * QUAKED trigger_setskill (.5 .5 .5) ?
 * Sets skill level to the value of "message".
 * Only used on start map.
 */
@entity
export class SetSkillTriggerEntity extends BaseTriggerEntity {
  static classname = 'trigger_setskill';

  override touch(otherEntity: BaseEntity): void {
    if (!(otherEntity instanceof PlayerEntity)) {
      return;
    }

    this.engine.SetCvar('skill', this.message);
  }

  override spawn(): void {
    console.assert(this.message !== null, 'skill must be set in message field');
    super.spawn();
  }
}

/**
 * QUAKED trigger_changelevel (0.5 0.5 0.5) ? NO_INTERMISSION
 * When the player touches this, they get sent to the map listed in the "map" variable.
 * Unless the NO_INTERMISSION flag is set, the view will go to the info_intermission spot and display stats.
 */
@entity
export class ChangeLevelTriggerEntity extends BaseTriggerEntity {
  static classname = 'trigger_changelevel';

  @serializable map: string | null = null;

  override touch(otherEntity: BaseEntity): void {
    if (!(otherEntity instanceof PlayerEntity)) {
      return;
    }

    if (this.game.noexit > 0 && this.game.mapname !== 'start') {
      this.damage(otherEntity, 50000);
      return;
    }

    if (this.game.coop || this.game.deathmatch) {
      this.engine.BroadcastPrint(`${otherEntity.netname} exited the level\n`);
    }

    this.game.nextmap = this.map;
    this._sub?.useTargets(otherEntity);

    if ((this.spawnflags & 1) !== 0 && !this.game.deathmatch) {
      this.game.loadNextMap();
    }

    this.solid = solid.SOLID_NOT;
    this._scheduleThink(this.game.time + 0.1, () => {
      this.game.startIntermission();
    });
  }

  override spawn(): void {
    console.assert(this.map !== null, 'map must be set');
    super.spawn();
  }
}

/**
 * QUAKED trigger_hurt (.5 .5 .5) ?
 * Any object touching this will be hurt.
 * Set dmg to damage amount (default: 5).
 * Optional netname.
 */
@entity
export class TriggerHurtEntity extends BaseTriggerEntity {
  static classname = 'trigger_hurt';

  @serializable netname: string | null = null;

  override touch(touchedByEntity: BaseEntity): void {
    if (!touchedByEntity.takedamage) {
      return;
    }

    if (this.attack_finished > this.game.time) {
      return;
    }

    this.attack_finished = this.game.time + 1.0;
    this.damage(touchedByEntity, this.dmg);
  }

  override spawn(): void {
    if (!this.dmg) {
      this.dmg = 5;
    }

    super.spawn();
  }
}

/**
 * QUAKED trigger_push (.5 .5 .5) ? PUSH_ONCE
 * Pushes the player and other objects.
 */
@entity
export class TriggerPushEntity extends BaseTriggerEntity {
  static classname = 'trigger_push';
  static FLAG_PUSH_ONCE = 1;

  @serializable speed = 0;

  protected override _precache(): void {
    this.engine.PrecacheSound('ambience/windfly.wav');
  }

  override touch(touchedByEntity: BaseEntity): void {
    if (![moveType.MOVETYPE_BOUNCE, moveType.MOVETYPE_WALK, moveType.MOVETYPE_STEP].includes(touchedByEntity.movetype)) {
      return;
    }

    touchedByEntity.velocity.set(this.movedir.copy().multiply(this.speed * 10));

    if (touchedByEntity instanceof PlayerEntity && touchedByEntity.fly_time < this.game.time) {
      touchedByEntity.fly_time = this.game.time + 1.5;
      touchedByEntity.startSound(channel.CHAN_AUTO, 'ambience/windfly.wav');
    }

    if ((this.spawnflags & TriggerPushEntity.FLAG_PUSH_ONCE) !== 0) {
      this.remove();
    }
  }

  override spawn(): void {
    this.speed ||= 1000;
    super.spawn();
  }
}

/**
 * QUAKED trigger_monsterjump (.5 .5 .5) ?
 * Walking monsters that touch this will jump in the direction of the trigger's angle.
 * "speed" defaults to 200, the speed thrown forward.
 * "height" defaults to 200, the speed thrown upwards.
 */
@entity
export class TriggerMonsterjumpEntity extends BaseTriggerEntity {
  static classname = 'trigger_monsterjump';

  @serializable speed = 0;
  @serializable height = 0;

  override touch(otherEntity: BaseEntity): void {
    const monsterMovementMask: number = flags.FL_MONSTER | flags.FL_FLY | flags.FL_SWIM;
    const monsterOnlyFlag: number = flags.FL_MONSTER;
    const movementFlags = otherEntity.flags & monsterMovementMask;
    if (movementFlags !== monsterOnlyFlag) {
      return;
    }

    // Set XY even if not on ground, so the jump will clear lips.
    const velocity = this.movedir.copy().multiply(this.speed);
    otherEntity.velocity.setTo(velocity[0], velocity[1], otherEntity.velocity[2]);

    if ((otherEntity.flags & flags.FL_ONGROUND) === 0) {
      return;
    }

    otherEntity.flags &= ~flags.FL_ONGROUND;
    otherEntity.velocity[2] = this.height;
  }

  override spawn(): void {
    this.speed ||= 200;
    this.height ||= 200;

    if (this.angles.isOrigin()) {
      this.angles.setTo(0.0, 360.0, 0.0);
    }

    super.spawn();
  }
}
