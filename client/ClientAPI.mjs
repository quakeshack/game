/** @typedef {typeof import('../../../engine/common/GameAPIs.mjs').ClientEngineAPI} ClientEngineAPI */
/** @typedef {import('../../../shared/GameInterfaces').ClientGameInterface} ClientGameInterface  */
/** @typedef {import('../../../shared/GameInterfaces').SerializableType} SerializableType */

import { BaseClientEdictHandler } from '../../../shared/ClientEdict.mjs';
import Vector from '../../../shared/Vector.mjs';
import { FireballEntity } from '../entity/Misc.mjs';
import { clientEvent } from '../entity/Player.mjs';
import { weaponConfig } from '../entity/Weapons.mjs';
import HUD from './HUD.mjs';

const clientEdictHandlers = {
  [FireballEntity.classname]: class FireballEdictHandler extends BaseClientEdictHandler {
    emit() {
      const dl = this.engine.AllocDlight(this.clientEdict.num);

      dl.color = new Vector(1, 0.75, 0.25);
      dl.origin = this.clientEdict.origin.copy();
      dl.radius = 285 + Math.random() * 15;
      dl.die = this.engine.CL.time + 0.1;

      this.engine.RocketTrail(this.clientEdict.originPrevious, this.clientEdict.origin, 1);
      this.engine.RocketTrail(this.clientEdict.originPrevious, this.clientEdict.origin, 6);
    }
  },
};

// TODO: move this to a separate file, make it extendable
const clientEventHandlers = {
  [clientEvent.BONUS_FLASH]: (game) => {
    game.engine.BonusFlash(new Vector(1, 0.75, 0.25), 0.25);
  },


};

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

  /** @type {import('../../../shared/GameInterfaces').ViewmodelConfig} */
  viewmodel = {
    visible: false,
    model: null,
    frame: 0,
  };

  /**
   * @param {ClientEngineAPI} engineAPI client engine API
   * @param {import('../../../shared/EventBus').EventBus} eventBus client event bus
   */
  constructor(engineAPI, eventBus) {
    this.engine = engineAPI;
    this.eventBus = eventBus;

    this.hud = new HUD(this, engineAPI);

    Object.seal(this);
  }

  init() {
    this.hud.init();
  }

  shutdown() {
    this.hud.shutdown();
  }

  startFrame() {
    // TODO: configure viewmodel based on health etc.

    if (this.clientdata.health <= 0 || !this.clientdata.weapon) {
      this.viewmodel.visible = false;
    } else {
      this.viewmodel.visible = true;

      this.viewmodel.model = this.engine.ModForName(weaponConfig.get(this.clientdata.weapon).viewModel);
      this.viewmodel.frame = this.clientdata.weaponframe;
    }
  }

  draw() {
    this.hud.draw();
  }

  /**
   * @param {import('../../../shared/GameInterfaces').RefDef} refdef
   */
  updateRefDef(refdef) {
    if (this.clientdata.health <= 0) {
      refdef.viewangles[2] = Math.max(80, refdef.viewangles[2] + 80); // make the player roll around
    }
  }

  handleClientEvent(code, ...args) {
    this.eventBus.publish(`client.event-received.${code}`, ...args);
  }

  static GetClientEdictHandler(classname) {
    return clientEdictHandlers[classname] || null;
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
