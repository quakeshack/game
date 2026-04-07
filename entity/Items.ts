import type { ServerEngineAPI } from '../../../shared/GameInterfaces.ts';

import Vector from '../../../shared/Vector.ts';

import { channel, clientEvent, flags, items, moveType, solid, tentType, worldType } from '../Defs.ts';
import { entity, serializable } from '../helper/MiscHelpers.ts';
import BaseEntity from './BaseEntity.ts';
import { PlayerEntity as RuntimePlayerEntity } from './Player.mjs';
import type { PlayerEntity } from './Player.ts';
import { Sub } from './Subs.ts';

interface HealthItemConfiguration {
  readonly model: string;
  readonly noise: string;
  readonly healamount: number;
  readonly items: number;
}

interface ArtifactPrecacheList {
  readonly sounds: readonly string[];
}

const itemFlags = Object.values(items).filter((value): value is items => typeof value === 'number');

// respawn times
// - backpack: never
// - weapon: 30s
// - powerup: 60s (or 300s when invisibility or invulnerability)
// - health: 20s
// - armor: 20s
// - ammo: 30s

const WEAPON_BIG2 = 1;

/**
 * maps item to a string
 */
export const itemNames: Readonly<Record<number, string>> = {
  [items.IT_AXE]: 'Axe',
  [items.IT_SHOTGUN]: 'Shotgun',
  [items.IT_SUPER_SHOTGUN]: 'Double-barrelled Shotgun',
  [items.IT_NAILGUN]: 'Nailgun',
  [items.IT_SUPER_NAILGUN]: 'Super Nailgun',
  [items.IT_GRENADE_LAUNCHER]: 'Grenade Launcher',
  [items.IT_ROCKET_LAUNCHER]: 'Rocket Launcher',
  [items.IT_LIGHTNING]: 'Thunderbolt',

  [items.IT_INVISIBILITY]: 'Ring of Shadows',
  [items.IT_SUIT]: 'Biosuit',
  [items.IT_INVULNERABILITY]: 'Pentagram of Protection',
  [items.IT_QUAD]: 'Quad Damage',

  [items.IT_KEY1]: 'Silver Key',
  [items.IT_KEY2]: 'Gold Key',
};

@entity
export abstract class BaseItemEntity extends BaseEntity {
  @serializable ammo_shells = 0;
  @serializable ammo_nails = 0;
  @serializable ammo_rockets = 0;
  @serializable ammo_cells = 0;
  @serializable items = 0;

  /** Preferred weapon after pickup. */
  @serializable weapon: items | 0 = 0;

  /** Seconds until respawn. */
  @serializable regeneration_time = 20.0;

  @serializable protected _model_original: string | null = null;

  /** Sound effect played when the item is picked up. */
  @serializable noise = 'weapons/lock4.wav';

  /** Optional nickname. */
  @serializable netname: string | null = null;

  protected override _declareFields(): void {
    this._sub ??= new Sub(this);
  }

  override spawn(): void {
    this.flags = flags.FL_ITEM;
    this.solid = solid.SOLID_TRIGGER;
    this.movetype = moveType.MOVETYPE_TOSS;
    this.origin[2] += 6.0;
    // this.effects |= effect.EF_MINLIGHT;
    // this.dropToFloor();

    console.assert(this.weapon === 0 || itemFlags.includes(this.weapon), 'weapon must be a valid item flag');
  }

  static override _precache(engineAPI: ServerEngineAPI): void {
    engineAPI.PrecacheSound('items/itembk2.wav');
    engineAPI.PrecacheSound('weapons/lock4.wav');
  }

  regenerate(): void { // QuakeC: SUB_regen
    this.model = this._model_original;
    this.solid = solid.SOLID_TRIGGER;
    this.startSound(channel.CHAN_VOICE, 'items/itembk2.wav');
    this.setOrigin(this.origin);
    this.engine.DispatchTempEntityEvent(tentType.TE_TELEPORT, this.centerPoint); // CR: added neat teleport in effect
  }

  toss(): void {
    this.velocity.setTo(300.0, -100.0 + Math.random() * 200.0, -100.0 + Math.random() * 200.0);
  }

  /**
   * To be overriden, called after healthy player check.
   * @returns True when the item may be picked up.
   */
  protected _canPickup(_playerEntity: PlayerEntity): boolean {
    return true;
  }

  /**
   * Can be overriden, called after healthy player check.
   * @returns True when the item was consumed successfully.
   */
  protected _pickup(playerEntity: PlayerEntity): boolean {
    return playerEntity.applyBackpack(this);
  }

  protected _collectItems(playerEntity: PlayerEntity): string[] {
    const collectedItems: string[] = [];

    // check if this items is new in player's inventory
    if (this.items > 0 && (playerEntity.items & this.items) !== this.items) {
      for (const [item, name] of Object.entries(itemNames)) {
        if (((this.items & ~playerEntity.items) & Number(item)) !== 0) { // only mention new items
          collectedItems.push(name);
        }
      }
    }

    return collectedItems;
  }

  override touch(otherEntity: BaseEntity): void {
    if (!(otherEntity instanceof RuntimePlayerEntity) || otherEntity.health <= 0 || !this._canPickup(otherEntity)) {
      return;
    }

    const player = otherEntity as PlayerEntity;

    // let the player consume this backpack
    if (!this._pickup(player)) {
      return; // player's inventory is already full
    }

    const collectedItems = this._collectItems(player);

    player.startSound(channel.CHAN_ITEM, this.noise);
    player.dispatchExpeditedEvent(clientEvent.ITEM_PICKED, this.edict, collectedItems, this.netname, this.items);

    this._afterTouch(player);
  }

  protected _afterTouch(playerEntity: PlayerEntity): void {
    const sub = this._sub;
    console.assert(sub !== null, 'BaseItemEntity requires Sub helper');
    if (sub === null) {
      return;
    }

    // trigger all connected actions
    sub.useTargets(playerEntity);

    if (this.game.deathmatch && this.regeneration_time > 0) {
      this.solid = solid.SOLID_NOT;
      this._model_original = this.model;
      this.model = null;
      this._scheduleThink(this.game.time + this.regeneration_time, () => { this.regenerate(); });
    } else {
      this.remove();
    }
  }
}

/**
 * QUAKED item_backpack (0 .5 .8) (-16 -16 0) (16 16 32)
 * QuakeShack extension. In vanilla Quake only spawned by monsters/players upon their death.
 *
 * A backpack can contain a bunch of items as well as ammo.
 */
@entity
export class BackpackEntity extends BaseItemEntity {
  static classname = 'item_backpack';

  @serializable remove_after = 0;

  static override _precache(engineAPI: ServerEngineAPI): void {
    engineAPI.PrecacheModel('progs/backpack.mdl');
  }

  protected override _collectItems(playerEntity: PlayerEntity): string[] {
    const collectedItems = super._collectItems(playerEntity);

    if (this.ammo_shells > 0) {
      collectedItems.push(`${this.ammo_shells} shells`);
    }

    if (this.ammo_nails > 0) {
      collectedItems.push(`${this.ammo_nails} nails`);
    }

    if (this.ammo_rockets > 0) {
      collectedItems.push(`${this.ammo_rockets} rockets`);
    }

    if (this.ammo_cells > 0) {
      collectedItems.push(`${this.ammo_cells} cells`);
    }

    return collectedItems;
  }

  override spawn(): void {
    super.spawn();

    this.setModel('progs/backpack.mdl');
    this.setSize(new Vector(-16.0, -16.0, 0.0), new Vector(16.0, 16.0, 56.0));

    // make it disappear after a while
    if (this.remove_after > 0) {
      this._scheduleThink(this.game.time + this.remove_after, () => { this.remove(); });
    }
  }
}

@entity
export abstract class BaseAmmoEntity extends BaseItemEntity {
  /** model set, when WEAPON_BIG2 is not set */
  static _model: string | null = null;
  /** model set, when WEAPON_BIG2 is set */
  static _modelBig: string | null = null;
  /** ammo given, when WEAPON_BIG2 is not set */
  static _ammo = 0;
  /** ammo given, when WEAPON_BIG2 is set */
  static _ammoBig = 0;
  /** preferred weapon item flag, 0 means no preference */
  static _weapon: items | 0 = 0;

  protected override _precache(): void {
    const thisClass = this.constructor as typeof BaseAmmoEntity;
    const modelName = (this.spawnflags & WEAPON_BIG2) !== 0 && thisClass._modelBig !== null
      ? thisClass._modelBig
      : thisClass._model;

    console.assert(modelName !== null, 'Ammo items must define a model');
    if (modelName === null) {
      return;
    }

    this.engine.PrecacheModel(modelName);
  }

  /**
   * Sets the corresponding ammo slot with given ammo.
   */
  protected _setAmmo(_ammo: number): void {
    // set the correct slot here
  }

  override spawn(): void {
    super.spawn();

    const thisClass = this.constructor as typeof BaseAmmoEntity;
    const useBigModel = (this.spawnflags & WEAPON_BIG2) !== 0 && thisClass._modelBig !== null;
    const modelName = useBigModel ? thisClass._modelBig : thisClass._model;

    console.assert(modelName !== null, 'Ammo items must define a model');
    if (modelName === null) {
      return;
    }

    this.setModel(modelName);
    this._setAmmo(useBigModel ? thisClass._ammoBig : thisClass._ammo);
    this.weapon = thisClass._weapon;

    this.setSize(Vector.origin, new Vector(32.0, 32.0, 56.0));
  }
}

/**
 * QUAKED item_shells (0 .5 .8) (0 0 0) (32 32 32) big
 */
@entity
export class ItemShellsEntity extends BaseAmmoEntity {
  static classname = 'item_shells';

  static _ammo = 20;
  static _ammoBig = 40;
  static _model = 'maps/b_shell0.bsp';
  static _modelBig = 'maps/b_shell1.bsp';
  static _weapon = items.IT_SHOTGUN;

  protected override _setAmmo(ammo: number): void {
    this.ammo_shells = ammo;
  }

  /**
   * Prefer the super shotgun when the player has it and enough shells.
   * @returns True when the pickup succeeds.
   */
  protected override _pickup(playerEntity: PlayerEntity): boolean {
    if ((playerEntity.items & items.IT_SUPER_SHOTGUN) !== 0 && playerEntity.ammo_shells + this.ammo_shells > 1) {
      this.weapon = items.IT_SUPER_SHOTGUN;
    }

    return super._pickup(playerEntity);
  }

  protected override _collectItems(playerEntity: PlayerEntity): string[] {
    const collectedItems = super._collectItems(playerEntity);

    if (this.ammo_shells > 0) {
      collectedItems.push(`${this.ammo_shells} shells`);
    }

    return collectedItems;
  }
}

/**
 * QUAKED item_spikes (0 .5 .8) (0 0 0) (32 32 32) big
 */
@entity
export class ItemSpikesEntity extends BaseAmmoEntity {
  static classname = 'item_spikes';

  static _ammo = 25;
  static _ammoBig = 50;
  static _model = 'maps/b_nail0.bsp';
  static _modelBig = 'maps/b_nail1.bsp';
  static _weapon = items.IT_NAILGUN;

  /**
   * Prefer the super nailgun when the player has it and enough nails.
   * @returns True when the pickup succeeds.
   */
  protected override _pickup(playerEntity: PlayerEntity): boolean {
    if ((playerEntity.items & items.IT_SUPER_NAILGUN) !== 0 && playerEntity.ammo_nails + this.ammo_nails > 1) {
      this.weapon = items.IT_SUPER_NAILGUN;
    }

    return super._pickup(playerEntity);
  }

  protected override _setAmmo(ammo: number): void {
    this.ammo_nails = ammo;
  }

  protected override _collectItems(playerEntity: PlayerEntity): string[] {
    const collectedItems = super._collectItems(playerEntity);

    if (this.ammo_nails > 0) {
      collectedItems.push(`${this.ammo_nails} nails`);
    }

    return collectedItems;
  }
}

/**
 * QUAKED item_rockets (0 .5 .8) (0 0 0) (32 32 32) big
 */
@entity
export class ItemRocketsEntity extends BaseAmmoEntity {
  static classname = 'item_rockets';

  static _ammo = 5;
  static _ammoBig = 10;
  static _model = 'maps/b_rock0.bsp';
  static _modelBig = 'maps/b_rock1.bsp';
  static _weapon = items.IT_ROCKET_LAUNCHER;

  protected override _setAmmo(ammo: number): void {
    this.ammo_rockets = ammo;
  }

  protected override _collectItems(playerEntity: PlayerEntity): string[] {
    const collectedItems = super._collectItems(playerEntity);

    if (this.ammo_rockets > 0) {
      collectedItems.push(`${this.ammo_rockets} rockets`);
    }

    return collectedItems;
  }
}

/**
 * QUAKED item_cells (0 .5 .8) (0 0 0) (32 32 32) big
 */
@entity
export class ItemCellsEntity extends BaseAmmoEntity {
  static classname = 'item_cells';

  static _ammo = 6;
  static _ammoBig = 12;
  static _model = 'maps/b_batt0.bsp';
  static _modelBig = 'maps/b_batt1.bsp';
  static _weapon = items.IT_LIGHTNING;

  protected override _setAmmo(ammo: number): void {
    this.ammo_cells = ammo;
  }

  protected override _collectItems(playerEntity: PlayerEntity): string[] {
    const collectedItems = super._collectItems(playerEntity);

    if (this.ammo_cells > 0) {
      collectedItems.push(`${this.ammo_cells} cells`);
    }

    return collectedItems;
  }
}

@entity
export abstract class BaseKeyEntity extends BaseItemEntity {
  static _item = 0;

  static _worldTypeToSound: Readonly<Record<number, string>> = {
    [worldType.MEDIEVAL]: 'misc/medkey.wav', // fallback
    [worldType.RUNES]: 'misc/runekey.wav',
    [worldType.BASE]: 'misc/basekey.wav',
  };

  static _worldTypeToNetname: Readonly<Record<number, string>> = {
    [worldType.MEDIEVAL]: 'base key', // fallback
    [worldType.RUNES]: 'base runekey',
    [worldType.BASE]: 'base keycard',
  };

  static _worldTypeToModel: Readonly<Record<number, string>> = {
    [worldType.MEDIEVAL]: 'progs/w_s_key.mdl', // fallback
    [worldType.RUNES]: 'progs/m_s_key.mdl',
    [worldType.BASE]: 'progs/b_s_key.mdl',
  };

  protected override _precache(): void {
    this._setInfo();

    console.assert(this.noise.length > 0, 'Key items must define a pickup sound');
    console.assert(this.model !== null, 'Key items must define a model');
    if (this.model === null) {
      return;
    }

    this.engine.PrecacheSound(this.noise);
    this.engine.PrecacheModel(this.model);
  }

  protected _setInfo(): void {
    const currentWorldType = this.game.worldspawn?.worldtype ?? worldType.MEDIEVAL;
    const thisClass = this.constructor as typeof BaseKeyEntity;

    this.noise = thisClass._worldTypeToSound[currentWorldType] ?? thisClass._worldTypeToSound[worldType.MEDIEVAL];
    this.netname = thisClass._worldTypeToNetname[currentWorldType] ?? thisClass._worldTypeToNetname[worldType.MEDIEVAL];
    this.model = thisClass._worldTypeToModel[currentWorldType] ?? thisClass._worldTypeToModel[worldType.MEDIEVAL];
  }

  override spawn(): void {
    super.spawn();

    this._setInfo();

    console.assert(this.model !== null, 'Key items must define a model');
    if (this.model === null) {
      return;
    }

    this.setModel(this.model);
    this.setSize(new Vector(-16.0, -16.0, -24.0), new Vector(16.0, 16.0, 32.0));

    this.items = (this.constructor as typeof BaseKeyEntity)._item;
  }

  override regenerate(): void {
    // no action, keys do not regenerate
  }

  protected override _canPickup(playerEntity: PlayerEntity): boolean {
    return (playerEntity.items & this.items) === 0;
  }

  protected override _afterTouch(playerEntity: PlayerEntity): void {
    const sub = this._sub;
    console.assert(sub !== null, 'BaseKeyEntity requires Sub helper');
    if (sub === null) {
      return;
    }

    sub.useTargets(playerEntity);

    // CR: weird that they can be taken in deathmatch
    if (!this.game.coop) {
      this.remove();
    }
  }
}

/**
 * QUAKED item_key1 (0 .5 .8) (-16 -16 -24) (16 16 32)
 * SILVER key
 * In order for keys to work
 * you MUST set your maps
 * worldtype to one of the
 * following:
 * 0: medieval
 * 1: metal
 * 2: base
 */
@entity
export class SilverKeyEntity extends BaseKeyEntity {
  static classname = 'item_key1';

  static _item = items.IT_KEY1;

  static _worldTypeToNetname: Readonly<Record<number, string>> = {
    [worldType.MEDIEVAL]: 'silver key', // fallback
    [worldType.RUNES]: 'silver runekey',
    [worldType.BASE]: 'silver keycard',
  };

  static _worldTypeToModel: Readonly<Record<number, string>> = {
    [worldType.MEDIEVAL]: 'progs/w_s_key.mdl', // fallback
    [worldType.RUNES]: 'progs/m_s_key.mdl',
    [worldType.BASE]: 'progs/b_s_key.mdl',
  };
}

/**
 * QUAKED item_key2 (0 .5 .8) (-16 -16 -24) (16 16 32)
 * GOLD key
 * In order for keys to work
 * you MUST set your maps
 * worldtype to one of the
 * following:
 * 0: medieval
 * 1: metal
 * 2: base
 */
@entity
export class GoldKeyEntity extends BaseKeyEntity {
  static classname = 'item_key2';

  static _item = items.IT_KEY2;

  static _worldTypeToNetname: Readonly<Record<number, string>> = {
    [worldType.MEDIEVAL]: 'gold key', // fallback
    [worldType.RUNES]: 'gold runekey',
    [worldType.BASE]: 'gold keycard',
  };

  static _worldTypeToModel: Readonly<Record<number, string>> = {
    [worldType.MEDIEVAL]: 'progs/w_g_key.mdl', // fallback
    [worldType.RUNES]: 'progs/m_g_key.mdl',
    [worldType.BASE]: 'progs/b_g_key.mdl',
  };
}

@entity
export abstract class BaseArtifactEntity extends BaseItemEntity {
  static _item = 0;
  static _regenerationTime = 60;

  static _model: string | null = null;
  static _noise: string | null = null;
  static _precacheList: ArtifactPrecacheList = { sounds: [] };

  protected override _precache(): void {
    const thisClass = this.constructor as typeof BaseArtifactEntity;

    console.assert(thisClass._model !== null, 'Artifact items must define a model');
    if (thisClass._model === null) {
      return;
    }

    this.engine.PrecacheModel(thisClass._model);
    for (const sound of thisClass._precacheList.sounds) {
      this.engine.PrecacheSound(sound);
    }
  }

  override spawn(): void {
    super.spawn();

    const thisClass = this.constructor as typeof BaseArtifactEntity;

    console.assert(thisClass._model !== null, 'Artifact items must define a model');
    console.assert(thisClass._noise !== null, 'Artifact items must define a pickup sound');
    if (thisClass._model === null || thisClass._noise === null) {
      return;
    }

    this.noise = thisClass._noise;
    this.items |= thisClass._item;
    this.regeneration_time = thisClass._regenerationTime;

    this.setModel(thisClass._model);
    this.setSize(new Vector(-16.0, -16.0, -24.0), new Vector(16.0, 16.0, 32.0));
  }

  protected override _afterTouch(playerEntity: PlayerEntity): void {
    this._updateTimers(playerEntity);
    super._afterTouch(playerEntity);
  }

  /**
   * Called when successfully picked up the artifact.
   */
  protected _updateTimers(_playerEntity: PlayerEntity): void {
    // update timers here, e.g. super_time = 1, super_damage_finished = time + 30 etc.
  }
}

/**
 * QUAKED item_artifact_invulnerability (0 .5 .8) (-16 -16 -24) (16 16 32)
 * Player is invulnerable for 30 seconds
 */
@entity
export class InvulnerabilityEntity extends BaseArtifactEntity {
  static classname = 'item_artifact_invulnerability';

  static _item = items.IT_INVULNERABILITY;
  static _model = 'progs/invulner.mdl';
  static _noise = 'items/protect.wav';

  static _regenerationTime = 300; // 5 mins

  static _precacheList: ArtifactPrecacheList = {
    sounds: [
      'items/protect.wav',
      'items/protect2.wav',
      'items/protect3.wav',
    ],
  };

  protected override _updateTimers(playerEntity: PlayerEntity): void {
    playerEntity.invincible_time = 1;
    playerEntity.invincible_finished = this.game.time + 30;
  }
}

/**
 * QUAKED item_artifact_invisibility (0 .5 .8) (-16 -16 -24) (16 16 32)
 * Player is invisible for 30 seconds
 */
@entity
export class InvisibilityEntity extends BaseArtifactEntity {
  static classname = 'item_artifact_invisibility';

  static _item = items.IT_INVISIBILITY;
  static _model = 'progs/invisibl.mdl';
  static _noise = 'items/inv1.wav';

  static _regenerationTime = 300; // 5 mins

  static _precacheList: ArtifactPrecacheList = {
    sounds: [
      'items/inv1.wav',
      'items/inv2.wav',
      'items/inv3.wav',
    ],
  };

  protected override _updateTimers(playerEntity: PlayerEntity): void {
    playerEntity.invisible_time = 1;
    playerEntity.invisible_finished = this.game.time + 30;
  }
}

/**
 * QUAKED item_artifact_envirosuit (0 .5 .8) (-16 -16 -24) (16 16 32)
 * Player takes no damage from water or slime for 30 seconds
 */
@entity
export class RadsuitEntity extends BaseArtifactEntity {
  static classname = 'item_artifact_envirosuit';

  static _item = items.IT_SUIT;
  static _model = 'progs/suit.mdl';
  static _noise = 'items/suit.wav';

  static _precacheList: ArtifactPrecacheList = {
    sounds: [
      'items/suit.wav',
      'items/suit2.wav',
    ],
  };

  protected override _updateTimers(playerEntity: PlayerEntity): void {
    playerEntity.rad_time = 1;
    playerEntity.radsuit_finished = this.game.time + 30;
  }
}

/**
 * QUAKED item_artifact_super_damage (0 .5 .8) (-16 -16 -24) (16 16 32)
 * The next attack from the player will do 4x damage
 */
@entity
export class SuperDamageEntity extends BaseArtifactEntity {
  static classname = 'item_artifact_super_damage';

  static _item = items.IT_QUAD;
  static _model = 'progs/quaddama.mdl';
  static _noise = 'items/damage.wav';

  static _precacheList: ArtifactPrecacheList = {
    sounds: [
      'items/damage.wav',
      'items/damage2.wav',
      'items/damage3.wav',
    ],
  };

  protected override _updateTimers(playerEntity: PlayerEntity): void {
    playerEntity.super_time = 1;
    playerEntity.super_damage_finished = this.game.time + 30;
  }
}

/**
 * QUAKED item_sigil (0 .5 .8) (-16 -16 -24) (16 16 32) E1 E2 E3 E4
 * End of level sigil, pick up to end episode and return to jrstart.
 */
@entity
export class SigilEntity extends BaseItemEntity {
  static classname = 'item_sigil';

  static readonly _items = [items.IT_SIGIL1, items.IT_SIGIL2, items.IT_SIGIL3, items.IT_SIGIL4] as const;
  static readonly _models = ['progs/end1.mdl', 'progs/end2.mdl', 'progs/end3.mdl', 'progs/end4.mdl'] as const;

  // CR: I'm not sure at all if this logic is actually being used (see QuakeC: items.qc/sigil_touch)
  // get classname() {
  //   // HACK: somewhat shitty hack to not break original Quake maps
  //   if (this.spawnflags === 15) {
  //     return this.constructor.classname + ' (used)';
  //   }
  //
  //   return this.constructor.classname;
  // }

  protected override _declareFields(): void {
    super._declareFields();
    this.noise = 'misc/runekey.wav';
  }

  protected override _precache(): void {
    this.engine.PrecacheSound('misc/runekey.wav');

    for (let i = 0; i < 4; i++) {
      if ((this.spawnflags & (1 << i)) !== 0) {
        this.engine.PrecacheModel((this.constructor as typeof SigilEntity)._models[i]);
        break;
      }
    }
  }

  protected override _pickup(playerEntity: PlayerEntity): boolean {
    this.game.serverflags |= this.spawnflags & 15;
    this.spawnflags = 15; // used in the classname hack

    super._pickup(playerEntity);

    return true;
  }

  protected override _afterTouch(playerEntity: PlayerEntity): void {
    this.solid = solid.SOLID_NOT;
    this.unsetModel();

    const sub = this._sub;
    console.assert(sub !== null, 'SigilEntity requires Sub helper');
    if (sub === null) {
      return;
    }

    // trigger all connected actions
    sub.useTargets(playerEntity);
  }

  override spawn(): void {
    super.spawn();

    const ctor = this.constructor as typeof SigilEntity;
    for (let i = 0; i < 4; i++) {
      if ((this.spawnflags & (1 << i)) !== 0) {
        this.items |= ctor._items[i];
        this.setModel(ctor._models[i]);
        break;
      }
    }

    this.setSize(new Vector(-16.0, -16.0, -24.0), new Vector(16.0, 16.0, 32.0));

    this.netname = 'the rune';
  }
}

/**
 * QUAKED item_health (.3 .3 1) (0 0 0) (32 32 32) rotten megahealth
 * Health box. Normally gives 25 points.
 * Rotten box heals 5-10 points,
 * megahealth will add 100 health, then
 * rot you down to your maximum health limit,
 * one point per second.
 */
@entity
export class HealthItemEntity extends BaseItemEntity {
  static classname = 'item_health';

  static H_NORMAL = 0;
  static H_ROTTEN = 1;
  static H_MEGA = 2;

  protected static readonly _config: Record<number, HealthItemConfiguration> = {
    [HealthItemEntity.H_NORMAL]: {
      model: 'maps/b_bh25.bsp',
      noise: 'items/health1.wav',
      healamount: 25,
      items: 0,
    },
    [HealthItemEntity.H_ROTTEN]: {
      model: 'maps/b_bh10.bsp',
      noise: 'items/r_item1.wav',
      healamount: 15,
      items: 0,
    },
    [HealthItemEntity.H_MEGA]: {
      model: 'maps/b_bh100.bsp',
      noise: 'items/r_item2.wav',
      healamount: 100,
      items: items.IT_SUPERHEALTH,
    },
  };

  @serializable healamount = 0;

  protected get _config(): HealthItemConfiguration {
    return HealthItemEntity._config[this.spawnflags & 3]!;
  }

  protected override _precache(): void {
    this.engine.PrecacheModel(this._config.model);
    this.engine.PrecacheSound(this._config.noise);
  }

  protected override _canPickup(playerEntity: PlayerEntity): boolean {
    return playerEntity.health < (((this.spawnflags & HealthItemEntity.H_MEGA) !== 0) ? 250 : playerEntity.max_health);
  }

  protected override _pickup(playerEntity: PlayerEntity): boolean {
    if (this.items > 0) {
      playerEntity.applyBackpack(this);
    }

    return playerEntity.applyHealth(this.healamount, (this.spawnflags & HealthItemEntity.H_MEGA) !== 0);
  }

  _takeHealth(): void {
    const player = this.owner as PlayerEntity | null;
    console.assert(player !== null, 'Megahealth requires an owning player');
    if (player === null) {
      return;
    }

    if (player.health > player.max_health) {
      player.health--;
      this._scheduleThink(this.game.time + 1.0, () => { this._takeHealth(); });
      return;
    }

    player.items &= ~items.IT_SUPERHEALTH;

    this.owner = null;

    if (this.game.deathmatch === 1) {
      this._scheduleThink(this.game.time + this.regeneration_time, () => { this.regenerate(); });
      return;
    }

    this.remove();
  }

  protected override _afterTouch(playerEntity: PlayerEntity): void {
    const sub = this._sub;
    console.assert(sub !== null, 'HealthItemEntity requires Sub helper');
    if (sub === null) {
      return;
    }

    this.solid = solid.SOLID_NOT;
    this._model_original = this.model;
    this.model = null;
    this.owner = playerEntity;

    // trigger all connected actions
    sub.useTargets(playerEntity);

    // chipping away the player's health when mega is running
    if ((this.spawnflags & HealthItemEntity.H_MEGA) !== 0) {
      this._scheduleThink(this.game.time + 5.0, () => { this._takeHealth(); });
    } else {
      this.remove();
    }
  }

  override spawn(): void {
    console.assert(
      [HealthItemEntity.H_NORMAL, HealthItemEntity.H_MEGA, HealthItemEntity.H_ROTTEN].includes(this.spawnflags & 3),
      'Spawnflags are not set correctly',
    );

    this.regeneration_time = 20;
    this.noise = this._config.noise;
    this.model = this._config.model;
    this.setModel(this.model);
    this.healamount = this._config.healamount;
    this.items = this._config.items;

    this.netname = `${this.healamount} health`;

    super.spawn();
  }
}

@entity
export abstract class BaseArmorEntity extends BaseItemEntity {
  static _armortype = 0;
  static _armorvalue = 0;
  static _item = 0;
  static _skin = 0;

  static override _precache(engineAPI: ServerEngineAPI): void {
    engineAPI.PrecacheSound('items/armor1.wav'); // armor up
    engineAPI.PrecacheModel('progs/armor.mdl');
  }

  protected override _pickup(playerEntity: PlayerEntity): boolean {
    const thisClass = this.constructor as typeof BaseArmorEntity;

    playerEntity.armortype = thisClass._armortype;
    playerEntity.armorvalue = thisClass._armorvalue;

    playerEntity.items &= ~(items.IT_ARMOR1 | items.IT_ARMOR2 | items.IT_ARMOR3);
    playerEntity.applyBackpack(this);

    return true;
  }

  protected override _canPickup(playerEntity: PlayerEntity): boolean {
    const thisClass = this.constructor as typeof BaseArmorEntity;

    return playerEntity.armortype * playerEntity.armorvalue < thisClass._armortype * thisClass._armorvalue;
  }

  override spawn(): void {
    super.spawn();

    const thisClass = this.constructor as typeof BaseArmorEntity;

    this.skin = thisClass._skin;
    this.items = thisClass._item;

    this.noise = 'items/armor1.wav';

    this.regeneration_time = 20;

    this.setModel('progs/armor.mdl');
    this.setSize(new Vector(-16.0, -16.0, 0.0), new Vector(16.0, 16.0, 56.0));

    this.netname = 'the armor';
  }
}

/**
 * QUAKED item_armor1 (0 .5 .8) (-16 -16 0) (16 16 32)
 */
@entity
export class LightArmorEntity extends BaseArmorEntity {
  static classname = 'item_armor1';

  static _armortype = 0.3;
  static _armorvalue = 100;
  static _item = items.IT_ARMOR1;
  static _skin = 0;
}

/**
 * QUAKED item_armor2 (0 .5 .8) (-16 -16 0) (16 16 32)
 */
@entity
export class StrongArmorEntity extends BaseArmorEntity {
  static classname = 'item_armor2';

  static _armortype = 0.6;
  static _armorvalue = 150;
  static _item = items.IT_ARMOR2;
  static _skin = 1;
}

/**
 * QUAKED item_armorInv (0 .5 .8) (-16 -16 0) (16 16 32)
 */
@entity
export class HeavyArmorEntity extends BaseArmorEntity {
  static classname = 'item_armorInv';

  static _armortype = 0.8;
  static _armorvalue = 200;
  static _item = items.IT_ARMOR3;
  static _skin = 2;
}

@entity
export abstract class BaseWeaponEntity extends BaseItemEntity {
  static _model: string | null = null;
  static _weapon: items | 0 = 0;
  static _pickupSound = 'weapons/pkup.wav';

  protected override _precache(): void {
    const thisClass = this.constructor as typeof BaseWeaponEntity;

    console.assert(thisClass._model !== null, 'Weapon items must define a model');
    if (thisClass._model === null) {
      return;
    }

    this.engine.PrecacheModel(thisClass._model);
    this.engine.PrecacheSound(thisClass._pickupSound);
  }

  override spawn(): void {
    const thisClass = this.constructor as typeof BaseWeaponEntity;

    console.assert(thisClass._model !== null, 'Weapon items must define a model');
    if (thisClass._model === null) {
      return;
    }

    this.noise = thisClass._pickupSound;
    this.items = thisClass._weapon;
    this.weapon = thisClass._weapon;
    this.regeneration_time = 30.0;
    this.setModel(thisClass._model);
    this.setSize(new Vector(-16.0, -16.0, 0.0), new Vector(16.0, 16.0, 56.0));

    this.netname = itemNames[thisClass._weapon] ?? thisClass.classname;

    super.spawn();
  }
}

/**
 * QUAKED weapon_supershotgun (0 .5 .8) (-16 -16 0) (16 16 32)
 */
@entity
export class WeaponSuperShotgun extends BaseWeaponEntity {
  static classname = 'weapon_supershotgun';

  static _model = 'progs/g_shot.mdl';
  static _weapon = items.IT_SUPER_SHOTGUN;

  override spawn(): void {
    this.ammo_shells = 5;
    super.spawn();
  }
}

/**
 * QUAKED weapon_nailgun (0 .5 .8) (-16 -16 0) (16 16 32)
 */
@entity
export class WeaponNailgun extends BaseWeaponEntity {
  static classname = 'weapon_nailgun';

  static _model = 'progs/g_nail.mdl';
  static _weapon = items.IT_NAILGUN;

  override spawn(): void {
    this.ammo_nails = 30;
    super.spawn();
  }
}

/**
 * QUAKED weapon_supernailgun (0 .5 .8) (-16 -16 0) (16 16 32)
 */
@entity
export class WeaponSuperNailgun extends BaseWeaponEntity {
  static classname = 'weapon_supernailgun';

  static _model = 'progs/g_nail2.mdl';
  static _weapon = items.IT_SUPER_NAILGUN;

  override spawn(): void {
    this.ammo_nails = 30;
    super.spawn();
  }
}

/**
 * QUAKED weapon_grenadelauncher (0 .5 .8) (-16 -16 0) (16 16 32)
 */
@entity
export class WeaponGrenadeLauncher extends BaseWeaponEntity {
  static classname = 'weapon_grenadelauncher';

  static _model = 'progs/g_rock.mdl';
  static _weapon = items.IT_GRENADE_LAUNCHER;

  override spawn(): void {
    this.ammo_rockets = 5;
    super.spawn();
  }
}

/**
 * QUAKED weapon_rocketlauncher (0 .5 .8) (-16 -16 0) (16 16 32)
 */
@entity
export class WeaponRocketLauncher extends BaseWeaponEntity {
  static classname = 'weapon_rocketlauncher';

  static _model = 'progs/g_rock2.mdl';
  static _weapon = items.IT_ROCKET_LAUNCHER;

  override spawn(): void {
    this.ammo_rockets = 5;
    super.spawn();
  }
}

/**
 * QUAKED weapon_lightning (0 .5 .8) (-16 -16 0) (16 16 32)
 */
@entity
export class WeaponThunderbolt extends BaseWeaponEntity {
  static classname = 'weapon_lightning';

  static _model = 'progs/g_light.mdl';
  static _weapon = items.IT_LIGHTNING;

  override spawn(): void {
    this.ammo_cells = 15;
    super.spawn();
  }
}
