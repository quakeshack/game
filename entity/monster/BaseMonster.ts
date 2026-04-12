import Vector from '../../../../shared/Vector.ts';

import { colors, damage, flags, moveType, range, solid } from '../../Defs.ts';
import type { ServerGameAPI } from '../../GameAPI.ts';
import { EntityAI, ATTACK_STATE } from '../../helper/AI.ts';
import { serializableObject, serializable } from '../../helper/MiscHelpers.ts';
import BaseEntity from '../BaseEntity.ts';
import { BackpackEntity } from '../Items.ts';
import type { PathCornerEntity } from '../Misc.ts';
import { GibEntity } from '../Player.ts';
import { Sub } from '../Subs.ts';
import { DamageHandler } from '../Weapons.ts';

import type { ServerEdict, ServerEngineAPI } from '../../../../shared/GameInterfaces.ts';

@serializableObject
export default abstract class BaseMonster extends BaseEntity {
  /** Health points for this monster class. */
  static _health = 0;

  /** Corresponding hull sizes [mins, maxs]. */
  static _size: [Vector | null, Vector | null] = [null, null];

  /** Default model path. */
  static _modelDefault: string | null = null;

  /** Head model for gibbing. */
  static _modelHead = 'progs/gib1.mdl';

  @serializable pausetime = 0;
  @serializable movetarget: BaseEntity | null = null;
  @serializable health = 0;
  @serializable ideal_yaw = 0.0;
  @serializable yaw_speed = 0.0;
  @serializable bloodcolor: number = colors.BLOOD;
  @serializable enemy: BaseEntity | null = null;
  @serializable goalentity: BaseEntity | null = null;
  @serializable cnt = 0;
  @serializable _ai!: EntityAI<BaseMonster>;

  _damageHandler: DamageHandler | null = null;
  _sub: Sub | null = null;

  constructor(edict: ServerEdict | null, gameAPI: ServerGameAPI) {
    super(edict, gameAPI);
    this._ai = this._newEntityAI();
    this._damageHandler = new DamageHandler(this);
    this._sub = new Sub(this);
  }

  _precache(): void {
    const ctor = this.constructor as typeof BaseMonster;

    if (ctor._modelDefault !== null) {
      this.engine.PrecacheModel(ctor._modelDefault);
    }

    if (ctor._modelHead !== null) {
      this.engine.PrecacheModel(ctor._modelHead);
    }

    this.engine.PrecacheModel('progs/gib1.mdl');
    this.engine.PrecacheModel('progs/gib2.mdl');
    this.engine.PrecacheModel('progs/gib3.mdl');
    this.engine.PrecacheSound('player/udeath.wav');
  }

  /**
   * Override to provide a better or more suitable AI for this entity.
   * @returns entity AI instance
   */
  protected _newEntityAI(): EntityAI<BaseMonster> {
    return new EntityAI(this);
  }

  think(): void {
    this._ai.think();
    super.think();
  }

  /**
   * Turns this monster into gibs.
   */
  protected _gib(playSound: boolean): void {
    GibEntity.gibEntity(this, (this.constructor as typeof BaseMonster)._modelHead, playSound);
  }

  isActor(): boolean {
    return true;
  }

  clear(): void {
    super.clear();
    this.enemy = null;
    this.goalentity = null;
    this.movetarget = null;
    this._ai?.clear();
  }

  /** When standing idle. */
  thinkStand(): void {
  }

  /** When walking. */
  thinkWalk(): void {
  }

  /** When running. */
  thinkRun(): void {
  }

  /** When missile is flying towards. */
  thinkMissile(): void {
  }

  /** When fighting in melee. */
  thinkMelee(): void {
  }

  /**
   * When dying.
   */
  thinkDie(_attackerEntity: BaseEntity): void {
  }

  /**
   * When getting attacked.
   */
  thinkPain(_attackerEntity: BaseEntity, _damage: number): void {
    this._ai.foundTarget(_attackerEntity, true);
  }

  /**
   * Signalizes a specific entity to hunt.
   */
  hunt(entity: BaseEntity): void {
    this.pausetime = 0;
    this._ai.foundTarget(entity, false);
  }

  /**
   * Called by the AI code to determine the desired attack state.
   * @returns attack state constant or null
   */
  checkAttack(): number | null {
    const target = this.enemy;
    if (!target) {
      return null;
    }

    const trace = this.tracelineToEntity(target, false);
    if (!target.equals(trace.entity as unknown as BaseEntity | null)) {
      return null;
    }
    if (trace.contents.inOpen && trace.contents.inWater) {
      return null;
    }

    const enemyRange = this._ai.enemyRange;

    if (enemyRange === range.RANGE_MELEE && this.hasMeleeAttack()) {
      return ATTACK_STATE.AS_MELEE;
    }

    if (!this.hasMissileAttack()) {
      return null;
    }
    if (this.game.time < this.attack_finished) {
      return null;
    }
    if (enemyRange === range.RANGE_FAR) {
      return null;
    }

    let chance = 0;
    if (enemyRange === range.RANGE_MELEE) {
      chance = 0.9;
      this.attackFinished(0);
    } else if (enemyRange === range.RANGE_NEAR) {
      chance = this.hasMeleeAttack() ? 0.2 : 0.4;
    } else if (enemyRange === range.RANGE_MID) {
      chance = this.hasMeleeAttack() ? 0.05 : 0.1;
    }

    if (Math.random() < chance) {
      this.attackFinished(2 * Math.random());
      return ATTACK_STATE.AS_MISSILE;
    }

    return null;
  }

  /**
   * Whether this monster supports melee attacks.
   * @returns true if melee capable
   */
  protected hasMeleeAttack(): boolean {
    return false;
  }

  /**
   * Whether this monster supports long-range attacks such as missiles or hit scanning.
   * @returns true if missile capable
   */
  protected hasMissileAttack(): boolean {
    return false;
  }

  _preSpawn(): boolean {
    if (this.game.deathmatch || this.game.nomonsters) {
      this.remove();
      return false;
    }
    return true;
  }

  _postSpawn(): void {
    this.engine.eventBus.publish('game.monster.spawned', this);
    this._ai.spawn();
    this._scheduleThink(this.nextthink + Math.random() * 0.5, () => { this._ai.think(); });
  }

  spawn(): void {
    if (!this._preSpawn()) {
      return;
    }

    const ctor = this.constructor as typeof BaseMonster;
    const [mins, maxs] = ctor._size;

    console.assert(ctor._modelDefault !== null, 'Monster model not set');
    console.assert(ctor._health > 0, 'Invalid health set');
    console.assert(mins instanceof Vector && maxs instanceof Vector, 'Invalid size set');

    this.health = ctor._health;
    this.takedamage = damage.DAMAGE_AIM;
    this.solid = solid.SOLID_SLIDEBOX;
    this.movetype = moveType.MOVETYPE_STEP;

    this.setModel(ctor._modelDefault!);
    this.setSize(mins!, maxs!);

    this._postSpawn();
  }

  use(userEntity: BaseEntity): void {
    this._ai.use(userEntity);
  }

  deathSound(): void {
  }

  painSound(): void {
  }

  sightSound(): void {
  }

  idleSound(): void {
  }

  attackSound(): void {
  }

  walk(dist: number): void {
    if (this._ai.findTarget()) {
      return;
    }

    if (!this.goalentity && !this.enemy) {
      return;
    }

    this.moveToGoal(dist);
  }

  /**
   * Called by path_corner when touched and certain checks passed.
   * @returns true if a new goal was set
   */
  moveTargetReached(markerEntity: PathCornerEntity): boolean {
    if (!markerEntity.target) {
      this.goalentity = null;
      this.movetarget = null;
      this.pausetime = Infinity;
      this.thinkStand();
      return false;
    }

    this.goalentity = this.movetarget = this.findFirstEntityByFieldAndValue('targetname', markerEntity.target);

    if (!this.goalentity) {
      this.engine.ConsoleWarning(`${markerEntity} got invalid target ("${markerEntity.target}")\n`);
      this.pausetime = Infinity;
      this.thinkStand();
      return false;
    }

    this.ideal_yaw = this.goalentity.origin.copy().subtract(this.origin).toYaw();

    return true;
  }

  attackFinished(normal: number): void {
    this.cnt = 0;
    if (this.game.skill !== 3) {
      this.attack_finished = this.game.time + normal;
    }
  }

  _dropBackpack(backpackParameters: Record<string, unknown>): void { // FIXME: make protected again?
    const backpack = this.engine.SpawnEntity<BackpackEntity>(BackpackEntity.classname, {
      origin: this.origin.copy(),
      regeneration_time: 0,
      remove_after: 120,
      ...backpackParameters,
    })?.entity;

    console.assert(backpack instanceof BackpackEntity);

    backpack!.toss();
  }

  /**
   * Calculates a trajectory to the target entity.
   * @returns velocity vector for the trajectory
   */
  calculateTrajectoryVelocity(
    targetEntity: BaseEntity,
    origin: Vector | null = null,
    travelTime = 0.9,
  ): Vector {
    if (!origin) {
      origin = this.origin.copy();
    }

    if (!this.game.hasFeature('correct-ballistic-grenades')) {
      const velocity = targetEntity.origin.copy().subtract(origin);
      velocity.normalize();
      velocity.multiply(600.0);
      velocity[2] = 200.0;
      return velocity;
    }

    const gravity = this.game.gravity;
    const target = targetEntity.origin.copy().add(targetEntity.view_ofs);
    const displacement = target.copy().subtract(origin);
    const velocity = displacement.copy();
    velocity.multiply(1 / travelTime);
    velocity[2] = (displacement[2] + 0.5 * gravity * travelTime * travelTime) / travelTime;
    velocity.add(new Vector(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiply(10.0));

    return velocity;
  }

  _refire(nextState: string): void {
    if (this.game.skill !== 3) {
      return;
    }

    if (this.cnt === 1) {
      return;
    }

    if (!this.enemy || !this._ai.enemyIsVisible) {
      return;
    }

    this.cnt = 1;
    this._runState(nextState);
  }
}

@serializableObject
export abstract class WalkMonster extends BaseMonster {
  spawn(): void {
    super.spawn();
  }
}

@serializableObject
export abstract class FlyMonster extends BaseMonster {
  spawn(): void {
    super.spawn();
    this.flags |= flags.FL_FLY;
  }

  thinkDie(_attackerEntity: BaseEntity): void {
    this.flags &= ~flags.FL_FLY;
  }
}

@serializableObject
export abstract class SwimMonster extends BaseMonster {
  spawn(): void {
    super.spawn();
    this.flags |= flags.FL_SWIM;
  }

  thinkDie(_attackerEntity: BaseEntity): void {
    this.flags &= ~flags.FL_SWIM;
  }
}

@serializableObject
export class MeatSprayEntity extends BaseEntity {
  static classname = 'misc_gib_meatspray';

  static _precache(engineAPI: ServerEngineAPI): void {
    engineAPI.PrecacheModel('progs/zom_gib.mdl');
  }

  spawn(): void {
    this.movetype = moveType.MOVETYPE_BOUNCE;
    this.solid = solid.SOLID_NOT;
    this.velocity[2] += 250 + 50 * Math.random();
    this.avelocity = new Vector(3000, 1000, 2000);
    this.ltime = this.game.time;
    this.frame = 0;
    this.flags = 0;

    this.setModel('progs/zom_gib.mdl');
    this.setSize(Vector.origin, Vector.origin);
    this.setOrigin(this.origin);

    this._scheduleThink(this.ltime + 1.0, () => { this.remove(); });
  }

  /**
   * Tosses around a piece of meat.
   */
  static sprayMeat(
    entity: BaseEntity,
    origin: Vector | null = null,
    velocity: Vector | null = null,
  ): void {
    if (!origin || !velocity) {
      const { forward, right } = entity.angles.angleVectors();

      if (!origin) {
        origin = entity.origin.copy().add(forward.multiply(16));
      }

      if (!velocity) {
        velocity = entity.velocity.copy().add(right.multiply(Math.random() * 100));
      }
    }

    const meatSpray = entity.engine.SpawnEntity<MeatSprayEntity>(MeatSprayEntity.classname, {
      owner: entity,
      velocity,
      origin,
    })?.entity;

    console.assert(meatSpray instanceof MeatSprayEntity);
  }
}
