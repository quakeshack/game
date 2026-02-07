
import { GibEntity, InfoPlayerStart, InfoPlayerStart2, InfoPlayerStartCoop, InfoPlayerStartDeathmatch, PlayerEntity, TelefragTriggerEntity } from './entity/Player.mjs';
import { BodyqueEntity, WorldspawnEntity } from './entity/Worldspawn.mjs';
import { spawnflags } from './Defs.mjs';
import * as misc from './entity/Misc.mjs';
import * as door from './entity/props/Doors.mjs';
import * as platform from './entity/props/Platforms.mjs';
import * as trigger from './entity/Triggers.mjs';
import { ArmySoldierMonster, ArmyEnforcerMonster } from './entity/monster/Soldier.mjs';
import { GameAI } from './helper/AI.mjs';
import * as sub from './entity/Subs.mjs';
import { ButtonEntity } from './entity/props/Buttons.mjs';
import * as item from './entity/Items.mjs';
import BaseEntity from './entity/BaseEntity.mjs';
import * as weapon from './entity/Weapons.mjs';
import DogMonsterEntity from './entity/monster/Dog.mjs';
import { Serializer } from './helper/MiscHelpers.mjs';
import DemonMonster from './entity/monster/Demon.mjs';
import { MeatSprayEntity } from './entity/monster/BaseMonster.mjs';
import ZombieMonster, { ZombieGibGrenade } from './entity/monster/Zombie.mjs';
import { KnightMonster, HellKnightMonster, KnightSpike } from './entity/monster/Knights.mjs';
import OgreMonsterEntity from './entity/monster/Ogre.mjs';
import ShalrathMonsterEntity, { ShalrathMissileEntity } from './entity/monster/Shalrath.mjs';
import ShamblerMonsterEntity from './entity/monster/Shambler.mjs';
import TarbabyMonsterEntity from './entity/monster/Tarbaby.mjs';
import FishMonsterEntity from './entity/monster/Fish.mjs';
import WizardMonsterEntity, { WizardMissile } from './entity/monster/Wizard.mjs';
import { BossLavaball, BossMonster, EventLightningEntity } from './entity/monster/Boss.mjs';
import OldOneMonster from './entity/monster/OldOne.mjs';
import GameStats from './helper/GameStats.mjs';
import EntityRegistry from './helper/Registry.mjs';

/** @typedef {import('../../shared/GameInterfaces').ServerGameInterface} ServerGameInterface */
/** @typedef {import('../../shared/GameInterfaces').EdictData} EdictData */
/** @typedef {import('../../shared/GameInterfaces').ServerEdict} ServerEdict */
/** @typedef {import("../../shared/GameInterfaces").ServerEngineAPI} ServerEngineAPI */
/** @typedef {import("../../shared/GameInterfaces").Cvar} Cvar */
/** @typedef {import('../../shared/GameInterfaces').ServerInfoField} ServerInfoField */
/** @typedef {import('../../shared/GameInterfaces').MapDetails} MapDetails */

/** @typedef {Record<string, Cvar|null>} CvarMap */

export const featureFlags = [
  // 'correct-ballistic-grenades', // enables zombie gib and ogre grenade trajectory fix
  'improved-gib-physics', // enables improved gib physics
  // 'draw-bullet-hole-decals', // enables handling decal events upon bullet impacts
];

/**
 * List of all entity classes.
 * @type {(typeof BaseEntity)[]}
 */
export const entityClasses = [
  WorldspawnEntity,
  BodyqueEntity,
  PlayerEntity,

  misc.NullEntity,
  misc.InfoNotNullEntity,
  misc.IntermissionCameraEntity,

  InfoPlayerStart,
  InfoPlayerStart2,
  InfoPlayerStartCoop,
  InfoPlayerStartDeathmatch,
  GibEntity,
  MeatSprayEntity,

  weapon.Missile,
  weapon.Spike,
  weapon.Superspike,
  weapon.Grenade,
  weapon.Laser,

  misc.ViewthingEntity,
  misc.DebugMarkerEntity,

  misc.LightEntity,
  misc.LightFluorosparkEntity,
  misc.LightFluoroEntity,
  misc.SmallWalltorchLightEntity,
  misc.YellowLargeFlameLightEntity,
  misc.YellowSmallFlameLightEntity,
  misc.WhiteSmallFlameLightEntity,
  misc.LightGlobeEntity,
  misc.LightGlobeDynamicEntity,

  misc.FireballSpawnerEntity,
  misc.FireballEntity,

  misc.AmbientCompHum,
  misc.AmbientDrone,
  misc.AmbientSuckWind,
  misc.AmbientFlouroBuzz,
  misc.AmbientDrip,
  misc.AmbientThunder,
  misc.AmbientLightBuzz,
  misc.AmbientSwamp1,
  misc.AmbientSwamp2,

  misc.WallEntity,
  misc.IllusionaryWallEntity,
  misc.EpisodegateWallEntity,
  misc.BossgateWallEntity,

  misc.PathCornerEntity,

  misc.TeleportEffectEntity,
  misc.BubbleEntity,
  misc.BubbleSpawnerEntity,
  misc.StaticBubbleSpawnerEntity,

  misc.BarrelEntity,
  misc.SmallBarrelEntity,

  misc.TrapShooterEntity,
  misc.TrapSpikeshooterEntity,

  trigger.MultipleTriggerEntity,
  trigger.InfoTeleportDestination,
  trigger.TeleportTriggerEntity,
  trigger.SecretTriggerEntity,
  trigger.OnceTriggerEntity,
  trigger.RelayTriggerEntity,
  trigger.CountTriggerEntity,
  trigger.OnlyRegisteredTriggerEntity,
  trigger.SetSkillTriggerEntity,
  trigger.ChangeLevelTriggerEntity,
  trigger.TriggerHurtEntity,
  trigger.TriggerPushEntity,
  trigger.TriggerMonsterjumpEntity,

  TelefragTriggerEntity,

  ArmySoldierMonster,
  ArmyEnforcerMonster,
  DogMonsterEntity,
  DemonMonster,
  ZombieMonster,
  ZombieGibGrenade,
  KnightMonster,
  HellKnightMonster,
  KnightSpike,
  OgreMonsterEntity,
  ShalrathMonsterEntity,
  ShalrathMissileEntity,
  ArmyEnforcerMonster,
  ShamblerMonsterEntity,
  TarbabyMonsterEntity,
  FishMonsterEntity,
  WizardMonsterEntity,
  WizardMissile,
  BossMonster,
  BossLavaball,
  EventLightningEntity,
  OldOneMonster,

  door.DoorEntity,
  door.SecretDoorEntity,

  platform.PlatformEntity,
  platform.PlatformTriggerEntity,
  platform.TrainEntity,
  platform.TeleportTrainEntity,

  ButtonEntity,

  sub.TriggerFieldEntity,
  sub.DelayedThinkEntity,

  item.BackpackEntity,
  item.ItemShellsEntity,
  item.ItemSpikesEntity,
  item.ItemRocketsEntity,
  item.ItemCellsEntity,

  item.GoldKeyEntity,
  item.SilverKeyEntity,

  item.InvisibilityEntity,
  item.InvulnerabilityEntity,
  item.RadsuitEntity,
  item.SuperDamageEntity,

  item.SigilEntity,

  item.HealthItemEntity,
  item.HeavyArmorEntity,
  item.LightArmorEntity,
  item.StrongArmorEntity,

  item.WeaponSuperShotgun,
  item.WeaponGrenadeLauncher,
  item.WeaponNailgun,
  item.WeaponSuperNailgun,
  item.WeaponRocketLauncher,
  item.WeaponThunderbolt,

  misc.MiscModelEntity,
];

/** @augments ServerGameInterface */
export class ServerGameAPI {
  /** @access package */
  static _entityRegistry = new EntityRegistry(entityClasses);

  /**
   * Cvar cache, defined by the game code
   * @type {CvarMap}
   */
  static _cvars = {
    nomonster: null,
    fraglimit: null,
    timelimit: null,
    samelevel: null,
    noexit: null,
    skill: null,
    deathmatch: null,
    coop: null,
  };

  _newGameStats() {
    return new GameStats(this, this.engine);
  }

  _newGameAI() {
    return new GameAI(this);
  }

  _lookupCvars() {
    // looking up Cvars defined by the engine
    return /** @type {CvarMap} */({
      teamplay: this.engine.GetCvar('teamplay'),
      gravity: this.engine.GetCvar('sv_gravity'),
    });
  }

  /**
   * Invoked by spawning a server or a changelevel. It will initialize the global game state.
   * @param {ServerEngineAPI} engineAPI engine exports
   */
  constructor(engineAPI) {
    this._serializer = new Serializer(this, engineAPI);

    /** @type {ServerEngineAPI} */
    this.engine = engineAPI;

    this._serializer.startFields();

    this.mapname = null; // Engine API

    this.force_retouch = 0; // Engine API

    // stats
    this.stats = this._newGameStats();

    // checkout Player.decodeLevelParms to understand this
    this.parm1 = 0;
    this.parm2 = 0;
    this.parm3 = 0;
    this.parm4 = 0;
    this.parm5 = 0;
    this.parm6 = 0;
    this.parm7 = 0;
    this.parm8 = 0;
    this.parm9 = 0;
    this.parm10 = 0;
    this.parm11 = 0;
    this.parm12 = 0;
    this.parm13 = 0;
    this.parm14 = 0;
    this.parm15 = 0;
    this.parm16 = 0;

    this.serverflags = 0;

    this.time = 0;
    this.framecount = 0;
    this.frametime = 0;

    /** @type {?WorldspawnEntity} QuakeC: world */
    this.worldspawn = null;

    /** @type {?BaseEntity} the last selected spawn point, used for cycling spawn spots */
    this.lastspawn = null;

    // game state related
    this.gameover = false;
    /** @type {number} intermission state (0 = off) */
    this.intermission_running = 0;
    /** @type {number} time when intermission is over */
    this.intermission_exittime = 0.0;
    /** @type {?string} next map name */
    this.nextmap = null;

    this._serializer.endFields();

    this.gameAI = this._newGameAI();

    /** @type {?BodyqueEntity} holds the dead player body chain */
    this.bodyque_head = null;

    /** @private */
    this._missingEntityClassStats = {};

    // FIXME: I’m not happy about this structure, especially with the getters down below
    /** cvar cache @protected */
    this._cvars = this._lookupCvars();
  }

  get skill() {
    const cvars = /** @type {typeof ServerGameAPI} */(this.constructor)._cvars;
    return cvars.skill.value;
  }

  get teamplay() {
    return this._cvars.teamplay.value;
  }

  get timelimit() {
    const cvars = /** @type {typeof ServerGameAPI} */(this.constructor)._cvars;
    return cvars.timelimit.value;
  }

  get fraglimit() {
    const cvars = /** @type {typeof ServerGameAPI} */(this.constructor)._cvars;
    return cvars.fraglimit.value;
  }

  get deathmatch() {
    const cvars = /** @type {typeof ServerGameAPI} */(this.constructor)._cvars;
    return cvars.deathmatch.value;
  }

  get coop() {
    const cvars = /** @type {typeof ServerGameAPI} */(this.constructor)._cvars;
    return cvars.coop.value;
  }

  get samelevel() {
    const cvars = /** @type {typeof ServerGameAPI} */(this.constructor)._cvars;
    return cvars.samelevel.value;
  }

  get noexit() {
    const cvars = /** @type {typeof ServerGameAPI} */(this.constructor)._cvars;
    return cvars.noexit.value;
  }

  get nomonsters() {
    const cvars = /** @type {typeof ServerGameAPI} */(this.constructor)._cvars;
    return cvars.nomonster.value;
  }

  get gravity() {
    return this._cvars.gravity.value;
  }

  hasFeature(feature) {
    return featureFlags.includes(feature);
  }

  startFrame() {
    this.framecount++;
  }

  PlayerPreThink(/** @type {ServerEdict} */ clientEdict) {
    const playerEntity = /** @type {PlayerEntity} */(clientEdict.entity);
    playerEntity.playerPreThink();
  }

  PlayerPostThink(/** @type {ServerEdict} */ clientEdict) {
    const playerEntity = /** @type {PlayerEntity} */(clientEdict.entity);
    playerEntity.playerPostThink();
  }

  ClientConnect(/** @type {ServerEdict} */ clientEdict) {
    const playerEntity = /** @type {PlayerEntity} */(clientEdict.entity);
    playerEntity.connected();
  }

  ClientDisconnect(/** @type {ServerEdict} */ clientEdict) {
    const playerEntity = /** @type {PlayerEntity} */(clientEdict.entity);
    playerEntity.disconnected();
  }

  ClientKill(/** @type {ServerEdict} */ clientEdict) {
    const playerEntity = /** @type {PlayerEntity} */(clientEdict.entity);
    playerEntity.suicide();
  }

  PutClientInServer(/** @type {ServerEdict} */ clientEdict) {
    const playerEntity = /** @type {PlayerEntity} */(clientEdict.entity);
    playerEntity.putPlayerInServer();
  }

  /**
   * Exit deathmatch games upon conditions.
   * @param {PlayerEntity} playerEntity player
   */
  checkRules(playerEntity) {
    if (this.gameover) {
      return; // someone else quit the game already
    }

    if (this.timelimit > 0 && this.time >= this.timelimit * 60) {
      this.gameover = true;
      this.engine.BroadcastPrint('Timelimit reached.\n');
      this.loadNextMap();
      return;
    }

    if (this.fraglimit > 0 && playerEntity.frags > this.fraglimit) {
      this.gameover = true;
      this.engine.BroadcastPrint(`${playerEntity.netname} triggered the fraglimit.\n`);
      this.loadNextMap();
      return;
    }
  }

  /**
   * Will load next map.
   * @param {?string} nextmap next map (default: this.nextmap)
   */
  loadNextMap(nextmap = this.nextmap) {
    if (!nextmap || this.samelevel) {
      this.engine.ChangeLevel(this.mapname);
      return;
    }

    this.engine.ChangeLevel(nextmap);
  }

  /**
   * @param {PlayerEntity} playerEntity player
   */
  sendMissingEntitiesToPlayer(playerEntity) {
    const stats = Object.entries(this._missingEntityClassStats);
    if (stats.length > 0) {
      stats.sort(([, a], [, b]) => b - a);
      playerEntity.consolePrint('Unknown entity classes on this map:\n');
      for (const [name, cnt] of stats) {
        playerEntity.consolePrint(`${new Number(cnt).toFixed(0).padStart(4, ' ')}x ${name}\n`);
      }
    }
  }

  startIntermission() {
    if (this.intermission_running) {
      return;
    }

    this.intermission_running = 1;
    this.intermission_exittime = this.time + (this.deathmatch ? 5.0 : 2.0); // 5s for dm games

    this.engine.PlayTrack(3); // TODO: client responsibility

    for (const player of this.engine.FindAllByFieldAndValue('classname', PlayerEntity.classname)) {
      const playerEntity = /** @type {PlayerEntity} */(player.entity);
      playerEntity.startIntermission();
    }
  }

  /**
   * Determine whether preparing an entity is allowed based e.g. on spawnflags and game mode.
   * @param {string} classname entity classname
   * @param {EdictData} initialData key-value initial data coming from the map
   * @returns {boolean} true if the entity was successfully prepared
   * @protected
   */
  _isPreparingEntityAllowed(classname, initialData) {
    const sflags = +initialData.spawnflags || 0;

    if (this.deathmatch && (sflags & spawnflags.SPAWNFLAG_NOT_DEATHMATCH)) { // no spawn in deathmatch
      return false;
    }

    if (this.skill === 0 && (sflags & spawnflags.SPAWNFLAG_NOT_EASY)) {
      return false;
    }

    if (this.skill === 1 && (sflags & spawnflags.SPAWNFLAG_NOT_MEDIUM)) {
      return false;
    }

    if (this.skill >= 2 && (sflags & spawnflags.SPAWNFLAG_NOT_HARD)) {
      return false;
    }

    return true;
  }

  /**
   * @param {ServerEdict} edict edict to be prepared
   * @param {string} classname entity classname
   * @param {EdictData} initialData key-value initial data coming from the map
   * @returns {boolean} true if the entity was successfully prepared
   */
  prepareEntity(edict, classname, initialData = {}) {
    const entityRegistry = /** @type {typeof ServerGameAPI} */(this.constructor)._entityRegistry;

    if (!entityRegistry.has(classname)) {
      this.engine.ConsoleWarning(`ServerGameAPI.prepareEntity: no entity factory for ${classname}!\n`);

      this._missingEntityClassStats[classname] = (this._missingEntityClassStats[classname] || 0) + 1;
      return false;
    }

    // spawnflags (control whether to spawn an entity or not)
    if (!this._isPreparingEntityAllowed(classname, initialData)) {
      return false;
    }

    const entityClass = entityRegistry.get(classname);
    const entity = edict.entity?.classname === classname ? edict.entity : new entityClass(edict, this);

    entity.assignInitialData(initialData);

    // @ts-ignore: skipping the ReadOnly restriction for entity assignment
    edict.entity = entity;

    return true;
  }

  /**
   * @param {ServerEdict} edict edict to be prepared
   * @returns {boolean} true if the entity was successfully spawned
   */
  spawnPreparedEntity(edict) {
    if (!edict.entity) {
      this.engine.ConsoleError('ServerGameAPI.prepareEntity: no entity class instance set!\n');
      return false;
    }

    edict.entity.spawn();

    return true;
  }

  /**
   * @returns {ServerInfoField[]} server info fields
   */
  static GetServerInfoFields() {
    return [
      { name: 'nomonster', label: 'Do not spawn monsters', type: 'boolean' },
      { name: 'noexit', label: 'Level cannot be exited', type: 'boolean' },
      { name: 'samelevel', label: 'Exit will lead to the same map', type: 'boolean' },
      { name: 'skill', label: 'Game skill level', type: 'enum', enumValues: { '0': 'Easy', '1': 'Medium', '2': 'Hard', '3': 'Nightmare' } },
      { name: 'deathmatch', label: 'Deathmatch mode', type: 'boolean' },
      { name: 'coop', label: 'Cooperative mode', type: 'boolean' },
      { name: 'timelimit', label: 'Time limit (minutes)', type: 'number' },
      { name: 'fraglimit', label: 'Frag limit', type: 'number' },
    ];
  };

  /**
   * @returns {MapDetails[]} map list
   */
  static GetMapList() {
    // TODO: add the corresponding pictures and names
    return [
      { name: 'start', label: 'Start Map', maxplayers: 4, pictures: [] },
      { name: 'dm1', label: 'DM1', maxplayers: 4, pictures: [] },
      { name: 'dm2', label: 'DM2', maxplayers: 4, pictures: [] },
      { name: 'dm3', label: 'DM3', maxplayers: 4, pictures: [] },
      { name: 'dm4', label: 'DM4', maxplayers: 4, pictures: [] },
      { name: 'dm5', label: 'DM5', maxplayers: 4, pictures: [] },
      { name: 'dm6', label: 'DM6', maxplayers: 4, pictures: [] },
      { name: 'e1m1', label: 'E1M1', maxplayers: 4, pictures: [] },
      { name: 'e1m2', label: 'E1M2', maxplayers: 4, pictures: [] },
      { name: 'e1m3', label: 'E1M3', maxplayers: 4, pictures: [] },
      { name: 'e1m4', label: 'E1M4', maxplayers: 4, pictures: [] },
      { name: 'e1m5', label: 'E1M5', maxplayers: 4, pictures: [] },
      { name: 'e1m6', label: 'E1M6', maxplayers: 4, pictures: [] },
      { name: 'e1m7', label: 'E1M7', maxplayers: 4, pictures: [] },
      { name: 'e1m8', label: 'E1M8', maxplayers: 4, pictures: [] },
      { name: 'e2m1', label: 'E2M1', maxplayers: 4, pictures: [] },
      { name: 'e2m2', label: 'E2M2', maxplayers: 4, pictures: [] },
      { name: 'e2m3', label: 'E2M3', maxplayers: 4, pictures: [] },
      { name: 'e2m4', label: 'E2M4', maxplayers: 4, pictures: [] },
      { name: 'e2m5', label: 'E2M5', maxplayers: 4, pictures: [] },
      { name: 'e2m6', label: 'E2M6', maxplayers: 4, pictures: [] },
      { name: 'e2m7', label: 'E2M7', maxplayers: 4, pictures: [] },
      { name: 'e3m1', label: 'E3M1', maxplayers: 4, pictures: [] },
      { name: 'e3m2', label: 'E3M2', maxplayers: 4, pictures: [] },
      { name: 'e3m3', label: 'E3M3', maxplayers: 4, pictures: [] },
      { name: 'e3m4', label: 'E3M4', maxplayers: 4, pictures: [] },
      { name: 'e3m5', label: 'E3M5', maxplayers: 4, pictures: [] },
      { name: 'e3m6', label: 'E3M6', maxplayers: 4, pictures: [] },
      { name: 'e3m7', label: 'E3M7', maxplayers: 4, pictures: [] },
      { name: 'e4m1', label: 'E4M1', maxplayers: 4, pictures: [] },
      { name: 'e4m2', label: 'E4M2', maxplayers: 4, pictures: [] },
      { name: 'e4m3', label: 'E4M3', maxplayers: 4, pictures: [] },
      { name: 'e4m4', label: 'E4M4', maxplayers: 4, pictures: [] },
      { name: 'e4m5', label: 'E4M5', maxplayers: 4, pictures: [] },
      { name: 'e4m6', label: 'E4M6', maxplayers: 4, pictures: [] },
      { name: 'e4m7', label: 'E4M7', maxplayers: 4, pictures: [] },
      { name: 'e4m8', label: 'E4M8', maxplayers: 4, pictures: [] },
    ];
  }

  getClientEntityFields() {
    return /** @type {typeof ServerGameAPI} */(this.constructor)._entityRegistry.getClientEntityFields();
  }

  _precacheResources() {
    /** @type {typeof ServerGameAPI} */(this.constructor)._entityRegistry.precacheAll(this.engine);
  }

  /**
   * Initialize the server game code.
   * @param {string} mapname map name
   * @param {number} serverflags server flags
   */
  init(mapname, serverflags) {
    const cvars = /** @type {typeof ServerGameAPI} */(this.constructor)._cvars;

    this.mapname = mapname;
    this.serverflags = serverflags;

    // coop automatically disables deathmatch
    if (cvars.coop.value) {
      cvars.coop.set(true);
      cvars.deathmatch.set(false);
    }

    // make sure skill is in range
    cvars.skill.set(Math.max(0, Math.min(3, Math.floor(cvars.skill.value))));

    // make sure stats are resubscribed
    this.stats.subscribeToEvents();

    // precache all resources
    this._precacheResources();
  }

  // eslint-disable-next-line no-unused-vars
  shutdown(isCrashShutdown) {
    this.bodyque_head = null;
    this.worldspawn = null;
    this.lastspawn = null;
  }

  /** @param {ServerEngineAPI} ServerEngineAPI engine API for server game code */
  static Init(ServerEngineAPI) {
    const cvars = this._cvars;

    // define game cvars
    cvars.nomonster = ServerEngineAPI.RegisterCvar('nomonster', '0', /* Cvar.FLAG.DEFERRED */ 0, 'Do not spawn monsters.');
    cvars.samelevel = ServerEngineAPI.RegisterCvar('samelevel', '0', 0, 'Set to 1 to stay on the same map even the map is over');
    cvars.fraglimit = ServerEngineAPI.RegisterCvar('fraglimit', '0');
    cvars.timelimit = ServerEngineAPI.RegisterCvar('timelimit', '0');
    cvars.noexit = ServerEngineAPI.RegisterCvar('noexit', '0');
    cvars.skill = ServerEngineAPI.RegisterCvar('skill', '1');
    cvars.deathmatch = ServerEngineAPI.RegisterCvar('deathmatch', '0');
    cvars.coop = ServerEngineAPI.RegisterCvar('coop', '0');

    // initialize all entity classes
    this._entityRegistry.initializeAll(ServerEngineAPI);
  }

  static Shutdown() {
    const cvars = this._cvars;

    // free all cvars
    for (const [key, cvar] of Object.entries(cvars).filter((cvar) => cvar !== null)) {
      cvar.free();
      cvars[key] = null;
    }
  }

  serialize() {
    return this._serializer.serialize();
  }

  deserialize(data) {
    this._serializer.deserialize(data);
  }
};
