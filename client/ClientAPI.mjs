import { clientEventName, items } from '../Defs.mjs';
import { weaponConfig } from '../entity/Weapons.mjs';
import { ServerGameAPI } from '../GameAPI.mjs';
import { Q1HUD } from './HUD.mjs';
import { ServerInfo } from './Sync.mjs';

/** @typedef {import('../../../shared/GameInterfaces').ClientEngineAPI} ClientEngineAPI  */
/** @typedef {import('../../../shared/GameInterfaces').ClientGameInterface} ClientGameInterface  */
/** @typedef {import('../../../shared/GameInterfaces').SerializableType} SerializableType */
/** @typedef {import('../../../shared/GameInterfaces').ViewmodelConfig} ViewmodelConfig */
/** @typedef {import('../../../shared/GameInterfaces').RefDef} RefDef */
/** @typedef {import('../../../shared/GameInterfaces').ClientdataMap} ClientdataMap */

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
  }

  shutdown() {
    this.hud.shutdown();
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
