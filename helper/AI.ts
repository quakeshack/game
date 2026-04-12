import type { ServerGameAPI } from '../GameAPI.ts';

import Vector from '../../../shared/Vector.ts';

import { damage, effect, flags, items, range } from '../Defs.ts';
import BaseEntity from '../entity/BaseEntity.ts';
import type BaseMonster from '../entity/monster/BaseMonster.ts';
import { serializableObject, EntityWrapper, serializable, Serializer } from './MiscHelpers.ts';

type CombatTarget = MonsterActor | PlayerActor;

/**
 * Game-wide AI state used to coordinate monster perception.
 */
export class GameAI {
  readonly _game: ServerGameAPI;

  _sightEntity: BaseEntity | null = null;
  _sightEntityTime = 0.0;
  _sightEntityLastOrigin = new Vector();

  constructor(game: ServerGameAPI) {
    this._game = game;
  }
}

/**
 * Base interface for entity-local AI implementations.
 */
export class EntityAI<T extends BaseMonster = BaseMonster> extends EntityWrapper<T> {
  protected get _gameAI(): GameAI {
    return this._game.gameAI;
  }

  protected override get _entity(): T {
    return super._entity;
  }

  get enemyRange(): range {
    return range.RANGE_FAR;
  }

  get enemyIsVisible(): boolean {
    return false;
  }

  clear(): void {
    console.assert(false, 'implement this');
  }

  think(): void {
    console.assert(false, 'implement this');
  }

  spawn(): void {
    console.assert(false, 'implement this');
  }

  stand(): void {
    console.assert(false, 'implement this');
  }

  walk(dist: number): void {
    void dist;
    console.assert(false, 'implement this');
  }

  run(dist: number): void {
    void dist;
    console.assert(false, 'implement this');
  }

  pain(dist: number): void {
    void dist;
    console.assert(false, 'implement this');
  }

  charge(dist = 0): void {
    void dist;
    console.assert(false, 'implement this');
  }

  painforward(dist: number): void {
    void dist;
    console.assert(false, 'implement this');
  }

  face(): void {
    console.assert(false, 'implement this');
  }

  turn(): void {
    console.assert(false, 'implement this');
  }

  forward(dist: number): void {
    void dist;
    console.assert(false, 'implement this');
  }

  back(dist: number): void {
    void dist;
    console.assert(false, 'implement this');
  }

  chargeSide(): void {
    console.assert(false, 'implement this');
  }

  melee(): void {
    console.assert(false, 'implement this');
  }

  meleeSide(): void {
    console.assert(false, 'implement this');
  }

  /**
   * Finds a target entity for the AI to interact with.
   * @returns True when a target was acquired.
   */
  findTarget(): boolean {
    console.assert(false, 'implement this');
    return false;
  }

  /**
   * Signalizes that a target entity has been found.
   */
  foundTarget(targetEntity: BaseEntity, fromPain = false): void {
    void targetEntity;
    void fromPain;
    console.assert(false, 'implement this');
  }

  use(userEntity: BaseEntity): void {
    void userEntity;
    console.assert(false, 'implement this');
  }
}

/**
 * No-op AI implementation for scripted monsters that do not use the normal behavior system.
 */
export class NoopMonsterAI<T extends BaseMonster = BaseMonster> extends EntityAI<T> {
  override clear(): void {
  }

  override think(): void {
  }

  override spawn(): void {
  }

  override stand(): void {
  }

  override walk(_dist: number): void {
  }

  override run(_dist: number): void {
  }

  override pain(_dist: number): void {
  }

  override charge(_dist = 0): void {
  }

  override painforward(_dist: number): void {
  }

  override face(): void {
  }

  override turn(): void {
  }

  override forward(_dist: number): void {
  }

  override back(_dist: number): void {
  }

  override chargeSide(): void {
  }

  override melee(): void {
  }

  override meleeSide(): void {
  }

  override findTarget(): boolean {
    return false;
  }

  override foundTarget(_targetEntity: BaseEntity, _fromPain = false): void {
  }

  override use(_userEntity: BaseEntity): void {
  }
}

/**
 * Runtime marker for monster entities without importing BaseMonster at runtime.
 */
abstract class MonsterActor extends BaseEntity {
  declare health: number;
  declare enemy: BaseEntity | null;
  declare _ai: EntityAI<BaseMonster>;

  abstract thinkRun(): void;

  static [Symbol.hasInstance](value: unknown): boolean {
    if (!(value instanceof BaseEntity)) {
      return false;
    }

    const candidate = value as {
      health?: unknown;
      enemy?: unknown;
      thinkRun?: unknown;
      _ai?: unknown;
    };

    return typeof candidate.health === 'number'
      && 'enemy' in candidate
      && typeof candidate.thinkRun === 'function'
      && candidate._ai !== undefined;
  }
}

/**
 * Runtime marker for the player entity without importing Player.ts at runtime.
 */
abstract class PlayerActor extends BaseEntity {
  declare health: number;
  declare items: number | undefined;

  static [Symbol.hasInstance](value: unknown): boolean {
    if (!(value instanceof BaseEntity)) {
      return false;
    }

    return value.classname === 'player';
  }
}

/**
 * Runtime marker for path_corner entities without importing Misc.ts at runtime.
 */
abstract class PathCornerMarker extends BaseEntity {
  static [Symbol.hasInstance](value: unknown): boolean {
    return value instanceof BaseEntity && value.classname === 'path_corner';
  }
}

/**
 * Normalizes an angle to the range [0, 360).
 * @returns Normalized angle in degrees.
 */
function anglemod(v: number): number {
  while (v >= 360) {
    v -= 360;
  }

  while (v < 0) {
    v += 360;
  }

  return v;
}

export enum ATTACK_STATE {
  AS_NONE = 0,
  AS_STRAIGHT = 1,
  AS_SLIDING = 2,
  AS_MELEE = 3,
  AS_MISSILE = 4,
}

@serializableObject
class EnemyMetadata {
  readonly _serializer: Serializer<EnemyMetadata>;

  @serializable isVisible = false;
  @serializable infront = false;
  @serializable range: range = range.RANGE_FAR;
  @serializable yaw: number | null = null;
  @serializable nextPathUpdateTime = 0.0;
  @serializable nextKnownOriginTime = 0.0;
  @serializable lastKnownOrigin = new Vector();

  constructor() {
    this._serializer = new Serializer(this, null);
  }

  clearTransientState(): void {
    this.isVisible = false;
    this.infront = false;
    this.range = range.RANGE_FAR;
    this.yaw = null;
    this.nextKnownOriginTime = 0.0;
    this.nextPathUpdateTime = 0.0;
  }
}

/**
 * Entity-local AI state based on original Quake behavior.
 */
@serializableObject
export class QuakeEntityAI<T extends BaseMonster = BaseMonster> extends EntityAI<T> {
  readonly _serializer: Serializer<QuakeEntityAI<T>>;

  @serializable private _searchTime = 0;
  @serializable private _oldEnemy: CombatTarget | null = null;
  @serializable _attackState = ATTACK_STATE.AS_NONE;
  @serializable private _path: Vector[] | null = null;
  @serializable private _enemyMetadata = new EnemyMetadata();
  @serializable private _oldKnownOrigin: Vector | null = null;
  @serializable private _lookingLeft = false;
  @serializable private _moveDistance = 0;
  @serializable private _initialized = false;

  constructor(entity: T) {
    super(entity);
    this._serializer = new Serializer(this, entity.engine);
  }

  override clear(): void {
    this._searchTime = 0;
    this._oldEnemy = null;
    this._lookingLeft = false;
    this._moveDistance = 0;
    this._attackState = ATTACK_STATE.AS_NONE;
    this._enemyMetadata.clearTransientState();
    this._path = null;
  }

  get enemyRange(): range {
    return this._enemyMetadata.range;
  }

  get enemyIsVisible(): boolean {
    return this._enemyMetadata.isVisible;
  }

  _stillAlive(): boolean {
    if (this._entity.health > 0) {
      return true;
    }

    console.warn(`${this._entity} is dead yet asked to do some alive activity, force-stopping activity`, this._entity);
    this._entity.resetThinking();

    return false;
  }

  thinkNavigation(): void {
    const enemy = this._entity.enemy;
    if (enemy === null) {
      return;
    }

    if (this._entity.flags & (flags.FL_FLY | flags.FL_SWIM)) {
      return;
    }

    if (this._oldKnownOrigin !== null) {
      if (this._entity.origin.distanceTo(this._oldKnownOrigin) > 64.0) {
        this._enemyMetadata.nextPathUpdateTime = 0.0;
      }

      this._oldKnownOrigin.set(this._entity.origin);
    } else {
      this._oldKnownOrigin = this._entity.origin.copy();
    }

    if (this._game.time > this._enemyMetadata.nextKnownOriginTime && this._enemyMetadata.isVisible) {
      this._enemyMetadata.nextKnownOriginTime = this._game.time + 10.0;
      this._enemyMetadata.nextPathUpdateTime = 0.0;
      this._gameAI._sightEntityLastOrigin.set(enemy.origin);
      console.debug(`${this._entity} updated sight of enemy ${enemy}, will search again in 10 seconds`);
    }

    if (this._game.time > this._enemyMetadata.nextPathUpdateTime && !this._gameAI._sightEntityLastOrigin.isOrigin()) {
      this._engine.NavigateAsync(this._entity.origin, this._gameAI._sightEntityLastOrigin).then((newPath) => {
        if (this._entity.edict === null) {
          return;
        }

        if (newPath !== null) {
          this._path = newPath;
          console.debug(`${this._entity} updated path to enemy ${this._entity.enemy} with ${this._path.length} waypoints`);
        } else {
          console.warn(`${this._entity} could not find path to enemy ${this._entity.enemy}`);
        }
      }).catch((err: unknown) => {
        console.error(`${this._entity} failed to compute path to enemy ${this._entity.enemy}: ${String(err)}`);
      });

      this._enemyMetadata.nextPathUpdateTime = this._game.time + 10.0 + Math.random() * 5.0;
    }

    if (this._path?.length) {
      const a = this._entity.origin.copy();
      a[2] = 0.0;
      const b = this._path[0].copy();
      b[2] = 0.0;
      if (a.distanceTo(b) < 32 * 1.41) {
        const waypoint = this._path.shift();
        console.debug(`${this._entity} reached waypoint ${waypoint}, ${this._path.length} waypoints left`);
      }
    }
  }

  override think(): void {
    if (!this._initialized) {
      this._initialize();
    }

    this.thinkNavigation();
  }

  _initialize(): void {
    const self = this._entity;

    if ((self.flags & (flags.FL_FLY | flags.FL_SWIM)) === 0) {
      self.origin[2] += 1.0;
      self.dropToFloor();
    }

    if (!self.walkMove(0, 0)) {
      self.engine.ConsoleDebug(`${self} stuck in wall at ${self.origin}\n`);
    }

    self.takedamage = damage.DAMAGE_AIM;
    self.ideal_yaw = self.angles.dot(new Vector(0.0, 1.0, 0.0));

    if (!self.yaw_speed) {
      self.yaw_speed = 20.0;
    }

    self.view_ofs = new Vector(0.0, 0.0, 25.0);
    self.flags |= flags.FL_MONSTER;

    if (self.target) {
      const target = self.findFirstEntityByFieldAndValue('targetname', self.target);
      console.assert(target !== null, 'target must resolve');

      if (target === null) {
        self.pausetime = Infinity;
        self.thinkStand();
      } else {
        self.goalentity = self.movetarget = target;
        self.ideal_yaw = target.origin.copy().subtract(self.origin).toYaw();

        if (target instanceof PathCornerMarker) {
          self.thinkWalk();
        } else {
          self.pausetime = Infinity;
          self.thinkStand();
        }
      }
    } else {
      self.pausetime = Infinity;
      self.thinkStand();
    }

    self.nextthink += Math.random() * 0.5;
    this._initialized = true;
  }

  _determineRange(target: BaseEntity): range {
    const spot1 = this._entity.origin.copy().add(this._entity.view_ofs);
    const spot2 = target.origin.copy().add(target.view_ofs);
    const r = spot1.distanceTo(spot2);

    if (r < 120) {
      return range.RANGE_MELEE;
    }

    if (r < 500) {
      return range.RANGE_NEAR;
    }

    if (r < 1000) {
      return range.RANGE_MID;
    }

    return range.RANGE_FAR;
  }

  _changeYaw(): number {
    if (this._enemyMetadata.yaw !== null) {
      this._entity.ideal_yaw = this._enemyMetadata.yaw;
    }

    return this._entity.changeYaw();
  }

  _checkClient(): BaseEntity | null {
    const client = this._entity.getNextBestClient();

    return client instanceof BaseEntity ? client : null;
  }

  override findTarget(): boolean {
    if (!this._stillAlive()) {
      return false;
    }

    let client: BaseEntity | null = null;
    const self = this._entity;

    if (this._gameAI._sightEntityTime >= this._game.time - 0.1 && !(self.spawnflags & 3)) {
      client = this._gameAI._sightEntity;

      if (client instanceof MonsterActor && self.equals(client.enemy)) {
        return false;
      }
    } else {
      client = this._checkClient();
    }

    if (!(client instanceof BaseEntity)) {
      return false;
    }

    if (client.equals(self.enemy)) {
      return false;
    }

    if ((client.flags & flags.FL_NOTARGET)
      || (client.effects & effect.EF_NODRAW)
      || (client instanceof PlayerActor && ((client.items ?? 0) & items.IT_INVISIBILITY))
    ) {
      return false;
    }

    const enemyRange = this._determineRange(client);
    if (enemyRange === range.RANGE_FAR) {
      return false;
    }

    if (!this._isVisible(client)) {
      return false;
    }

    if (enemyRange === range.RANGE_NEAR) {
      if (client.show_hostile < this._game.time && !this._isInFront(client)) {
        return false;
      }
    } else if (enemyRange === range.RANGE_MID) {
      if (!this._isInFront(client)) {
        return false;
      }
    }

    if (client instanceof PlayerActor) {
      self.enemy = client;
    } else if (client instanceof MonsterActor) {
      const resolvedEnemy = client.enemy;
      if (!(resolvedEnemy instanceof PlayerActor)) {
        self.enemy = null;
        return false;
      }

      self.enemy = resolvedEnemy;
    } else {
      self.enemy = null;
      return false;
    }

    this.foundTarget(self.enemy, false);

    return true;
  }

  override foundTarget(targetEntity: BaseEntity, fromPain = false): void {
    if (!this._stillAlive()) {
      return;
    }

    if (!(targetEntity instanceof PlayerActor) && !(targetEntity instanceof MonsterActor)) {
      return;
    }

    const previousEnemy = this._entity.enemy;
    if (previousEnemy instanceof PlayerActor || previousEnemy instanceof MonsterActor) {
      this._oldEnemy = previousEnemy;
    }

    this._entity.enemy = targetEntity;

    if (!this._entity.enemy.equals(this._oldEnemy)) {
      console.debug(`${this._entity} acquired new enemy ${this._entity.enemy}, force computing a new path`);
      this._enemyMetadata.nextPathUpdateTime = 0.0;
    }

    this._gameAI._sightEntityLastOrigin.set(this._entity.enemy.origin);
    this._enemyMetadata.nextKnownOriginTime = this._game.time + 10.0;

    console.debug(`${this._entity} updated last seen and origin of ${this._entity.enemy}`);

    if (this._entity.enemy instanceof PlayerActor) {
      this._gameAI._sightEntity = this._entity;
      this._gameAI._sightEntityTime = this._game.time;
    }

    this._entity.show_hostile = this._game.time + 1.0;
    this._entity.sightSound();
    this._huntTarget(fromPain);
  }

  _huntTarget(fromPain: boolean): void {
    if (!this._stillAlive()) {
      return;
    }

    const enemy = this._entity.enemy;
    console.assert(enemy !== null, 'Missing enemy');
    if (enemy === null) {
      return;
    }

    this._entity.goalentity = enemy;
    this._entity.ideal_yaw = enemy.origin.copy().subtract(this._entity.origin).toYaw();

    if (!fromPain) {
      this._entity._scheduleThink(this._game.time + 0.05, function (this: BaseEntity, entity: BaseEntity): void {
        console.assert(entity instanceof MonsterActor, 'run-think callback requires a monster entity');
        if (entity instanceof MonsterActor) {
          entity.thinkRun();
        }
      }, 'animation-state-machine');
    }

    this._entity.attackFinished(1.0);
  }

  _isVisible(target: BaseEntity): boolean {
    const trace = this._entity.tracelineToEntity(target, true);

    if (trace.contents.inOpen && trace.contents.inWater) {
      return false;
    }

    return trace.fraction === 1.0 || target.equals(trace.entity as unknown as BaseEntity | null);
  }

  _isHearable(target: BaseEntity): boolean {
    const edict = this._entity.edict;
    console.assert(edict !== null, '_isHearable requires an edict-backed monster');
    if (edict === null) {
      return false;
    }

    const phs = this._engine.GetPHS(target.origin);
    if (!edict.isInPXS(phs)) {
      return false;
    }

    const leaf1 = this._engine.GetAreaForPoint(this._entity.origin);
    const leaf2 = this._engine.GetAreaForPoint(target.origin);

    if (!this._engine.AreasConnected(leaf1, leaf2)) {
      return false;
    }

    return true;
  }

  _isInFront(target: BaseEntity): boolean {
    const { forward } = this._entity.angles.angleVectors();
    const vec = target.origin.copy().subtract(this._entity.origin);
    vec.normalize();

    return vec.dot(forward) > 0.3;
  }

  _chooseTurn(_dest3: Vector): void {
  }

  _isFacingIdeal(): boolean {
    const delta = anglemod(this._entity.angles[1] - this._entity.ideal_yaw);

    return !(delta > 45 && delta < 315);
  }

  painforward(dist: number): void {
    this._entity.walkMove(this._entity.ideal_yaw, dist);
  }

  override stand(): void {
    if (!this._stillAlive()) {
      return;
    }

    if (this.findTarget()) {
      return;
    }

    if (this._game.time > this._entity.pausetime) {
      this._entity.thinkWalk();
    }
  }

  override walk(dist: number): void {
    this._moveDistance = dist;
    this._entity.walk(dist);
  }

  runMelee(): void {
    if (!this._stillAlive()) {
      return;
    }

    this._changeYaw();

    if (this._isFacingIdeal()) {
      this._entity.thinkMelee();
      this._attackState = ATTACK_STATE.AS_STRAIGHT;
    }
  }

  runMissile(): void {
    if (!this._stillAlive()) {
      return;
    }

    this._changeYaw();

    if (this._isFacingIdeal()) {
      this._entity.thinkMissile();
      this._attackState = ATTACK_STATE.AS_STRAIGHT;
    }
  }

  runSlide(): void {
    this._changeYaw();

    if (this._entity.walkMove(this._entity.ideal_yaw + (this._lookingLeft ? 90 : -90), this._moveDistance)) {
      return;
    }

    this._lookingLeft = !this._lookingLeft;
    this._entity.walkMove(this._entity.ideal_yaw + (this._lookingLeft ? 90 : -90), this._moveDistance);
  }

  override run(dist: number): void {
    if (!this._stillAlive()) {
      return;
    }

    this._moveDistance = dist;

    const enemy = this._entity.enemy;
    if (enemy instanceof PlayerActor || enemy instanceof MonsterActor) {
      if ((enemy.health ?? 0) <= 0) {
        this._entity.enemy = null;

        if (this._oldEnemy !== null && (this._oldEnemy.health ?? 0) > 0) {
          this.foundTarget(this._oldEnemy, false);
        } else if (this._entity.movetarget) {
          this._entity.thinkWalk();
          return;
        } else {
          this._entity.thinkStand();
          return;
        }
      }
    } else if (enemy !== null) {
      this._entity.enemy = null;
    }

    this._entity.show_hostile = this._game.time + 1.0;

    const currentEnemy = this._entity.enemy;
    const isEnemyVisible = currentEnemy !== null ? this._isVisible(currentEnemy) : false;

    if (isEnemyVisible || (currentEnemy instanceof PlayerActor && (currentEnemy.health ?? 0) > 0)) {
      this._searchTime = this._game.time + 5.0;
    }

    if (this._game.coop && this._searchTime < this._game.time) {
      if (this.findTarget()) {
        return;
      }
    }

    if (currentEnemy !== null) {
      this._enemyMetadata.isVisible = isEnemyVisible;
      this._enemyMetadata.infront = this._isInFront(currentEnemy);
      this._enemyMetadata.range = this._determineRange(currentEnemy);
      this._enemyMetadata.yaw = currentEnemy.origin.copy().subtract(this._entity.origin).toYaw();
    } else {
      this._enemyMetadata.isVisible = false;
    }

    switch (this._attackState) {
      case ATTACK_STATE.AS_MISSILE:
        this.runMissile();
        return;

      case ATTACK_STATE.AS_MELEE:
        this.runMelee();
        return;
    }

    const nextAttackState = this._checkAnyAttack(isEnemyVisible);
    if (nextAttackState !== null) {
      this._attackState = nextAttackState;
      return;
    }

    if (this._attackState === ATTACK_STATE.AS_SLIDING) {
      this.runSlide();
      return;
    }

    if (this._entity.goalentity) {
      this._entity.moveToGoal(dist, this._path?.length ? this._path[0] : null);
    }
  }

  _checkAnyAttack(isEnemyVisible: boolean): ATTACK_STATE | null {
    if (!this._stillAlive()) {
      return null;
    }

    if (!isEnemyVisible) {
      return null;
    }

    return this._entity.checkAttack() as ATTACK_STATE | null;
  }

  turn(): void {
    if (this.findTarget()) {
      return;
    }

    this._changeYaw();
  }

  override charge(dist = 0): void {
    this.face();
    this._entity.moveToGoal(dist);
  }

  chargeSide(): void {
    const self = this._entity;
    const enemy = self.enemy;
    console.assert(enemy !== null, 'enemy required');
    if (enemy === null) {
      return;
    }

    self.ideal_yaw = enemy.origin.copy().subtract(self.origin).toYaw();
    self.changeYaw();

    const { right } = self.angles.angleVectors();
    const dtemp = enemy.origin.copy().subtract(right.multiply(30));
    const heading = dtemp.subtract(self.origin).toYaw();

    self.walkMove(heading, 20);
  }

  melee(): void {
    if (!this._stillAlive()) {
      return;
    }

    const enemy = this._entity.enemy;
    if (enemy === null) {
      return;
    }

    const delta = enemy.origin.copy().subtract(this._entity.origin);
    if (delta.len() > 60) {
      return;
    }

    const ldmg = (Math.random() + Math.random() + Math.random()) * 3;
    this._entity.damage(enemy, ldmg);
  }

  meleeSide(): void {
    if (!this._stillAlive()) {
      return;
    }

    const enemy = this._entity.enemy;
    if (enemy === null) {
      return;
    }

    this.chargeSide();

    const delta = enemy.origin.copy().subtract(this._entity.origin);
    if (delta.len() > 60) {
      return;
    }

    if (!enemy.canReceiveDamage(this._entity)) {
      return;
    }

    const ldmg = (Math.random() + Math.random() + Math.random()) * 3;
    this._entity.damage(enemy, ldmg);
  }

  override face(): void {
    const enemy = this._entity.enemy;
    console.assert(enemy instanceof BaseEntity, 'valid enemy required');
    if (!(enemy instanceof BaseEntity)) {
      return;
    }

    this._entity.ideal_yaw = enemy.origin.copy().subtract(this._entity.origin).toYaw();
    this._entity.changeYaw();
  }

  forward(dist: number): void {
    this._entity.walkMove(this._entity.angles[1] + 180, dist);
  }

  back(dist: number): void {
    this._entity.walkMove(this._entity.angles[1], dist);
  }

  override pain(dist: number): void {
    this.back(dist);
  }

  override use(userEntity: BaseEntity): void {
    if (this._entity.enemy || this._entity.health <= 0) {
      return;
    }

    if (userEntity.flags & flags.FL_NOTARGET) {
      return;
    }

    if (!(userEntity instanceof PlayerActor)) {
      return;
    }

    if ((userEntity.items ?? 0) & items.IT_INVISIBILITY) {
      return;
    }

    this._enemyMetadata.lastKnownOrigin.set(userEntity.origin);
    this._enemyMetadata.nextKnownOriginTime = this._game.time + 10.0;
    this._gameAI._sightEntityLastOrigin.set(userEntity.origin);

    this._entity.enemy = userEntity;
    this._entity._scheduleThink(this._game.time + 0.1, function (this: BaseEntity, _entity: BaseEntity): void {
      console.assert(this instanceof MonsterActor, 'monster think callback required');
      if (!(this instanceof MonsterActor)) {
        return;
      }

      const enemy = this.enemy;
      console.assert(enemy instanceof BaseEntity, 'enemy required for delayed target acquisition');
      if (enemy instanceof BaseEntity) {
        this._ai.foundTarget(enemy);
      }
    });
  }

  override spawn(): void {
  }
}
