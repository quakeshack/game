import type { ServerGameAPI } from '../GameAPI.ts';

import Vector from '../../../shared/Vector.ts';

import { damage, effect, flags, items, range } from '../Defs.ts';
import BaseEntity from '../entity/BaseEntity.ts';
import type BaseMonster from '../entity/monster/BaseMonster.ts';
import { ChaseNavigator } from './ChaseNavigator.ts';
import { serializableObject, EntityWrapper, serializable, Serializer } from './MiscHelpers.ts';

type CombatTarget = MonsterActor | PlayerActor;

/**
 * Game-wide AI state used to coordinate monster perception.
 */
export class GameAI {
  readonly _game: ServerGameAPI;

  /** The monster that last spotted a player, so that monsters seeing it wake up too (QuakeC's sight_entity). */
  _sightEntity: BaseEntity | null = null;
  _sightEntityTime = 0.0;
  /**
   * Where a monster last saw a player, the origin while none has. A monster woken by another one, without seeing
   * the player itself, heads there.
   */
  _sightEntityLastOrigin = new Vector();
  /** When a door last started blocking monster paths: a path asked for before it may lead into that door. */
  _navigationChangeTime = 0.0;

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
   * Signals that a target entity has been found: the monster makes it its enemy and starts running after it.
   */
  foundTarget(targetEntity: BaseEntity): void {
    void targetEntity;
    console.assert(false, 'implement this');
  }

  /**
   * Reacts to being hurt by an attacker, before the monster plays its pain animation.
   */
  reactToDamage(attackerEntity: BaseEntity): void {
    void attackerEntity;
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

  override foundTarget(_targetEntity: BaseEntity): void {
  }

  override reactToDamage(_attackerEntity: BaseEntity): void {
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
  const normalized = v % 360;

  return normalized < 0 ? normalized + 360 : normalized;
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

  constructor() {
    this._serializer = new Serializer(this, null);
  }

  clearTransientState(): void {
    this.isVisible = false;
    this.infront = false;
    this.range = range.RANGE_FAR;
    this.yaw = null;
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
  @serializable private _enemyMetadata = new EnemyMetadata();
  @serializable private _navigator: ChaseNavigator<T> = new ChaseNavigator(this._entity);
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
    this._navigator.reset();
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

  /**
   * Where this monster's chase is heading, for debugging and tests.
   * @returns The navigator.
   */
  get navigator(): ChaseNavigator<T> {
    return this._navigator;
  }

  /**
   * Lets go of an enemy whose edict was freed. Its slot may have been reused, nulling all its properties (including
   * origin), and BaseMonster.think() calls _ai.think() before super.think(), so the stale-reference cleanup in
   * BaseEntity.think() hasn't run yet.
   */
  _dropFreedEnemy(): void {
    const enemy = this._entity.enemy;

    if (enemy !== null && (enemy.edict === null || enemy.edict.isFree())) {
      this._entity.enemy = null;
    }
  }

  override think(): void {
    if (!this._initialized) {
      this._initialize();
    }

    this._dropFreedEnemy();
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

    // spawnflags & 3: ambushing monsters only wake up on really seeing the player, not another monster getting angry
    if (this._gameAI._sightEntityTime >= this._game.time - 0.1 && !(self.spawnflags & 3)) {
      client = this._gameAI._sightEntity;

      // the monster that spotted someone is after our enemy already
      if (client instanceof MonsterActor && this._isSameEntity(client.enemy, self.enemy)) {
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

    // a monster that got angry leads us to the player it is after
    const target = client instanceof MonsterActor ? client.enemy : client;

    // unlike QuakeC, which overwrote self.enemy before this check and then reset it to world,
    // a failed lookup keeps the current enemy
    if (!(target instanceof PlayerActor) || target.equals(self.enemy)) {
      return false;
    }

    this.foundTarget(target);

    if (client instanceof MonsterActor) {
      // told by another monster without seeing the player: head where a monster last saw it
      if (!this._gameAI._sightEntityLastOrigin.isOrigin() && !this._isVisible(target)) {
        this._navigator.remember(this._gameAI._sightEntityLastOrigin);
      }
    } else {
      this._gameAI._sightEntityLastOrigin.set(target.origin);
    }

    return true;
  }

  /**
   * Whether two enemy slots name the same entity, nobody counting as the same as nobody.
   * @returns True when both are null or the same entity.
   */
  _isSameEntity(left: BaseEntity | null, right: BaseEntity | null): boolean {
    if (left === null || right === null) {
      return left === right;
    }

    return left.equals(right);
  }

  /**
   * Gets mad at the attacker, the reaction to damage of QuakeC’s T_Damage. A monster does not turn on its
   * current enemy again, on itself or on a monster it puts up with (`BaseMonster.retaliatesAgainst`), and
   * remembers the player it turned away from so that it can go back to it.
   * Runs before the pain handler, so a pain animation replaces the run state started here.
   */
  override reactToDamage(attackerEntity: BaseEntity): void {
    const self = this._entity;

    if (!(attackerEntity instanceof PlayerActor) && !(attackerEntity instanceof MonsterActor)) {
      return;
    }

    if (self.equals(attackerEntity) || attackerEntity.equals(self.enemy)) {
      return;
    }

    if (!self.retaliatesAgainst(attackerEntity)) {
      return;
    }

    // only a player is worth coming back to, so infighting with a third monster does not make it forget the player
    if (self.enemy instanceof PlayerActor) {
      this._oldEnemy = self.enemy;
    }

    this.foundTarget(attackerEntity);
  }

  override foundTarget(targetEntity: BaseEntity): void {
    if (!this._stillAlive()) {
      return;
    }

    if (!(targetEntity instanceof PlayerActor) && !(targetEntity instanceof MonsterActor)) {
      return;
    }

    const previousEnemy = this._entity.enemy;

    this._entity.enemy = targetEntity;

    if (!targetEntity.equals(previousEnemy)) {
      console.debug(`${this._entity} acquired new enemy ${targetEntity}`);
      this._navigator.reset();
    }

    // it saw the enemy, was hurt by it, or was sent after it: it knows where the enemy is
    this._navigator.remember(targetEntity.origin);

    if (this._entity.enemy instanceof PlayerActor) {
      this._gameAI._sightEntity = this._entity;
      this._gameAI._sightEntityTime = this._game.time;
    }

    this._entity.show_hostile = this._game.time + 1.0;
    this._entity.sightSound();
    this._huntTarget();
  }

  /**
   * Heads for the enemy and starts running. A pain animation started right after replaces the run state,
   * as it shares its `animation-state-machine` think.
   */
  _huntTarget(): void {
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

    this._entity._scheduleThink(this._game.time + 0.05, function (this: BaseEntity, entity: BaseEntity): void {
      console.assert(entity instanceof MonsterActor, 'run-think callback requires a monster entity');
      if (entity instanceof MonsterActor) {
        entity.thinkRun();
      }
    }, 'animation-state-machine');

    this._entity.attackFinished(1.0);
  }

  _isVisible(target: BaseEntity): boolean {
    // too far away, don't even bother tracing
    if (target.origin.distanceTo(this._entity.origin) > 2048) {
      return false;
    }

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
          this.foundTarget(this._oldEnemy);
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

    if (isEnemyVisible && currentEnemy !== null) {
      this._navigator.remember(currentEnemy.origin);

      if (currentEnemy instanceof PlayerActor) {
        this._gameAI._sightEntityLastOrigin.set(currentEnemy.origin);
      }
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
      const waypoint = currentEnemy !== null ? this._navigator.steer(currentEnemy, isEnemyVisible) : null;
      this._entity.moveToGoal(dist, waypoint);
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
