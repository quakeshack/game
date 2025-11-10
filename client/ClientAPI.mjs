import { clientEvent, clientEventName, items } from '../Defs.mjs';
import { weaponConfig } from '../entity/Weapons.mjs';
import { entityRegistry } from '../GameAPI.mjs';
import HUD from './HUD.mjs';

/** @typedef {import('../../../shared/GameInterfaces').ClientEngineAPI} ClientEngineAPI  */
/** @typedef {import('../../../shared/GameInterfaces').ClientGameInterface} ClientGameInterface  */
/** @typedef {import('../../../shared/GameInterfaces').SerializableType} SerializableType */

/** @augments ClientGameInterface */
export class ClientGameAPI {
  /** current player’s data */
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

  /** @type {Record<string, string>} server cvar values */
  serverInfo = {
    hostname: '',
    coop: '0',
    deathmatch: '0',
    skill: '0',
  };

  /** @type {import('../../../shared/GameInterfaces').ViewmodelConfig} */
  viewmodel = {
    visible: false,
    model: null,
    frame: 0,
  };

  /**
   * @param {ClientEngineAPI} engineAPI client engine API
   */
  constructor(engineAPI) {
    this.engine = engineAPI;

    this.hud = new HUD(this, engineAPI);

    Object.seal(this);
  }

  init() {
    this.hud.init();

    this.engine.eventBus.subscribe('client.server-info.ready', (serverInfo) => {
      Object.assign(this.serverInfo, serverInfo);
    });

    this.engine.eventBus.subscribe('client.server-info.updated', (key, value) => {
      this.serverInfo[key] = value;
    });

    this.engine.eventBus.subscribe('client.chat.message', (name, message, isDirect) => {
      if (isDirect) {
        this.engine.ConsolePrint(`${name} to you: ${message}\n`);
      } else {
        this.engine.ConsolePrint(`${name}: ${message}\n`);
      }

      this.engine.LoadSound('misc/talk.wav').play();
    });

    this.engine.eventBus.subscribe(clientEventName(clientEvent.OBITUARY), (...args) => {
      console.log('OBITUARY event received', args);
    });
  }

  shutdown() {
    this.hud.shutdown();
  }

  startFrame() {
    if (this.clientdata.health <= 0 || !this.clientdata.weapon || (this.clientdata.items & items.IT_INVISIBILITY)) {
      this.viewmodel.visible = false;
    } else {
      this.viewmodel.visible = true;

      this.viewmodel.model = this.engine.ModForName(weaponConfig.get(/** @type {import('../entity/Weapons.mjs').WeaponConfigKey} */(this.clientdata.weapon)).viewModel);
      this.viewmodel.frame = this.clientdata.weaponframe;
    }

    this.hud.startFrame();
  }

  draw() {
    this.hud.draw();
  }

  /**
   * @param {import('../../../shared/GameInterfaces').RefDef} refdef current refresh definition
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
    return entityRegistry.has(classname) ? entityRegistry.get(classname).clientEdictHandler : null;
  }

  /**
   * @param {ClientEngineAPI} engineAPI client engine API
   */
  static Init(engineAPI) {
    HUD.Init(engineAPI);
  }

  /**
   * @param {ClientEngineAPI} engineAPI client engine API
   */
  static Shutdown(engineAPI) {
    HUD.Shutdown(engineAPI);
  }

  static IsServerCompatible(version) {
    return version[0] === 1 && version[1] === 0 && version[2] === 0;
  }
};
