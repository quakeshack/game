import type { BaseClientEdictHandler } from '../../../shared/ClientEdict.ts';
import type { ClientdataMap, ClientEngineAPI, ClientEventValue, GLTexture, RefDef } from '../../../shared/GameInterfaces.ts';

import Vector from '../../../shared/Vector.ts';

import { clientEvent, clientEventName, decals, effect, items } from '../Defs.ts';
import { weaponConfig, type WeaponConfigKey } from '../entity/Weapons.ts';
import { featureFlags, ServerGameAPI } from '../GameAPI.ts';
import { Q1HUD, type HUDSaveState } from './HUD.ts';
import { ServerInfo, type ServerInfoSnapshot } from './Sync.ts';

interface DecalSet {
  readonly axehit: GLTexture[];
  readonly bhole: GLTexture[];
}

interface ClientViewmodelConfig {
  visible: boolean;
  model: ReturnType<ClientEngineAPI['ModForName']> | null;
  frame: number;
}

interface ClientGameSaveData {
  clientdata: Id1Clientdata;
  serverInfo: ServerInfoSnapshot;
  hud: HUDSaveState;
}

export interface Id1Clientdata extends ClientdataMap {
  health: number;
  armorvalue: number;
  armortype: number;
  items: number;
  ammo_shells: number;
  ammo_nails: number;
  ammo_rockets: number;
  ammo_cells: number;
  weapon: WeaponConfigKey | 0;
  weaponframe: number;
  effects: number;
}

/**
 * Client-side game interface for id1.
 */
export class ClientGameAPI {
  /** current player’s data */
  clientdata: Id1Clientdata = {
    health: 100,
    armorvalue: 0,
    armortype: 0,
    items: 0,

    ammo_shells: 0,
    ammo_nails: 0,
    ammo_rockets: 0,
    ammo_cells: 0,

    weapon: 0,
    weaponframe: 0,

    effects: 0,
  };

  serverInfo: ServerInfo;

  viewmodel: ClientViewmodelConfig = {
    visible: false,
    model: null,
    frame: 0,
  };

  decals: DecalSet = {
    axehit: [],
    bhole: [],
  };

  decalEventHandler: (() => void) | null = null;

  readonly engine: ClientEngineAPI;
  readonly hud: Q1HUD;

  protected _newHUD(): Q1HUD {
    return new Q1HUD(this, this.engine);
  }

  protected _newServerInfo(): ServerInfo {
    return new ServerInfo(this.engine);
  }

  constructor(engineAPI: ClientEngineAPI) {
    this.engine = engineAPI;

    this.hud = this._newHUD();
    this.serverInfo = this._newServerInfo();
  }

  init(): void {
    this.hud.init();

    if (featureFlags.includes('draw-bullet-hole-decals')) {
      this._initDecalEvents();
    }
  }

  shutdown(): void {
    this.hud.shutdown();

    if (featureFlags.includes('draw-bullet-hole-decals')) {
      this._shutdownDecalEvents();
    }
  }

  protected _initDecalEvents(): void {
    Promise.all([
      this.engine.LoadPicFromFile('gfx/bhole1.png'),
      this.engine.LoadPicFromFile('gfx/bhole2.png'),
      this.engine.LoadPicFromFile('gfx/bhole3.png'),
      this.engine.LoadPicFromFile('gfx/bhole4.png'),
    ]).then((textures): void => {
      for (const texture of textures) {
        texture.wrapClamped();
        this.decals.bhole.push(texture);
      }
    }).catch((error: Error): void => {
      this.engine.ConsoleError(`failed to load bullet holes decal textures: ${error.message}\n`);
    });

    Promise.all([
      this.engine.LoadPicFromFile('gfx/axehit1.png'),
      this.engine.LoadPicFromFile('gfx/axehit2.png'),
      this.engine.LoadPicFromFile('gfx/axehit3.png'),
      this.engine.LoadPicFromFile('gfx/axehit4.png'),
    ]).then((textures): void => {
      for (const texture of textures) {
        texture.wrapClamped();
        this.decals.axehit.push(texture);
      }
    }).catch((error: Error): void => {
      this.engine.ConsoleError(`failed to load axehit decal textures: ${error.message}\n`);
    });

    this.decalEventHandler = this.engine.eventBus.subscribe(clientEventName(clientEvent.EMIT_DECAL), (origin: Vector, normal: Vector, texture: decals): void => {
      switch (texture) {
        case decals.DECAL_BULLETHOLE:
          if (this.decals.bhole.length > 0) {
            this.engine.PlaceDecal(origin, normal, this.decals.bhole[Math.floor(Math.random() * this.decals.bhole.length)]);
          }
          break;

        case decals.DECAL_AXEHIT:
          if (this.decals.axehit.length > 0) {
            this.engine.PlaceDecal(origin, normal, this.decals.axehit[Math.floor(Math.random() * this.decals.axehit.length)]);
          }
          break;

        default:
          this.engine.ConsoleDebug(`EMIT_DECAL handler: unknown decal texture id: ${texture}\n`);
      }
    });
  }

  protected _shutdownDecalEvents(): void {
    if (this.decalEventHandler !== null) {
      this.decalEventHandler();
      this.decalEventHandler = null;
    }

    for (const texture of this.decals.bhole) {
      texture.free();
    }

    this.decals.bhole.length = 0;

    for (const texture of this.decals.axehit) {
      texture.free();
    }

    this.decals.axehit.length = 0;
  }

  protected _updateViewModel(): void { // CR: PlayerClientEntity has a similar logic regarding muzzleflash!
    if (this.clientdata.health <= 0 || this.clientdata.weapon === 0 || (this.clientdata.items & items.IT_INVISIBILITY) !== 0) {
      this.viewmodel.visible = false;
      this.viewmodel.model = null;
      return;
    }

    const weapon = weaponConfig.get(this.clientdata.weapon);
    console.assert(weapon !== undefined, `Missing client weapon config for ${this.clientdata.weapon}`);
    if (weapon === undefined) {
      this.viewmodel.visible = false;
      this.viewmodel.model = null;
      return;
    }

    this.viewmodel.visible = true;
    this.viewmodel.model = this.engine.ModForName(weapon.viewModel);
    this.viewmodel.frame = this.clientdata.weaponframe;
  }

  protected _updateEffects(): void {
    if ((this.clientdata.effects & effect.EF_MUZZLEFLASH) !== 0) {
      const dynamicLight = this.engine.AllocDlight(this.engine.CL.entityNum);
      const forwardVectors = this.engine.CL.viewangles.angleVectors().forward;
      const origin = this.engine.CL.vieworigin;
      dynamicLight.origin = new Vector(
        origin[0] + 20.0 * forwardVectors[0],
        origin[1] + 20.0 * forwardVectors[1],
        origin[2] + 32.0 + 20.0 * forwardVectors[2],
      );
      dynamicLight.radius = 200.0 + Math.random() * 32.0;
      dynamicLight.minlight = 32.0;
      dynamicLight.die = this.engine.CL.time + 0.2;
      dynamicLight.color = new Vector(1.0, 0.95, 0.85);
    }
  }

  startFrame(): void {
    this._updateViewModel();
    this._updateEffects();

    this.hud.startFrame();
  }

  draw(): void {
    this.hud.draw();
  }

  drawLoading(): void {
    // allows drawing stuff on the loading screen like tips or objectives
  }

  /**
   * Update the client refdef before rendering.
   */
  updateRefDef(refdef: RefDef): void {
    if (this.clientdata.health <= 0) {
      refdef.viewangles[2] = Math.max(80, refdef.viewangles[2] + 80); // make the player roll around
    }
  }

  handleClientEvent(eventId: number, ...args: ClientEventValue[]): void {
    this.engine.eventBus.publish(clientEventName(eventId), ...args);
  }

  saveGame(): string {
    const data: ClientGameSaveData = {
      clientdata: { ...this.clientdata },
      serverInfo: { ...(this.serverInfo as ServerInfoSnapshot) },
      hud: this.hud.saveState(),
    };

    return JSON.stringify(data);
  }

  loadGame(data: string): void {
    const parsedData = JSON.parse(data) as ClientGameSaveData;

    Object.assign(this.clientdata, parsedData.clientdata);
    Object.assign(this.serverInfo as ServerInfoSnapshot, parsedData.serverInfo);

    this.hud.loadState(parsedData.hud);
  }

  static GetStartGameInterface(_engineAPI: ClientEngineAPI): null {
    return null;
  }

  static GetClientEdictHandler(classname: string): typeof BaseClientEdictHandler | null {
    return ServerGameAPI._entityRegistry.get(classname)?.clientEdictHandler || null;
  }

  static Init(engineAPI: ClientEngineAPI): void {
    Q1HUD.Init(engineAPI);
  }

  static Shutdown(engineAPI: ClientEngineAPI): void {
    Q1HUD.Shutdown(engineAPI);
  }

  static IsServerCompatible(version: number[]): boolean {
    return version[0] === 1 && version[1] === 0 && version[2] === 0;
  }
}
