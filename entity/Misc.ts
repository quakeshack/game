import type { ServerEngineAPI } from '../../../shared/GameInterfaces.ts';

import { BaseClientEdictHandler } from '../../../shared/ClientEdict.ts';
import Vector from '../../../shared/Vector.ts';

import { attn, channel, colors, content, damage, effect, moveType, solid, tentType, waterlevel } from '../Defs.ts';
import { crandom, entity, serializable } from '../helper/MiscHelpers.ts';
import BaseEntity from './BaseEntity.ts';
import BaseMonster from './monster/BaseMonster.ts';
import { PlayerEntity } from './Player.ts';
import { Sub } from './Subs.ts';
import { DamageHandler, DamageInflictor, Explosions, Laser, Spike, Superspike } from './Weapons.ts';

/**
 * QUAKED info_null (0 0.5 0) (-4 -4 -4) (4 4 4)
 * Used as a positional target for spotlights, etc.
 */
@entity
export class NullEntity extends BaseEntity {
  static classname = 'info_null';

  override spawn(): void {
    this.remove();
  }
}

/**
 * QUAKED info_notnull (0 0.5 0) (-4 -4 -4) (4 4 4)
 * Used as a positional target for lightning.
 */
@entity
export class InfoNotNullEntity extends BaseEntity {
  static classname = 'info_notnull';
}

/**
 * Legacy alias used by some maps and editors for a persistent point target,
 * e.g. player statue in END.BSP.
 */
@entity
export class MiscNullEntity extends InfoNotNullEntity {
  static classname = 'misc_null';
}

/**
 * QUAKED info_intermission (1 0.5 0.5) (-16 -16 -16) (16 16 16)
 * This is the camera point for the intermission.
 * Use mangle instead of angle, so you can set pitch or roll as well as yaw. 'pitch roll yaw'
 */
@entity
export class IntermissionCameraEntity extends BaseEntity {
  static classname = 'info_intermission';

  @serializable mangle = new Vector();
}

/**
 * QUAKED viewthing (0 .5 .8) (-8 -8 -8) (8 8 8)
 * Just for the debugging level. Don't use.
 */
@entity
export class ViewthingEntity extends BaseEntity {
  static classname = 'viewthing';

  protected override _precache(): void {
    this.engine.PrecacheModel('progs/player.mdl');
  }

  override spawn(): void {
    this.movetype = moveType.MOVETYPE_NONE;
    this.solid = solid.SOLID_NOT;
    this.setModel('progs/player.mdl');
  }
}

@entity
export class BaseLightEntity extends BaseEntity {
  static START_OFF = 1;

  @serializable light_lev = 0;
  @serializable style = 0;

  override use(_usedByEntity: BaseEntity): void {
    if (this.spawnflags & BaseLightEntity.START_OFF) {
      this.engine.Lightstyle(this.style, 'm');
      this.spawnflags -= BaseLightEntity.START_OFF;
    } else {
      this.engine.Lightstyle(this.style, 'a');
      this.spawnflags += BaseLightEntity.START_OFF;
    }
  }

  protected _defaultStyle(): void {
    if (this.style < 32) {
      return;
    }

    if (this.spawnflags & BaseLightEntity.START_OFF) {
      this.engine.Lightstyle(this.style, 'a');
    } else {
      this.engine.Lightstyle(this.style, 'm');
    }
  }
}

/**
 * QUAKED light (0 1 0) (-8 -8 -8) (8 8 8) START_OFF
 * Non-displayed light.
 * Default light value is 300.
 * Default style is 0.
 * If targeted, it will toggle between on or off.
 */
@entity
export class LightEntity extends BaseLightEntity {
  static classname = 'light';

  override spawn(): void {
    if (!this.targetname) {
      this.remove();
      return;
    }

    this._defaultStyle();
  }

  on(): void {
    this.engine.Lightstyle(this.style, 'm');
  }

  off(): void {
    this.engine.Lightstyle(this.style, 'a');
  }
}

/**
 * QUAKED light_fluoro (0 1 0) (-8 -8 -8) (8 8 8) START_OFF
 * Non-displayed light.
 * Default light value is 300.
 * Default style is 0.
 * If targeted, it will toggle between on or off.
 * Makes steady fluorescent humming sound.
 */
@entity
export class LightFluoroEntity extends BaseLightEntity {
  static classname = 'light_fluoro';

  protected override _precache(): void {
    this.engine.PrecacheSound('ambience/fl_hum1.wav');
  }

  override spawn(): void {
    this._defaultStyle();
    this.spawnAmbientSound('ambience/fl_hum1.wav', 0.5, attn.ATTN_STATIC);
  }
}

/**
 * QUAKED light_fluorospark (0 1 0) (-8 -8 -8) (8 8 8)
 * Non-displayed light.
 * Default light value is 300.
 * Default style is 10.
 * Makes sparking, broken fluorescent sound.
 */
@entity
export class LightFluorosparkEntity extends BaseLightEntity {
  static classname = 'light_fluorospark';

  protected override _precache(): void {
    this.engine.PrecacheSound('ambience/buzz1.wav');
  }

  override spawn(): void {
    if (!this.style) {
      this.style = 10;
    }

    this.spawnAmbientSound('ambience/buzz1.wav', 0.5, attn.ATTN_STATIC);
  }
}

/**
 * QUAKED light_globe (0 1 0) (-8 -8 -8) (8 8 8)
 * Sphere globe light.
 * Default light value is 300.
 * Default style is 0.
 */
@entity
export class LightGlobeEntity extends BaseLightEntity {
  static classname = 'light_globe';

  protected override _precache(): void {
    this.engine.PrecacheModel('progs/s_light.spr');
  }

  override spawn(): void {
    this.setModel('progs/s_light.spr');
    this.makeStatic();
  }
}

/**
 * Disappears after 700 ms.
 * TODO: This could be a client-side effect instead of an entity.
 */
@entity
export class LightGlobeDynamicEntity extends BaseLightEntity {
  static classname = 'light_globe_dynamic';

  protected override _precache(): void {
    this.engine.PrecacheModel('progs/s_light.mdl');
  }

  override spawn(): void {
    this.setModel('progs/s_light.mdl');
    this._scheduleThink(this.game.time + 0.2, () => {
      this.frame = 1;
    });
    this._scheduleThink(this.game.time + 0.3, () => {
      this.frame = 2;
    });
    this._scheduleThink(this.game.time + 0.4, () => {
      this.remove();
    });
  }
}

@entity
export class TorchLightEntity extends BaseLightEntity {
  protected override _precache(): void {
    this.engine.PrecacheModel('progs/flame.mdl');
    this.engine.PrecacheModel('progs/flame2.mdl');
    this.engine.PrecacheSound('ambience/fire1.wav');
  }

  override spawn(): void {
    this.effects |= effect.EF_FULLBRIGHT;
    this.spawnAmbientSound('ambience/fire1.wav', 0.5, attn.ATTN_STATIC);
    this.makeStatic();
  }
}

/**
 * QUAKED light_torch_small_walltorch (0 .5 0) (-10 -10 -20) (10 10 20)
 * Short wall torch.
 * Default light value is 200.
 * Default style is 0.
 */
@entity
export class SmallWalltorchLightEntity extends TorchLightEntity {
  static classname = 'light_torch_small_walltorch';

  override spawn(): void {
    this.setModel('progs/flame.mdl');
    super.spawn();
  }
}

/**
 * QUAKED light_flame_large_yellow (0 1 0) (-10 -10 -12) (12 12 18)
 * Large yellow flame ball.
 */
@entity
export class YellowLargeFlameLightEntity extends TorchLightEntity {
  static classname = 'light_flame_large_yellow';

  override spawn(): void {
    this.setModel('progs/flame2.mdl');
    this.frame = 1;
    super.spawn();
  }
}

/**
 * QUAKED light_flame_small_yellow (0 1 0) (-8 -8 -8) (8 8 8) START_OFF
 * Small yellow flame ball.
 */
@entity
export class YellowSmallFlameLightEntity extends TorchLightEntity {
  static classname = 'light_flame_small_yellow';

  override spawn(): void {
    this.setModel('progs/flame2.mdl');
    super.spawn();
  }
}

/**
 * QUAKED light_flame_small_white (0 1 0) (-10 -10 -40) (10 10 40) START_OFF
 * Small white flame ball.
 */
@entity
export class WhiteSmallFlameLightEntity extends TorchLightEntity {
  static classname = 'light_flame_small_white';

  override spawn(): void {
    this.setModel('progs/flame2.mdl');
    super.spawn();
  }
}

@entity
export class FireballEntity extends BaseEntity {
  static classname = 'misc_fireball_fireball';

  static clientEdictHandler = class FireballEdictHandler extends BaseClientEdictHandler {
    emit(): void {
      const dl = this.engine.AllocDlight(this.clientEdict.num);

      dl.color = new Vector(...this.engine.IndexToRGB(colors.FIRE));
      dl.origin = this.clientEdict.origin.copy();
      dl.radius = 285 + Math.random() * 15;
      dl.die = this.engine.CL.time + 0.1;

      this.engine.RocketTrail(this.clientEdict.originPrevious, this.clientEdict.origin, 1);
      this.engine.RocketTrail(this.clientEdict.originPrevious, this.clientEdict.origin, 6);
    }
  };

  @serializable speed = 1000;

  get netname(): string {
    return 'a fireball';
  }

  override spawn(): void {
    console.assert(this.owner instanceof FireballSpawnerEntity, 'misc_fireball_fireball must have a misc_fireball as owner');

    this.solid = solid.SOLID_TRIGGER;
    this.movetype = moveType.MOVETYPE_TOSS;
    this.effects |= effect.EF_FULLBRIGHT;
    this.velocity = new Vector(
      Math.random() * 100 - 50,
      Math.random() * 100 - 50,
      Math.random() * 200 + this.speed,
    );
    this.setModel('progs/lavaball.mdl');
    this.setSize(Vector.origin, Vector.origin);

    this._scheduleThink(this.game.time + 5.0, () => {
      this.remove();
    });
  }

  override touch(otherEntity: BaseEntity): void {
    this.damage(otherEntity, 20.0);
    this.remove();
  }
}

/**
 * QUAKED misc_fireball (0 .5 .8) (-8 -8 -8) (8 8 8)
 * Lava Balls.
 */
@entity
export class FireballSpawnerEntity extends BaseEntity {
  static classname = 'misc_fireball';

  @serializable speed = 1000;

  protected override _precache(): void {
    this.engine.PrecacheModel('progs/lavaball.mdl');
  }

  override spawn(): void {
    this._scheduleThink(this.game.time + Math.random() * 5.0, () => {
      this._fire();
    });
  }

  protected _fire(): void {
    this.engine.SpawnEntity(FireballEntity.classname, {
      origin: this.origin,
      speed: this.speed,
      owner: this,
    });

    this._scheduleThink(this.game.time + Math.random() * 5.0, () => {
      this._fire();
    });
  }
}

@entity
export class DebugMarkerEntity extends BaseEntity {
  static classname = 'debug_marker';

  protected override _precache(): void {
    this.engine.PrecacheModel('progs/s_light.spr');
  }

  override spawn(): void {
    this.movetype = moveType.MOVETYPE_NONE;
    this.solid = solid.SOLID_TRIGGER;
    this.setSize(new Vector(-4.0, -4.0, -4.0), new Vector(4.0, 4.0, 4.0));
    this.setModel('progs/s_light.spr');

    if (this.owner instanceof PlayerEntity) {
      this.owner.centerPrint(`marker set at ${this.origin}`);
      this._scheduleThink(this.game.time + 5.0, () => {
        this.remove();
      });
      return;
    }

    this.makeStatic();
  }

  override touch(otherEntity: BaseEntity): void {
    if (otherEntity.equals(this.owner)) {
      this.remove();
    }
  }
}

@entity
export class BaseAmbientSound extends BaseEntity {
  static _sfxName: string | null = null;
  static _volume = 0;

  protected override _precache(): void {
    const ctor = this.constructor as typeof BaseAmbientSound;
    console.assert(ctor._sfxName !== null, 'Ambient sound classes must define _sfxName');
    if (ctor._sfxName === null) {
      return;
    }

    this.engine.PrecacheSound(ctor._sfxName);
  }

  override spawn(): void {
    const ctor = this.constructor as typeof BaseAmbientSound;
    console.assert(ctor._sfxName !== null, 'Ambient sound classes must define _sfxName');
    if (ctor._sfxName === null) {
      return;
    }

    this.spawnAmbientSound(ctor._sfxName, ctor._volume, attn.ATTN_STATIC);
  }
}

@entity
export class AmbientCompHum extends BaseAmbientSound {
  static classname = 'ambient_comp_hum';
  static _sfxName = 'ambience/comp1.wav';
  static _volume = 1.0;
}

@entity
export class AmbientDrone extends BaseAmbientSound {
  static classname = 'ambient_drone';
  static _sfxName = 'ambience/drone6.wav';
  static _volume = 0.5;
}

@entity
export class AmbientSuckWind extends BaseAmbientSound {
  static classname = 'ambient_suck_wind';
  static _sfxName = 'ambience/suck1.wav';
  static _volume = 1.0;
}

@entity
export class AmbientFlouroBuzz extends BaseAmbientSound {
  static classname = 'ambient_flouro_buzz';
  static _sfxName = 'ambience/buzz1.wav';
  static _volume = 1.0;
}

@entity
export class AmbientDrip extends BaseAmbientSound {
  static classname = 'ambient_drip';
  static _sfxName = 'ambience/drip1.wav';
  static _volume = 0.5;
}

@entity
export class AmbientThunder extends BaseAmbientSound {
  static classname = 'ambient_thunder';
  static _sfxName = 'ambience/thunder1.wav';
  static _volume = 0.5;
}

@entity
export class AmbientLightBuzz extends BaseAmbientSound {
  static classname = 'ambient_light_buzz';
  static _sfxName = 'ambience/fl_hum1.wav';
  static _volume = 0.5;
}

@entity
export class AmbientSwamp1 extends BaseAmbientSound {
  static classname = 'ambient_swamp1';
  static _sfxName = 'ambience/swamp1.wav';
  static _volume = 0.5;
}

@entity
export class AmbientSwamp2 extends BaseAmbientSound {
  static classname = 'ambient_swamp2';
  static _sfxName = 'ambience/swamp2.wav';
  static _volume = 0.5;
}

@entity
export class BaseWallEntity extends BaseEntity {
  override use(_usedByEntity: BaseEntity): void {
    this.frame = 1 - this.frame;
  }

  override spawn(): void {
    console.assert(this.model !== null, 'Brush wall entities require a model');
    if (this.model === null) {
      return;
    }

    this.angles.clear();
    this.movetype = moveType.MOVETYPE_PUSH;
    this.solid = solid.SOLID_BSP;
    this.setModel(this.model);
    this.setOrigin(this.origin);
  }
}

/**
 * QUAKED func_wall (0 .5 .8) ?
 * This is just a solid wall if not inhibited.
 */
@entity
export class WallEntity extends BaseWallEntity {
  static classname = 'func_wall';
}

/**
 * QUAKED func_illusionary (0 .5 .8) ?
 * A simple entity that looks solid but lets you walk through it.
 */
@entity
export class IllusionaryWallEntity extends BaseWallEntity {
  static classname = 'func_illusionary';

  override use(_usedByEntity: BaseEntity): void {
  }

  override spawn(): void {
    console.assert(this.model !== null, 'Illusionary wall entities require a model');
    if (this.model === null) {
      return;
    }

    this.setModel(this.model);
    this.makeStatic();
  }
}

/**
 * QUAKED func_episodegate (0 .5 .8) ? E1 E2 E3 E4
 * This bmodel will appear if the episode has already been completed,
 * so players can't reenter it.
 */
@entity
export class EpisodegateWallEntity extends BaseWallEntity {
  static classname = 'func_episodegate';

  override spawn(): void {
    if ((this.game.serverflags & this.spawnflags) === 0) {
      this.remove();
      return;
    }

    super.spawn();
  }
}

/**
 * QUAKED func_bossgate (0 .5 .8) ?
 * This bmodel appears unless players have all of the episode sigils.
 */
@entity
export class BossgateWallEntity extends BaseWallEntity {
  static classname = 'func_bossgate';

  override spawn(): void {
    if ((this.game.serverflags & 15) === 15) {
      this.remove();
      return;
    }

    super.spawn();
  }
}

/**
 * Ephemeral teleport fog effect.
 */
@entity
export class TeleportEffectEntity extends BaseEntity {
  static classname = 'misc_tfog';

  static override _precache(engineAPI: ServerEngineAPI): void {
    engineAPI.PrecacheSound('misc/r_tele1.wav');
    engineAPI.PrecacheSound('misc/r_tele2.wav');
    engineAPI.PrecacheSound('misc/r_tele3.wav');
    engineAPI.PrecacheSound('misc/r_tele4.wav');
    engineAPI.PrecacheSound('misc/r_tele5.wav');
  }

  protected _playTeleport(): void {
    this.startSound(channel.CHAN_VOICE, `misc/r_tele${Math.floor(Math.random() * 5) + 1}.wav`);
    this.remove();
  }

  override spawn(): void {
    this._scheduleThink(this.game.time + 0.2, () => {
      this._playTeleport();
    });

    this.engine.DispatchTempEntityEvent(tentType.TE_TELEPORT, this.origin);
  }
}

@entity
export class BaseBarrelEntity extends BaseEntity {
  static _model: string | null = null;
  static _noise: string | null = null;

  @serializable health = 20;
  @serializable bloodcolor: number = colors.DUST;

  protected _damageInflictor = null;
  protected _explosion = null;

  protected override _declareFields(): void {
    super._declareFields();
    this._damageHandler = new DamageHandler(this);
    this._damageInflictor = new DamageInflictor(this);
    this._explosion = new Explosions(this);
  }

  protected override _precache(): void {
    const ctor = this.constructor as typeof BaseBarrelEntity;
    console.assert(ctor._model !== null, 'Barrel classes must define _model');
    console.assert(ctor._noise !== null, 'Barrel classes must define _noise');
    if (ctor._model === null || ctor._noise === null) {
      return;
    }

    this.engine.PrecacheModel(ctor._model);
    this.engine.PrecacheSound(ctor._noise);
  }

  static override _initStates(): void {
    this._resetStates();
    Explosions.initStates(this);
  }

  get netname(): string {
    return 'a barrel';
  }

  thinkDie(): void {
    const ctor = this.constructor as typeof BaseBarrelEntity;
    console.assert(this._damageInflictor !== null, 'Barrels require DamageInflictor helper');
    console.assert(this._explosion !== null, 'Barrels require explosion helper');
    console.assert(ctor._noise !== null, 'Barrel classes must define _noise');
    if (this._damageInflictor === null || this._explosion === null || ctor._noise === null) {
      return;
    }

    this.takedamage = damage.DAMAGE_NO;
    this._damageInflictor.blastDamage(160, this, this);
    this.startSound(channel.CHAN_VOICE, ctor._noise);
    this.engine.StartParticles(this.origin, Vector.origin, colors.FIRE, 255);

    this.origin[2] += 32;
    this._explosion.becomeExplosion();
  }

  override spawn(): void {
    const ctor = this.constructor as typeof BaseBarrelEntity;
    console.assert(ctor._model !== null, 'Barrel classes must define _model');
    if (ctor._model === null) {
      return;
    }

    this.solid = solid.SOLID_BBOX;
    this.movetype = moveType.MOVETYPE_NONE;
    this.takedamage = damage.DAMAGE_AIM;
    this.setModel(ctor._model);

    this.origin[2] += 2.0;
    this.dropToFloor();
  }
}

/**
 * QUAKED misc_explobox (0 .5 .8) (0 0 0) (32 32 64)
 */
@entity
export class BarrelEntity extends BaseBarrelEntity {
  static classname = 'misc_explobox';
  static _model = 'maps/b_explob.bsp';
  static _noise = 'weapons/r_exp3.wav';
}

/**
 * QUAKED misc_explobox2 (0 .5 .8) (0 0 0) (32 32 64)
 * Smaller exploding box, REGISTERED ONLY.
 */
@entity
export class SmallBarrelEntity extends BaseBarrelEntity {
  static classname = 'misc_explobox2';
  static _model = 'maps/b_explob.bsp';
  static _noise = 'weapons/r_exp3.wav';
}

/**
 * QUAKED path_corner (0.5 0.3 0) (-8 -8 -8) (8 8 8)
 * Monsters will continue walking towards the next target corner.
 */
@entity
export class PathCornerEntity extends BaseEntity {
  static classname = 'path_corner';

  /** The number of seconds to spend standing or bowing for path_stand or path_bow. */
  @serializable pausetime = 0;
  /** Copied over to enemies or func_train entities. */
  @serializable wait = 0;

  override touch(otherEntity: BaseEntity): void {
    if (!(otherEntity instanceof BaseMonster)) {
      return;
    }

    if (!this.equals(otherEntity.movetarget)) {
      return;
    }

    if (otherEntity.enemy) {
      return;
    }

    otherEntity.moveTargetReached(this);
  }

  override spawn(): void {
    console.assert(this.targetname !== null, 'requires targetname to function');
    this.solid = solid.SOLID_TRIGGER;
    this.setSize(new Vector(-8.0, -8.0, -8.0), new Vector(8.0, 8.0, 8.0));
  }
}

/**
 * QUAKED trap_spikeshooter (0 .5 .8) (-8 -8 -8) (8 8 8) superspike laser
 * When triggered, fires a spike in the direction set in QuakeEd.
 * Laser is only for REGISTERED.
 */
@entity
export class TrapSpikeshooterEntity extends BaseEntity {
  static classname = 'trap_spikeshooter';

  static SPAWNFLAG_SUPERSPIKE = 1;
  static SPAWNFLAG_LASER = 2;

  @serializable wait = 0;

  protected override _declareFields(): void {
    super._declareFields();
    this._sub ??= new Sub(this);
  }

  protected override _precache(): void {
    if (this.spawnflags & TrapSpikeshooterEntity.SPAWNFLAG_LASER) {
      this.engine.PrecacheModel('progs/laser.mdl');
      this.engine.PrecacheSound('enforcer/enfire.wav');
      this.engine.PrecacheSound('enforcer/enfstop.wav');
      return;
    }

    this.engine.PrecacheSound('weapons/spike2.wav');
  }

  override use(_usedByEntity: BaseEntity): void {
    if (this.spawnflags & TrapSpikeshooterEntity.SPAWNFLAG_LASER) {
      const laserEdict = this.engine.SpawnEntity(Laser.classname, { owner: this, origin: this.origin });
      const laser = laserEdict?.entity;
      console.assert(laser instanceof Laser, 'trap_spikeshooter laser spawns must yield Laser entities');
      if (laser instanceof Laser) {
        laser.effects |= effect.EF_MUZZLEFLASH;
      }
      return;
    }

    this.startSound(channel.CHAN_VOICE, 'weapons/spike2.wav');
    this.engine.SpawnEntity(
      (this.spawnflags & TrapSpikeshooterEntity.SPAWNFLAG_SUPERSPIKE) ? Superspike.classname : Spike.classname,
      { owner: this, speed: 500.0 },
    );
  }

  override spawn(): void {
    const sub = this._sub;
    console.assert(sub !== null, 'TrapSpikeshooterEntity requires Sub helper');
    sub?.setMovedir();
  }
}

/**
 * QUAKED trap_shooter (0 .5 .8) (-8 -8 -8) (8 8 8) superspike laser
 * Continuously fires spikes.
 * "wait" time between spikes (1.0 default).
 * "nextthink" delay before firing first spike, so multiple shooters can be staggered.
 */
@entity
export class TrapShooterEntity extends TrapSpikeshooterEntity {
  static classname = 'trap_shooter';

  override spawn(): void {
    super.spawn();

    if (this.wait === 0) {
      this.wait = 1;
    }

    // This is a bit of a hack, but it matches the original QuakeC scheduling.
    this._scheduleThink(this.wait + this.ltime + this.nextthink, function (this: TrapShooterEntity): void {
      this.use(this);
    });
  }
}

/**
 * Spawns bubbles, used for the death of the player.
 * Do not place this inside the map, use the static bubble() function instead.
 * For use inside the map, use air_bubbles instead.
 */
@entity
export class BubbleSpawnerEntity extends BaseEntity {
  static classname = 'misc_bubble_spawner';

  /** How many bubbles to spawn. */
  @serializable bubble_count = 0;
  /** How many map units to spread them apart upon spawning. */
  @serializable spread = 0;

  protected _spawnBubble(): void {
    this.engine.SpawnEntity(BubbleEntity.classname, { owner: this });
  }

  override spawn(): void {
    this._scheduleThink(this.game.time + this.bubble_count, function (this: BubbleSpawnerEntity): void {
      this.remove();
    });

    while (this.bubble_count > 0) {
      this._scheduleThink(this.game.time + this.bubble_count-- * 0.1, function (this: BubbleSpawnerEntity): void {
        this._spawnBubble();
      });
    }
  }

  /**
   * QuakeC: player.qc/DeathBubbles
   * @returns The spawned bubble spawner entity.
   */
  static bubble(entity: BaseEntity, bubbles: number): BubbleSpawnerEntity {
    console.assert(bubbles > 0, 'bubble() requires a positive number of bubbles');
    console.assert(bubbles < 50, 'bubble() requires a number of bubbles less than 50');

    const edict = entity.engine.SpawnEntity(BubbleSpawnerEntity.classname, {
      origin: entity.origin.copy().add(entity.view_ofs),
      bubble_count: bubbles,
      spread: 5,
    });
    const spawner = edict?.entity;
    console.assert(spawner instanceof BubbleSpawnerEntity, 'bubble() must spawn a BubbleSpawnerEntity');
    return spawner as BubbleSpawnerEntity;
  }
}

/**
 * QUAKED air_bubbles (0 .5 .8) (-8 -8 -8) (8 8 8)
 * Testing air bubbles.
 */
@entity
export class StaticBubbleSpawnerEntity extends BubbleSpawnerEntity {
  static classname = 'air_bubbles';

  protected override _spawnBubble(): void {
    super._spawnBubble();
    this._scheduleThink(this.game.time + Math.random() * 1.0 + 1.0, function (this: StaticBubbleSpawnerEntity): void {
      this._spawnBubble();
    });
  }

  override spawn(): void {
    this._spawnBubble();
  }
}

@entity
export class BubbleEntity extends BaseEntity {
  static classname = 'misc_bubble';

  static override _precache(engineAPI: ServerEngineAPI): void {
    engineAPI.PrecacheModel('progs/s_bubble.spr');
  }

  override touch(otherEntity: BaseEntity): void {
    if (otherEntity.isWorld()) {
      this.lazyRemove();
    }
  }

  protected _bubble(): void {
    this.watertype = this.engine.DeterminePointContents(this.origin);

    if (this.watertype !== content.CONTENT_WATER) {
      this.remove();
      return;
    }

    if (this.attack_finished < this.game.time) {
      this.remove();
      return;
    }

    this.velocity[0] = crandom() * 2.0;
    this.velocity[1] = crandom() * 2.0;

    this._scheduleThink(this.game.time + 1.0, function (this: BubbleEntity): void {
      this._bubble();
    });
  }

  override spawn(): void {
    console.assert(this.owner instanceof BubbleSpawnerEntity, 'BubbleEntity requires a BubbleSpawnerEntity as owner');
    if (!(this.owner instanceof BubbleSpawnerEntity)) {
      return;
    }

    // Waterlevel head and watertype water keep the engine from playing splash sounds.
    this.waterlevel = waterlevel.WATERLEVEL_HEAD;
    this.watertype = content.CONTENT_WATER;

    // Make sure world touches remove the bubbles.
    this.solid = solid.SOLID_TRIGGER;

    this.origin.set(this.owner.origin);
    this.origin[0] += crandom() * this.owner.spread;
    this.origin[1] += crandom() * this.owner.spread;
    this.origin[2] += crandom() * this.owner.spread;
    this.setOrigin(this.origin);
    this.setSize(new Vector(-8.0, -8.0, -8.0), new Vector(8.0, 8.0, 8.0));
    this.setModel('progs/s_bubble.spr');
    this.frame = 0;

    // Bubbles only live for up to 10 seconds.
    this.attack_finished = this.game.time + 10.0;

    // Enabling fake buoyancy effect and remove when out of water.
    this.movetype = moveType.MOVETYPE_FLY;
    this.velocity = new Vector(0.0, 0.0, 15.0 + crandom());
    this._bubble();
  }
}

/**
 * QUAKED misc_model (0 .5 .8) (-8 -8 -8) (8 8 8)
 * Use this entity to place a model in the world that doesn't do anything.
 * Set the "model" field to the path of the model to use.
 * Its mesh will be used for collision.
 */
@entity
export class MiscModelEntity extends BaseEntity {
  static classname = 'misc_model';

  override spawn(): void {
    console.assert(this.model !== null, 'misc_model requires a model to be set');
    if (this.model === null) {
      return;
    }

    this.movetype = moveType.MOVETYPE_NONE;
    this.solid = solid.SOLID_MESH;
    this.setModel(this.model);
  }
}
