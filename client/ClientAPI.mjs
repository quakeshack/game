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

  /** @param {ClientGameAPI} game */
  [clientEvent.STATS_UPDATED]: (game, stat, value) => {
    console.assert(stat in game.stats, `Unknown stat ${stat}`);

    game.stats[stat] = value;
  },

  /** @param {ClientGameAPI} game */
  [clientEvent.STATS_INIT]: (game, ...values) => {
    game.stats.monsters_total = values[0];
    game.stats.monsters_killed = values[1];
    game.stats.secrets_total = values[2];
    game.stats.secrets_found = values[3];
  },

  /** @param {ClientGameAPI} game */
  [clientEvent.ITEM_PICKED]: (game, itemEntity, itemName, items) => {
    if (itemName !== null) {
      game.engine.ConsolePrint(`You got ${itemName} (${itemEntity.classname}, ${items}).\n`);
    } else {
      game.engine.ConsolePrint('You found an empty item.\n');
    }

    game.engine.BonusFlash(new Vector(1, 0.75, 0.25), 0.25);
  },

  /** @param {ClientGameAPI} game */
  [clientEvent.WEAPON_SELECTED]: (game, weapon) => {

  },

  [clientEvent.TEST_EVENT]: (game, ...args) => {
    console.log(`Test event received with args:`, ...args);
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

  /** gamewide statistics */
  stats = {
    monsters_total: 0,
    monsters_killed: 0,
    secrets_total: 0,
    secrets_found: 0,
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
    // TODO: have a registry/map of client events and their handlers
    console.log(`Client event ${code} with args:`, ...args);

    if (!(code in clientEventHandlers)) {
      this.engine.ConsoleWarning(`No handler for client event ${code}\n`);
      return;
    }

    clientEventHandlers[code].apply(null, [this, ...args]);
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
