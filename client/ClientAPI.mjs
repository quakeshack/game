import { clientEvent, clientEventName, decals, items } from '../Defs.mjs';
import { weaponConfig } from '../entity/Weapons.mjs';
import { featureFlags, ServerGameAPI } from '../GameAPI.mjs';
import { Q1HUD } from './HUD.mjs';
import { ServerInfo } from './Sync.mjs';

/** @typedef {import('../../../shared/GameInterfaces').ClientEngineAPI} ClientEngineAPI  */
/** @typedef {import('../../../shared/GameInterfaces').ClientGameInterface} ClientGameInterface  */
/** @typedef {import('../../../shared/GameInterfaces').SerializableType} SerializableType */
/** @typedef {import('../../../shared/GameInterfaces').ViewmodelConfig} ViewmodelConfig */
/** @typedef {import('../../../shared/GameInterfaces').RefDef} RefDef */
/** @typedef {import('../../../shared/GameInterfaces').ClientdataMap} ClientdataMap */
/** @typedef {import('../../../shared/GameInterfaces').GLTexture} GLTexture */

/** @typedef {import('../entity/Weapons.mjs').WeaponConfigKey} WeaponConfigKey */

/** @augments ClientGameInterface */
export class ClientGameAPI {
  /** @see {ClientdataMap} current player’s data */
  clientdata = {
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
  };

  /** @type {ServerInfo} */
  serverInfo = null;

  /** @type {ViewmodelConfig} */
  viewmodel = {
    visible: false,
    model: null,
    frame: 0,
  };

  decals = {
    axehit: /** @type {GLTexture[]} */ ([]),
    bhole: /** @type {GLTexture[]} */ ([]),
  };

  decalEventHandler = /** @type {Function|null} */ (null);

  /** @returns {Q1HUD} HUD @protected */
  _newHUD() {
    return new Q1HUD(this, this.engine);
  }

  /** @returns {ServerInfo} server info @protected */
  _newServerInfo() {
    return new ServerInfo(this.engine);
  }

  /**
   * @param {ClientEngineAPI} engineAPI client engine API
   */
  constructor(engineAPI) {
    this.engine = engineAPI;

    this.hud = this._newHUD();
    this.serverInfo = this._newServerInfo();
  }

  init() {
    this.hud.init();

    if (featureFlags.includes('draw-bullet-hole-decals')) {
      this._initDecalEvents();
    }
  }

  shutdown() {
    this.hud.shutdown();

    if (featureFlags.includes('draw-bullet-hole-decals')) {
      this._shutdownDecalEvents();
    }
  }

  _initDecalEvents() {
    Promise.all([
      this.engine.LoadPicFromFile('gfx/bhole1.png'),
      this.engine.LoadPicFromFile('gfx/bhole2.png'),
      this.engine.LoadPicFromFile('gfx/bhole3.png'),
      this.engine.LoadPicFromFile('gfx/bhole4.png'),
    ]).then((txs) => {
      for (const tx of txs) {
        tx.wrapClamped();
        this.decals.bhole.push(tx);
      }
    }).catch((e) => {
      this.engine.ConsoleError(`failed to load bullet holes decal textures: ${e.message}\n`);
    });

    Promise.all([
      this.engine.LoadPicFromFile('gfx/axehit1.png'),
      this.engine.LoadPicFromFile('gfx/axehit2.png'),
      this.engine.LoadPicFromFile('gfx/axehit3.png'),
      this.engine.LoadPicFromFile('gfx/axehit4.png'),
    ]).then((txs) => {
      for (const tx of txs) {
        tx.wrapClamped();
        this.decals.axehit.push(tx);
      }
    }).catch((e) => {
      this.engine.ConsoleError(`failed to load axehit decal textures: ${e.message}\n`);
    });

    this.decalEventHandler = this.engine.eventBus.subscribe(clientEventName(clientEvent.EMIT_DECAL), (origin, normal, texture) => {
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

  _shutdownDecalEvents() {
    if (this.decalEventHandler) {
      this.decalEventHandler();
      this.decalEventHandler = null;
    }

    for (const tx of this.decals.bhole) {
      tx.free();
    }

    this.decals.bhole.length = 0;

    for (const tx of this.decals.axehit) {
      tx.free();
    }

    this.decals.axehit.length = 0;
  }

  /** @protected */
  _updateViewModel() {
    if (this.clientdata.health <= 0 || !this.clientdata.weapon || (this.clientdata.items & items.IT_INVISIBILITY)) {
      this.viewmodel.visible = false;
    } else {
      this.viewmodel.visible = true;

      this.viewmodel.model = this.engine.ModForName(weaponConfig.get(/** @type {WeaponConfigKey} */(this.clientdata.weapon)).viewModel);
      this.viewmodel.frame = this.clientdata.weaponframe;
    }
  }

  startFrame() {
    this._updateViewModel();

    this.hud.startFrame();
  }

  draw() {
    this.hud.draw();
  }

  /**
   * @param {RefDef} refdef current refresh definition
   */
  updateRefDef(refdef) {
    if (this.clientdata.health <= 0) {
      refdef.viewangles[2] = Math.max(80, refdef.viewangles[2] + 80); // make the player roll around
    }
  }

  handleClientEvent(eventId, ...args) {
    this.engine.eventBus.publish(clientEventName(eventId), ...args);
  }

  saveGame() {
    const data = {
      clientdata: this.clientdata,
      serverInfo: this.serverInfo,
      hud: this.hud.saveState(),
    };

    return JSON.stringify(data);
  }

  loadGame(data) {
    const parsedData = JSON.parse(data);

    this.clientdata = Object.assign(this.clientdata, parsedData.clientdata);
    this.serverInfo = Object.assign(this.serverInfo, parsedData.serverInfo);

    this.hud.loadState(parsedData.hud);
  }

  static GetClientEdictHandler(classname) {
    return ServerGameAPI._entityRegistry.get(classname)?.clientEdictHandler || null;
  }

  /**
   * @param {ClientEngineAPI} engineAPI client engine API
   */
  static Init(engineAPI) {
    Q1HUD.Init(engineAPI);
  }

  /**
   * @param {ClientEngineAPI} engineAPI client engine API
   */
  static Shutdown(engineAPI) {
    Q1HUD.Shutdown(engineAPI);
  }

  static IsServerCompatible(version) {
    return version[0] === 1 && version[1] === 0 && version[2] === 0;
  }
};
