import type { ServerEngineAPI } from '../../../shared/GameInterfaces.ts';
import Vector, { type DirectionalVectors } from '../../../shared/Vector.ts';

import { attn, channel, clientEvent, colors, content, damage, decals, effect, flags, items, moveType, solid, tentType, waterlevel } from '../Defs.ts';
import { featureFlags } from '../GameAPI.ts';
import { crandom, EntityWrapper, entity, serializable } from '../helper/MiscHelpers.ts';
import BaseEntity, { type TraceResult } from './BaseEntity.ts';
import BaseMonster from './monster/BaseMonster.ts';
import { PlayerEntity } from './Player.ts';

type WeaponAmmoSlot = 'ammo_shells' | 'ammo_nails' | 'ammo_rockets' | 'ammo_cells';
type WeaponItemKey = 'IT_SHELLS' | 'IT_NAILS' | 'IT_ROCKETS' | 'IT_CELLS';

interface WeaponConfigEntry {
  readonly ammoSlot: WeaponAmmoSlot | null;
  readonly viewModel: string;
  readonly items?: WeaponItemKey;
  readonly priority: number;
}

interface DamageableEntity extends BaseEntity {
  health: number;
}

interface DamageHandledEntity extends BaseEntity {
  _damageHandler: DamageHandler | null;
}

interface StatefulEntity extends BaseEntity {
  _runState(state: string | null): boolean;
}

interface StateDefiningEntityClass {
  _defineState(
    state: string,
    keyframe: string | number | null,
    nextState?: string | null,
    handler?: ((this: BaseEntity) => void) | null,
  ): void;
}

interface DamageMultiplierSet {
  regular: number;
  blast: number;
  beam: number;
}

interface DamageReceiverEntity extends BaseEntity {
  health: number;
  thinkDie(attackerEntity: BaseEntity): void;
  thinkPain?: (attackerEntity: BaseEntity, damagePoints: number) => void;
  pain_finished?: number;
  bloodcolor?: number;
  enemy?: BaseEntity | null;
}

export type WeaponConfigKey =
  | typeof items.IT_AXE
  | typeof items.IT_SHOTGUN
  | typeof items.IT_SUPER_SHOTGUN
  | typeof items.IT_NAILGUN
  | typeof items.IT_SUPER_NAILGUN
  | typeof items.IT_GRENADE_LAUNCHER
  | typeof items.IT_ROCKET_LAUNCHER
  | typeof items.IT_LIGHTNING;

/**
 * Handy map to manage weapon slots.
 */
export const weaponConfig = new Map<WeaponConfigKey, WeaponConfigEntry>([
  [items.IT_AXE, { ammoSlot: null, viewModel: 'progs/v_axe.mdl', priority: 0 }],
  [items.IT_SHOTGUN, { ammoSlot: 'ammo_shells', viewModel: 'progs/v_shot.mdl', items: 'IT_SHELLS', priority: 1 }],
  [items.IT_SUPER_SHOTGUN, { ammoSlot: 'ammo_shells', viewModel: 'progs/v_shot2.mdl', items: 'IT_SHELLS', priority: 2 }],
  [items.IT_NAILGUN, { ammoSlot: 'ammo_nails', viewModel: 'progs/v_nail.mdl', items: 'IT_NAILS', priority: 3 }],
  [items.IT_SUPER_NAILGUN, { ammoSlot: 'ammo_nails', viewModel: 'progs/v_nail2.mdl', items: 'IT_NAILS', priority: 4 }],
  [items.IT_GRENADE_LAUNCHER, { ammoSlot: 'ammo_rockets', viewModel: 'progs/v_rock.mdl', items: 'IT_ROCKETS', priority: 5 }],
  [items.IT_ROCKET_LAUNCHER, { ammoSlot: 'ammo_rockets', viewModel: 'progs/v_rock2.mdl', items: 'IT_ROCKETS', priority: 6 }],
  [items.IT_LIGHTNING, { ammoSlot: 'ammo_cells', viewModel: 'progs/v_light.mdl', items: 'IT_CELLS', priority: 7 }],
]);

/**
 * Precache shared weapon assets.
 */
export function Precache(engineAPI: ServerEngineAPI): void {
  // FIXME: move “use in c code” precache commands back to the engine
  engineAPI.PrecacheSound('weapons/r_exp3.wav'); // new rocket explosion
  engineAPI.PrecacheSound('weapons/rocket1i.wav'); // spike gun
  engineAPI.PrecacheSound('weapons/sgun1.wav');
  engineAPI.PrecacheSound('weapons/guncock.wav'); // player shotgun
  engineAPI.PrecacheSound('weapons/ric1.wav'); // ricochet (used in c code)
  engineAPI.PrecacheSound('weapons/ric2.wav'); // ricochet (used in c code)
  engineAPI.PrecacheSound('weapons/ric3.wav'); // ricochet (used in c code)
  engineAPI.PrecacheSound('weapons/spike2.wav'); // super spikes
  engineAPI.PrecacheSound('weapons/tink1.wav'); // spikes tink (used in c code)
  engineAPI.PrecacheSound('weapons/grenade.wav'); // grenade launcher
  engineAPI.PrecacheSound('weapons/shotgn2.wav'); // super shotgun
  engineAPI.PrecacheSound('weapons/lhit.wav'); // lightning
  engineAPI.PrecacheSound('weapons/lstart.wav'); // lightning start

  engineAPI.PrecacheModel('progs/bolt.mdl'); // for lightning gun
  engineAPI.PrecacheModel('progs/bolt2.mdl'); // for lightning gun

  // precache view models
  for (const { viewModel } of weaponConfig.values()) {
    engineAPI.PrecacheModel(viewModel);
  }
}

/**
 * Struct holding items and ammo.
 */
@entity
export class Backpack {
  @serializable ammo_shells = 0;
  @serializable ammo_nails = 0;
  @serializable ammo_rockets = 0;
  @serializable ammo_cells = 0;
  @serializable items = 0;
  @serializable weapon: WeaponConfigKey | 0 = 0;
}

/**
 * Shared explosion helper for projectile entities.
 */
export class Explosions<T extends BaseEntity = BaseEntity> extends EntityWrapper<T> {
  static initStates(entityClass: typeof BaseEntity): void {
    const statefulClass = entityClass as typeof BaseEntity & StateDefiningEntityClass;

    statefulClass._defineState('s_explode1', 0, 's_explode2');
    statefulClass._defineState('s_explode2', 1, 's_explode3');
    statefulClass._defineState('s_explode3', 2, 's_explode4');
    statefulClass._defineState('s_explode4', 3, 's_explode5');
    statefulClass._defineState('s_explode5', 4, 's_explode6');
    statefulClass._defineState('s_explode6', 5, null, function (this: BaseEntity): void {
      this.remove();
    });
  }

  static precache(engineAPI: ServerEngineAPI): void {
    engineAPI.PrecacheModel('progs/s_explod.spr'); // sprite explosion
  }

  becomeExplosion(): void {
    // TODO: actually a client side job, the complete state machine for this

    this._engine.DispatchTempEntityEvent(tentType.TE_EXPLOSION, this._entity.origin);

    this._entity.movetype = moveType.MOVETYPE_NONE;
    this._entity.solid = solid.SOLID_NOT; // disables touch handling
    this._entity.takedamage = damage.DAMAGE_NO; // disables receiving damage
    this._entity.velocity.clear();

    this._entity.effects |= effect.EF_DIMLIGHT | effect.EF_NOSHADOW | effect.EF_FULLBRIGHT;

    this._entity.setModel('progs/s_explod.spr');

    const statefulEntity = this._entity as StatefulEntity;
    statefulEntity._runState('s_explode1');
  }
}

/**
 * Methods to cause damage to something else, e.g. fire bullets etc.
 */
export class DamageInflictor<T extends BaseEntity = BaseEntity> extends EntityWrapper<T> {
  protected _multiEntity: BaseEntity | null = null;
  protected _multiDamage = 0;

  private _clearMultiDamage(): void {
    this._multiEntity = null;
    this._multiDamage = 0;
  }

  private _applyMultiDamage(): void {
    if (this._multiEntity === null) {
      return;
    }

    this._entity.damage(this._multiEntity, this._multiDamage);
  }

  private _addMultiDamage(hitEntity: BaseEntity, damagePoints: number): void {
    if (!hitEntity.equals(this._multiEntity)) {
      this._applyMultiDamage();
      this._multiEntity = hitEntity;
      this._multiDamage = damagePoints;
      return;
    }

    this._multiDamage += damagePoints;
  }

  private _traceAttack(
    damagePoints: number,
    direction: Vector,
    _angleVectors: DirectionalVectors,
    trace: TraceResult,
  ): void {
    // FIXME: that velocity thing is out of whack

    // const velocity = direction.copy()
    //   .add(angleVectors.up.copy().multiply(crandom()))
    //   .add(angleVectors.right.copy().multiply(crandom()));

    // velocity.normalize();
    // velocity.add(trace.plane.normal.copy().multiply(2.0)).multiply(40.0);

    const origin = trace.point.copy().subtract(direction.copy().multiply(4.0));
    const traceEntity = trace.entity as BaseEntity | null;

    if (traceEntity !== null && traceEntity.takedamage) {
      const damageableEntity = traceEntity as DamageHandledEntity;
      const damageHandler = damageableEntity._damageHandler;

      if (damageHandler !== null) {
        damageHandler.spawnBlood(damagePoints, origin); // , velocity);
        this._addMultiDamage(traceEntity, damagePoints);
      }
    } else {
      const pointContents = this._engine.DeterminePointContents(origin) as content;

      if (pointContents === content.CONTENT_SKY) {
        return;
      }

      this.dispatchGunshotEvent(origin);
      this._engine.BroadcastClientEvent(false, clientEvent.EMIT_DECAL, trace.point, trace.plane.normal, decals.DECAL_BULLETHOLE);
    }
  }

  /**
   * Fires bullets.
   */
  fireBullets(shotcount: number, dir: Vector, spread: Vector): void {
    const angleVectors = this._entity.v_angle.angleVectors();

    const start = this._entity.origin.copy().add(angleVectors.forward.copy().multiply(10.0));
    start[2] = this._entity.absmin[2] + this._entity.size[2] * 0.7;

    this._clearMultiDamage();

    while (shotcount > 0) {
      const direction = dir.copy()
        .add(angleVectors.right.copy().multiply(spread[0] * crandom()))
        .add(angleVectors.up.copy().multiply(spread[1] * crandom()));

      const trace = this._entity.traceline(start, direction.copy().multiply(2048.0).add(start), false);

      if (trace.fraction !== 1.0) {
        this._traceAttack(4.0, direction, angleVectors, trace);
      }

      shotcount--;
    }

    this._applyMultiDamage();
    this._clearMultiDamage();
  }

  /**
   * Emits a gunshot event.
   */
  dispatchGunshotEvent(origin: Vector | null = null): void {
    this._engine.DispatchTempEntityEvent(tentType.TE_GUNSHOT, origin ?? this._entity.origin);
  }

  /**
   * Emits a beam event.
   */
  dispatchBeamEvent(beamType: number, endOrigin: Vector, startOrigin: Vector | null = null): void {
    this._engine.DispatchBeamEvent(beamType, this._entity.edictId, startOrigin ?? this._entity.origin, endOrigin);
  }

  blastDamage(damagePoints: number, attackerEntity: BaseEntity | null, ignore: BaseEntity | null = null): void {
    // this._entity = missile
    // attackerEntity = missile’s owner (e.g. player)

    for (const victimEdict of this._engine.FindInRadius(this._entity.origin, damagePoints + 40)) {
      const victim = victimEdict.entity as BaseEntity | null;

      if (victim === null || !victim.takedamage) {
        continue;
      }

      if (victim.equals(ignore)) {
        continue;
      }

      const origin = victim.origin.copy().add(victim.mins.copy().add(victim.maxs).multiply(0.5));
      let points = 0.5 * this._entity.origin.distanceTo(origin);

      points = damagePoints - points;

      if (victim.equals(attackerEntity)) {
        points *= 0.5;
      }

      const damageableVictim = victim as DamageHandledEntity;
      if (points > 0 && damageableVictim._damageHandler !== null && damageableVictim._damageHandler.canReceiveDamage(this._entity)) {
        this._entity.damage(victim, points * damageableVictim._damageHandler.receiveDamageFactor.blast, attackerEntity);
      }
    }
  }

  beamDamage(damagePoints: number, hitPoint: Vector): void {
    for (const victimEdict of this._engine.FindInRadius(this._entity.origin, damagePoints + 40)) {
      const victim = victimEdict.entity as BaseEntity | null;

      if (victim === null || !victim.takedamage) {
        continue;
      }

      let points = Math.max(0, 0.5 * this._entity.origin.distanceTo(victim.origin));

      points = damagePoints - points;

      if (victim.equals(this._entity)) {
        points *= 0.5;
      }

      const damageableVictim = victim as DamageHandledEntity;
      if (points > 0 && damageableVictim._damageHandler !== null && damageableVictim._damageHandler.canReceiveDamage(this._entity)) {
        this._entity.damage(victim, points * damageableVictim._damageHandler.receiveDamageFactor.beam, null, hitPoint);
      }
    }
  }

  lightningDamage(startOrigin: Vector, endOrigin: Vector, damagePoints: number): void {
    const f = endOrigin.copy().subtract(startOrigin);
    f.normalize();
    f[0] = -f[1];
    f[1] = f[0];
    f[2] = 0.0;
    f.multiply(16.0);

    const trace1 = this._entity.traceline(startOrigin, endOrigin, false);
    const traceEntity1 = trace1.entity as BaseEntity | null;
    if (traceEntity1 !== null && traceEntity1.takedamage) {
      this._engine.StartParticles(trace1.point, new Vector(0.0, 0.0, 100.0), colors.SPARK, damagePoints * 4);
      this._entity.damage(traceEntity1, damagePoints);

      // CR: ported over a fixed version, but commented out for now
      // if (this._entity.classname === 'player' && trace1.entity.classname === 'player') {
      //   trace1.entity.velocity[2] += 400.0;
      // }
    }

    const trace2 = this._entity.traceline(startOrigin.copy().add(f), endOrigin.copy().add(f), false);
    const traceEntity2 = trace2.entity as BaseEntity | null;
    if (traceEntity2 !== null && !traceEntity2.equals(traceEntity1) && traceEntity2.takedamage) {
      this._engine.StartParticles(trace2.point, new Vector(0.0, 0.0, 100.0), colors.SPARK, damagePoints * 4);
      this._entity.damage(traceEntity2, damagePoints);
    }

    const trace3 = this._entity.traceline(startOrigin.copy().subtract(f), endOrigin.copy().subtract(f), false);
    const traceEntity3 = trace3.entity as BaseEntity | null;
    if (traceEntity3 !== null && !traceEntity3.equals(traceEntity1) && !traceEntity3.equals(traceEntity2) && traceEntity3.takedamage) {
      this._engine.StartParticles(trace3.point, new Vector(0.0, 0.0, 100.0), colors.SPARK, damagePoints * 4);
      this._entity.damage(traceEntity3, damagePoints);
    }
  }
}

/**
 * Methods to handle damage on an entity.
 */
export class DamageHandler<T extends BaseEntity = BaseEntity> extends EntityWrapper<T> {
  receiveDamageFactor: DamageMultiplierSet = {
    regular: 1.0,
    blast: 1.0,
    beam: 1.0,
  };

  private get _damageEntity(): DamageReceiverEntity {
    return this._entity as DamageReceiverEntity;
  }

  protected override _assertEntity(): void {
    const entity = this._damageEntity;

    console.assert(entity.health !== undefined);
    console.assert(entity.thinkDie !== undefined);
  }

  private _killed(attackerEntity: BaseEntity): void {
    const entity = this._damageEntity;

    // doors, triggers, etc.
    if (entity.movetype === moveType.MOVETYPE_PUSH || entity.movetype === moveType.MOVETYPE_NONE) {
      entity.takedamage = damage.DAMAGE_NO; // CR: not Quake vanilla behavior here
      entity.resetThinking();
      entity.thinkDie(attackerEntity);
      return;
    }

    if (entity instanceof BaseMonster) {
      entity.enemy = attackerEntity;
    }

    // bump the monster counter
    if (entity.flags & flags.FL_MONSTER) {
      this._engine.eventBus.publish('game.monster.killed', entity, attackerEntity);
    }

    // CR: ClientObituary(self, attacker); is handled by PlayerEntity.thinkDie now

    entity.takedamage = damage.DAMAGE_NO;
    // FIXME: this._entity.touch = SUB_Null; -- we need to solve this differently?

    // CR: the original QuakeC would call monster_death_use, but we have all thinkDie invoking useTargets anyway

    entity.resetThinking();
    entity.thinkDie(attackerEntity);
  }

  /**
   * Spawns trail of blood.
   */
  spawnBlood(damagePoints: number, origin: Vector, velocity: Vector | null = null): void {
    const entity = this._damageEntity;
    const bloodcolor = typeof entity.bloodcolor === 'number' ? entity.bloodcolor : colors.BLOOD;
    this._engine.StartParticles(
      origin,
      velocity ?? entity.velocity.copy().multiply(0.01 * damagePoints),
      bloodcolor,
      damagePoints * 2,
    );
  }

  /**
   * The damage is coming from inflictor, but get mad at attacker.
   * This should be the only function that ever reduces health.
   */
  damage(inflictorEntity: BaseEntity, attackerEntity: BaseEntity, inflictedDamage: number, hitPoint: Vector): void {
    const entity = this._damageEntity;

    if (entity.takedamage === damage.DAMAGE_NO || entity.health <= 0) {
      // this entity cannot take any damage (anymore)
      return;
    }

    // used by buttons and triggers to set activator for target firing
    entity.dmg_attacker = attackerEntity;

    if (attackerEntity instanceof PlayerEntity && attackerEntity.super_damage_finished > this._game.time) {
      inflictedDamage *= 4.0; // QUAD DAMAGE
    }

    // // CR: here we could ask the entity to assess the damage point (e.g. headshot = 3x the damage), naive calculation below:
    // if (hitPoint[2] - this._entity.origin[2] > this._entity.view_ofs[2]) {
    //   inflictedDamage *= 100;
    // }

    // save damage based on the target's armor level
    inflictedDamage *= this.receiveDamageFactor.regular;

    let save = 0;
    let take = 0;
    if (this._entity instanceof PlayerEntity) {
      save = Math.ceil(this._entity.armortype * inflictedDamage);

      if (save >= this._entity.armorvalue) {
        save = this._entity.armorvalue;
        this._entity.armortype = 0; // lost all armor
        this._entity.items &= ~(items.IT_ARMOR1 | items.IT_ARMOR2 | items.IT_ARMOR3);
      }

      this._entity.armorvalue -= save;
      take = Math.ceil(inflictedDamage - save);
    } else {
      // no armor path
      take = inflictedDamage;
    }

    // add to the damage total for clients, which will be sent as a single
    // message at the end of the frame
    // FIXME: remove after combining shotgun blasts?
    if (entity.flags & flags.FL_CLIENT) {
      entity.dmg_take += take;
      entity.dmg_save += save;
      entity.dmg_inflictor = inflictorEntity;
    }

    // figure momentum add
    if (!inflictorEntity.isWorld() && (entity.movetype === moveType.MOVETYPE_WALK || featureFlags.includes('improved-gib-physics'))) {
      const direction = entity.origin.copy().subtract(inflictorEntity.centerPoint);
      direction.normalize();
      entity.velocity.add(direction.multiply(8.0 * inflictedDamage));
    }

    // check for godmode
    if (entity.flags & flags.FL_GODMODE) {
      return;
    }

    // check for invincibility and play protection sounds to indicate invincibility
    if (this._entity instanceof PlayerEntity && this._entity.invincible_finished >= this._game.time) {
      if ((this._entity.invincible_sound_time[inflictorEntity.edictId] || 0) < this._game.time) {
        this._entity.startSound(channel.CHAN_ITEM, 'items/protect3.wav');
        this._entity.invincible_sound_time[inflictorEntity.edictId] = this._game.time + 2.0;
      }
      return;
    }

    // no friendly fire
    if (
      this._entity instanceof PlayerEntity
      && attackerEntity instanceof PlayerEntity
      && this._game.teamplay === 1
      && this._entity.team > 0
      && this._entity.team === attackerEntity.team
    ) {
      return;
    }

    // spawn blood
    this.spawnBlood(inflictedDamage, hitPoint);

    // do the actual damage and check for a kill
    entity.health -= take;

    // negative health is a kill
    if (entity.health <= 0) {
      this._killed(attackerEntity);
      return;
    }

    // publish injured event
    if (entity.flags & flags.FL_MONSTER) {
      this._engine.eventBus.publish('game.monster.injured', entity, attackerEntity, inflictorEntity);
    }

    if (entity.thinkPain) {
      entity.thinkPain(attackerEntity, inflictedDamage);

      // nightmare mode monsters don't go into pain frames often
      if (entity.pain_finished !== undefined && this._game.skill === 3) {
        entity.pain_finished = this._game.time + 5.0;
      }
    }
  }

  /**
   * Returns true if the inflictor can directly damage the target.
   * Used for explosions and melee attacks.
   * @returns True when the inflictor has a direct damage path to the target.
   */
  canReceiveDamage(inflictorEntity: BaseEntity): boolean {
    const entity = this._damageEntity;

    // bmodels need special checking because their origin is 0,0,0
    if (entity.movetype === moveType.MOVETYPE_PUSH) {
      const trace = inflictorEntity.tracelineToVector(entity.centerPoint, true);

      if (trace.fraction === 1.0 || entity.equals(trace.entity as BaseEntity | null)) {
        return true;
      }

      return false;
    }

    // CR: it’s basically missile measurements
    for (const offset of [
      new Vector(0.0, 0.0, 0.0),
      new Vector(15.0, 15.0, 0.0),
      new Vector(-15.0, -15.0, 0.0),
      new Vector(-15.0, 15.0, 0.0),
      new Vector(15.0, -15.0, 0.0),
    ]) {
      const point = offset.add(entity.origin);
      const trace = inflictorEntity.traceline(inflictorEntity.origin, point, true);

      // CR: trace.fraction is *almost* 1.0, it’s weird and I do not really get it debugged.
      // Over in vanilla Quake this seems to work?
      // Anyway, added entity checks.
      // UPDATE: I figured it out, it was the botched Edict/Entity check over in the engine, it works now. Though, I’m keeping the check.
      if (trace.fraction === 1.0 || entity.equals(trace.entity as BaseEntity | null)) {
        return true;
      }
    }

    return false;
  }
}

@entity
export class BaseProjectile extends BaseEntity {
  static classname = 'weapon_projectile_abstract';
  static _model: string | null = null;

  protected readonly _damageInflictor = new DamageInflictor(this);
  private readonly _explosions = new Explosions(this);

  static override _initStates(): void {
    this._resetStates();
    Explosions.initStates(this);
  }

  static override _precache(engineAPI: ServerEngineAPI): void {
    Explosions.precache(engineAPI);

    if (this._model !== null) {
      engineAPI.PrecacheModel(this._model);
    }
  }

  protected _becomeExplosion(): void {
    this._explosions.becomeExplosion();
  }

  override touch(touchedByEntity: BaseEntity): void {
    if (this.solid === solid.SOLID_NOT) {
      return;
    }

    // sky swallows any projectile
    // CR: DOES NOT WORK, it’s always CONTENT_EMPTY, also does not work in vanilla Quake
    // UPDATE: IT DOES WORK, it’s the stupid Quake maps having some content info wrong!
    const pointContents = this.engine.DeterminePointContents(this.origin) as content;
    if (pointContents === content.CONTENT_SKY) {
      this.remove();
      return;
    }

    this._handleImpact(touchedByEntity);
  }

  protected _handleImpact(_touchedByEntity: BaseEntity): void {
    // implement impact here
  }

  /**
   * Prepares the projectile by setting velocity (direction only), adjusts origin a bit,
   * and adds a timed removal think.
   */
  override spawn(): void {
    this.solid = solid.SOLID_BBOX;

    const owner = this.owner;
    console.assert(owner !== null, 'Needs an owner');

    // direction
    if (owner instanceof PlayerEntity) {
      const { forward } = owner.v_angle.angleVectors();
      this.velocity.set(this.aim(forward));

      this.setOrigin(owner.origin.copy().add(forward.multiply(8.0)).add(new Vector(0.0, 0.0, 16.0)));
    } else {
      this.velocity.set(owner!.movedir);

      this.setOrigin(owner!.origin);
    }

    this.angles.set(this.velocity.toAngles());
    this.setSize(Vector.origin, Vector.origin);

    // remove after 6s
    this._scheduleThink(this.game.time + 6.0, () => {
      this.remove();
    });
  }
}

@entity
export class Grenade extends BaseProjectile {
  static classname = 'weapon_projectile_grenade';

  static override _precache(engineAPI: ServerEngineAPI): void {
    engineAPI.PrecacheModel('progs/grenade.mdl');
    engineAPI.PrecacheSound('weapons/bounce.wav'); // grenade bounce
  }

  private _explode(): void {
    this.resetThinking();

    // nerfing grenade damage for NPCs
    const damagePoints = this.owner instanceof PlayerEntity ? 120 : 40;

    this._damageInflictor.blastDamage(damagePoints, this.owner);

    this.velocity.normalize();
    this.origin.subtract(this.velocity.multiply(8.0));

    this._becomeExplosion();
  }

  override touch(touchedByEntity: BaseEntity): void {
    if (this.solid === solid.SOLID_NOT) {
      return;
    }

    if (this.owner !== null && touchedByEntity.equals(this.owner)) {
      return; // don't explode on owner
    }

    const takedamageValue = touchedByEntity.takedamage as damage;
    if (takedamageValue === damage.DAMAGE_AIM) {
      this._explode();
      return;
    }

    // CR: in the original the grenade bounces off and makes a splash sound
    const pointContents = this.engine.DeterminePointContents(this.origin) as content;
    if (pointContents === content.CONTENT_SKY) {
      this.remove();
      return;
    }

    this.startSound(channel.CHAN_WEAPON, 'weapons/bounce.wav');

    if (this.velocity.isOrigin()) {
      this.avelocity.clear();
      return;
    }

    this.avelocity.set(this.velocity);
  }

  override spawn(): void {
    const owner = this.owner;
    console.assert(owner !== null, 'Needs an owner');

    this.solid = solid.SOLID_BBOX;
    this.movetype = moveType.MOVETYPE_BOUNCE;

    if (this.velocity.len() > 0) {
      this.angles.set(this.velocity.toAngles());
    }

    this.setModel('progs/grenade.mdl');
    this.setSize(Vector.origin, Vector.origin);
    this.setOrigin(owner!.origin);

    this._scheduleThink(this.game.time + 2.5, () => {
      this._explode();
    });
  }
}

@entity
export class Missile extends BaseProjectile {
  static classname = 'weapon_projectile_missile';

  static override _precache(engineAPI: ServerEngineAPI): void {
    engineAPI.PrecacheModel('progs/missile.mdl');
  }

  protected override _handleImpact(touchedByEntity: BaseEntity): void {
    if (this.owner !== null && touchedByEntity.equals(this.owner)) {
      return; // don't explode on owner
    }

    const damagePoints = 100 + Math.random() * 20;
    const damageableEntity = touchedByEntity as DamageableEntity;

    if (damageableEntity.takedamage && damageableEntity.health > 0) {
      this.damage(damageableEntity, damagePoints, this.owner, this.origin); // FIXME: better hitpoint
    }

    // don't do radius damage to the other, because all the damage
    // was done in the impact
    this._damageInflictor.blastDamage(120, this.owner, touchedByEntity);

    this.velocity.normalize();
    this.origin.subtract(this.velocity.multiply(8.0));

    this._becomeExplosion();
  }

  override spawn(): void {
    console.assert(this.owner !== null, 'Needs an owner');

    super.spawn();

    this.movetype = moveType.MOVETYPE_FLYMISSILE;

    this.velocity.multiply(1000.0); // fast projectile

    this.effects |= effect.EF_NOSHADOW;

    this.setModel('progs/missile.mdl');
    this.setSize(Vector.origin, Vector.origin);
  }
}

@entity
export class BaseSpike extends BaseProjectile {
  static _damage = 0;
  static _tentType: number | null = null;

  @serializable speed = 0;

  protected override _handleImpact(touchedByEntity: BaseEntity): void {
    if (this.owner !== null && touchedByEntity.equals(this.owner)) {
      return; // don't explode on owner
    }

    if (touchedByEntity.solid === solid.SOLID_TRIGGER) {
      return; // do not trigger fields
    }

    const ctor = this.constructor as typeof BaseSpike;
    const damageableEntity = touchedByEntity as DamageableEntity;

    if (damageableEntity.takedamage && damageableEntity.health > 0) {
      this.damage(damageableEntity, ctor._damage, this.owner, this.origin);
    }

    this.engine.DispatchTempEntityEvent(ctor._tentType, this.origin);

    // delay the remove, the projectile might still be needed for some touch evaluations
    this.lazyRemove();
  }

  override spawn(): void {
    console.assert(this.owner !== null, 'Needs an owner');

    super.spawn();

    this.movetype = moveType.MOVETYPE_FLYMISSILE;

    this.velocity.multiply(this.speed || 1000.0); // fast projectile

    this.setModel((this.constructor as typeof BaseSpike)._model);
    this.setSize(Vector.origin, Vector.origin);
  }
}

@entity
export class Spike extends BaseSpike {
  static classname = 'weapon_projectile_spike';
  static _damage = 9;
  static _tentType = tentType.TE_SPIKE;
  static _model = 'progs/spike.mdl';

  override spawn(): void {
    super.spawn();

    if (!(this.owner instanceof PlayerEntity)) {
      return;
    }

    const { right } = this.owner.v_angle.angleVectors();
    this.setOrigin(this.origin.add(right.multiply((this.owner.weaponframe % 2) === 1 ? 4.0 : -4.0)));
  }
}

@entity
export class Superspike extends BaseSpike {
  static classname = 'weapon_projectile_superspike';
  static _damage = 18;
  static _tentType = tentType.TE_SUPERSPIKE;
  static _model = 'progs/s_spike.mdl';
}

@entity
export class Laser extends BaseSpike {
  static classname = 'weapon_projectile_laser';
  static _damage = 15;
  static _tentType = tentType.TE_GUNSHOT;
  static _model = 'progs/laser.mdl';

  static override _precache(engineAPI: ServerEngineAPI): void {
    // not available using shareware assets
    if (!engineAPI.registered) {
      return;
    }

    super._precache(engineAPI);
  }

  protected override _handleImpact(touchedByEntity: BaseEntity): void {
    super._handleImpact(touchedByEntity);

    this.startSound(channel.CHAN_WEAPON, 'enforcer/enfstop.wav', 1.0, attn.ATTN_STATIC);
  }

  override spawn(): void {
    super.spawn();

    const owner = this.owner;
    console.assert(owner !== null, 'Needs an owner');
    owner!.startSound(channel.CHAN_WEAPON, 'enforcer/enfire.wav');
  }
}

/**
 * This class outsources all weapon related duties from PlayerEntity in its own separate component.
 * Ammo, however, is still managed over at PlayerEntity due to some clusterfun entaglement with engine code.
 */
export class PlayerWeapons extends EntityWrapper<PlayerEntity> {
  private readonly _damageInflictor: DamageInflictor<PlayerEntity>;
  private _lightningSoundTime = 0;

  constructor(playerEntity: PlayerEntity) {
    super(playerEntity);

    this._damageInflictor = new DamageInflictor(playerEntity);
  }

  private get _player(): PlayerEntity {
    return this._entity;
  }

  /**
   * Starts sound on player’s weapon channel.
   */
  private _startSound(sfxName: string, soundChannel = channel.CHAN_WEAPON): void {
    this._player.startSound(soundChannel, sfxName);
  }

  /**
   * Return true if the current weapon is okay to use.
   * @returns True when the currently selected weapon can keep firing.
   */
  checkAmmo(): boolean {
    if (this._player.weapon === items.IT_AXE) {
      return true;
    }

    const config = weaponConfig.get(this._player.weapon as WeaponConfigKey);
    console.assert(config !== undefined, `PlayerWeapons.checkAmmo: invalid weapon ${this._player.weapon}`);

    if (config?.ammoSlot !== null && this._player[config.ammoSlot] > 0) {
      return true;
    }

    this._player.selectBestWeapon();

    return false;
  }

  fireAxe(): void {
    // CR: no check ammo, it’s always true

    const { forward } = this._player.v_angle.angleVectors();
    const source = this._player.origin.copy().add(new Vector(0.0, 0.0, 16.0));

    const trace = this._player.traceline(source, forward.copy().multiply(64.0).add(source), false);

    if (trace.fraction === 1.0) {
      return;
    }

    const pointContents = this._engine.DeterminePointContents(trace.point) as content;
    if (pointContents === content.CONTENT_SKY) {
      // CR: smashing a sky face, ignoring
      return;
    }

    const origin = trace.point.copy().subtract(forward.copy().multiply(4.0));
    const traceEntity = trace.entity as BaseEntity | null;

    const takedamageValue = traceEntity?.takedamage as damage | undefined;
    if (traceEntity !== null && takedamageValue !== damage.DAMAGE_NO) {
      this._player.damage(traceEntity, 20.0, null, trace.point);
      return;
    }

    // hit wall
    this._startSound('player/axhit2.wav');
    this._damageInflictor.dispatchGunshotEvent(origin);
    this._engine.BroadcastClientEvent(false, clientEvent.EMIT_DECAL, trace.point, trace.plane.normal, decals.DECAL_AXEHIT);
  }

  fireShotgun(): void {
    if (!this.checkAmmo()) {
      return;
    }

    this._startSound('weapons/guncock.wav');
    this._player.currentammo = this._player.ammo_shells = this._player.ammo_shells - 1;
    this._player.punchangle[0] -= 2.0;

    const { forward } = this._player.v_angle.angleVectors();
    const direction = this._player.aim(forward);

    this._damageInflictor.fireBullets(6, direction, new Vector(0.04, 0.04, 0.0));
  }

  fireSuperShotgun(): void {
    if (this._player.currentammo === 1) {
      this.fireShotgun();
      return;
    }

    if (!this.checkAmmo()) {
      return;
    }

    this._startSound('weapons/shotgn2.wav');
    this._player.currentammo = this._player.ammo_shells = this._player.ammo_shells - 2;
    this._player.punchangle[0] -= 4.0;

    const { forward } = this._player.v_angle.angleVectors();
    const direction = this._player.aim(forward);

    this._damageInflictor.fireBullets(14, direction, new Vector(0.14, 0.08, 0.0));
  }

  fireNailgun(): void {
    if (!this.checkAmmo() || this._player.weapon !== items.IT_NAILGUN) {
      return;
    }

    this._startSound('weapons/rocket1i.wav');
    this._player.currentammo = this._player.ammo_nails = this._player.ammo_nails - 1;
    this._player.punchangle[0] -= 0.5;

    this._player._scheduleThink(this._game.time + 0.1, function (this: PlayerEntity): void {
      if (this.button0) {
        this._weapons.fireNailgun();
      }
    });

    this._engine.SpawnEntity(Spike.classname, { owner: this._player.edict });
  }

  fireSuperNailgun(): void {
    if (!this.checkAmmo() || this._player.weapon !== items.IT_SUPER_NAILGUN) {
      return;
    }

    this._startSound('weapons/spike2.wav');
    this._player.currentammo = this._player.ammo_nails = this._player.ammo_nails - 2;
    this._player.punchangle[0] -= 0.5;

    if (this._player.currentammo >= 0) {
      this._player._scheduleThink(this._game.time + 0.1, function (this: PlayerEntity): void {
        if (this.button0) {
          this._weapons.fireSuperNailgun();
        }
      });

      this._engine.SpawnEntity(Superspike.classname, { owner: this._player.edict });
      return;
    }

    this._engine.SpawnEntity(Spike.classname, { owner: this._player.edict });
  }

  fireRocket(): void {
    if (!this.checkAmmo()) {
      return;
    }

    this._startSound('weapons/sgun1.wav');
    this._player.currentammo = this._player.ammo_rockets = this._player.ammo_rockets - 1;
    this._player.punchangle[0] = -2;

    this._engine.SpawnEntity(Missile.classname, { owner: this._player.edict });
  }

  fireGrenade(): void {
    if (!this.checkAmmo()) {
      return;
    }

    this._startSound('weapons/grenade.wav');
    this._player.currentammo = this._player.ammo_rockets = this._player.ammo_rockets - 1;
    this._player.punchangle[0] = -2;

    const velocity = new Vector();
    const { forward, up, right } = this._player.v_angle.angleVectors();

    if (this._player.v_angle[0] !== 0.0) {
      velocity.add(forward.multiply(600.0));
      velocity.add(up.copy().multiply(200.0));
      velocity.add(right.multiply(10.0 * crandom()));
      velocity.add(up.multiply(10.0 * crandom()));
    } else {
      velocity.set(this._player.aim(forward).multiply(600.0));
      velocity[2] = 200.0;
    }

    this._engine.SpawnEntity(Grenade.classname, { owner: this._player.edict, velocity });
  }

  fireLightning(attackContinuation = false): void {
    if (!attackContinuation) {
      this._startSound('weapons/lstart.wav', channel.CHAN_AUTO);
    }

    if (!this.checkAmmo()) {
      return;
    }

    // explode if under water
    if (this._player.waterlevel >= waterlevel.WATERLEVEL_WAIST) {
      const ammo = this._player.ammo_cells;
      this._damageInflictor.blastDamage(ammo * 35, this._player);
      this._player.currentammo = this._player.ammo_cells = 0;
      return;
    }

    if (attackContinuation && this._lightningSoundTime < this._game.time) {
      this._startSound('weapons/lhit.wav');
      this._lightningSoundTime = this._game.time + 0.6;
    }

    this._player.punchangle[0] -= 1.0;

    this._player.currentammo = this._player.ammo_cells = this._player.ammo_cells - 1;

    const origin = new Vector(0.0, 0.0, 16.0).add(this._player.origin);
    const { forward } = this._player.v_angle.angleVectors();

    const trace = this._player.traceline(origin, forward.multiply(600.0).add(origin), true);

    this._damageInflictor.dispatchBeamEvent(tentType.TE_LIGHTNING2, trace.point, origin);
    this._damageInflictor.lightningDamage(origin, trace.point.add(forward.multiply(4.0 / 600.0)), 30);

    this._player._scheduleThink(this._game.time + 0.1, function (this: PlayerEntity): void {
      if (this.button0) {
        this._weapons.fireLightning(true);
      }
    });
  }
}
