import {
  attn,
  channel,
  content,
  effect,
  flags,
  hull,
  modelFlags,
  moveType,
  solid,
  waterlevel,
} from '../../shared/Defs.ts';

export {
  attn,
  channel,
  content,
  effect,
  flags,
  hull,
  modelFlags,
  moveType,
  solid,
  waterlevel,
};

/**
 * Range values.
 */
export enum range {
  RANGE_MELEE = 0,
  RANGE_NEAR = 1,
  RANGE_MID = 2,
  RANGE_FAR = 3,
}

/**
 * Deadflag values.
 */
export enum dead {
  DEAD_NO = 0,
  DEAD_DYING = 1,
  DEAD_DEAD = 2,
  DEAD_RESPAWNABLE = 3,
}

/**
 * Takedamage values.
 */
export enum damage {
  DAMAGE_NO = 0,
  DAMAGE_YES = 1,
  DAMAGE_AIM = 2,
}

/**
 * Player items and weapons.
 */
export enum items {
  IT_AXE = 4096,
  IT_SHOTGUN = 1,
  IT_SUPER_SHOTGUN = 2,
  IT_NAILGUN = 4,
  IT_SUPER_NAILGUN = 8,
  IT_GRENADE_LAUNCHER = 16,
  IT_ROCKET_LAUNCHER = 32,
  IT_LIGHTNING = 64,
  IT_KEY1 = 131072,
  IT_KEY2 = 262144,
  IT_INVISIBILITY = 524288,
  IT_INVULNERABILITY = 1048576,
  IT_SUIT = 2097152,
  IT_QUAD = 4194304,
  IT_SHELLS = 256,
  IT_NAILS = 512,
  IT_ROCKETS = 1024,
  IT_CELLS = 2048,
  IT_ARMOR1 = 8192,
  IT_ARMOR2 = 16384,
  IT_ARMOR3 = 32768,
  IT_SUPERHEALTH = 65536,
  IT_SIGIL1 = 1 << 26,
  IT_SIGIL2 = 1 << 27,
  IT_SIGIL3 = 1 << 28,
  IT_SIGIL4 = 1 << 29,
}

const itemValues = Object.values(items).filter((value): value is items => typeof value === 'number');

/** All items combined into a single bitmask. */
export const allItems = itemValues.reduce((accumulator, value) => accumulator | value, 0);

export const deathType = Object.freeze({
  NONE: null,
  FALLING: 'falling',
} as const);

/**
 * Worldspawn worldtype values.
 */
export enum worldType {
  MEDIEVAL = 0,
  RUNES = 1,
  BASE = 2,
}

/**
 * Temporary entity types used for client-side transient effects.
 */
export enum tentType {
  TE_SPIKE = 0,
  TE_SUPERSPIKE = 1,
  TE_GUNSHOT = 2,
  TE_EXPLOSION = 3,
  TE_TAREXPLOSION = 4,
  TE_LIGHTNING1 = 5,
  TE_LIGHTNING2 = 6,
  TE_WIZSPIKE = 7,
  TE_KNIGHTSPIKE = 8,
  TE_LIGHTNING3 = 9,
  TE_LAVASPLASH = 10,
  TE_TELEPORT = 11,
}

/**
 * Indexed palette colors used by gore and HUD effects.
 */
export enum colors {
  DUST = 0,
  BLOOD = 73,
  FIRE = 75,
  SPARK = 225,
  HUD_AMMO_NORMAL = 240,
  HUD_AMMO_WARNING = 250,
  HUD_CSHIFT_BONUSFLASH = 192,
  HUD_CSHIFT_DAMAGE = 193,
  HUD_CSHIFT_SECRET = 128,
  HUD_CSHIFT_POWERUP_QUAD = 208,
  HUD_CSHIFT_POWERUP_INVULN = 250,
  HUD_CSHIFT_POWERUP_SUIT = 192,
  HUD_CSHIFT_POWERUP_INVIS = 15,
  HUD_RANKING_TEXT = 240,
  HUD_RANKING_BACKGROUND = 16,
}

/**
 * Spawnflag bit values.
 */
export enum spawnflags {
  SPAWNFLAG_NOT_EASY = 256,
  SPAWNFLAG_NOT_MEDIUM = 512,
  SPAWNFLAG_NOT_HARD = 1024,
  SPAWNFLAG_NOT_DEATHMATCH = 2048,
}

/**
 * Decal identifiers.
 */
export enum decals {
  DECAL_BULLETHOLE = 1,
  DECAL_AXEHIT = 2,
}

/**
 * Client event opcodes emitted by the game code.
 */
export enum clientEvent {
  BONUS_FLASH = 1,
  DAMAGE_FLASH = 2,
  STATS_UPDATED = 3,
  STATS_INIT = 4,
  ITEM_PICKED = 5,
  WEAPON_SELECTED = 6,
  OBITUARY = 7,
  INTERMISSION_START = 8,
  EMIT_DECAL = 9,
  DAMAGE_RECEIVED = 99,
  TEST_EVENT = 254,
}

/**
 * Return the client event bus topic for a client event opcode.
 * @returns The client event topic string.
 */
export function clientEventName(eventId: number): string {
  return `client.event-received.${eventId}`;
}

/**
 * Content shift slots used by the client HUD.
 */
export enum contentShift {
  damage = 0,
  bonus = 1,
  powerup = 2,
  info = 3,
}
