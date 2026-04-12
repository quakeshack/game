import Vector from '../../../shared/Vector.ts';

import { channel, moveType, solid } from '../Defs.ts';
import { EntityWrapper, Serializer, serializableObject, serializable } from '../helper/MiscHelpers.ts';
import BaseEntity from './BaseEntity.ts';
import { PlayerEntity } from './Player.ts';

type SubMoveCallback = ((this: BaseEntity) => void) | null;

interface SubMoveData {
  finalOrigin: Vector | null;
  finalAngle: Vector | null;
  callback: SubMoveCallback;
  active: boolean;
}

interface SubUseData {
  callback: SubMoveCallback;
}

export enum TriggerFieldFlag {
  /** Vanilla Quake behavior */
  TFF_NONE = 0,
  /** Dead actors can still trigger the field */
  TFF_DEAD_ACTORS_TRIGGER = 1,
  /** Any entity can trigger the field */
  TFF_ANY_ENTITY_TRIGGERS = 2,
}

export { TriggerFieldFlag as triggerFieldFlags };

/**
 * Special entity that will trigger a linked entity's use method when touched.
 * Use flags and {triggerFieldFlags} to adjust behavior.
 */
@serializableObject
export class TriggerFieldEntity extends BaseEntity {
  static classname = 'subs_triggerfield';

  protected override _declareFields(): void {
    super._declareFields();
    this.flags = 0 as typeof this.flags;
  }

  override spawn(): void {
    this.movetype = moveType.MOVETYPE_NONE;
    this.solid = solid.SOLID_TRIGGER;

    this.setFieldSize(this.mins, this.maxs);
  }

  setFieldSize(fmins: Vector, fmaxs: Vector): void {
    const dimensions = new Vector(60.0, 60.0, 8.0);
    const mins = fmins.copy().subtract(dimensions);
    const maxs = fmaxs.copy().add(dimensions);
    this.setSize(mins, maxs);
  }

  touch(otherEntity: BaseEntity): void {
    // Upon spawn, otherEntity might be another TriggerField when overlapping.
    if (otherEntity instanceof TriggerFieldEntity) {
      return;
    }

    if (otherEntity.isWorld()) {
      return;
    }

    const otherEntityIsActor = otherEntity.isActor();

    if ((this.flags & TriggerFieldFlag.TFF_ANY_ENTITY_TRIGGERS) === 0 && !otherEntityIsActor) {
      return;
    }

    if (otherEntityIsActor && (this.flags & TriggerFieldFlag.TFF_DEAD_ACTORS_TRIGGER) === 0 && otherEntity.health <= 0) {
      return;
    }

    if (this.game.time < this.attack_finished) {
      return;
    }

    this.attack_finished = this.game.time + 1.0;

    this.owner?.use(otherEntity);
  }
}

/**
 * Special entity that will trigger a linked entity's useTargets method after a delay.
 * You do not have to spawn this yourself, it will be done by useTargets when a delay is set.
 */
@serializableObject
export class DelayedThinkEntity extends BaseEntity {
  static classname = 'subs_delayedthink';

  @serializable activator: BaseEntity | null = null;
  @serializable delay = 0;

  protected override _declareFields(): void {
    super._declareFields();
    this._sub ??= new Sub(this);
  }

  override spawn(): void {
    if (this.owner === null || this.activator === null) {
      return;
    }

    this.message = this.owner.message;
    this.killtarget = this.owner.killtarget;
    this.target = this.owner.target;

    console.assert(this.delay > 0, 'delay must be greater than 0');
    console.assert(this.killtarget !== null || this.target !== null, 'must have either killtarget or target');

    this._scheduleThink(this.game.time + this.delay, function (this: DelayedThinkEntity): void {
      // Reset delay to avoid repeated delayed dispatches during save/load edge cases.
      this.delay = 0;
      this._sub?.useTargets(this.activator!);
      this.remove();
    });
  }
}

/**
 * Helper class to make entities more interactive:
 * - movements
 * - delayed interactions
 * - optional triggers upon use
 */
@serializableObject
export class Sub<T extends BaseEntity = BaseEntity> extends EntityWrapper<T> {
  readonly _serializer: Serializer<Sub<T>>;
  @serializable _moveData: SubMoveData;
  @serializable _useData: SubUseData;

  constructor(entity: T) {
    super(entity);

    this._serializer = new Serializer(this, this._engine);

    this._moveData = Serializer.makeSerializableObject({
      finalOrigin: null,
      finalAngle: null,
      callback: null,
      active: false,
    } as SubMoveData, this._engine);

    this._useData = Serializer.makeSerializableObject({
      callback: null,
    } as SubUseData, this._engine);

    this.reset();
  }

  protected override _assertEntity(): void {
    console.assert(this._entity.target !== undefined, 'target property required');
    console.assert(this._entity.killtarget !== undefined, 'killtarget property required');
  }

  /**
   * QuakeEd only writes a single float for angles, so up and down are special cases.
   */
  setMovedir(): void {
    if (this._entity.angles.equalsTo(0.0, -1.0, 0.0)) {
      this._entity.movedir.setTo(0.0, 0.0, 1.0);
    } else if (this._entity.angles.equalsTo(0.0, -2.0, 0.0)) {
      this._entity.movedir.setTo(0.0, 0.0, -1.0);
    } else {
      const { forward } = this._entity.angles.angleVectors();
      this._entity.movedir.set(forward);
    }

    this._entity.angles.setTo(0.0, 0.0, 0.0);
  }

  reset(): void {
    // Reset current movement/use bookkeeping.
    this._moveData.finalAngle = null;
    this._moveData.finalOrigin = null;
    this._moveData.callback = null;
    this._moveData.active = false;

    this._useData.callback = null;
  }

  /**
   * Returns true when regular entity think handling should continue.
   * @returns True when normal entity think processing should continue.
   */
  _think(): boolean {
    if (this._moveData.active) {
      if (this._moveData.finalOrigin !== null) {
        this._entity.setOrigin(this._moveData.finalOrigin);
        this._entity.velocity.clear();
        this._moveData.finalOrigin = null;
      }

      if (this._moveData.finalAngle !== null) {
        this._entity.angles.set(this._moveData.finalAngle);
        this._entity.avelocity.clear();
        this._moveData.finalAngle = null;
      }

      if (this._moveData.callback !== null) {
        this._moveData.callback.call(this._entity);
        this._moveData.callback = null;
      }

      this._moveData.active = false;
      return false;
    }

    if (this._useData.callback !== null) {
      this._useData.callback.call(this._entity);
      this._useData.callback = null;
      return false;
    }

    return true;
  }

  /**
   * Set an entity off on a journey toward a destination.
   */
  calcMove(tdest: Vector, tspeed: number, callback: SubMoveCallback = null): void {
    console.assert(tspeed !== 0, 'desired movement speed provided');

    this._moveData.active = true;
    this._moveData.callback = callback;
    this._moveData.finalOrigin = tdest.copy();

    // Check if we are already in place.
    if (this._entity.origin.equals(tdest)) {
      this._entity.velocity.clear();
      this._entity._scheduleThink(this._entity.ltime + 0.1, function (this: BaseEntity): void {
        this._sub?._think();
      }, 'sub-calcmove');
      return;
    }

    // Set destdelta to the vector needed to move.
    const destinationDelta = tdest.copy().subtract(this._entity.origin);
    const distance = destinationDelta.len();

    // Divide by speed to get the time to reach dest.
    const travelTime = distance / tspeed;

    if (travelTime < 0.1) {
      // Too soon.
      this._entity.velocity.clear();
      this._entity._scheduleThink(this._entity.ltime + 0.1, function (this: BaseEntity): void {
        this._sub?._think();
      }, 'sub-calcmove');
      return;
    }

    // Schedule a think to trigger when the destination is reached.
    this._entity._scheduleThink(this._entity.ltime + travelTime, function (this: BaseEntity): void {
      this._sub?._think();
    }, 'sub-calcmove');

    // Scale the delta vector by travel time to get velocity.
    this._entity.velocity = destinationDelta.multiply(1.0 / travelTime);
  }

  useTargets(activatorEntity: BaseEntity): void {
    console.assert(activatorEntity !== null, 'activator is required');

    // Delayed execution has to be done with a helper entity.
    if (this._entity.delay && this._useData.callback === null) {
      this._engine.SpawnEntity(DelayedThinkEntity.classname, {
        owner: this._entity,
        delay: this._entity.delay,
        activator: activatorEntity,
      });
      return;
    }

    // Print a message if the activator is a player.
    if (activatorEntity instanceof PlayerEntity && this._entity.message) {
      activatorEntity.centerPrint(this._entity.message);

      if (!this._entity.noise) {
        activatorEntity.startSound(channel.CHAN_VOICE, 'misc/talk.wav');
      }
    }

    if (this._entity.killtarget) {
      // Preserve stock QC behavior: killtargets are processed in a find/remove loop
      // and the function returns as soon as the search runs dry, so targets are not
      // fired when killtarget processing was entered.
      let searchEntity: BaseEntity | null = this._game.worldspawn;
      while (searchEntity !== null) {
        searchEntity = searchEntity.findNextEntityByFieldAndValue('targetname', this._entity.killtarget);
        if (searchEntity === null) {
          return;
        }

        searchEntity.remove();
      }
    }

    // Fire targets.
    if (this._entity.target) {
      for (const edict of this._engine.FindAllByFieldAndValue('targetname', this._entity.target)) {
        const entity = edict.entity;
        if (entity instanceof BaseEntity) {
          entity.use(activatorEntity);
        }
      }
    }
  }
}

export default Sub;
