/* eslint-disable jsdoc/require-returns, jsdoc/require-yields */

import type { ParsedQC, SerializedData, ServerEdict, ServerEngineAPI } from '../../../shared/GameInterfaces.ts';
import type { ServerEdict as RuntimeServerEdict } from '../../../engine/server/Edict.ts';
import type { ServerGameAPI } from '../GameAPI.ts';
import type { Sub } from './Subs.mjs';
import type { DamageHandler } from './Weapons.mjs';

import { BaseClientEdictHandler } from '../../../shared/ClientEdict.ts';
import Q from '../../../shared/Q.ts';
import Vector from '../../../shared/Vector.ts';
import { attn, content, damage, dead, effect, flags, moveType, solid, waterlevel } from '../Defs.ts';
import { entity, serializable, Serializer } from '../helper/MiscHelpers.ts';

type ScheduledThinkCallback<T extends BaseEntity = BaseEntity> = (this: T, entity: T) => void;
type TraceResult = ReturnType<ServerEngineAPI['Traceline']>;

export type { ScheduledThinkCallback, TraceResult };

export interface EntityClass<T extends BaseEntity = BaseEntity> {
  readonly classname: string;
  readonly clientEntityFields: string[];

  new (edict: ServerEdict | null, gameAPI: ServerGameAPI): T;

  _precache(engineAPI: ServerEngineAPI): void;
  _parseModelData(engineAPI: ServerEngineAPI): void;
  _initStates(): void;
}

export interface EntityStateDefinition<T extends BaseEntity = BaseEntity> {
  readonly keyframe: string | number | null;
  readonly nextState: string | null;
  readonly handler: ScheduledThinkCallback<T> | null;
}

/**
 * Serializable scheduled think entry used by the BaseEntity think queue.
 */
@entity
class ScheduledThink {
  @serializable nextThink: number;
  @serializable callback: ScheduledThinkCallback;
  @serializable identifier: string | null;
  @serializable isRequired: boolean;

  _serializer: Serializer<ScheduledThink>;

  constructor(nextThink: number, callback: ScheduledThinkCallback, identifier: string | null, isRequired: boolean) {
    this.nextThink = nextThink;
    this.callback = callback;
    this.identifier = identifier;
    this.isRequired = isRequired;
    this._serializer = new Serializer(this, null);
  }
}

/**
 * Base class for all id1 gameplay entities.
 * The class now declares its core runtime shape directly in TypeScript so modders
 * can see what exists without reverse-engineering serializer side effects.
 * Legacy JS subclasses can still add fields in _declareFields() while the port is in flight.
 */
@entity
export default abstract class BaseEntity {
  /** The classname of the entity referenced by maps. Must be set. */
  public static classname: string;

  /** Optional client-side handler of this entity. */
  public static clientEdictHandler: typeof BaseClientEdictHandler | null = null;

  /**
   * Fields that are exposed to the client.
   * Do not mutate the array contents during runtime.
   */
  public static clientEntityFields: string[] = [];

  // state machine and model meta data
  private static _modelData: Readonly<ParsedQC> | null = null;
  private static _states: Record<string, EntityStateDefinition<BaseEntity>> = {};
  protected static _modelQC: string | null = null;

  // infrastructure
  public engine: ServerEngineAPI;
  public game: ServerGameAPI;
  protected _edictRef: WeakRef<ServerEdict> | null;
  protected _serializer: Serializer<BaseEntity>;

  // helper objects
  protected _damageHandler: DamageHandler | null = null;
  protected _sub: Sub | null = null;

  /** Local entity time used by pushers and related movement code. */
  @serializable ltime = 0.0;
  @serializable origin = new Vector();
  @serializable oldorigin = new Vector();
  @serializable angles = new Vector();
  @serializable mins = new Vector();
  @serializable maxs = new Vector();
  @serializable absmin = new Vector();
  @serializable absmax = new Vector();
  @serializable size = new Vector();
  @serializable velocity = new Vector();
  @serializable avelocity = new Vector();
  @serializable movetype = moveType.MOVETYPE_NONE;
  @serializable solid = solid.SOLID_NOT;
  @serializable flags = flags.FL_NONE;
  @serializable spawnflags = 0;
  @serializable watertype = content.CONTENT_NONE;
  @serializable waterlevel = waterlevel.WATERLEVEL_NONE;
  @serializable teleport_time = 0;

  @serializable view_ofs = new Vector();
  @serializable v_angle = new Vector();
  @serializable punchangle = new Vector();
  @serializable idealpitch = 0;
  @serializable fixangle = false;

  @serializable gravity: number | null = null;
  @serializable groundentity: BaseEntity | null = null;

  @serializable model: string | null = null;
  @serializable modelindex = 0;
  @serializable frame = 0;
  @serializable skin = 0;
  @serializable effects = effect.EF_NONE;
  @serializable alpha = 1.0;
  @serializable keyframe: number | null = null;
  @serializable nextthink = 0.0;

  @serializable owner: BaseEntity | null = null;
  @serializable killtarget: string | null = null;
  @serializable target: string | null = null;
  @serializable targetname: string | null = null;
  @serializable movedir = new Vector();

  @serializable deadflag = dead.DEAD_NO;
  @serializable takedamage = damage.DAMAGE_NO;
  @serializable dmg = 0;
  @serializable dmg_take = 0;
  @serializable dmg_save = 0;
  @serializable dmg_inflictor: BaseEntity | null = null;
  @serializable dmg_attacker: BaseEntity | null = null;
  @serializable show_hostile = 0;
  @serializable attack_finished = 0;
  @serializable pain_finished = 0;
  @serializable message: string | null = null;

  // state machine, needs to be serialized as well, but remains private
  @serializable private _stateNext: string | null = null;
  @serializable private _stateCurrent: string | null = null;
  @serializable private _scheduledThinks: ScheduledThink[] = [];

  /**
   * Return the entity classname.
   */
  get classname(): string {
    const constructorValue = this.constructor as typeof BaseEntity;
    console.assert(typeof constructorValue.classname === 'string', 'Entity classname must be defined on the constructor');
    return constructorValue.classname ?? 'unknown_entity';
  }

  get edict(): ServerEdict | null {
    return this._edictRef?.deref() ?? null;
  }

  /**
   * Return the entity volume.
   */
  get volume(): number {
    return this.size[0] * this.size[1] * this.size[2];
  }

  /**
   * Determine the logical center point of the entity.
   */
  get centerPoint(): Vector {
    return this.origin.isOrigin() ? this.absmin.copy().add(this.absmax).multiply(0.5) : this.origin.copy();
  }

  /**
   * Return the allocated edict id, if available.
   */
  get edictId(): number | undefined {
    const edict = this.edict;
    return edict !== null ? edict.num : undefined;
  }

  constructor(edict: ServerEdict | null, gameAPI: ServerGameAPI) {
    this._edictRef = edict ? new WeakRef(edict) : null;
    this.engine = gameAPI.engine;
    this.game = gameAPI;
    this._serializer = new Serializer(this, this.engine);

    this._declareFields();
    this._precache();
  }

  /**
   * Legacy JS hook for declaring subclass fields before spawn.
   * New TS subclasses should prefer typed class fields and static serializableFields.
   */
  protected _declareFields(): void {
  }

  /**
   * Precache instance resources needed for this entity.
   */
  protected _precache(): void {
  }

  /**
   * Precache class-level resources needed for dynamic spawns.
   */
  static _precache(_engineAPI: ServerEngineAPI): void {
  }

  /**
   * Parse model QC data into runtime model metadata.
   */
  static _parseModelData(engineAPI: ServerEngineAPI): void {
    if (this._modelQC !== null) {
      this._modelData = Object.freeze(engineAPI.ParseQC(this._modelQC));
    }
  }

  /**
   * Configure the state machine.
   * Accessed by the entity Registry during initialization.
   */
  static _initStates(): void {
  }

  /**
   * Build an ordered list of numbered frame names.
   */
  protected static _createFrameNames(prefix: string, count: number): string[] {
    return Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
  }

  /**
   * Reset static state-machine storage before registering a new state graph.
   */
  protected static _resetStates(): void {
    this._states = {};
  }

  /**
   * Define a state machine entry.
   */
  protected static _defineState<T extends BaseEntity>(
    state: string,
    keyframe: string | number | null,
    nextState: string | null = null,
    handler: ScheduledThinkCallback<T> | null = null,
  ): void {
    console.assert(this._states !== null, 'state storage must be initialized in _initStates()');
    this._states[state] = { keyframe, nextState, handler: handler as ScheduledThinkCallback };
  }

  /**
   * Define a looping sequence of animation frames in one call.
   * Generates numbered states `${prefix}1`, `${prefix}2`, etc.
   * The last state loops back to `${prefix}1` unless `loop` is false.
   * @param prefix - State name prefix (e.g. `'army_stand'`).
   * @param frames - Ordered frame names or indices from the model QC.
   * @param handler - Callback invoked on each frame, receives the 0-based frame index.
   * @param loop - Whether the last frame loops back to the first (default: true).
   */
  protected static _defineSequence<T extends BaseEntity>(
    prefix: string,
    frames: readonly (string | number)[],
    handler: ((this: T, frameIndex: number) => void) | null = null,
    loop = true,
  ): void {
    for (let i = 0; i < frames.length; i++) {
      const state = `${prefix}${i + 1}`;
      const nextState = i < frames.length - 1
        ? `${prefix}${i + 2}`
        : (loop ? `${prefix}1` : null);
      const frameIndex = i;
      this._defineState(state, frames[i], nextState, handler !== null
        ? function (this: T): void { handler.call(this, frameIndex); }
        : null);
    }
  }

  /**
   * Start or continue the animation state machine.
   * @returns True when the requested state existed.
   */
  protected _runState(state: string | null = null): boolean {
    let nextState = state;
    if (nextState === null) {
      nextState = this._stateNext;
    }

    if (nextState === null) {
      return false;
    }

    const states = (this.constructor as typeof BaseEntity)._states;
    if (states === null || states[nextState] === undefined) {
      return false;
    }

    const data = states[nextState];
    this._stateCurrent = nextState;
    this._stateNext = data.nextState || null;

    const animation = (this.constructor as typeof BaseEntity)._modelData;
    if (typeof data.keyframe === 'number') {
      this.frame = data.keyframe;
      this.keyframe = data.keyframe;
    } else if (animation !== null && data.keyframe !== null) {
      const frameIndex = animation.frames.indexOf(data.keyframe);
      if (frameIndex !== -1) {
        this.frame = frameIndex;
        this.keyframe = frameIndex;
      }
    }

    this._scheduleThink(this.game.time + 0.1, function (this: BaseEntity): void {
      this._runState();
    }, 'animation-state-machine');

    if (data.handler !== null) {
      data.handler.call(this, this);
    }

    return true;
  }

  /**
   * Schedule a think callback.
   * Accessed by Subs.
   */
  _scheduleThink(
    nextThink: number,
    callback: ScheduledThinkCallback,
    identifier: string | null = null,
    isRequired = false,
  ): void {
    const think = identifier !== null
      ? this._scheduledThinks.find((scheduledThink) => scheduledThink.identifier === identifier) ?? null
      : null;

    if (think !== null) {
      think.nextThink = nextThink;
      think.callback = callback;
      think.isRequired = isRequired;
    } else {
      this._scheduledThinks.push(new ScheduledThink(nextThink, callback, identifier, isRequired));
    }

    this._scheduledThinks.sort((left, right) => left.nextThink - right.nextThink);
    this.nextthink = this._scheduledThinks[0].nextThink;
  }

  /**
   * Run the next scheduled think.
   * @returns True when something executed.
   */
  protected _runScheduledThinks(): boolean {
    if (this._scheduledThinks === null || this._scheduledThinks.length === 0) {
      return false;
    }

    const nextThink = this._scheduledThinks.shift()!;
    nextThink.callback.call(this, this);

    // The callback may have freed this entity, nulling _scheduledThinks.
    if (this._scheduledThinks === null || this._scheduledThinks.length === 0) {
      return true;
    }

    if (this.movetype !== moveType.MOVETYPE_PUSH) {
      while (this._scheduledThinks.length > 0 && this.game.time > this._scheduledThinks[0].nextThink) {
        const scheduledThink = this._scheduledThinks.shift()!;

        if (scheduledThink.isRequired) {
          scheduledThink.callback.call(this, this);
        }

        // Guard against free() called inside a required callback.
        if (this._scheduledThinks === null) {
          return true;
        }
      }
    }

    if (this._scheduledThinks !== null && this._scheduledThinks.length > 0) {
      this.nextthink = this._scheduledThinks[0].nextThink;
    }

    return true;
  }

  /**
   * Try to inflict damage on another entity.
   * @returns True when damage handling was available.
   */
  damage(victimEntity: BaseEntity | null, points: number, attackerEntity: BaseEntity | null = null, hitPoint: Vector | null = null): boolean {
    if (victimEntity === null || victimEntity._damageHandler === null) {
      return false;
    }

    victimEntity._damageHandler.damage(this, attackerEntity || this, points, hitPoint || victimEntity.origin);
    return true;
  }

  /**
   * Check whether this entity can currently receive damage.
   */
  canReceiveDamage(attackerEntity: BaseEntity): boolean {
    if (this._damageHandler === null) {
      return false;
    }

    return this._damageHandler.canReceiveDamage(attackerEntity);
  }

  /**
   * Clear all scheduled thinking.
   */
  resetThinking(): void {
    this._scheduledThinks = [];
    this.nextthink = -1.0;
  }

  /**
   * Assign initial entity data from map parsing or dynamic spawn calls.
   */
  assignInitialData(initialData: Record<string, unknown>): void {
    const entityRecord = this as Record<string, unknown>;

    for (const [key, value] of Object.entries(initialData)) {
      if (key === 'classname') {
        if (this.classname !== value) {
          throw new RangeError('classname from initial data does not match entity classname');
        }

        continue;
      }

      if (key.startsWith('_') || key.startsWith('#')) {
        continue;
      }

      if (!(key in this)) {
        console.warn(`BaseEntity.assignInitialData: invalid key on entity (${this})`, key, value);
        continue;
      }

      const currentValue = entityRecord[key];
      if (typeof currentValue === 'function') {
        console.warn(`BaseEntity.assignInitialData: trying to write into member function (${this})`, key, value);
        continue;
      }

      switch (true) {
        case currentValue instanceof Vector:
          entityRecord[key] = value instanceof Vector
            ? value.copy()
            : new Vector(...String(value).split(' ').map((component: string) => Q.atof(component)));
          break;

        case typeof currentValue === 'number':
          entityRecord[key] = typeof value === 'number' ? value : Q.atof(String(value));
          break;

        default:
          entityRecord[key] = value;
          break;
      }
    }

    if (this.engine.IsLoading()) {
      this._precache();
    }
  }

  /**
   * Set the world origin and relink through the engine.
   */
  setOrigin(origin: Vector): void {
    this.edict!.setOrigin(origin);
  }

  /**
   * Set the entity model and relink through the engine.
   */
  setModel(modelname: string | null): void {
    if (modelname === null || modelname.length === 0) {
      this.modelindex = 0;
      this.model = null;
      return;
    }

    if (this.engine.IsLoading()) {
      this.engine.PrecacheModel(modelname);
    }

    this.edict!.setModel(modelname);
  }

  /**
   * Clear the current model.
   */
  unsetModel(resetSize = false): void {
    this.modelindex = 0;
    this.model = null;

    if (resetSize) {
      this.setSize(Vector.origin, Vector.origin);
    }
  }

  /**
   * Set the bounding box size.
   */
  setSize(mins: Vector, maxs: Vector): void {
    this.edict!.setMinMaxSize(mins, maxs);
  }

  /**
   * Compare this entity against another entity or edict.
   */
  equals(otherEntity: BaseEntity | ServerEdict | null): boolean {
    if (this.edict === null) {
      return false;
    }

    let candidate: BaseEntity | null = null;

    if (otherEntity instanceof BaseEntity) {
      candidate = otherEntity;
    } else if (otherEntity !== null) {
      if (otherEntity.entity === null) {
        return false;
      }

      const entity = otherEntity.entity!;
      console.assert(entity instanceof BaseEntity, 'ServerEdict.entity must reference a BaseEntity instance');
      candidate = entity as unknown as BaseEntity;
    }

    if (candidate === null || candidate.edict === null) {
      return false;
    }

    return this.edict!.equals(candidate.edict! as RuntimeServerEdict);
  }

  /**
   * Return whether this is the worldspawn entity.
   */
  isWorld(): boolean {
    return this.edictId === 0;
  }

  /**
   * Return whether this entity counts as an actor.
   */
  isActor(): boolean {
    return false;
  }

  /**
   * Return a readable debug label for the entity.
   */
  toString(): string {
    return `${this.classname} (num: ${this.edictId}, origin: ${this.origin}, state: ${this._stateCurrent})`;
  }

  /**
   * Return an aim direction using the engine helper.
   */
  aim(direction: Vector): Vector {
    return this.edict!.aim(direction);
  }

  /**
   * Try to walk-move this entity.
   */
  walkMove(yaw: number, dist: number): boolean {
    return this.edict!.walkMove(yaw, dist);
  }

  /**
   * Change the current yaw toward ideal_yaw.
   */
  changeYaw(): number {
    return this.edict!.changeYaw();
  }

  /**
   * Drop the entity toward the floor.
   */
  dropToFloor(z = -2048.0): boolean {
    return this.edict!.dropToFloor(z);
  }

  /**
   * Return whether the entity is on the floor.
   */
  isOnTheFloor(): boolean {
    return this.edict!.isOnTheFloor();
  }

  /**
   * Turn this entity into a static world object.
   */
  makeStatic(): void {
    this.edict!.makeStatic();
  }

  /**
   * Spawn an ambient looping sound at the entity center.
   */
  spawnAmbientSound(sfxName: string, volume: number, attenuation: number): void {
    this.engine.PrecacheSound(sfxName);
    this.engine.SpawnAmbientSound(this.centerPoint, sfxName, volume, attenuation);
  }

  /**
   * Start a sound bound to this entity.
   */
  startSound(soundChannel: number, sfxName: string, volume = 1.0, attenuation = attn.ATTN_NORM): void {
    this.engine.PrecacheSound(sfxName);
    this.engine.StartSound(this.edict! as RuntimeServerEdict, soundChannel, sfxName, volume, attenuation);
  }

  /**
   * Remove this entity immediately.
   */
  remove(): void {
    this.edict!.freeEdict();
  }

  /**
   * Remove this entity after the current callback stack finishes.
   */
  lazyRemove(): void {
    this.unsetModel(true);
    this.solid = solid.SOLID_NOT;
    this.movetype = moveType.MOVETYPE_NONE;
    this.resetThinking();
    this._scheduleThink(this.game.time + 0.1, function (this: BaseEntity): void {
      this.remove();
    }, 'remove', true);
  }

  /**
   * Reset transient combat and movement relationships.
   */
  clear(): void {
    this.resetThinking();
    this.dmg_attacker = null;
    this.dmg_inflictor = null;
    this.owner = null;
    this.groundentity = null;
  }

  /**
   * Free this entity for garbage collection.
   * All own properties are set to null so that external references to this
   * entity see a clearly dead object. This intentionally violates TS field
   * types — the entity must not be used after free().
   */
  free(): void {
    const entityRecord = this as Record<string, unknown>;

    for (const property of Object.keys(entityRecord)) {
      entityRecord[property] = null;
    }
  }

  /**
   * Spawn the entity into the world.
   */
  spawn(): void {
    // no default spawn logic
  }

  /**
   * Run scheduled thinks and clear references to freed entities.
   */
  think(): void {
    const entityRecord = this as Record<string, unknown>;

    // remove all references to freed entities before running thinks
    for (const key of Object.keys(entityRecord)) {
      const value = entityRecord[key];
      if (value instanceof BaseEntity && value.edict === null) {
        entityRecord[key] = null;
      }
    }

    this._runScheduledThinks();
  }

  /**
   * Called when another entity uses this entity.
   */
  use(_usedByEntity: BaseEntity): void {
  }

  /**
   * Called when another entity blocks this entity.
   */
  blocked(_blockedByEntity: BaseEntity): void {
  }

  /**
   * Called when another entity touches this entity.
   */
  touch(_touchedByEntity: BaseEntity, _pushVector: Vector): void {
  }

  /**
   * Called when a player or actor interacts with this entity via +use.
   */
  interact(_interactingEntity: BaseEntity): void {
  }

  /**
   * Return whether two entity bounds intersect.
   */
  isTouching(otherEntity: BaseEntity): boolean {
    for (let i = 0; i < 3; i++) {
      if (this.mins[i] > otherEntity.maxs[i]) {
        return false;
      }

      if (this.maxs[i] < otherEntity.mins[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Find the next entity matching a field/value pair.
   */
  findNextEntityByFieldAndValue(field: string, value: string, lastEntity: BaseEntity | null = this, loopSearch = false): BaseEntity | null {
    const lastEntityId = lastEntity?.edictId;
    const edict = this.engine.FindByFieldAndValue(field, value, lastEntityId !== undefined ? lastEntityId + 1 : 0);
    if (edict === null || edict.entity === null) {
      return loopSearch ? this.findFirstEntityByFieldAndValue(field, value) : null;
    }

    const entity = edict.entity!;
    console.assert(entity instanceof BaseEntity, 'FindByFieldAndValue must return BaseEntity-backed edicts');
    return entity as unknown as BaseEntity;
  }

  /**
   * Find the first entity matching a field/value pair.
   */
  findFirstEntityByFieldAndValue(field: string, value: string): BaseEntity | null {
    const edict = this.engine.FindByFieldAndValue(field, value);
    if (edict === null || edict.entity === null) {
      return null;
    }

    const entity = edict.entity!;
    console.assert(entity instanceof BaseEntity, 'FindByFieldAndValue must return BaseEntity-backed edicts');
    return entity as unknown as BaseEntity;
  }

  /**
   * Yield all entities matching a field/value pair.
   */
  *findAllEntitiesByFieldAndValue(field: string, value: string): IterableIterator<BaseEntity> {
    for (const edict of this.engine.FindAllByFieldAndValue(field, value)) {
      if (edict.entity === null) {
        continue;
      }

      const entity = edict.entity!;
      console.assert(entity instanceof BaseEntity, 'FindAllByFieldAndValue must return BaseEntity-backed edicts');
      yield entity as unknown as BaseEntity;
    }
  }

  /**
   * Return the next best client target from the engine helper.
   */
  getNextBestClient(): BaseEntity | null {
    const nextClient = this.edict!.getNextBestClient()?.entity as BaseEntity | null;

    return nextClient;
  }

  /**
   * Trace from this entity to another entity.
   */
  tracelineToEntity(target: BaseEntity, ignoreMonsters: boolean): TraceResult {
    const start = this.origin.copy().add(this.view_ofs);
    const end = target.origin.copy().add(target.view_ofs);
    return this.engine.Traceline(start, end, ignoreMonsters, this.edict! as RuntimeServerEdict);
  }

  /**
   * Trace from this entity to a world-space point.
   */
  tracelineToVector(target: Vector, ignoreMonsters: boolean): TraceResult {
    const start = this.origin.copy().add(this.view_ofs);
    return this.engine.Traceline(start, target, ignoreMonsters, this.edict! as RuntimeServerEdict);
  }

  /**
   * Trace between two world-space points.
   */
  traceline(origin: Vector, target: Vector, ignoreMonsters: boolean): TraceResult {
    return this.engine.Traceline(origin, target, ignoreMonsters, this.edict! as RuntimeServerEdict);
  }

  /**
   * Move this entity toward its goal.
   */
  moveToGoal(distance: number, target: Vector | null = null): boolean {
    return this.edict!.moveToGoal(distance, target);
  }

  serialize(): SerializedData {
    return this._serializer.serialize() as unknown as SerializedData;
  }

  deserialize(data: SerializedData): void {
    this._serializer.deserialize(data as unknown as Record<string, ['X']>);
  }
}
