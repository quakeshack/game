import type {
  Cvar,
  EdictData,
  MapDetails,
  SerializedData,
  ServerEdict,
  ServerEngineAPI,
  ServerInfoField,
  StartServerListEntry,
} from '../../shared/GameInterfaces.ts';

import { GibEntity, InfoPlayerStart, InfoPlayerStart2, InfoPlayerStartCoop, InfoPlayerStartDeathmatch, PlayerEntity, TelefragTriggerEntity } from './entity/Player.ts';
import { BodyqueEntity, WorldspawnEntity } from './entity/Worldspawn.ts';
import { spawnflags } from './Defs.ts';
import * as misc from './entity/Misc.ts';
import * as door from './entity/props/Doors.ts';
import * as platform from './entity/props/Platforms.ts';
import * as trigger from './entity/Triggers.ts';
import { ButtonEntity } from './entity/props/Buttons.ts';
import { ArmySoldierMonster, ArmyEnforcerMonster } from './entity/monster/Soldier.ts';
import { GameAI } from './helper/AI.ts';
import * as sub from './entity/Subs.ts';
import * as item from './entity/Items.ts';
import BaseEntity from './entity/BaseEntity.ts';
import * as weapon from './entity/Weapons.ts';
import DogMonsterEntity from './entity/monster/Dog.ts';
import { serializableObject, serializable, Serializer, type SerializableRecord } from './helper/MiscHelpers.ts';
import DemonMonster from './entity/monster/Demon.ts';
import { MeatSprayEntity } from './entity/monster/BaseMonster.ts';
import ZombieMonster, { ZombieGibGrenade } from './entity/monster/Zombie.ts';
import { KnightMonster, HellKnightMonster, KnightSpike } from './entity/monster/Knights.ts';
import OgreMonsterEntity from './entity/monster/Ogre.ts';
import ShalrathMonsterEntity, { ShalrathMissileEntity } from './entity/monster/Shalrath.ts';
import ShamblerMonsterEntity from './entity/monster/Shambler.ts';
import TarbabyMonsterEntity from './entity/monster/Tarbaby.ts';
import FishMonsterEntity from './entity/monster/Fish.ts';
import WizardMonsterEntity, { WizardMissile } from './entity/monster/Wizard.ts';
import { BossLavaball, BossMonster, EventLightningEntity } from './entity/monster/Boss.ts';
import OldOneMonster from './entity/monster/OldOne.ts';
import GameStats from './helper/GameStats.ts';
import EntityRegistry from './helper/Registry.ts';
import type { EntityClass } from './entity/BaseEntity.ts';
import * as miscProps from './entity/props/Misc.ts';

type FeatureFlag = 'correct-ballistic-grenades' | 'draw-bullet-hole-decals' | 'improved-gib-physics';

interface GameDefinedCvarMap {
  nomonster: Cvar | null;
  fraglimit: Cvar | null;
  timelimit: Cvar | null;
  samelevel: Cvar | null;
  noexit: Cvar | null;
  skill: Cvar | null;
  deathmatch: Cvar | null;
  coop: Cvar | null;
}

interface EngineCvarMap {
  teamplay: Cvar | null;
  gravity: Cvar | null;
  nextmap: Cvar | null;
}

type MutableServerEdict = Omit<ServerEdict, 'entity'> & {
  entity: BaseEntity | null;
};

export const featureFlags: FeatureFlag[] = [
  // 'correct-ballistic-grenades', // enables zombie gib and ogre grenade trajectory fix
  'improved-gib-physics',
  // 'draw-bullet-hole-decals', // enables handling decal events upon bullet impacts
];

export const entityClasses: readonly EntityClass[] = [
  WorldspawnEntity,
  BodyqueEntity,
  PlayerEntity,
  misc.NullEntity,
  misc.InfoNotNullEntity,
  misc.MiscNullEntity,
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
  platform.RotatingEntity,
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
  miscProps.FogEntity,
];

@serializableObject
export class ServerGameAPI {
  static _entityRegistry: EntityRegistry = new EntityRegistry(entityClasses);

  /**
   * Cvar cache defined by the game code.
   */
  static _cvars: GameDefinedCvarMap = {
    nomonster: null,
    fraglimit: null,
    timelimit: null,
    samelevel: null,
    noexit: null,
    skill: null,
    deathmatch: null,
    coop: null,
  };

  _serializer: Serializer<ServerGameAPI>;
  engine: ServerEngineAPI;

  @serializable mapname: string | null;
  @serializable force_retouch: number;
  @serializable stats: GameStats;
  @serializable parm1: number;
  @serializable parm2: number;
  @serializable parm3: number;
  @serializable parm4: number;
  @serializable parm5: number;
  @serializable parm6: number;
  @serializable parm7: number;
  @serializable parm8: number;
  @serializable parm9: number;
  @serializable parm10: number;
  @serializable parm11: number;
  @serializable parm12: number;
  @serializable parm13: number;
  @serializable parm14: number;
  @serializable parm15: number;
  @serializable parm16: number;
  @serializable serverflags: number;
  @serializable time: number;
  @serializable framecount: number;
  @serializable frametime: number;

  /** QuakeC: world. */
  @serializable worldspawn: WorldspawnEntity | null;

  /** The last selected spawn point, used for cycling spawn spots. */
  @serializable lastspawn: BaseEntity | null;
  @serializable gameover: boolean;

  /** Intermission state, 0 means disabled. */
  @serializable intermission_running: number;

  /** Time when the intermission can be exited. */
  @serializable intermission_exittime: number;

  /** Next map name selected for changelevel. */
  @serializable nextmap: string | null;
  gameAI: GameAI;

  /** Holds the dead player body chain. */
  bodyque_head: BodyqueEntity | null;

  _missingEntityClassStats: Record<string, number>;

  /** Engine-owned cvar cache for cross-module lookups. */
  _cvars: EngineCvarMap;

  /** Functions to be called when shutting down the game. */
  _shutdownHooks: Array<() => void>;

  /**
   * Invoked by spawning a server or a changelevel. It will initialize the global game state.
   */
  constructor(engineAPI: ServerEngineAPI) {
    this.engine = engineAPI;

    this.mapname = null;
    this.force_retouch = 0;

    this.stats = this._newGameStats();

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

    this.worldspawn = null;
    this.lastspawn = null;

    this.gameover = false;
    this.intermission_running = 0;
    this.intermission_exittime = 0.0;
    this.nextmap = null;

    this._serializer = new Serializer(this, engineAPI);

    this.gameAI = this._newGameAI();
    this.bodyque_head = null;
    this._missingEntityClassStats = {};
    this._cvars = this._lookupCvars();
    this._shutdownHooks = [];
  }

  _newGameStats(): GameStats {
    return new GameStats(this, this.engine);
  }

  _newGameAI(): GameAI {
    return new GameAI(this);
  }

  _lookupCvars(): EngineCvarMap {
    return {
      teamplay: this.engine.GetCvar('teamplay'),
      gravity: this.engine.GetCvar('sv_gravity'),
      nextmap: this.engine.GetCvar('sv_nextmap'),
    };
  }

  get skill(): number {
    const cvars = (this.constructor as typeof ServerGameAPI)._cvars;
    return cvars.skill!.value;
  }

  get teamplay(): number {
    return this._cvars.teamplay!.value;
  }

  get timelimit(): number {
    const cvars = (this.constructor as typeof ServerGameAPI)._cvars;
    return cvars.timelimit!.value;
  }

  get fraglimit(): number {
    const cvars = (this.constructor as typeof ServerGameAPI)._cvars;
    return cvars.fraglimit!.value;
  }

  get deathmatch(): number {
    const cvars = (this.constructor as typeof ServerGameAPI)._cvars;
    return cvars.deathmatch!.value;
  }

  get coop(): number {
    const cvars = (this.constructor as typeof ServerGameAPI)._cvars;
    return cvars.coop!.value;
  }

  get samelevel(): number {
    const cvars = (this.constructor as typeof ServerGameAPI)._cvars;
    return cvars.samelevel!.value;
  }

  get noexit(): number {
    const cvars = (this.constructor as typeof ServerGameAPI)._cvars;
    return cvars.noexit!.value;
  }

  get nomonsters(): number {
    const cvars = (this.constructor as typeof ServerGameAPI)._cvars;
    return cvars.nomonster!.value;
  }

  get gravity(): number {
    return this._cvars.gravity!.value;
  }

  hasFeature(feature: FeatureFlag): boolean {
    return featureFlags.includes(feature);
  }

  startFrame(): void {
    this.framecount++;
  }

  PlayerPreThink(clientEdict: ServerEdict): void {
    const playerEntity = clientEdict.entity;
    if (!(playerEntity instanceof PlayerEntity)) {
      throw new TypeError('ServerGameAPI.PlayerPreThink expected a PlayerEntity.');
    }

    playerEntity.playerPreThink();
  }

  PlayerPostThink(clientEdict: ServerEdict): void {
    const playerEntity = clientEdict.entity;
    if (!(playerEntity instanceof PlayerEntity)) {
      throw new TypeError('ServerGameAPI.PlayerPostThink expected a PlayerEntity.');
    }

    playerEntity.playerPostThink();
  }

  ClientConnect(clientEdict: ServerEdict): void {
    const playerEntity = clientEdict.entity;
    if (!(playerEntity instanceof PlayerEntity)) {
      throw new TypeError('ServerGameAPI.ClientConnect expected a PlayerEntity.');
    }

    playerEntity.connected();
  }

  ClientDisconnect(clientEdict: ServerEdict): void {
    const playerEntity = clientEdict.entity;
    if (!(playerEntity instanceof PlayerEntity)) {
      throw new TypeError('ServerGameAPI.ClientDisconnect expected a PlayerEntity.');
    }

    playerEntity.disconnected();
  }

  ClientKill(clientEdict: ServerEdict): void {
    const playerEntity = clientEdict.entity;
    if (!(playerEntity instanceof PlayerEntity)) {
      throw new TypeError('ServerGameAPI.ClientKill expected a PlayerEntity.');
    }

    playerEntity.suicide();
  }

  PutClientInServer(clientEdict: ServerEdict): void {
    const playerEntity = clientEdict.entity;
    if (!(playerEntity instanceof PlayerEntity)) {
      throw new TypeError('ServerGameAPI.PutClientInServer expected a PlayerEntity.');
    }

    playerEntity.putPlayerInServer();
  }

  /**
   * Exit deathmatch games upon conditions.
   */
  checkRules(playerEntity: PlayerEntity): void {
    if (this.gameover) {
      return;
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
    }
  }

  _initNextMap(): void {
    const setNextmap = (): void => {
      if (this.engine.maxplayers === 1) {
        return;
      }

      this.nextmap = this._cvars.nextmap?.string || null;
    };

    this.engine.eventBus.subscribe('cvar.changed.sv_nextmap', () => {
      setNextmap();
    });

    setNextmap();
  }

  /**
   * Load the next map.
   */
  loadNextMap(nextmap: string | null = this.nextmap): void {
    if (!nextmap || this.samelevel) {
      if (this.mapname === null) {
        throw new Error('ServerGameAPI.loadNextMap requires an active map name.');
      }

      this.engine.ChangeLevel(this.mapname);
      return;
    }

    this.engine.ChangeLevel(nextmap);
  }

  sendMissingEntitiesToPlayer(playerEntity: PlayerEntity): void {
    const stats = Object.entries(this._missingEntityClassStats);
    if (stats.length === 0) {
      return;
    }

    stats.sort(([, a], [, b]) => b - a);
    playerEntity.consolePrint('Unknown entity classes on this map:\n');
    for (const [name, count] of stats) {
      playerEntity.consolePrint(`${count.toFixed(0).padStart(4, ' ')}x ${name}\n`);
    }
  }

  startIntermission(): void {
    if (this.intermission_running) {
      return;
    }

    this.intermission_running = 1;
    this.intermission_exittime = this.time + (this.deathmatch ? 5.0 : 2.0);

    this.engine.PlayTrack(3);

    const playerClassname = PlayerEntity.classname;
    console.assert(typeof playerClassname === 'string', 'PlayerEntity.classname must be defined');
    for (const player of this.engine.FindAllByFieldAndValue('classname', playerClassname!)) {
      const playerEntity = player.entity;
      if (!(playerEntity instanceof PlayerEntity)) {
        continue;
      }

      playerEntity.startIntermission();
    }
  }

  /**
   * Determine whether preparing an entity is allowed based on spawnflags and game mode.
   * @returns True when the entity may be spawned for the current game mode.
   */
  _isPreparingEntityAllowed(_classname: string, initialData: EdictData): boolean {
    const spawnflagValue = typeof initialData.spawnflags === 'number'
      ? initialData.spawnflags
      : Number(initialData.spawnflags ?? 0);

    if (this.deathmatch && (spawnflagValue & spawnflags.SPAWNFLAG_NOT_DEATHMATCH)) {
      return false;
    }

    if (this.skill === 0 && (spawnflagValue & spawnflags.SPAWNFLAG_NOT_EASY)) {
      return false;
    }

    if (this.skill === 1 && (spawnflagValue & spawnflags.SPAWNFLAG_NOT_MEDIUM)) {
      return false;
    }

    if (this.skill >= 2 && (spawnflagValue & spawnflags.SPAWNFLAG_NOT_HARD)) {
      return false;
    }

    return true;
  }

  prepareEntity(edict: ServerEdict, classname: string, initialData: EdictData = {}): boolean {
    const entityRegistry = (this.constructor as typeof ServerGameAPI)._entityRegistry;

    if (!entityRegistry.has(classname)) {
      this.engine.ConsoleWarning(`ServerGameAPI.prepareEntity: no entity factory for ${classname}!\n`);
      this._missingEntityClassStats[classname] = (this._missingEntityClassStats[classname] || 0) + 1;
      return false;
    }

    if (!this._isPreparingEntityAllowed(classname, initialData)) {
      return false;
    }

    const entityClass = entityRegistry.get(classname);
    if (entityClass === null) {
      this.engine.ConsoleWarning(`ServerGameAPI.prepareEntity: no entity class for ${classname}!\n`);
      return false;
    }

    let entity: BaseEntity;
    if (edict.entity !== null && edict.entity.classname === classname) {
      entity = edict.entity as unknown as BaseEntity;
    } else {
      entity = new entityClass(edict, this);
    }

    const runtimeEdict = edict as unknown as MutableServerEdict;
    runtimeEdict.entity = entity;

    entity.initializeEntity();

    entity.assignInitialData(initialData);
    entity.precacheEntity();

    return true;
  }

  spawnPreparedEntity(edict: ServerEdict): boolean {
    if (edict.entity === null) {
      this.engine.ConsoleError('ServerGameAPI.prepareEntity: no entity class instance set!\n');
      return false;
    }

    edict.entity.spawn();
    return true;
  }

  static GetServerInfoFields(): ServerInfoField[] {
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
  }

  static GetMapList(): MapDetails[] {
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

  static GetStartServerList(): StartServerListEntry[] {
    return [
      {
        label: 'Start deathmatch',
        callback: (engineAPI: ServerEngineAPI): void => {
          engineAPI.AppendConsoleText(`
          hostname "Quake Deathmatch"
          deathmatch 1
          coop 0
          maxplayers 8
          map e1m1
        `);
        },
      },
      {
        label: 'Start co-op game',
        callback: (engineAPI: ServerEngineAPI): void => {
          engineAPI.AppendConsoleText(`
          hostname "Quake Cooperative"
          deathmatch 0
          coop 1
          maxplayers 8
          map e1m1
        `);
        },
      },
    ];
  }

  getClientEntityFields(): Record<string, string[]> {
    return (this.constructor as typeof ServerGameAPI)._entityRegistry.getClientEntityFields();
  }

  _precacheResources(): void {
    (this.constructor as typeof ServerGameAPI)._entityRegistry.precacheAll(this.engine);
  }

  /**
   * Initialize the server game code.
   */
  init(mapname: string, serverflags: number): void {
    const cvars = (this.constructor as typeof ServerGameAPI)._cvars;
    const coop = cvars.coop!;
    const deathmatch = cvars.deathmatch!;
    const skill = cvars.skill!;

    this.mapname = mapname;
    this.serverflags = serverflags;

    if (coop.value) {
      coop.set(true);
      deathmatch.set(false);
    }

    skill.set(Math.max(0, Math.min(3, Math.floor(skill.value))));

    this.stats.subscribeToEvents();
    this._precacheResources();
    this._initNextMap();
  }

  shutdown(_isCrashShutdown: boolean): void {
    this.bodyque_head = null;
    this.worldspawn = null;
    this.lastspawn = null;

    while (this._shutdownHooks.length > 0) {
      const shutdown = this._shutdownHooks.pop();
      if (shutdown === undefined) {
        continue;
      }

      shutdown();
    }
  }

  static Init(serverEngineAPI: ServerEngineAPI): void {
    const cvars = this._cvars;

    cvars.nomonster = serverEngineAPI.RegisterCvar('nomonster', '0', 0, 'Do not spawn monsters.');
    cvars.samelevel = serverEngineAPI.RegisterCvar('samelevel', '0', 0, 'Set to 1 to stay on the same map even the map is over');
    cvars.fraglimit = serverEngineAPI.RegisterCvar('fraglimit', '0');
    cvars.timelimit = serverEngineAPI.RegisterCvar('timelimit', '0');
    cvars.noexit = serverEngineAPI.RegisterCvar('noexit', '0');
    cvars.skill = serverEngineAPI.RegisterCvar('skill', '1');
    cvars.deathmatch = serverEngineAPI.RegisterCvar('deathmatch', '0');
    cvars.coop = serverEngineAPI.RegisterCvar('coop', '0');

    this._entityRegistry.initializeAll(serverEngineAPI);
  }

  static Shutdown(): void {
    const cvars = this._cvars;

    for (const key of Object.keys(cvars) as Array<keyof GameDefinedCvarMap>) {
      const cvar = cvars[key];
      if (cvar === null) {
        continue;
      }

      cvar.free();
      cvars[key] = null;
    }
  }

  serialize(): SerializedData {
    return this._serializer.serialize() as SerializedData;
  }

  deserialize(data: SerializedData): void {
    this._serializer.deserialize(data as SerializableRecord);
  }
}
