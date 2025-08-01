import Vector from '../../../shared/Vector.mjs';
import { ClientGameAPI } from './ClientAPI.mjs';

/** @typedef {typeof import('../../../engine/common/GameAPIs.mjs').ClientEngineAPI} ClientEngineAPI */

/** @type {{[key: string]: import('../../../shared/GameInterfaces').GLTexture}} */
const backgrounds = {
  statusbar: null,
  inventorybar: null,
  scorebar: null,
};

class Gfx {
  offsets = [0, 0];

  /**
   * @param {ClientEngineAPI} clientEngineAPI
   */
  constructor(clientEngineAPI) {
    this.clientEngineAPI = clientEngineAPI;
  }

  drawPic(x, y, pic) {
    this.clientEngineAPI.DrawPic(x + this.offsets[0], y + this.offsets[1], pic);
  }

  drawString(x, y, text, scale = 1.0, color = new Vector(1.0, 1.0, 1.0)) {
    this.clientEngineAPI.DrawString(x + this.offsets[0], y + this.offsets[1], text, scale, color);
  }
}

export default class HUD {
  /** +showscores/-showscores */
  static #showScoreboard = false;

  /** @type {Function[]} */
  static #eventListeners = [];

  /** @type {Gfx} */
  static gfx = null;

  /**
   * @param {ClientGameAPI} clientGameAPI
   * @param {ClientEngineAPI} clientEngineAPI
   */
  constructor(clientGameAPI, clientEngineAPI) {
    this.game = clientGameAPI;
    this.engine = clientEngineAPI;
    Object.seal(this);
  }

  init() {
    // make sure the HUD is initialized with the correct viewport size
    const { width, height } = this.engine.VID;
    HUD.#viewportResize(width, height);
  }

  shutdown() {
  }

  draw() {
    if (HUD.#showScoreboard) {
      this.engine.DrawString(8, 8, 'Scoreboard is not implemented yet', 2.0, new Vector(1.0, 1.0, 0.0));
    }

    // Draw the status bar, inventory bar, and score bar
    HUD.gfx.drawPic(0, 0, backgrounds.statusbar);
    HUD.gfx.drawString(0, 0, `HP: ${this.game.clientdata.health}, Armor: ${this.game.clientdata.armorvalue}`, 2);
  }

  /**
   * @param {number} width viewport width
   * @param {number} height viewport height
   */
  static #viewportResize(width, height) {
    this.gfx.offsets[0] = width / 2 - 160;
    this.gfx.offsets[1] = height - 24;
  }

  /**
   * @param {ClientEngineAPI} engineAPI client engine API
   */
  static Init(engineAPI) {
    backgrounds.statusbar = engineAPI.LoadPicFromWad('SBAR');
    backgrounds.inventorybar = engineAPI.LoadPicFromWad('IBAR');
    backgrounds.scorebar = engineAPI.LoadPicFromWad('SCOREBAR');

    engineAPI.RegisterCommand('+showscores', () => { this.#showScoreboard = true; });
    engineAPI.RegisterCommand('-showscores', () => { this.#showScoreboard = false; });

    this.#eventListeners.push(engineAPI.eventBus.subscribe('vid.resize', ({ width, height }) => this.#viewportResize(width, height)));

    this.gfx = new Gfx(engineAPI);
  }

  /**
   * @param {ClientEngineAPI} engineAPI client engine API
   */
  static Shutdown(engineAPI) {
    for (const [key, texture] of Object.entries(backgrounds)) {
      if (texture) {
        texture.free();
        backgrounds[key] = null;
      }
    }

    engineAPI.UnregisterCommand('+showscores');
    engineAPI.UnregisterCommand('-showscores');

    for (const unsubscribe of this.#eventListeners) {
      unsubscribe();
    }
  }
};
