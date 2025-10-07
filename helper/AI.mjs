import Vector from '../../../shared/Vector.mjs';

import { damage, effect, flags, items, range } from '../Defs.mjs';
import BaseEntity from '../entity/BaseEntity.mjs';
import { PathCornerEntity } from '../entity/Misc.mjs';
import BaseMonster from '../entity/monster/BaseMonster.mjs';
import { PlayerEntity } from '../entity/Player.mjs';
import { ServerGameAPI } from '../GameAPI.mjs';
import { EntityWrapper, Serializer } from './MiscHelpers.mjs';

/**
 * Game-wide AI state, used to coordinate AI communication.
 */
export class GameAI {
  /**
   * @param {ServerGameAPI} game gameAPI
   */
  constructor(game) {
    this._game = game;

    /** @type {?BaseEntity} */
    this._sightEntity = null;
    this._sightEntityTime = 0.0;
    this._sightEntityLastOrigin = new Vector();
  }
};

/**
 * EntityAI interface.
 * @template {BaseMonster} T
 * @augments EntityWrapper<T>
 */
export class EntityAI extends EntityWrapper {
  /** @returns {GameAI} global AI state @protected */
  get _gameAI() {
    return this._game.gameAI;
  }

  /** @returns {T} augmented monster @protected */
  get _entity() {
    return /** @type {T}*/(super._entity);
  }

  get enemyRange() {
    return /** @type {range} */(range.RANGE_FAR); // override in derived classes
  }

  get enemyIsVisible() {
    return false; // override in derived classes
  }

  clear() {
    // implement this
    console.assert(false, 'implement this');
  }

  think() {
    // implement this
    console.assert(false, 'implement this');
  }

  spawn() {
    // implement this
    console.assert(false, 'implement this');
  }

  stand() {
    // implement this
    console.assert(false, 'implement this');
  }

  // eslint-disable-next-line no-unused-vars
  walk(dist) {
    // implement this
    console.assert(false, 'implement this');
  }

  // eslint-disable-next-line no-unused-vars
  run(dist) {
    // implement this
    console.assert(false, 'implement this');
  }

  // eslint-disable-next-line no-unused-vars
  pain(dist) {
    // implement this
    console.assert(false, 'implement this');
  }

  // eslint-disable-next-line no-unused-vars
  charge(dist) {
    // implement this
    console.assert(false, 'implement this');
  }

  face() {
    // implement this
    console.assert(false, 'implement this');
  }

  /**
   * Finds a target entity for the AI to interact with.
   * @returns {boolean} true if a target was found, false otherwise
   */
  findTarget() {
    // implement this
    console.assert(false, 'implement this');
    return false;
  }

  /**
   * Signalizes that a target entity has been found.
   * @param {BaseEntity} targetEntity entity to focus on
   * @param {boolean} fromPain if set to true, we will not overwrite the next state
   */
  // eslint-disable-next-line no-unused-vars
  foundTarget(targetEntity, fromPain) {
    // implement this
    console.assert(false, 'implement this');
  }

  // eslint-disable-next-line no-unused-vars
  use(userEntity) {
    // implement this
    console.assert(false, 'implement this');
  }
};

/**
 * Normalizes an angle to the range [0, 360).
 * @param {number} v - The angle to normalize.
 * @returns {number} The normalized angle.
 */
function anglemod(v) {
  while (v >= 360) {
    v -= 360;
  }
  while (v < 0) {
    v += 360;
  }
  return v;
}

/**
 * @readonly
 * @enum {number}
 */
export const ATTACK_STATE = {
  AS_NONE: 0,
  AS_STRAIGHT: 1,
  AS_SLIDING: 2,
  AS_MELEE: 3,
  /** any long-range attack, can be missiles or hit scanning */
  AS_MISSILE: 4,
};

/**
 * entity local AI state based on original Quake behavior
 * @template {BaseMonster} T
 * @augments EntityAI<T>
 */
export class QuakeEntityAI extends EntityAI {
  /**
   * @param {T} entity NPC
   */
  constructor(entity) {
    super(entity);

    this._serializer = new Serializer(this, entity.engine);

    this._serializer.startFields();

    /** @private */
    this._searchTime = 0;
    /** @type {?BaseEntity} previous acquired target, fallback for dead enemy @private */
    this._oldEnemy = null;
    /** @private */
    this._attackState = ATTACK_STATE.AS_NONE;

    /** @type {?Vector[]} waypoints to navigate along to the enemy @private */
    this._path = null;

    /** @private */
    this._enemyMetadata = {
      isVisible: false, // QuakeC: enemy_vis
      infront: false, // QuakeC: enemy_infront
      /** @type {range} */
      range: range.RANGE_FAR, // QuakeC: enemy_range
      /** @type {number} yaw */
      yaw: null, // QuakeC: enemy_yaw
      nextPathUpdateTime: 0.0,
      nextKnownOriginTime: 0.0,
      lastKnownOrigin: new Vector(),
    };

    /** @type {?Vector} we store the last known origin, if we are going off track, this indicates a teleport */
    this._oldKnownOrigin = null;

    Serializer.makeSerializable(this._enemyMetadata, this._engine);

    /** @private */
    this._lookingLeft = false; // QuakeC: lefty

    /** @private */
    this._moveDistance = 0;

    /** @private */
    this._initialized = false;

    this._serializer.endFields();

    Object.seal(this);
  }

  clear() {
    this._searchTime = 0;
    this._oldEnemy = null;
    this._lookingLeft = false;
    this._moveDistance = 0;
    this._attackState = ATTACK_STATE.AS_NONE;
    this._enemyMetadata.isVisible = false;
    this._enemyMetadata.infront = false;
    this._enemyMetadata.range = range.RANGE_FAR;
    this._enemyMetadata.yaw = null;
    this._enemyMetadata.nextKnownOriginTime = 0.0;
    this._enemyMetadata.nextPathUpdateTime = 0.0;
    this._path = null;
  }

  /**
   * @returns {range} the determined range of the enemy
   */
  get enemyRange() {
    return this._enemyMetadata.range;
  }

  /**
   * @returns {boolean} true if the enemy is visible
   */
  get enemyIsVisible() {
    return this._enemyMetadata.isVisible;
  }

  _stillAlive() {
    if (this._entity.health > 0) {
      return true;
    }

    console.warn(`${this._entity} is dead yet asked to do some alive activity, force-stopping activity`, this._entity);
    this._entity.resetThinking();

    return false;
  }

  thinkNavigation() {
    if (!this._entity.enemy) {
      return;
    }

    // nav mesh is only suited for ground based monsters
    if (this._entity.flags & (flags.FL_FLY | flags.FL_SWIM)) {
      return;
    }

    if (this._oldKnownOrigin !== null) {
      if (this._entity.origin.distanceTo(this._oldKnownOrigin) > 64.0) {
        this._enemyMetadata.nextPathUpdateTime = 0.0; // force path update, we were teleported or got a huge push from somewhere
      }

      this._oldKnownOrigin.set(this._entity.origin);
    } else {
      this._oldKnownOrigin = this._entity.origin.copy();
    }

    if (this._game.time > this._enemyMetadata.nextKnownOriginTime && this._enemyMetadata.isVisible) {
      this._enemyMetadata.nextKnownOriginTime = this._game.time + 10.0;
      this._enemyMetadata.nextPathUpdateTime = 0.0; // force path update
      this._gameAI._sightEntityLastOrigin.set(this._entity.enemy.origin);
      console.debug(`${this._entity} updated sight of enemy ${this._entity.enemy}, will search again in 10 seconds`);
    }

    if (this._game.time > this._enemyMetadata.nextPathUpdateTime && !this._gameAI._sightEntityLastOrigin.isOrigin()) {
      this._engine.NavigateAsync(this._entity.origin, this._gameAI._sightEntityLastOrigin).then((newPath) => {
        if (!this._entity || !this._entity.edict) {
          // freed
          return;
        }

        if (newPath !== null) {
          this._path = newPath;
          console.debug(`${this._entity} updated path to enemy ${this._entity.enemy} with ${this._path.length} waypoints`);
        } else {
          console.warn(`${this._entity} could not find path to enemy ${this._entity.enemy}`);
        }
      });

      this._enemyMetadata.nextPathUpdateTime = this._game.time + 10.0 + Math.random() * 5.0;
    }

    if (this._path?.length > 0) {
      // do a 2D check if we reached the waypoint
      const a = this._entity.origin.copy(); a[2] = 0.0;
      const b = this._path[0].copy(); b[2] = 0.0;
      if (a.distanceTo(b) < 16.0) { // assume half a hull width
        const waypoint = this._path.shift(); // reached the waypoint
        console.debug(`${this._entity} reached waypoint ${waypoint}, ${this._path.length} waypoints left`);
      }

      // if (this._path.length > 0) {
      //   this._enemyMetadata.yaw = this._entity.ideal_yaw = this._path[0].copy().subtract(this._entity.origin).toYaw();
      // }
    }
  }

  think() {
    if (!this._initialized) {
      this._initialize();
    }

    this.thinkNavigation();
  }

  _initialize() {
    const self = this._entity;

    // make sure enemies are on the floor (unless they can swim or levitate)
    if ((self.flags & (flags.FL_FLY | flags.FL_SWIM)) === 0) {
      self.origin[2] += 1.0; // raise off floor a bit
      self.dropToFloor();
    }

    // check for stuck enemies
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
      const target = this._entity.findFirstEntityByFieldAndValue('targetname', self.target);
      console.assert(target !== null, 'target must resolve');

      self.goalentity = self.movetarget = target;
      self.ideal_yaw = target.origin.copy().subtract(self.origin).toYaw();

      if (target instanceof PathCornerEntity) {
        self.thinkWalk();
      } else {
        self.pausetime = Infinity;
        self.thinkStand();
      }
    } else {
      self.pausetime = Infinity;
      self.thinkStand();
    }

    // spread think times so they don't all happen at same time
    self.nextthink += Math.random() * 0.5;

    this._initialized = true;
  }

  /**
   * returns the range catagorization of an entity reletive to self
   * 0 melee range, will become hostile even if back is turned
   * 1 visibility and infront, or visibility and show hostile
   * 2 infront and show hostile
   * 3 only triggered by damage
   * @param {BaseEntity} target target to check
   * @returns {range} determined range
   */
  _determineRange(target) { // QuakeC: ai.qc/range
    const spot1 = this._entity.origin.copy().add(this._entity.view_ofs);
    const spot2 = target.origin.copy().add('view_ofs' in target ? /** @type {Vector} */(target.view_ofs) : new Vector());

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

  _changeYaw() {
    if (this._enemyMetadata.yaw !== null) {
      this._entity.ideal_yaw = this._enemyMetadata.yaw;
    }

    return this._entity.changeYaw();
  }

  _checkClient() {
    return this._entity.getNextBestClient();
  }

  findTarget() { // QuakeC: ai.qc/FindTarget
    if (!this._stillAlive()) {
      return false;
    }

    // if the first spawnflag bit is set, the monster will only wake up on
    // really seeing the player, not another monster getting angry

    /** @type {?BaseEntity} */
    let client = null;
    const self = this._entity;

    // spawnflags & 3 is a big hack, because zombie crucified used the first
    // spawn flag prior to the ambush flag, and I forgot about it, so the second
    // spawn flag works as well
    if (this._gameAI._sightEntityTime >= this._game.time - 0.1 && !(self.spawnflags & 3)) {
      client = this._gameAI._sightEntity;

      if (client instanceof BaseMonster && self.equals(client.enemy)) {
        return false; // CR: QuakeC introduces undefined behavior here by invoking an empty return, I hope false is okay for now
      }
    } else {
      client = this._checkClient();

      if (!client) {
        return false; // current check entity isn't in PVS
      }
    }

    // already found that one
    if (client.equals(self.enemy)) {
      return false;
    }

    // client got invisibility or has notarget set
    if ((client.flags & flags.FL_NOTARGET) || // no target set
        (client.effects & effect.EF_NODRAW) || // completely invisible
        (client instanceof PlayerEntity && (client.items & items.IT_INVISIBILITY))
      ) {
      return false;
    }

    const r = this._determineRange(client);

    if (r === range.RANGE_FAR) {
      return false;
    }

    if (!this._isVisible(client)) {
      return false;
    }

    if (r === range.RANGE_NEAR) {
      if (client.show_hostile < this._game.time && !this._isInFront(client)) {
        return false;
      }
    } else if (r === range.RANGE_MID) {
      if (!this._isInFront(client)) {
        return false;
      }
    }

    // got one, trying to resolve the enemy chain first
    self.enemy = client;
    if (!(self.enemy instanceof PlayerEntity)) {
      // @ts-ignore: enemy can have an enemy property
      self.enemy = self.enemy.enemy;
      if (!(self.enemy instanceof PlayerEntity)) {
        self.enemy = this._game.worldspawn;
        // self.enemy = null; // this._game.worldspawn; // CR: unsure about null or worldspawn
        return false;
      }
    }

    this.foundTarget(self.enemy, false);

    return true;
  }

  /**
   * Signalizes that a target entity has been found.
   * Important: When called from thinkPain, make sure you want to break the current attack!
   * @param {BaseEntity} targetEntity enemy
   * @param {boolean} fromPain if set to true, we will not overwrite the next state
   */
  foundTarget(targetEntity, fromPain) { // QuakeC: ai.qc/FoundTarget
    if (!this._stillAlive()) {
      return;
    }

    if (this._entity.enemy) {
      this._oldEnemy = this._entity.enemy;
    }

    this._entity.enemy = targetEntity;

    // a new enemy? compute a new path
    if (!this._entity.enemy.equals(this._oldEnemy)) {
      console.debug(`${this._entity} acquired new enemy ${this._entity.enemy}, force computing a new path`);
      this._enemyMetadata.nextPathUpdateTime = 0.0; // force path update
    }

    this._gameAI._sightEntityLastOrigin.set(this._entity.enemy.origin);
    this._enemyMetadata.nextKnownOriginTime = this._game.time + 10.0;

    console.debug(`${this._entity} updated last seen and origin of ${this._entity.enemy}`);

    if (this._entity.enemy instanceof PlayerEntity) {
      // let other monsters see this monster for a while
      this._gameAI._sightEntity = this._entity;
      this._gameAI._sightEntityTime = this._game.time;
    }

    this._entity.show_hostile = this._game.time + 1.0;

    this._entity.sightSound();
    this._huntTarget(fromPain);
  }

  _huntTarget(fromPain) { // QuakeC: ai.qc/HuntTarget
    if (!this._stillAlive()) {
      return;
    }

    console.assert(this._entity.enemy, 'Missing enemy');

    this._entity.goalentity = this._entity.enemy;
    // this._entity.ideal_yaw = this._entity.enemy.origin.copy().subtract(this._entity.origin).toYaw();

    if (!fromPain) {
      // NOTE: keep it at 50 ms otherwise there will be a racy condition with the animation thinker causing dead monsters attacking the player
      this._entity._scheduleThink(this._game.time + 0.05, this._entity.thinkRun);
    }

    this._entity.attackFinished(1.0); // wait a while before first attack

    // console.log('_huntTarget', this._entity);
  }

  /**
   * @param {BaseEntity} target target entity
   * @returns {boolean} target is visible
   */
  _isVisible(target) { // QuakeC: ai.qc/visible
    const trace = this._entity.tracelineToEntity(target, true);

    if (trace.contents.inOpen && trace.contents.inWater) {
      return false; // sight line crossed contents
    }

    return target.equals(trace.entity); // used to be `trace.fraction === 1.0`
  }

  _isInFront(target) { // QuakeC: ai.qc/infront
    const { forward } = this._entity.angles.angleVectors();

    const vec = target.origin.copy().subtract(this._entity.origin);
    vec.normalize();

    return vec.dot(forward) > 0.3;
  }

  // eslint-disable-next-line no-unused-vars
  _chooseTurn(dest3) { // QuakeC: ai.qc/ChooseTurn
    // NOT TO BE IMPLEMENTED, UNUSED
  }

  _isFacingIdeal() { // QuakeC: ai.qc/FacingIdeal
    const delta = anglemod(this._entity.angles[1] - this._entity.ideal_yaw);

    return !(delta > 45 && delta < 315);
  }

  painforward(dist) { // QuakeC: ai.qc/ai_painforward
    this._entity.walkMove(this._entity.ideal_yaw, dist);
  }

  /**
   * The monster is staying in one place for a while, with slight angle turns
   */
  stand() { // QuakeC: ai.qc/ai_stand
    if (!this._stillAlive()) {
      return;
    }

    if (this.findTarget()) {
      return;
    }

    if (this._game.time > this._entity.pausetime) {
      // CR: this will for most enemies to just walk in place, they need a goaltarget or an enemy to walk somewhere useful
      this._entity.thinkWalk();
      return;
    }

    // change angle slightly
    // CR: no code here in QuakeC
  }

  walk(dist) { // QuakeC: ai.qc/ai_walk
    this._moveDistance = dist;

    // passing down the logic to the BaseMonster
    this._entity.walk(dist);
  }

  runMelee(){ // QuakeC: ai.qc/ai_run_melee
    if (!this._stillAlive()) {
      return;
    }

    this._changeYaw();

    if (this._isFacingIdeal()) { // TODO: consider distance
      this._entity.thinkMelee();
      this._attackState = ATTACK_STATE.AS_STRAIGHT;
    }
  }

  runMissile() { // QuakeC: ai.qc/ai_run_missile
    if (!this._stillAlive()) {
      return;
    }

    this._changeYaw();

    if (this._isFacingIdeal()) {
      this._entity.thinkMissile();
      this._attackState = ATTACK_STATE.AS_STRAIGHT;
    }
  }

  runSlide() { // QuakeC: ai.qc/ai_run_slide
    this._changeYaw();

    if (this._entity.walkMove(this._entity.ideal_yaw + (this._lookingLeft ? 90 : -90), this._moveDistance)) {
      return;
    }

    this._lookingLeft = !this._lookingLeft;

    this._entity.walkMove(this._entity.ideal_yaw + (this._lookingLeft ? 90 : -90), this._moveDistance);
  }

  run(dist) { // QuakeC: ai.qc/ai_run
    if (!this._stillAlive()) {
      return;
    }

    // console.log('AI run', this._entity.toString(), dist);

    this._moveDistance = dist;

    // see if the enemy is dead
    if (this._entity.enemy?.health <= 0) {
      this._entity.enemy = null;
      // FIXME: look all around for other targets (original FIXME from QuakeC)
      if (this._oldEnemy?.health > 0) {
        this.foundTarget(this._oldEnemy, false);
      } else {
        if (this._entity.movetarget) {
          this._entity.thinkWalk();
        } else {
          this._entity.thinkStand();
        }
        return;
      }
    }

    this._entity.show_hostile = this._game.time + 1.0; // wake up other monsters

    const isEnemyVisible = this._entity.enemy ? this._isVisible(this._entity.enemy) : false;

    // check knowledge of enemy
    if (isEnemyVisible || (this._entity.enemy instanceof PlayerEntity && this._entity.enemy.health > 0)) {
      this._searchTime = this._game.time + 5.0;
    }

    // look for other coop players
    if (this._game.coop && this._searchTime < this._game.time) {
      if (this.findTarget()) {
        return;
      }
    }

    if (this._entity.enemy) {
      this._enemyMetadata.isVisible = isEnemyVisible;
      this._enemyMetadata.infront = this._isInFront(this._entity.enemy);
      this._enemyMetadata.range = this._determineRange(this._entity.enemy);
      if (isEnemyVisible) {
        this._enemyMetadata.yaw = this._entity.enemy.origin.copy().subtract(this._entity.origin).toYaw();
      } else if (this._path?.length > 0) {
        this._enemyMetadata.yaw = this._path[0].copy().subtract(this._entity.origin).toYaw();
      }
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
      return; // beginning an attack
    }

    if (this._attackState === ATTACK_STATE.AS_SLIDING) {
      this.runSlide();
      return;
    }

    // head straight in
    if (this._entity.goalentity) {
      this._entity.moveToGoal(dist, this._path?.length > 0 ? this._path[0] : null);
    }
  }

  _checkAnyAttack(isEnemyVisible) { // QuakeC: ai.qc/CheckAnyAttack
    if (!this._stillAlive()) {
      return null;
    }

    if (!isEnemyVisible) {
      return null;
    }

    return this._entity.checkAttack();
  }

  turn() { // QuakeC: ai.qc/ai_turn
    if (this.findTarget()) {
      return;
    }

    this._changeYaw();
  }

  charge(dist) { // QuakeC: ai.qc/ai_charge
    this.face();
    this._entity.moveToGoal(dist);
  }

  chargeSide() { // QuakeC: fight.qc/ai_charge_side
    const self = this._entity;

    // Aim to the left of the enemy for a flyby
    self.ideal_yaw = self.enemy.origin.copy().subtract(self.origin).toYaw();
    self.changeYaw();

    const { right } = self.angles.angleVectors();
    const dtemp = self.enemy.origin.copy().subtract(right.multiply(30));
    const heading = dtemp.subtract(self.origin).toYaw();

    self.walkMove(heading, 20);
  }

  melee() { // QuakeC: fight.qc/ai_melee
    if (!this._stillAlive()) {
      return;
    }

    if (!this._entity.enemy) {
      return; // removed before stroke
    }

    const delta = this._entity.enemy.origin.copy().subtract(this._entity.origin);

    if (delta.len() > 60) {
      return;
    }

    const ldmg = (Math.random() + Math.random() + Math.random()) * 3;
    this._entity.damage(this._entity.enemy, ldmg);
  }

  meleeSide() { // QuakeC: fight.qc/ai_melee_side
    if (!this._stillAlive()) {
      return;
    }

    if (!this._entity.enemy) {
      return; // removed before stroke
    }

    this.chargeSide();

    const delta = this._entity.enemy.origin.copy().subtract(this._entity.origin);

    if (delta.len() > 60) {
      return;
    }

    if (!this._entity.enemy.canReceiveDamage(this._entity)) {
      return;
    }

    const ldmg = (Math.random() + Math.random() + Math.random()) * 3;
    this._entity.damage(this._entity.enemy, ldmg);
  }

  face() {
    console.assert(this._entity.enemy instanceof BaseEntity, 'valid enemy required');
    this._entity.ideal_yaw = this._entity.enemy.origin.copy().subtract(this._entity.origin).toYaw();
    this._entity.changeYaw();
  }

  forward(dist) {
    this._entity.walkMove(this._entity.angles[1] + 180, dist);
  }

  back(dist) {
    this._entity.walkMove(this._entity.angles[1], dist);
  }

  pain(dist) {
    this.back(dist);
  }

  use(userEntity) {
    if (this._entity.enemy) {
      return;
    }

    if (this._entity.health <= 0) {
      return;
    }

    if (userEntity.items & items.IT_INVISIBILITY) {
      return;
    }

    if (userEntity.flags & flags.FL_NOTARGET) {
      return;
    }

    if (!(userEntity instanceof PlayerEntity)) {
      return;
    }

    // hive mind the position update
    this._enemyMetadata.lastKnownOrigin.set(userEntity.origin);
    this._enemyMetadata.nextKnownOriginTime = this._game.time + 10.0;
    this._gameAI._sightEntityLastOrigin.set(userEntity.origin);

    this._entity.enemy = userEntity; // we need this in the next think and we cannot pass it along via the scope due to possible serialization
    this._entity._scheduleThink(this._game.time + 0.1, function () { this._ai.foundTarget(this.enemy); });
  }

  spawn() {
  }
};
