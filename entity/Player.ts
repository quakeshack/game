import type { ClientEventValue, PlayerEntitySpawnParamsDynamic, ServerEdict, ServerEngineAPI } from '../../../shared/GameInterfaces.ts';

import { BaseClientEdictHandler } from '../../../shared/ClientEdict.ts';
import Vector from '../../../shared/Vector.ts';

import { attn, channel, clientEvent, colors, content, damage, dead, deathType, effect, flags, hull, items, moveType, solid, waterlevel } from '../Defs.ts';
import { featureFlags } from '../GameAPI.ts';
import { crandom, entity, serializable, Serializer } from '../helper/MiscHelpers.ts';
import BaseEntity from './BaseEntity.ts';
import { BackpackEntity } from './Items.ts';
import { BubbleSpawnerEntity, InfoNotNullEntity, IntermissionCameraEntity, TeleportEffectEntity } from './Misc.ts';
import BaseMonster, { MeatSprayEntity } from './monster/BaseMonster.ts';
import { DamageHandler, PlayerWeapons, weaponConfig, type BackpackPickup, type WeaponConfigKey } from './Weapons.ts';
import { CopyToBodyQue } from './Worldspawn.ts';

type ButtonState = boolean | number;

interface ModelIndexSet {
  player: number | null;
  eyes: number | null;
}

interface InvincibleSoundTimeMap {
  [attackerEdictId: number]: number;
}

/**
 * Return a launch velocity scaled to the damage that caused the gib.
 * @returns Gib launch velocity.
 */
function VelocityForDamage(damagePoints: number): Vector {
  const velocity = new Vector(100.0 * crandom(), 100.0 * crandom(), 100.0 * crandom() + 200.0);

  if (damagePoints > -50) {
    velocity.multiply(0.7);
  } else if (damagePoints > -200) {
    velocity.multiply(2.0);
  } else {
    velocity.multiply(10.0);
  }

  return velocity;
}

/**
 * Return a readable display name for obituary messages.
 * @returns Player netname when available, otherwise the classname.
 */
function getEntityDisplayName(entity: BaseEntity): string {
  if ('netname' in entity && typeof entity.netname === 'string' && entity.netname.length > 0) {
    return entity.netname;
  }

  return entity.classname;
}

/**
 * Check whether a numeric item bit maps to a weapon configuration entry.
 * @returns True when the item is a weapon config key.
 */
function isWeaponConfigKey(value: number): value is WeaponConfigKey {
  return weaponConfig.has(value as WeaponConfigKey);
}

/**
 * QUAKED info_player_start (1 0 0) (-16 -16 -24) (16 16 24)
 * The normal starting point for a level.
 */
export class InfoPlayerStart extends InfoNotNullEntity {
  static classname = 'info_player_start';
}

/**
 * QUAKED info_player_start2 (1 0 0) (-16 -16 -24) (16 16 24)
 * Only used on start map for the return point from an episode.
 */
export class InfoPlayerStart2 extends InfoNotNullEntity {
  static classname = 'info_player_start2';
}

/**
 * Saved out by quaked in region mode.
 * Details: https://quakewiki.org/wiki/testplayerstart
 */
export class InfoPlayerStartTest extends InfoNotNullEntity {
  static classname = 'testplayerstart';
}

/**
 * QUAKED info_player_deathmatch (1 0 1) (-16 -16 -24) (16 16 24)
 * potential spawning position for deathmatch games
 */
export class InfoPlayerStartDeathmatch extends InfoNotNullEntity {
  static classname = 'info_player_deathmatch';
}

/**
 * QUAKED info_player_coop (1 0 1) (-16 -16 -24) (16 16 24)
 * potential spawning position for coop games
 */
export class InfoPlayerStartCoop extends InfoNotNullEntity {
  static classname = 'info_player_coop';
}

@entity
export class PlayerEntity extends BaseEntity implements PlayerEntitySpawnParamsDynamic {
  static classname = 'player';

  static _modelQC = `
$cd id1/models/player_4
$origin 0 -6 24
$base base
$skin skin

//
// running
//
$frame axrun1 axrun2 axrun3 axrun4 axrun5 axrun6

$frame rockrun1 rockrun2 rockrun3 rockrun4 rockrun5 rockrun6

//
// standing
//
$frame stand1 stand2 stand3 stand4 stand5

$frame axstnd1 axstnd2 axstnd3 axstnd4 axstnd5 axstnd6
$frame axstnd7 axstnd8 axstnd9 axstnd10 axstnd11 axstnd12


//
// pain
//
$frame axpain1 axpain2 axpain3 axpain4 axpain5 axpain6

$frame pain1 pain2 pain3 pain4 pain5 pain6


//
// death
//

$frame axdeth1 axdeth2 axdeth3 axdeth4 axdeth5 axdeth6
$frame axdeth7 axdeth8 axdeth9

$frame deatha1 deatha2 deatha3 deatha4 deatha5 deatha6 deatha7 deatha8
$frame deatha9 deatha10 deatha11

$frame deathb1 deathb2 deathb3 deathb4 deathb5 deathb6 deathb7 deathb8
$frame deathb9

$frame deathc1 deathc2 deathc3 deathc4 deathc5 deathc6 deathc7 deathc8
$frame deathc9 deathc10 deathc11 deathc12 deathc13 deathc14 deathc15

$frame deathd1 deathd2 deathd3 deathd4 deathd5 deathd6 deathd7
$frame deathd8 deathd9

$frame deathe1 deathe2 deathe3 deathe4 deathe5 deathe6 deathe7
$frame deathe8 deathe9

//
// attacks
//
$frame nailatt1 nailatt2

$frame light1 light2

$frame rockatt1 rockatt2 rockatt3 rockatt4 rockatt5 rockatt6

$frame shotatt1 shotatt2 shotatt3 shotatt4 shotatt5 shotatt6

$frame axatt1 axatt2 axatt3 axatt4 axatt5 axatt6

$frame axattb1 axattb2 axattb3 axattb4 axattb5 axattb6

$frame axattc1 axattc2 axattc3 axattc4 axattc5 axattc6

$frame axattd1 axattd2 axattd3 axattd4 axattd5 axattd6
`;

  static clientdataFields = [
    'items',
    'armortype',
    'armorvalue',
    'ammo_shells',
    'ammo_nails',
    'ammo_rockets',
    'ammo_cells',
    'weapon',
    'weaponframe',
    'health',
    'effects',
  ];

  static clientEntityFields = [
    'items',
  ];

  static _backpackLimits = {
    ammo_nails: 200,
    ammo_cells: 100,
    ammo_rockets: 100,
    ammo_shells: 100,
  };

  static clientEdictHandler = class PlayerClientEntity extends BaseClientEdictHandler {
    override emit(): void {
      if ((+this.clientEdict.extended.items & items.IT_QUAD) !== 0) {
        const dynamicLight = this.engine.AllocDlight(this.clientEdict.num);

        dynamicLight.color = this.engine.IndexToRGB(colors.HUD_CSHIFT_POWERUP_QUAD);
        dynamicLight.origin = this.clientEdict.origin.copy();
        dynamicLight.radius = 295 + Math.random() * 5;
        dynamicLight.die = this.engine.CL.time + 0.1;
      } else if ((+this.clientEdict.extended.items & items.IT_INVULNERABILITY) !== 0) {
        const dynamicLight = this.engine.AllocDlight(this.clientEdict.num);

        dynamicLight.color = this.engine.IndexToRGB(colors.HUD_CSHIFT_POWERUP_INVULN);
        dynamicLight.origin = this.clientEdict.origin.copy();
        dynamicLight.radius = 295 + Math.random() * 5;
        dynamicLight.die = this.engine.CL.time + 0.1;
      }

      if ((this.clientEdict.effects & effect.EF_MUZZLEFLASH) !== 0) {
        const dynamicLight = this.engine.AllocDlight(this.clientEdict.num);
        const forwardVector = this.clientEdict.angles.angleVectors().forward;
        dynamicLight.origin = new Vector(
          this.clientEdict.origin[0] + 20.0 * forwardVector[0],
          this.clientEdict.origin[1] + 20.0 * forwardVector[1],
          this.clientEdict.origin[2] + 16.0 + 20.0 * forwardVector[2],
        );
        dynamicLight.radius = 200.0 + Math.random() * 32.0;
        dynamicLight.minlight = 32.0;
        dynamicLight.die = this.engine.CL.time + 0.2;
        dynamicLight.color = new Vector(1.0, 0.95, 0.85);
      }
    }
  };

  protected declare _weapons: PlayerWeapons;

  /** Restored spawn parameters carried between level transitions. */
  @serializable private _spawnParameters: string | null = null;

  /** Attack button state. */
  @serializable button0: ButtonState = false;

  /** Interact/use button state. */
  @serializable button1: ButtonState = false;

  /** Jump button state. */
  @serializable button2: ButtonState = false;

  /** Inventory and carried powerup bits. */
  @serializable items = 0;

  /** Current health total. */
  @serializable health = 0;

  /** Active armor protection factor. */
  @serializable armortype = 0;

  /** Current armor points. */
  @serializable armorvalue = 0;

  /** Shell ammo count. */
  @serializable ammo_shells = 0;

  /** Nail ammo count. */
  @serializable ammo_nails = 0;

  /** Rocket ammo count. */
  @serializable ammo_rockets = 0;

  /** Cell ammo count. */
  @serializable ammo_cells = 0;

  /** Current weapon id. */
  @serializable weapon: WeaponConfigKey | 0 = 0;

  /** Maximum normal health limit. */
  @serializable max_health = 100;

  /** Ammo count for the currently selected weapon. */
  @serializable currentammo = 0;

  /** Active first-person weapon model, kept for legacy client data. */
  @serializable weaponmodel: string | null = null;

  /** Current first-person weapon animation frame. */
  @serializable weaponframe = 0;

  /** Pending impulse command. */
  @serializable impulse = 0;

  /** Player jump flag, despite also storing vertical velocity snapshots. */
  @serializable jump_flag = 0.0;

  /** Player swimming sound flag, despite behaving like a timer. */
  @serializable swim_flag = 0.0;

  /** Time when drowning starts once the player runs out of air. */
  @serializable air_finished = 0;

  /** Number of bubbles emitted while drowning. */
  @serializable bubble_count = 0;

  /** Keeps track of how the player died. */
  @serializable deathtype = deathType.NONE;

  /** Next time the quad-damage warning should flash. */
  @serializable super_time = 0;

  /** Time when quad damage expires. */
  @serializable super_damage_finished = 0;

  /** Next time the biosuit warning should flash. */
  @serializable rad_time = 0;

  /** Time when the biosuit expires. */
  @serializable radsuit_finished = 0;

  /** Next time the invisibility warning should flash. */
  @serializable invisible_time = 0;

  /** Time for the next looping invisibility sound. */
  @serializable invisible_sound = 0;

  /** Time when invisibility expires. */
  @serializable invisible_finished = 0;

  /** Next time the invulnerability warning should flash. */
  @serializable invincible_time = 0;

  /** Time when invulnerability expires. */
  @serializable invincible_finished = 0;

  /** Next invincibility sound time per attacking entity. */
  @serializable invincible_sound_time: InvincibleSoundTimeMap = {};

  /** Time for the next quad damage sound tick while firing. */
  @serializable super_sound = 0;

  /** Multiplayer display name. */
  @serializable netname: string | null = null;

  /** Player color translation map. */
  @serializable colormap = 0;

  /** Team number used by teamplay rules. */
  @serializable team = 0;

  /** Frag count. */
  @serializable frags = 0;

  /** Client data fields pushed every frame when updated. */
  @serializable clientdataFields: string[] = [];

  /** Blood color used for damage effects. */
  @serializable bloodcolor = colors.BLOOD;

  /** Forced movement timer used by movers such as trigger_push. */
  @serializable fly_time = 0;

  /** Movement pause time used by teleporters and respawn delays. */
  @serializable pausetime = 0;

  /** Time gate for periodic environmental damage. */
  @serializable protected _damageTime = 0;

  /** Cached model indices for the normal player model and invisibility eyes. */
  @serializable protected _modelIndex: ModelIndexSet = { player: null, eyes: null };

  private get _requiredEdict(): ServerEdict {
    const edict = this.edict;
    console.assert(edict !== null, 'PlayerEntity requires a live edict');
    return edict!;
  }

  protected override _declareFields(): void {
    this._weapons = new PlayerWeapons(this);

    // client data visibility fields still live on BaseEntity, but the player owns their gameplay semantics
    this.view_ofs = new Vector();
    this.punchangle = new Vector();
    this.v_angle = new Vector();
    this.fixangle = false;
    this.idealpitch = 0;

    // set to time+0.2 whenever a client fires a weapon or takes damage.
    // Used to alert monsters that otherwise would let the player go.
    this.show_hostile = 0;

    this.invincible_sound_time = {};
    Serializer.makeSerializable(this.invincible_sound_time, this.engine);
    this.clientdataFields = [...(this.constructor as typeof PlayerEntity).clientdataFields];

    this._modelIndex = { player: null, eyes: null };
    Serializer.makeSerializable(this._modelIndex, this.engine);
    this._damageHandler = new DamageHandler(this);
  }

  static override _precache(engineAPI: ServerEngineAPI): void {
    // player gib sounds
    engineAPI.PrecacheSound('player/gib.wav'); // player gib sound
    engineAPI.PrecacheSound('player/udeath.wav'); // player gib sound
    engineAPI.PrecacheSound('player/tornoff2.wav'); // gib sound

    // player pain sounds
    engineAPI.PrecacheSound('player/pain1.wav');
    engineAPI.PrecacheSound('player/pain2.wav');
    engineAPI.PrecacheSound('player/pain3.wav');
    engineAPI.PrecacheSound('player/pain4.wav');
    engineAPI.PrecacheSound('player/pain5.wav');
    engineAPI.PrecacheSound('player/pain6.wav');

    // player death sounds
    engineAPI.PrecacheSound('player/death1.wav');
    engineAPI.PrecacheSound('player/death2.wav');
    engineAPI.PrecacheSound('player/death3.wav');
    engineAPI.PrecacheSound('player/death4.wav');
    engineAPI.PrecacheSound('player/death5.wav');

    // ax sounds
    engineAPI.PrecacheSound('weapons/ax1.wav'); // ax swoosh
    engineAPI.PrecacheSound('player/axhit1.wav'); // ax hit meat
    engineAPI.PrecacheSound('player/axhit2.wav'); // ax hit world

    engineAPI.PrecacheSound('player/h2ojump.wav'); // player jumping into water
    engineAPI.PrecacheSound('player/slimbrn2.wav'); // player enter slime
    engineAPI.PrecacheSound('player/inh2o.wav'); // player enter water
    engineAPI.PrecacheSound('player/inlava.wav'); // player enter lava
    engineAPI.PrecacheSound('misc/outwater.wav'); // leaving water sound
    engineAPI.PrecacheSound('misc/water1.wav'); // swimming
    engineAPI.PrecacheSound('misc/water2.wav'); // swimming

    engineAPI.PrecacheModel('progs/player.mdl');
    engineAPI.PrecacheModel('progs/eyes.mdl');
    engineAPI.PrecacheModel('progs/h_player.mdl');

    engineAPI.PrecacheSound('items/damage3.wav');

    engineAPI.PrecacheSound('player/plyrjmp8.wav'); // player jump
    engineAPI.PrecacheSound('player/land.wav'); // player landing
    engineAPI.PrecacheSound('player/land2.wav'); // player hurt landing
    engineAPI.PrecacheSound('player/drown1.wav'); // drowning pain
    engineAPI.PrecacheSound('player/drown2.wav'); // drowning pain
    engineAPI.PrecacheSound('player/gasp1.wav'); // gasping for air
    engineAPI.PrecacheSound('player/gasp2.wav'); // taking breath
    engineAPI.PrecacheSound('player/h2odeath.wav'); // drowning death
    engineAPI.PrecacheSound('player/lburn1.wav'); // lava burn
    engineAPI.PrecacheSound('player/lburn2.wav'); // lava burn
    engineAPI.PrecacheSound('player/teledth1.wav'); // telefrag
  }

  protected _enterRunningState(): void {
    if (this.weapon === items.IT_AXE) {
      this._runState('player_run_axe1');
      return;
    }

    this._runState('player_run1');
  }

  protected _enterStandingState(): void {
    if (this.weapon === items.IT_AXE) {
      this._runState('player_stand_axe1');
      return;
    }

    this._runState('player_stand1');
  }

  protected _enterPainState(): void {
    if (this.weaponframe > 0) {
      return;
    }

    if (this.invisible_finished > this.game.time) {
      // Eyes do not have pain frames.
      return;
    }

    if (this.weapon === items.IT_AXE) {
      this._runState('player_pain_axe1');
      return;
    }

    this._runState('player_pain1');
  }

  protected _attackStateDone(): void {
    this.weaponframe = 0;

    // Replace the default next animation step with custom stand/run recovery logic.
    this._scheduleThink(this.game.time + 0.1, () => {
      if (this._stateAssertStanding()) {
        this._enterStandingState();
        return;
      }

      if (this._stateAssertRunning()) {
        this._enterRunningState();
      }
    }, 'animation-state-machine');
  }

  protected _stateAssertRunning(): boolean {
    // Fall back to standing when the player stops moving in XY.
    if (this.velocity[0] === 0.0 && this.velocity[1] === 0.0) {
      this._enterStandingState();
      return false;
    }

    return true;
  }

  protected _stateAssertStanding(): boolean {
    // Fall back to running when the player starts moving in XY.
    if (this.velocity[0] !== 0.0 && this.velocity[1] !== 0.0) {
      this._enterRunningState();
      return false;
    }

    return true;
  }

  static override _initStates(): void {
    // This state machine not only controls animations, it also decides when the axe attack actually fires.
    // The run/stand loops stay unrolled so the engine state machine can own the timing directly.
    this._resetStates();

    const defineAttackSequence = (prefix: string, framePrefix: string, finalWeaponFrame: number): void => {
      this._defineSequence(prefix, this._createFrameNames(framePrefix, 6),
        function (this: PlayerEntity, frameIndex: number): void {
          this.weaponframe = frameIndex + 1;
          if (frameIndex === 0) {
            this.effects |= effect.EF_MUZZLEFLASH;
          }
          if (frameIndex === 5) {
            this._attackStateDone();
          }
        },
        false);
      void finalWeaponFrame;
    };

    const defineAxeAttackSequence = (prefix: string, framePrefix: string, firstWeaponFrame: number): void => {
      this._defineSequence(prefix, this._createFrameNames(framePrefix, 4),
        function (this: PlayerEntity, frameIndex: number): void {
          this.weaponframe = firstWeaponFrame + frameIndex;
          if (frameIndex === 2) {
            this._weapons.fireAxe();
          }
          if (frameIndex === 3) {
            this._attackStateDone();
          }
        },
        false);
    };

    const defineDeathSequence = (prefix: string, framePrefix: string, count: number): void => {
      this._defineSequence(prefix, this._createFrameNames(framePrefix, count),
        function (this: PlayerEntity, frameIndex: number): void {
          if (frameIndex === count - 1) {
            this._playerDead();
          }
        },
        false);
    };

    this._defineSequence('player_run', this._createFrameNames('rockrun', 6),
      function (this: PlayerEntity, frameIndex: number): void {
        this._stateAssertRunning();
        if (frameIndex === 0) {
          this.weaponframe = 0;
        }
      });

    this._defineSequence('player_run_axe', this._createFrameNames('axrun', 6),
      function (this: PlayerEntity, frameIndex: number): void {
        this._stateAssertRunning();
        if (frameIndex === 0) {
          this.weaponframe = 0;
        }
      });

    this._defineSequence('player_stand', this._createFrameNames('stand', 5),
      function (this: PlayerEntity, frameIndex: number): void {
        this._stateAssertStanding();
        if (frameIndex === 0) {
          this.weaponframe = 0;
        }
      });

    this._defineSequence('player_stand_axe', this._createFrameNames('axstnd', 12),
      function (this: PlayerEntity, frameIndex: number): void {
        this._stateAssertStanding();
        if (frameIndex === 0) {
          this.weaponframe = 0;
        }
      });

    defineAttackSequence('player_shot', 'shotatt', 6);
    defineAttackSequence('player_rocket', 'rockatt', 6);
    defineAxeAttackSequence('player_axe', 'axatt', 1);
    defineAxeAttackSequence('player_axeb', 'axattb', 5);
    defineAxeAttackSequence('player_axec', 'axattc', 1);
    defineAxeAttackSequence('player_axed', 'axattd', 5);

    this._defineSequence('player_pain', this._createFrameNames('pain', 6),
      function (this: PlayerEntity, frameIndex: number): void {
        if (frameIndex === 0) {
          this.weaponframe = 0;
          this._painSound();
        }
        if (frameIndex === 5) {
          this._attackStateDone();
        }
      },
      false);

    this._defineSequence('player_pain_axe', this._createFrameNames('axpain', 6),
      function (this: PlayerEntity, frameIndex: number): void {
        if (frameIndex === 0) {
          this.weaponframe = 0;
          this._painSound();
        }
        if (frameIndex === 5) {
          this._attackStateDone();
        }
      },
      false);

    defineDeathSequence('player_diea', 'deatha', 11);
    defineDeathSequence('player_dieb', 'deathb', 9);
    defineDeathSequence('player_diec', 'deathc', 15);
    defineDeathSequence('player_died', 'deathd', 9);
    defineDeathSequence('player_diee', 'deathe', 9);
    defineDeathSequence('player_die_ax', 'axdeth', 9);

    this._defineSequence('player_nail', this._createFrameNames('nailatt', 2),
      function (this: PlayerEntity): void {
        this._attackNailState();
      });

    this._defineSequence('player_light', this._createFrameNames('nailatt', 2),
      function (this: PlayerEntity): void {
        this._attackLightningState();
      });
  }

  protected _attackNailState(): void {
    this.effects |= effect.EF_MUZZLEFLASH;

    if (!this.button0) {
      this._attackStateDone();
      return;
    }

    if (this.weaponframe < 0 || this.weaponframe >= 8) {
      this.weaponframe = 0;
    }

    this.weaponframe++;

    // Reset attack_finished so impulses cannot be spammed between nail refires.
    this.attack_finished = this.game.time + 0.2;
  }

  protected _attackLightningState(): void {
    this.effects |= effect.EF_MUZZLEFLASH;

    if (!this.button0) {
      this._attackStateDone();
      return;
    }

    if (this.weaponframe < 0 || this.weaponframe >= 4) {
      this.weaponframe = 0;
    }

    this.weaponframe++;

    // Reset attack_finished so impulses cannot be spammed between lightning refires.
    this.attack_finished = this.game.time + 0.2;
  }

  protected _painSound(): void {
    // TODO: player.qc/PainSound still lacks the original contents-sensitive logic.
    this.startSound(channel.CHAN_VOICE, `player/pain${Math.floor(Math.random() * 6) + 1}.wav`);
  }

  protected _deathSound(): void {
    // Underwater death sound.
    if (this.waterlevel === waterlevel.WATERLEVEL_HEAD) {
      this.startSound(channel.CHAN_VOICE, 'player/h2odeath.wav');
      return;
    }

    // Regular death sound.
    this.startSound(channel.CHAN_VOICE, `player/death${Math.floor(Math.random() * 5) + 1}.wav`);
  }

  /**
   * In coop try to find a coop spawn spot, in deathmatch try to find a free
   * deathmatch spawn spot, and in singleplayer fall back to player start.
   * @returns Selected spawn point.
   */
  protected _selectSpawnPoint(): BaseEntity {
    if (this.game.coop) {
      this.game.lastspawn = this.findNextEntityByFieldAndValue('classname', InfoPlayerStartCoop.classname, this.game.lastspawn, true);

      if (this.game.lastspawn) {
        return this.game.lastspawn;
      }
    } else if (this.game.deathmatch) {
      let spot = this.game.lastspawn;
      let attempts = 32;

      while (attempts-- > 0) {
        spot = this.findNextEntityByFieldAndValue('classname', InfoPlayerStartDeathmatch.classname, spot, true);

        if (!spot) {
          this.engine.ConsoleWarning('PlayerEntity._selectSpawnPoint: There is no deathmatch spawn point on this map!\n');
          break;
        }

        const hasPlayerOccupant = this.engine.FindInRadius(spot.origin, 32).some(({ entity }) => entity instanceof PlayerEntity);
        if (!hasPlayerOccupant) {
          this.game.lastspawn = spot;
          return this.game.lastspawn;
        }
      }
    }

    if (this.game.serverflags) {
      // Return with a rune to start.
      const spot = this.findFirstEntityByFieldAndValue('classname', InfoPlayerStart2.classname);

      if (spot) {
        return spot;
      }
    }

    const spot = this.findFirstEntityByFieldAndValue('classname', InfoPlayerStart.classname);
    console.assert(spot !== null, 'info_player_start last resort');
    return spot!;
  }

  protected _dropBackpack(): void {
    const spawnedBackpack = this.engine.SpawnEntity(BackpackEntity.classname, {
      origin: this.origin.copy().subtract(new Vector(0.0, 0.0, 24.0)),
      items: this.weapon,
      ammo_cells: this.ammo_cells,
      ammo_nails: this.ammo_nails,
      ammo_rockets: this.ammo_rockets,
      ammo_shells: this.ammo_shells,
      regeneration_time: 0, // do not regenerate
      remove_after: 120, // remove after 120s
    }).entity;
    console.assert(spawnedBackpack instanceof BackpackEntity, 'PlayerEntity._dropBackpack expects a BackpackEntity');
    const backpack = spawnedBackpack as BackpackEntity;

    this.ammo_cells = 0;
    this.ammo_nails = 0;
    this.ammo_rockets = 0;
    this.ammo_shells = 0;
    this.items &= ~this.weapon | items.IT_AXE;

    // Toss it around.
    backpack.toss();
  }

  protected _playerDie(): void {
    this.items &= ~items.IT_INVISIBILITY;
    this.invisible_finished = 0; // do not die as eyes
    this.invincible_finished = 0;
    this.super_damage_finished = 0;
    this.radsuit_finished = 0;
    this.modelindex = this._modelIndex.player; // do not use eyes

    if (this.game.deathmatch || this.game.coop) {
      this._dropBackpack();
    }

    this.weaponmodel = null;
    this.weaponframe = 0;
    this.view_ofs.setTo(0.0, 0.0, -8.0);
    this.deadflag = dead.DEAD_DYING;
    this.solid = solid.SOLID_NOT;
    this.flags &= ~flags.FL_ONGROUND;
    this.movetype = moveType.MOVETYPE_TOSS;

    if ((this.flags & flags.FL_INWATER) !== 0) {
      // FIXME: if in lava, burn the corpse up; if in water, make the corpse float.
      this.velocity.clear();
    } else if (this.velocity[2] < 10.0) {
      this.velocity[2] += Math.random() * 300.0;
    }

    if (this.health < -40.0) {
      GibEntity.gibEntity(this, 'progs/h_player.mdl', true);
      this._playerDead();
      return;
    }

    BubbleSpawnerEntity.bubble(this, 20);
    this._deathSound();

    this.angles[0] = 0.0;
    this.angles[2] = 0.0;
    this.punchangle[2] = Math.max(-this.health, 75) * Math.random() + 15; // make the player roll around

    if (this.weapon === items.IT_AXE) {
      this._runState('player_die_ax1');
      return;
    }

    switch (Math.floor(Math.random() * 5)) {
      case 0:
        this._runState('player_diea1');
        break;
      case 1:
        this._runState('player_dieb1');
        break;
      case 2:
        this._runState('player_diec1');
        break;
      case 3:
        this._runState('player_died1');
        break;
      default:
        this._runState('player_diee1');
        break;
    }
  }

  protected _playerDead(): void {
    this.resetThinking();
    // Allow respawn after a short delay.
    this.pausetime = this.game.time + 1.0;
    this.deadflag = dead.DEAD_DEAD;
  }

  centerPrint(message: string): void {
    this._requiredEdict.getClient().centerPrint(message);
  }

  consolePrint(message: string): void {
    this._requiredEdict.getClient().consolePrint(message);
  }

  dispatchEvent(eventType: number, ...args: ClientEventValue[]): void {
    this.engine.DispatchClientEvent(this._requiredEdict, false, eventType, ...args);
  }

  dispatchExpeditedEvent(eventType: number, ...args: ClientEventValue[]): void {
    this.engine.DispatchClientEvent(this._requiredEdict, true, eventType, ...args);
  }

  protected _freshSpawnParameters(): void {
    // This is where fresh spawn parameters are set: initial weapon, ammo, and armor state.
    this.items = items.IT_SHOTGUN | items.IT_AXE;
    this.health = 100;
    this.armorvalue = 0;
    this.ammo_shells = 25;
    this.ammo_nails = 0;
    this.ammo_rockets = 0;
    this.ammo_cells = 0;
    this.weapon = items.IT_SHOTGUN;
    this.armortype = 0;
  }

  saveSpawnParameters(): string {
    if (this.health <= 0) {
      this._freshSpawnParameters();
    }

    this._spawnParameters = JSON.stringify([
      null,
      this.items & ~(items.IT_KEY1 | items.IT_KEY2 | items.IT_INVISIBILITY | items.IT_INVULNERABILITY | items.IT_SUIT | items.IT_QUAD), // remove items
      Math.max(50, Math.min(100, this.health)), // cap super health, but give 50 hp at least
      this.armorvalue,
      this.ammo_shells,
      this.ammo_nails,
      this.ammo_rockets,
      this.ammo_cells,
      this.weapon,
      this.armortype * 100, // convert from value to percent
    ]);

    return this._spawnParameters;
  }

  restoreSpawnParameters(data: string): void {
    this._spawnParameters = data;
  }

  protected _applySpawnParameters(): void {
    if (this.game.serverflags) {
      // HACK: maps/start.bsp always resets the carried parms.
      if (this.game.worldspawn.model === 'maps/start.bsp') {
        this._freshSpawnParameters();
        return;
      }
    }

    if (this._spawnParameters === null) {
      this._freshSpawnParameters();
      return;
    }

    const params = JSON.parse(this._spawnParameters) as number[];
    this.items = params[1];
    this.health = params[2];
    this.armorvalue = params[3];
    this.ammo_shells = params[4];
    this.ammo_nails = params[5];
    this.ammo_rockets = params[6];
    this.ammo_cells = params[7];
    this.weapon = params[8];
    this.armortype = params[9] * 0.01; // convert from percent to value
  }

  /**
   * QuakeC: W_SetCurrentAmmo.
   */
  setWeapon(weapon: WeaponConfigKey | 0 = this.weapon): void {
    console.assert(weaponConfig.has(weapon as WeaponConfigKey), `PlayerEntity.setWeapon: invalid weapon ${weapon}`);

    if ((this.items & weapon) === 0) {
      return; // player does not have that weapon, ignore
    }

    this.weapon = weapon;
    this.items &= ~(this.items & (items.IT_SHELLS | items.IT_NAILS | items.IT_ROCKETS | items.IT_CELLS));

    const config = weaponConfig.get(this.weapon as WeaponConfigKey);
    if (config) {
      this.currentammo = config.ammoSlot !== null ? this[config.ammoSlot] : 0;
      this.weaponmodel = config.viewModel;
      this.weaponframe = 0;
      if (config.items) {
        this.items |= items[config.items];
      }
    } else {
      this.currentammo = 0;
      this.weaponmodel = null;
      this.weaponframe = 0;
    }

    this.dispatchExpeditedEvent(clientEvent.WEAPON_SELECTED, this.weapon);
    this._enterRunningState();
  }

  chooseBestWeapon(): WeaponConfigKey {
    const ownedItems = this.items;
    let bestWeapon: WeaponConfigKey = items.IT_AXE;
    let maxPriority = 0;

    for (const [weapon, config] of weaponConfig.entries()) {
      const hasWeapon = (ownedItems & weapon) !== 0;
      const hasAmmo = config.ammoSlot === null || this[config.ammoSlot] > 0;
      const isUsable = weapon !== items.IT_LIGHTNING || this.waterlevel < waterlevel.WATERLEVEL_WAIST;

      if (hasWeapon && hasAmmo && isUsable && config.priority > maxPriority) {
        bestWeapon = weapon;
        maxPriority = config.priority;
      }
    }

    return bestWeapon;
  }

  selectBestWeapon(): void {
    this.setWeapon(this.chooseBestWeapon());
  }

  applyBackpack(backpack: BackpackPickup): boolean {
    let backpackUsed = false;
    const thisClass = this.constructor as typeof PlayerEntity;

    const ammoNails = Math.min(thisClass._backpackLimits.ammo_nails, this.ammo_nails + backpack.ammo_nails);
    const ammoCells = Math.min(thisClass._backpackLimits.ammo_cells, this.ammo_cells + backpack.ammo_cells);
    const ammoRockets = Math.min(thisClass._backpackLimits.ammo_rockets, this.ammo_rockets + backpack.ammo_rockets);
    const ammoShells = Math.min(thisClass._backpackLimits.ammo_shells, this.ammo_shells + backpack.ammo_shells);

    if (ammoNails !== this.ammo_nails) {
      this.ammo_nails = ammoNails;
      backpackUsed = true;
    }

    if (ammoCells !== this.ammo_cells) {
      this.ammo_cells = ammoCells;
      backpackUsed = true;
    }

    if (ammoRockets !== this.ammo_rockets) {
      this.ammo_rockets = ammoRockets;
      backpackUsed = true;
    }

    if (ammoShells !== this.ammo_shells) {
      this.ammo_shells = ammoShells;
      backpackUsed = true;
    }

    if ((this.items & backpack.items) !== backpack.items) {
      this.items |= backpack.items;
      backpackUsed = true;
    }

    // QuakeC weapon_touch / BackpackTouch weapon switching logic.
    const pickupWeapon = isWeaponConfigKey(backpack.weapon) ? backpack.weapon : 0;
    const newWeapon = pickupWeapon || this.weapon;
    if (newWeapon !== 0 && backpackUsed) {
      if (!this.game.deathmatch) {
        // Singleplayer and coop always switch to the picked weapon.
        this.setWeapon(newWeapon);
      } else {
        // Deathmatch only switches when the pickup outranks the current weapon.
        const currentConfig = weaponConfig.get(this.weapon as WeaponConfigKey);
        const newConfig = weaponConfig.get(newWeapon as WeaponConfigKey);

        if (currentConfig && newConfig && newConfig.priority > currentConfig.priority) {
          this.setWeapon(newWeapon);
        }
      }
    }

    return backpackUsed;
  }

  applyHealth(healthpoints: number, ignoreLimit = false): boolean {
    if (this.health <= 0) {
      return false;
    }

    if (!ignoreLimit && this.health >= this.max_health) {
      return false;
    }

    const roundedHealthPoints = Math.ceil(healthpoints);
    this.health += roundedHealthPoints;

    if (!ignoreLimit && this.health >= this.max_health) {
      this.health = this.max_health;
    }

    this.health = Math.min(this.health, 250);
    return true;
  }

  checkAmmo(): boolean {
    return this._weapons.checkAmmo();
  }

  private _explainEntity(): void {
    if (!this._canUseCheats()) {
      return;
    }

    const start = this.origin.copy().add(this.view_ofs);
    const { forward } = this.angles.angleVectors();
    const end = start.copy().add(forward.multiply(128.0));
    const mins = new Vector(-8.0, -8.0, -8.0);
    const maxs = new Vector(8.0, 8.0, 8.0);
    const trace = this.engine.Traceline(start, end, false, this._requiredEdict, mins, maxs);

    if (trace.entity) {
      const tracedEntity = trace.entity;
      this.startSound(channel.CHAN_BODY, 'misc/talk.wav');
      this.centerPrint(tracedEntity.classname);
      console.debug('tracedEntity:', tracedEntity);
      console.debug('trace:', trace);
    }
  }

  private _testStuff(): void {
    MeatSprayEntity.sprayMeat(this);
  }

  private _killRay(): void {
    if (!this._canUseCheats()) {
      return;
    }

    const start = this.origin.copy().add(this.view_ofs);
    const { forward } = this.angles.angleVectors();
    const end = start.copy().add(forward.multiply(128.0));
    const mins = new Vector(-8.0, -8.0, -8.0);
    const maxs = new Vector(8.0, 8.0, 8.0);
    const trace = this.engine.Traceline(start, end, false, this._requiredEdict, mins, maxs);

    if (trace.entity) {
      this.damage(trace.entity, 50000.0);
    }
  }

  protected _cheatCommandGeneric(): void {
    if (!this._canUseCheats()) {
      return;
    }

    this.applyBackpack({
      weapon: 0,
      items:
        items.IT_AXE |
        items.IT_SHOTGUN |
        items.IT_SUPER_SHOTGUN |
        items.IT_NAILGUN |
        items.IT_SUPER_NAILGUN |
        items.IT_GRENADE_LAUNCHER |
        items.IT_ROCKET_LAUNCHER |
        items.IT_LIGHTNING |
        items.IT_KEY1 |
        items.IT_KEY2,
      ammo_rockets: 25,
      ammo_nails: 100,
      ammo_shells: 50,
      ammo_cells: 100,
    });

    this.dispatchEvent(clientEvent.BONUS_FLASH);
  }

  protected _cheatCommandQuad(): void {
    if (!this._canUseCheats()) {
      return;
    }

    this.super_time = 1.0;
    this.super_damage_finished = this.game.time + 30.0;
    this.items |= items.IT_QUAD;
  }

  protected _cycleWeaponCommand(): void {
    while (true) {
      let outOfAmmo = false;

      if (this.weapon === items.IT_LIGHTNING) {
        this.weapon = items.IT_AXE;
      } else if (this.weapon === items.IT_AXE) {
        this.weapon = items.IT_SHOTGUN;
        outOfAmmo = this.ammo_shells < 1;
      } else if (this.weapon === items.IT_SHOTGUN) {
        this.weapon = items.IT_SUPER_SHOTGUN;
        outOfAmmo = this.ammo_shells < 2;
      } else if (this.weapon === items.IT_SUPER_SHOTGUN) {
        this.weapon = items.IT_NAILGUN;
        outOfAmmo = this.ammo_nails < 1;
      } else if (this.weapon === items.IT_NAILGUN) {
        this.weapon = items.IT_SUPER_NAILGUN;
        outOfAmmo = this.ammo_nails < 2;
      } else if (this.weapon === items.IT_SUPER_NAILGUN) {
        this.weapon = items.IT_GRENADE_LAUNCHER;
        outOfAmmo = this.ammo_rockets < 1;
      } else if (this.weapon === items.IT_GRENADE_LAUNCHER) {
        this.weapon = items.IT_ROCKET_LAUNCHER;
        outOfAmmo = this.ammo_rockets < 1;
      } else if (this.weapon === items.IT_ROCKET_LAUNCHER) {
        this.weapon = items.IT_LIGHTNING;
        outOfAmmo = this.ammo_cells < 1;
      }

      if ((this.items & this.weapon) !== 0 && !outOfAmmo) {
        this.setWeapon();
        return;
      }
    }
  }

  protected _cycleWeaponReverseCommand(): void {
    while (true) {
      let outOfAmmo = false;

      if (this.weapon === items.IT_LIGHTNING) {
        this.weapon = items.IT_ROCKET_LAUNCHER;
        outOfAmmo = this.ammo_rockets < 1;
      } else if (this.weapon === items.IT_ROCKET_LAUNCHER) {
        this.weapon = items.IT_GRENADE_LAUNCHER;
        outOfAmmo = this.ammo_rockets < 1;
      } else if (this.weapon === items.IT_GRENADE_LAUNCHER) {
        this.weapon = items.IT_SUPER_NAILGUN;
        outOfAmmo = this.ammo_nails < 2;
      } else if (this.weapon === items.IT_SUPER_NAILGUN) {
        this.weapon = items.IT_NAILGUN;
        outOfAmmo = this.ammo_nails < 1;
      } else if (this.weapon === items.IT_NAILGUN) {
        this.weapon = items.IT_SUPER_SHOTGUN;
        outOfAmmo = this.ammo_shells < 2;
      } else if (this.weapon === items.IT_SUPER_SHOTGUN) {
        this.weapon = items.IT_SHOTGUN;
        outOfAmmo = this.ammo_shells < 1;
      } else if (this.weapon === items.IT_SHOTGUN) {
        this.weapon = items.IT_AXE;
      } else if (this.weapon === items.IT_AXE) {
        this.weapon = items.IT_LIGHTNING;
        outOfAmmo = this.ammo_cells < 1;
      }

      if ((this.items & this.weapon) !== 0 && !outOfAmmo) {
        this.setWeapon();
        return;
      }
    }
  }

  protected _canUseCheats(): boolean {
    const cheats = this.engine.GetCvar('sv_cheats');
    if (!cheats?.value) {
      this.consolePrint('Cheats are not enabled on this server.\n');
      return false;
    }

    return true;
  }

  protected _finishMap(): void {
    if (!this._canUseCheats()) {
      return;
    }

    this.game.gameover = true;
    this.engine.BroadcastPrint(`${this.netname} decided that this map has concluded.\n`);
    this.game.startIntermission();
  }

  protected _handleImpulseCommands(): void {
    if (this.impulse <= 0) {
      return;
    }

    if (this.impulse >= 1 && this.impulse <= 8) {
      this._weaponChange(this.impulse);
    } else {
      switch (this.impulse) {
        case 66:
          this._explainEntity();
          break;
        case 102:
          this._finishMap();
          break;
        case 101:
          this._testStuff();
          break;
        case 100:
          this._killRay();
          break;
        case 9:
          this._cheatCommandGeneric();
          break;
        case 10:
          this._cycleWeaponCommand();
          break;
        case 11:
          this.consolePrint('Not implemented.\n');
          break;
        case 12:
          this._cycleWeaponReverseCommand();
          break;
        case 255:
          this._cheatCommandQuad();
          break;
        default:
          this.consolePrint(`Unknown impulse #${this.impulse}.\n`);
          break;
      }
    }

    this.impulse = 0;
  }

  protected _weaponAttack(): void {
    if (!this._weapons.checkAmmo()) {
      return;
    }

    this.show_hostile = this.game.time + 1.0;

    switch (this.weapon) {
      case items.IT_AXE: {
        this.startSound(channel.CHAN_WEAPON, 'weapons/ax1.wav');
        const roll = Math.random();
        if (roll < 0.25) {
          this._runState('player_axe1');
        } else if (roll < 0.5) {
          this._runState('player_axeb1');
        } else if (roll < 0.75) {
          this._runState('player_axec1');
        } else {
          this._runState('player_axed1');
        }
        this.attack_finished = this.game.time + 0.5;
        break;
      }
      case items.IT_SHOTGUN:
        this._runState('player_shot1');
        this._weapons.fireShotgun();
        this.attack_finished = this.game.time + 0.5;
        break;
      case items.IT_SUPER_SHOTGUN:
        this._runState('player_shot1');
        this._weapons.fireSuperShotgun();
        this.attack_finished = this.game.time + 0.7;
        break;
      case items.IT_ROCKET_LAUNCHER:
        this._runState('player_rocket1');
        this._weapons.fireRocket();
        this.attack_finished = this.game.time + 0.8;
        break;
      case items.IT_GRENADE_LAUNCHER:
        this._runState('player_rocket1');
        this._weapons.fireGrenade();
        this.attack_finished = this.game.time + 0.8;
        break;
      case items.IT_NAILGUN:
        this._runState('player_nail1');
        this._weapons.fireNailgun();
        this.attack_finished = this.game.time + 0.2;
        break;
      case items.IT_SUPER_NAILGUN:
        this._runState('player_nail1');
        this._weapons.fireSuperNailgun();
        this.attack_finished = this.game.time + 0.2;
        break;
      case items.IT_LIGHTNING:
        this._runState('player_light1');
        this._weapons.fireLightning();
        this.attack_finished = this.game.time + 0.1;
        break;
      default:
        this.consolePrint(`_weaponAttack: ${this.weapon} not implemented\n`);
        this.attack_finished = this.game.time + 0.1;
        break;
    }
  }

  protected _weaponChange(slot: number): void {
    let outOfAmmo = false;
    let weapon: WeaponConfigKey | 0 = 0;

    switch (slot) {
      case 1:
        weapon = items.IT_AXE;
        break;
      case 2:
        weapon = items.IT_SHOTGUN;
        outOfAmmo = this.ammo_shells < 1;
        break;
      case 3:
        weapon = items.IT_SUPER_SHOTGUN;
        outOfAmmo = this.ammo_shells < 2;
        break;
      case 4:
        weapon = items.IT_NAILGUN;
        outOfAmmo = this.ammo_nails < 1;
        break;
      case 5:
        weapon = items.IT_SUPER_NAILGUN;
        outOfAmmo = this.ammo_nails < 2;
        break;
      case 6:
        weapon = items.IT_GRENADE_LAUNCHER;
        outOfAmmo = this.ammo_rockets < 1;
        break;
      case 7:
        weapon = items.IT_ROCKET_LAUNCHER;
        outOfAmmo = this.ammo_rockets < 1;
        break;
      case 8:
        weapon = items.IT_LIGHTNING;
        outOfAmmo = this.ammo_cells < 1;
        break;
      default:
        break;
    }

    this.impulse = 0;

    if ((this.items & weapon) === 0) {
      this.consolePrint('no weapon.\n');
      return;
    }

    if (outOfAmmo) {
      this.consolePrint('not enough ammo.\n');
      return;
    }

    this.setWeapon(weapon);
  }

  protected _weaponFrame(): void {
    if (this.game.time < this.attack_finished) {
      return;
    }

    this._handleImpulseCommands();

    if (this.button0) {
      this._superDamageSound();
      this._weaponAttack();
    }
  }

  protected _superDamageSound(): void {
    if (this.super_damage_finished > this.game.time && this.super_sound < this.game.time) {
      this.super_sound = this.game.time + 1.0;
      this.startSound(channel.CHAN_BODY, 'items/damage3.wav');
    }
  }

  _powerupFrame(): void {
    if (this.health <= 0) {
      return;
    }

    if (this.invisible_finished) {
      if (this.invisible_sound < this.game.time) {
        this.startSound(channel.CHAN_AUTO, 'items/inv3.wav', 0.5, attn.ATTN_IDLE);
        this.invisible_sound = this.game.time + (Math.random() * 3 + 1);
      }

      if (this.invisible_finished < this.game.time + 3) {
        if (this.invisible_time === 1) {
          this.consolePrint('Ring of Shadows magic is fading\n');
          this.dispatchEvent(clientEvent.BONUS_FLASH);
          this.startSound(channel.CHAN_AUTO, 'items/inv2.wav');
          this.invisible_time = this.game.time + 1;
        }

        if (this.invisible_time < this.game.time) {
          this.invisible_time = this.game.time + 1;
          this.dispatchEvent(clientEvent.BONUS_FLASH);
        }
      }

      if (this.invisible_finished < this.game.time) {
        this.items &= ~items.IT_INVISIBILITY;
        this.invisible_finished = 0;
        this.invisible_time = 0;
        this.modelindex = this._modelIndex.player;
      } else {
        this.modelindex = this._modelIndex.eyes;
        this.frame = 0;
      }
    }

    if (this.invincible_finished) {
      if (this.invincible_finished < this.game.time + 3) {
        if (this.invincible_time === 1) {
          this.consolePrint('Protection is almost burned out\n');
          this.dispatchEvent(clientEvent.BONUS_FLASH);
          this.startSound(channel.CHAN_AUTO, 'items/protect2.wav');
          this.invincible_time = this.game.time + 1;
        }

        if (this.invincible_time < this.game.time) {
          this.invincible_time = this.game.time + 1;
          this.dispatchEvent(clientEvent.BONUS_FLASH);
        }
      }

      if (this.invincible_finished < this.game.time) {
        this.items &= ~items.IT_INVULNERABILITY;
        this.invincible_time = 0;
        this.invincible_finished = 0;
        this.invincible_sound_time = {};
      }
    }

    if (this.super_damage_finished) {
      if (this.super_damage_finished < this.game.time + 3) {
        if (this.super_time === 1) {
          this.consolePrint('Quad Damage is wearing off\n');
          this.dispatchEvent(clientEvent.BONUS_FLASH);
          this.startSound(channel.CHAN_AUTO, 'items/damage2.wav');
          this.super_time = this.game.time + 1;
        }

        if (this.super_time < this.game.time) {
          this.super_time = this.game.time + 1;
          this.dispatchEvent(clientEvent.BONUS_FLASH);
        }
      }

      if (this.super_damage_finished < this.game.time) {
        this.items &= ~items.IT_QUAD;
        this.super_damage_finished = 0;
        this.super_time = 0;
      }
    }

    if (this.radsuit_finished) {
      this.air_finished = this.game.time + 12;
      if (this.radsuit_finished < this.game.time + 3) {
        if (this.rad_time === 1) {
          this.consolePrint('Air supply in Biosuit expiring\n');
          this.dispatchEvent(clientEvent.BONUS_FLASH);
          this.startSound(channel.CHAN_AUTO, 'items/suit2.wav');
          this.rad_time = this.game.time + 1;
        }

        if (this.rad_time < this.game.time) {
          this.rad_time = this.game.time + 1;
          this.dispatchEvent(clientEvent.BONUS_FLASH);
        }
      }

      if (this.radsuit_finished < this.game.time) {
        this.items &= ~items.IT_SUIT;
        this.rad_time = 0;
        this.radsuit_finished = 0;
      }
    }
  }

  protected _interactThink(): void {
    if (!this.button1) {
      return;
    }

    // Some Half-Life-like use logic lives here (buttons, pushing/pulling objects),
    // but line-of-sight and facing checks still need tightening.
    for (const { entity } of this.engine.FindInRadius(this.origin, 64.0, (serverEdict) => (serverEdict.entity!.flags & flags.FL_USEABLE) !== 0)) {
      entity!.interact(this);
    }

    this.button1 = false;
  }

  override clear(): void {
    super.clear();
    this.takedamage = damage.DAMAGE_AIM;
    this.solid = solid.SOLID_SLIDEBOX;
    this.movetype = moveType.MOVETYPE_WALK;
    this.show_hostile = 0;
    this.max_health = 100;
    this.health = 100;
    this.flags = flags.FL_CLIENT;
    this.air_finished = this.game.time + 12;
    this.dmg = 2;
    this.super_damage_finished = 0;
    this.radsuit_finished = 0;
    this.invisible_finished = 0;
    this.invincible_finished = 0;
    this.effects = 0;
    this.invincible_time = 0;

    this.button0 = false;
    this.button1 = false;
    this.button2 = false;
    this.impulse = 0;

    this.attack_finished = this.game.time;
    this.deadflag = dead.DEAD_NO;
    this.pausetime = 0; // teleporters reuse this to freeze the player briefly
    this.jump_flag = 0; // still used as a velocity snapshot despite the name

    this.punchangle.clear();
    this.velocity.clear();
    this.avelocity.clear();
    this.fixangle = true;
    this.view_ofs.setTo(0.0, 0.0, 22.0);

    // FIXME: this needs to move somewhere else; setModel() also retriggers touches.
    this.setModel('progs/eyes.mdl');
    this._modelIndex.eyes = this.modelindex;
    this.setModel('progs/player.mdl');
    this._modelIndex.player = this.modelindex;

    this.setSize(hull[0][0], hull[0][1]);

    this._applySpawnParameters();
    this.setWeapon();
  }

  putPlayerInServer(): void {
    // Select spawn spot.
    const spot = this._selectSpawnPoint();
    this.origin = spot.origin.copy().add(new Vector(0.0, 0.0, 1.0));
    this.angles = spot.angles.copy();
    this.setOrigin(this.origin);

    // Update client on stats.
    this.game.stats.sendToPlayer(this);
    this._enterStandingState();

    if (this.game.deathmatch || this.game.coop) {
      // Display a neat teleport effect upon spawn.
      const { forward } = this.angles.angleVectors();
      const origin = forward.multiply(20.0).add(this.origin);
      this.engine.SpawnEntity(TeleportEffectEntity.classname, { origin });
    }

    // Add a telefrag trigger in case someone is already on the spawn spot.
    this.engine.SpawnEntity(TelefragTriggerEntity.classname, {
      origin: this.origin,
      owner: this,
    });
  }

  protected _playerDeathThink(): void {
    if ((this.flags & flags.FL_ONGROUND) !== 0) {
      const forward = this.velocity.len() - 20.0;
      if (forward <= 0) {
        this.velocity.clear();
      } else {
        this.velocity.normalize();
        this.velocity.multiply(forward);
      }
    }

    if (this.deadflag === dead.DEAD_DEAD) {
      // Wait for all buttons to be released.
      if (this.button0 || this.button1 || this.button2) {
        return;
      }

      this.deadflag = dead.DEAD_RESPAWNABLE;
      return;
    }

    // Wait for any button down.
    if (!this.button0 && !this.button1 && !this.button2) {
      return;
    }

    // Release all buttons.
    this.button0 = false;
    this.button1 = false;
    this.button2 = false;

    // Keep the player dead for a short while.
    if (this.pausetime < this.game.time) {
      this._respawn();
    }
  }

  protected _playerJump(): void {
    if ((this.flags & flags.FL_WATERJUMP) !== 0) {
      return;
    }

    if (this.waterlevel >= waterlevel.WATERLEVEL_WAIST) {
      if (this.watertype === content.CONTENT_WATER) {
        this.velocity[2] = 100;
      } else if (this.watertype === content.CONTENT_SLIME) {
        this.velocity[2] = 80;
      } else {
        this.velocity[2] = 50;
      }

      if (this.swim_flag < this.game.time) {
        this.swim_flag = this.game.time + 1.0;
        this.startSound(channel.CHAN_BODY, Math.random() < 0.5 ? 'misc/water1.wav' : 'misc/water2.wav');
      }

      return;
    }

    // In noclip, jump just moves upward without ground-state checks.
    if (this.movetype !== moveType.MOVETYPE_NOCLIP) {
      if ((this.flags & flags.FL_ONGROUND) === 0) {
        return;
      }

      if ((this.flags & flags.FL_JUMPRELEASED) === 0) {
        return; // do not pogo stick
      }

      this.flags &= ~flags.FL_JUMPRELEASED;
      this.flags &= ~flags.FL_ONGROUND;
      this.button2 = 0;

      this.startSound(channel.CHAN_BODY, 'player/plyrjmp8.wav');
    }

    this.velocity[2] += 270.0;
  }

  protected _playerWaterMove(): void {
    if (this.movetype === moveType.MOVETYPE_NOCLIP || this.health < 0) {
      return;
    }

    if (this.waterlevel !== waterlevel.WATERLEVEL_HEAD) {
      if (this.air_finished < this.game.time) {
        this.startSound(channel.CHAN_VOICE, 'player/gasp2.wav');
      } else if (this.air_finished < this.game.time + 9.0) {
        this.startSound(channel.CHAN_VOICE, 'player/gasp1.wav');
      }
      this.air_finished = this.game.time + 12.0;
      this.dmg = 2;
    } else if (this.air_finished < this.game.time && this.pain_finished < this.game.time) {
      this.dmg += 2;
      if (this.dmg > 15) {
        this.dmg = 10;
      }
      this.damage(this, this.dmg);
      BubbleSpawnerEntity.bubble(this, Math.ceil(this.dmg / 4));
      this.pain_finished = this.game.time + 1.0;
    }

    if (this.waterlevel === waterlevel.WATERLEVEL_NONE) {
      if ((this.flags & flags.FL_INWATER) !== 0) {
        this.startSound(channel.CHAN_BODY, 'misc/outwater.wav');
        this.flags &= ~flags.FL_INWATER;
      }
      return;
    }

    if (this.watertype === content.CONTENT_LAVA) {
      if (this._damageTime < this.game.time) {
        this._damageTime = this.game.time + (this.radsuit_finished > this.game.time ? 1.0 : 0.2);
        this.damage(this, 10 * this.waterlevel);
      }
    } else if (this.watertype === content.CONTENT_SLIME) {
      if (this._damageTime < this.game.time && this.radsuit_finished < this.game.time) {
        this._damageTime = this.game.time + 1.0;
        this.damage(this, 4 * this.waterlevel);
      }
    }

    if ((this.flags & flags.FL_INWATER) === 0) {
      if (this.watertype === content.CONTENT_LAVA) {
        this.startSound(channel.CHAN_BODY, 'player/inlava.wav');
      } else if (this.watertype === content.CONTENT_WATER) {
        this.startSound(channel.CHAN_BODY, 'player/inh2o.wav');
      } else if (this.watertype === content.CONTENT_SLIME) {
        this.startSound(channel.CHAN_BODY, 'player/slimbrn2.wav');
      }

      this.flags |= flags.FL_INWATER;
      this._damageTime = 0;
    }

    if ((this.flags & flags.FL_WATERJUMP) === 0) {
      this.velocity = this.velocity.subtract(this.velocity.copy().multiply(0.8 * this.waterlevel * this.game.frametime));
    }
  }

  protected _playerWaterJump(): void {
    if (this.waterlevel !== waterlevel.WATERLEVEL_WAIST) {
      return;
    }

    // FIXME: this still fails on chris2.map, just like the original QuakeC.
    const start = this.origin.copy();
    start[2] += 8.0;

    const { forward } = this.angles.angleVectors();
    forward[2] = 0.0;
    forward.normalize();
    forward.multiply(24.0);

    const end = start.copy().add(forward);
    const traceWaist = this.traceline(start, end, true);
    if (traceWaist.fraction < 1.0) {
      start[2] += this.maxs[2] - 8.0;
      end.set(start).add(forward);
      const traceEye = this.traceline(start, end, true);
      if (traceEye.fraction === 1.0) {
        this.flags |= flags.FL_WATERJUMP;
        this.velocity[2] = 225.0;
        this.flags &= ~flags.FL_JUMPRELEASED;
        this.teleport_time = this.game.time + 2.0;
      }
    }
  }

  _intermissionThink(): void {
    if (this.game.time < this.game.intermission_exittime) {
      return;
    }

    if (!this.button0 && !this.button1 && !this.button2) {
      return;
    }

    this._intermissionExit();
  }

  _intermissionFindSpot(): IntermissionCameraEntity | BaseEntity {
    const spots = Array.from(this.findAllEntitiesByFieldAndValue('classname', IntermissionCameraEntity.classname));

    if (spots.length > 0) {
      const spot = spots[Math.floor(Math.random() * spots.length)];
      console.assert(spot !== undefined, 'intermission spot must exist when spots.length > 0');
      return spot!;
    }

    return this._selectSpawnPoint();
  }

  _intermissionExit(): void {
    if (this.game.deathmatch) {
      this.game.loadNextMap();
      return;
    }

    this.game.intermission_exittime = this.game.time + 1.0;
    this.game.intermission_running++;

    if (this.game.intermission_running === 2) {
      const finaleText = this._getEpisodeFinaleText();
      if (finaleText) {
        this.engine.PlayTrack(2);
        this.centerPrint(finaleText);
        return;
      }
    }

    if (this.game.intermission_running === 3) {
      if (!this.engine.registered) {
        this.engine.ShowSellScreen();
        return;
      }

      if ((this.game.serverflags & 15) === 15) {
        const allRunesText = 'Now, you have all four Runes. You sense\n' +
          'tremendous invisible forces moving to\n' +
          'unseal ancient barriers. Shub-Niggurath\n' +
          'had hoped to use the Runes Herself to\n' +
          'clear off the Earth, but now instead,\n' +
          'you will use them to enter her home and\n' +
          'confront her as an avatar of avenging\n' +
          'Earth-life. If you defeat her, you will\n' +
          'be remembered forever as the savior of\n' +
          'the planet. If she conquers, it will be\n' +
          'as if you had never been born.';
        this.centerPrint(allRunesText);
        return;
      }
    }

    this.game.loadNextMap();
  }

  _getEpisodeFinaleText(): string | null {
    const mapname = this.game.mapname;

    if (mapname === 'e1m7') {
      if (this.engine.registered) {
        return 'As the corpse of the monstrous entity\n' +
          'Chthon sinks back into the lava whence\n' +
          'it rose, you grip the Rune of Earth\n' +
          'Magic tightly. Now that you have\n' +
          'conquered the Dimension of the Doomed,\n' +
          'realm of Earth Magic, you are ready to\n' +
          'complete your task. A Rune of magic\n' +
          'power lies at the end of each haunted\n' +
          'land of Quake. Go forth, seek the\n' +
          'totality of the four Runes!';
      }

      return 'As the corpse of the monstrous entity\n' +
        'Chthon sinks back into the lava whence\n' +
        'it rose, you grip the Rune of Earth\n' +
        'Magic tightly. Now that you have\n' +
        'conquered the Dimension of the Doomed,\n' +
        'realm of Earth Magic, you are ready to\n' +
        'complete your task in the other three\n' +
        'haunted lands of Quake. Or are you? If\n' +
        'you don\'t register Quake, you\'ll never\n' +
        'know what awaits you in the Realm of\n' +
        'Black Magic, the Netherworld, and the\n' +
        'Elder World!';
    }

    if (mapname === 'e2m6') {
      return 'The Rune of Black Magic throbs evilly in\n' +
        'your hand and whispers dark thoughts\n' +
        'into your brain. You learn the inmost\n' +
        'lore of the Hell-Mother; Shub-Niggurath!\n' +
        'You now know that she is behind all the\n' +
        'terrible plotting which has led to so\n' +
        'much death and horror. But she is not\n' +
        'inviolate! Armed with this Rune, you\n' +
        'realize that once all four Runes are\n' +
        'combined, the gate to Shub-Niggurath\'s\n' +
        'Pit will open, and you can face the\n' +
        'Witch-Goddess herself in her frightful\n' +
        'otherworld cathedral.';
    }

    if (mapname === 'e3m6') {
      return 'The charred viscera of diabolic horrors\n' +
        'bubble viscously as you seize the Rune\n' +
        'of Hell Magic. Its heat scorches your\n' +
        'hand, and its terrible secrets blight\n' +
        'your mind. Gathering the shreds of your\n' +
        'courage, you shake the devil\'s shackles\n' +
        'from your soul, and become ever more\n' +
        'hard and determined to destroy the\n' +
        'hideous creatures whose mere existence\n' +
        'threatens the souls and psyches of all\n' +
        'the population of Earth.';
    }

    if (mapname === 'e4m7') {
      return 'Despite the awful might of the Elder\n' +
        'World, you have achieved the Rune of\n' +
        'Elder Magic, capstone of all types of\n' +
        'arcane wisdom. Beyond good and evil,\n' +
        'beyond life and death, the Rune\n' +
        'pulsates, heavy with import. Patient and\n' +
        'potent, the Elder Being Shub-Niggurath\n' +
        'weaves her dire plans to clear off all\n' +
        'life from the Earth, and bring her own\n' +
        'foul offspring to our world! For all the\n' +
        'dwellers in these nightmare dimensions\n' +
        'are her descendants! Once all Runes of\n' +
        'magic power are united, the energy\n' +
        'behind them will blast open the Gateway\n' +
        'to Shub-Niggurath, and you can travel\n' +
        'there to foil the Hell-Mother\'s plots\n' +
        'in person.';
    }

    return null;
  }

  startIntermission(): void {
    console.assert(this.game.intermission_running > 0, 'must only be called during intermission running');

    // Vanilla Quake shows the same intermission spot to everyone.
    const spot = this._intermissionFindSpot();
    // Move the player there so PVS checks and delta updates still behave correctly.
    this.view_ofs.clear();
    if (spot instanceof IntermissionCameraEntity) {
      this.angles.set(spot.mangle || spot.angles);
      this.v_angle.set(spot.mangle || spot.angles);
    } else {
      this.angles.set(spot.angles);
      this.v_angle.set(spot.angles);
    }
    this.fixangle = true;
    this.takedamage = damage.DAMAGE_NO;
    this.solid = solid.SOLID_NOT;
    this.movetype = moveType.MOVETYPE_NONE;
    this.unsetModel();
    this.setOrigin(spot.origin);

    // Tell the client to start intermission.
    this.dispatchExpeditedEvent(clientEvent.INTERMISSION_START, null, spot.origin, spot.angles);
  }

  playerPreThink(): void {
    if (this.game.intermission_running) {
      this._intermissionThink();
      return;
    }

    if (this.view_ofs.isOrigin()) {
      return;
    }

    this.game.checkRules(this);

    // FIXME: player movement logic is also mirrored in Pmove and should be deduplicated.
    this._playerWaterMove();
    this._playerWaterJump();

    if (this.deadflag >= dead.DEAD_DEAD) {
      this._playerDeathThink();
      return;
    }

    if (this.deadflag === dead.DEAD_DYING) {
      return;
    }

    if (this.button2) {
      this._playerJump();
    } else {
      this.flags |= flags.FL_JUMPRELEASED;
    }

    if (this.game.time < this.pausetime) {
      this.velocity.clear();
    }

    if (this.game.time > this.attack_finished && this.currentammo === 0 && this.weapon !== items.IT_AXE) {
      this.selectBestWeapon();
    }
  }

  playerPostThink(): void {
    if (this.view_ofs.isOrigin() || this.deadflag !== dead.DEAD_NO) {
      return;
    }

    // Handle use requests and then weapon logic.
    this._interactThink();
    this._weaponFrame();

    // Check for landing and play the appropriate landing sound.
    if (this.jump_flag < -300 && (this.flags & flags.FL_ONGROUND) !== 0 && this.health > 0) {
      if (this.watertype === content.CONTENT_WATER) {
        this.startSound(channel.CHAN_BODY, 'player/h2ojump.wav');
      } else if (this.jump_flag < -650) {
        this.game.worldspawn.damage(this, 5.0); // fixed 5 damage for falling
        this.startSound(channel.CHAN_VOICE, 'player/land2.wav');
        this.deathtype = deathType.FALLING;
      } else {
        this.startSound(channel.CHAN_VOICE, 'player/land.wav');
      }

      this.jump_flag = 0;
    }

    if ((this.flags & flags.FL_ONGROUND) === 0) {
      this.jump_flag = this.velocity[2];
    }

    // Do all powerup housekeeping last.
    this._powerupFrame();
  }

  thinkDie(attackerEntity: BaseEntity): void {
    this._playerDie();

    if (attackerEntity.equals(this)) {
      if (this.waterlevel !== waterlevel.WATERLEVEL_NONE) {
        switch (this.watertype) {
          case content.CONTENT_WATER:
            this.engine.BroadcastPrint(`${this.netname} identified as a fish.\n`);
            break;
          case content.CONTENT_SLIME:
            this.engine.BroadcastPrint(`${this.netname} got slimed up.\n`);
            break;
          case content.CONTENT_LAVA:
            this.engine.BroadcastPrint(`${this.netname} tried to swim in lava.\n`);
            break;
          default:
            this.engine.BroadcastPrint(`${this.netname} killed himself in some mysterious liquid.\n`);
            break;
        }
      } else {
        this.engine.BroadcastPrint(`${this.netname} killed himself.\n`);
      }

      this.frags--;
      this.engine.eventBus.publish('game.player.died', this, this);
      return;
    }

    const actualAttacker = (() => {
      let current: BaseEntity | null = attackerEntity;
      let attempts = 10;
      while (current && attempts-- > 0) {
        if (current instanceof PlayerEntity) {
          return current;
        }

        current = current.owner;
      }

      return attackerEntity;
    })();

    this.engine.BroadcastPrint(`${getEntityDisplayName(actualAttacker)} killed ${this.netname}.\n`);

    if (actualAttacker instanceof PlayerEntity) {
      actualAttacker.frags += this.team > 0 && this.game.teamplay > 0 && actualAttacker.team === this.team ? -1 : 1;
      this.engine.BroadcastClientEvent(
        true,
        clientEvent.OBITUARY,
        this.edictId ?? null,
        actualAttacker.edictId ?? null,
        actualAttacker.weapon || 0,
        actualAttacker.items || 0,
      );
    } else {
      this.engine.BroadcastClientEvent(true, clientEvent.OBITUARY, this.edictId ?? null, actualAttacker.edictId ?? null, 0, 0);
    }

    this.engine.eventBus.publish('game.player.died', this, actualAttacker);
  }

  thinkPain(_attackerEntity: BaseEntity, _damagePoints: number): void {
    this._enterPainState();
  }

  suicide(): void {
    // Vanilla Quake used set_suicide_frame here; route through normal damage instead.
    this.damage(this, 50000);
  }

  connected(): void {
    this.engine.BroadcastPrint(`${this.netname} entered the game.\n`);

    this.clear();
    this.frags = 0;

    if (this.game.intermission_running) {
      this._intermissionExit();
    }

    this.game.sendMissingEntitiesToPlayer(this);
  }

  disconnected(): void {
    if (this.game.gameover) {
      return;
    }

    this._playerDie();
    this._playerDead();
    // The engine stops thinking disconnected players, so clear the model instead of leaving a statue behind.
    this.unsetModel();

    if (this.game.deathmatch || this.game.coop) {
      this.engine.SpawnEntity(TeleportEffectEntity.classname, { origin: this.origin });
      this.engine.BroadcastPrint(`${this.netname} left the game.\n`);
    }
  }

  protected _respawn(): void {
    // These spawn parms are odd, but this matches the original split between coop, deathmatch, and singleplayer.
    if (this.game.coop) {
      CopyToBodyQue(this.game, this); // copy the dead body for appearances sake
      this._applySpawnParameters();
      this.clear();
      this.putPlayerInServer();
      return;
    }

    if (this.game.deathmatch) {
      CopyToBodyQue(this.game, this); // copy the dead body for appearances sake
      this._freshSpawnParameters();
      this.clear();
      this.putPlayerInServer();
      return;
    }

    this.engine.AppendConsoleText('restart\n');
  }

  override isActor(): boolean {
    return true;
  }
}

@entity
export class TelefragTriggerEntity extends BaseEntity {
  static classname = 'misc_teledeath';

  override touch(touchedByEntity: BaseEntity): void {
    if (touchedByEntity.equals(this.owner)) {
      return;
    }

    if (touchedByEntity instanceof PlayerEntity) {
      if (!(this.owner instanceof PlayerEntity) && this.owner instanceof BaseEntity) {
        this.damage(this.owner, 50000.0);
        return;
      }
    }

    if ('health' in touchedByEntity) {
      this.damage(touchedByEntity, 50000.0);
    }
  }

  override spawn(): void {
    console.assert(this.owner, 'Needs an owner');

    const oversize = new Vector(1.0, 1.0, 1.0);
    const mins = this.owner!.mins.copy().subtract(oversize);
    const maxs = this.owner!.maxs.copy().add(oversize);

    this.solid = solid.SOLID_TRIGGER;
    this.setSize(mins, maxs);
    this._scheduleThink(this.game.time + 0.2, () => { this.remove(); });
    this.game.force_retouch = 2;
  }
}

@entity
export class GibEntity extends BaseEntity {
  static classname = 'misc_gib';

  static override _precache(engineAPI: ServerEngineAPI): void {
    engineAPI.PrecacheModel('progs/zom_gib.mdl');
    engineAPI.PrecacheModel('progs/gib1.mdl');
    engineAPI.PrecacheModel('progs/gib2.mdl');
    engineAPI.PrecacheModel('progs/gib3.mdl');

    engineAPI.PrecacheSound('player/gib.wav');
    engineAPI.PrecacheSound('player/udeath.wav');
  }

  override spawn(): void {
    console.assert(this.model !== null, 'GibEntity requires a model before spawn');
    this.setModel(this.model!);
    this.setSize(Vector.origin, Vector.origin);
    this.movetype = moveType.MOVETYPE_BOUNCE;
    this.solid = solid.SOLID_NOT;
    this.avelocity = new Vector(Math.random(), Math.random(), Math.random()).multiply(600.0);
    this.ltime = this.game.time;
    this.frame = 0;
    this.flags = 0;

    this._scheduleThink(this.ltime + 10.0 + Math.random() * 10.0, () => { this.remove(); });
  }

  static throwGibs(entity: BaseMonster | PlayerEntity, damagePoints: number | null = null, impact: Vector = Vector.origin): void {
    const models = ['progs/gib1.mdl', 'progs/gib2.mdl', 'progs/gib3.mdl'];

    for (let i = 0, max = Math.ceil(entity.volume / 16000); i < max; i++) {
      const model = models[Math.floor(Math.random() * models.length)];
      console.assert(model !== undefined, 'gib model must exist');
      entity.engine.SpawnEntity(GibEntity.classname, {
        origin: entity.origin.copy(),
        velocity: VelocityForDamage(damagePoints !== null ? damagePoints : entity.health).add(impact),
        model,
      });
    }
  }

  static throwMeatGib(entity: BaseMonster | PlayerEntity, velocity: Vector, origin: Vector = entity.origin): void {
    entity.engine.SpawnEntity(GibEntity.classname, {
      origin: origin.copy(),
      velocity,
      model: 'progs/zom_gib.mdl',
    });
  }

  static gibEntity(entity: BaseMonster | PlayerEntity, headModel: string, playSound = true): void {
    if (!entity.isActor() || entity.health > 0) {
      return;
    }

    const damagePoints = entity.health;

    entity.resetThinking();
    entity.setModel(headModel);
    entity.frame = 0;
    entity.movetype = moveType.MOVETYPE_BOUNCE;
    entity.takedamage = damage.DAMAGE_NO;
    entity.solid = solid.SOLID_NOT;
    entity.view_ofs = new Vector(0.0, 0.0, 8.0);
    entity.setSize(new Vector(-16.0, -16.0, 0.0), new Vector(16.0, 16.0, 56.0));
    entity.origin[2] -= 24.0;
    entity.flags &= ~flags.FL_ONGROUND;
    entity.avelocity = new Vector(0.0, 600.0, 0.0).multiply(crandom());
    entity.deadflag = dead.DEAD_DEAD;

    const impact = new Vector();

    if (featureFlags.includes('improved-gib-physics')) {
      entity.velocity.normalize();
      impact.set(entity.velocity.multiply(-5.0 * damagePoints));
      entity.velocity = VelocityForDamage(damagePoints).add(impact);
    }

    GibEntity.throwGibs(entity, damagePoints, impact);

    if (playSound) {
      entity.startSound(channel.CHAN_VOICE, Math.random() < 0.5 ? 'player/gib.wav' : 'player/udeath.wav');
    }
  }
}
