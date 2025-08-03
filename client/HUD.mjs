import Q from '../../../shared/Q.mjs';
import Vector from '../../../shared/Vector.mjs';
import { clientEventName, items } from '../Defs.mjs';
import { clientEvent } from '../entity/Player.mjs';
import { weaponConfig } from '../entity/Weapons.mjs';
import { ClientGameAPI } from './ClientAPI.mjs';

/** @typedef {typeof import('../../../engine/common/GameAPIs.mjs').ClientEngineAPI} ClientEngineAPI */
/** @typedef {import('../../../shared/GameInterfaces').GLTexture} GLTexture */

const backgrounds = {
  /** @type {GLTexture} */
  statusbar: null,
  /** @type {GLTexture} */
  inventorybar: null,
  /** @type {GLTexture} */
  scorebar: null,
};

const faces = {
  /** @type {GLTexture} */
  face_invis: null,
  /** @type {GLTexture} */
  face_invuln: null,
  /** @type {GLTexture} */
  face_invis_invuln: null,
  /** @type {GLTexture} */
  face_quad: null,
  /** @type {GLTexture[][]} */
  faces: [
    [null, null],
    [null, null],
    [null, null],
    [null, null],
    [null, null],
  ],
};

const armors = {
  /** @type {GLTexture} */
  armor1: null,
  /** @type {GLTexture} */
  armor2: null,
  /** @type {GLTexture} */
  armor3: null,
};

const ammos = {
  /** @type {GLTexture} */
  ammo_shells: null,
  /** @type {GLTexture} */
  ammo_nails: null,
  /** @type {GLTexture} */
  ammo_rockets: null,
  /** @type {GLTexture} */
  ammo_cells: null,
};

/**
 * Graphics helper class for the HUD.
 */
class Gfx {
  offsets = [0, 0];
  scale = 1.0;

  #nums = [
    new Array(11).fill(null),
    new Array(11).fill(null),
  ];

  /**
   * @param {ClientEngineAPI} clientEngineAPI
   */
  constructor(clientEngineAPI) {
    this.clientEngineAPI = clientEngineAPI;

    this.loadAssets();
  }

  loadAssets() {
    for (let i = 0; i < 10; i++) {
      this.#nums[0][i] = this.clientEngineAPI.LoadPicFromWad(`NUM_${i}`);
      this.#nums[1][i] = this.clientEngineAPI.LoadPicFromWad(`ANUM_${i}`);
    }

    this.#nums[0][10] = this.clientEngineAPI.LoadPicFromWad('NUM_MINUS');
    this.#nums[1][10] = this.clientEngineAPI.LoadPicFromWad('ANUM_MINUS');
  }

  drawPic(x, y, pic) {
    this.clientEngineAPI.DrawPic((x + this.offsets[0]), (y + this.offsets[1]), pic, this.scale);
  }

  drawString(x, y, text, scale = 1.0, color = new Vector(1.0, 1.0, 1.0)) {
    this.clientEngineAPI.DrawString((x + this.offsets[0]), (y + this.offsets[1]), text, scale * this.scale, color);
  }

  drawNumber(x, y, number, digits = 3, color = 0) {
    let str = number.toFixed(0); // can only handle integers
    if (str.length > digits) {
      str = str.substring(str.length - digits, str.length);
    } else if (str.length < digits) {
      x += (digits - str.length) * 24;
    }
    for (let i = 0; i < str.length; i++) {
      const frame = str.charCodeAt(i);
      this.drawPic(x, y, this.#nums[color][frame === 45 ? 10 : frame - 48]);
      x += 24;
    }
  }
}

export default class HUD {
  /** +showscores/-showscores */
  static #showScoreboard = false;

  /** @type {Gfx} */
  static gfx = null;

  /** gamewide stats */
  stats = {
    monsters_total: 0,
    monsters_killed: 0,
    secrets_total: 0,
    secrets_found: 0,
  };

  /**
   * @param {ClientGameAPI} clientGameAPI
   * @param {ClientEngineAPI} clientEngineAPI
   */
  constructor(clientGameAPI, clientEngineAPI) {
    this.game = clientGameAPI;
    this.engine = clientEngineAPI;
    Object.seal(this);
    Object.seal(this.stats);
  }

  init() {
    // make sure the HUD is initialized with the correct viewport size
    const { width, height } = this.engine.VID;
    HUD.#viewportResize(width, height);

    // observe notable events
    this.#subscribeToEvents();
  }

  shutdown() {
  }

  #subscribeToEvents() {
    // subscribe to viewport resize events
    this.engine.eventBus.subscribe('vid.resize', ({ width, height }) => HUD.#viewportResize(width, height));

    // picked up an item
    this.engine.eventBus.subscribe(clientEventName(clientEvent.ITEM_PICKED), (itemEntity, itemName, items) => {
      if (itemName !== null) {
        this.engine.ConsolePrint(`You got ${itemName} (${itemEntity.classname}, ${items}).\n`);
      } else {
        this.engine.ConsolePrint('You found an empty item.\n');
      }

      this.engine.BonusFlash(new Vector(1, 0.75, 0.25), 0.25);
    });

    // still used for some fading item effects
    this.engine.eventBus.subscribe(clientEventName(clientEvent.BONUS_FLASH), () => {
      this.engine.BonusFlash(new Vector(1, 0.75, 0.25), 0.33);
    });

    // game stats base value
    this.engine.eventBus.subscribe(clientEventName(clientEvent.STATS_INIT), (slot, value) => {
      console.assert(slot in this.stats, `Unknown stat slot ${slot}`);
      this.stats[slot] = value;
    });

    // game stats updates during game play
    this.engine.eventBus.subscribe(clientEventName(clientEvent.STATS_UPDATED), (slot, value) => {
      console.assert(slot in this.stats, `Unknown stat slot ${slot}`);
      this.stats[slot] = value;
    });
  }

  #drawFace(x, y) {
    const citems = this.game.clientdata.items;

    if (citems & (items.IT_INVISIBILITY | items.IT_INVULNERABILITY)) {
      HUD.gfx.drawPic(x, y, faces.face_invis_invuln);
      return;
    }

    if (citems & (items.IT_QUAD)) {
      HUD.gfx.drawPic(x, y, faces.face_quad);
      return;
    }

    if (citems & (items.IT_INVISIBILITY)) {
      HUD.gfx.drawPic(x, y, faces.face_invis);
      return;
    }

    if (citems & (items.IT_INVULNERABILITY)) {
      HUD.gfx.drawPic(x, y, faces.face_invuln);
      return;
    }

    const health = Math.max(0, this.game.clientdata.health);

    // TODO: pain states
    HUD.gfx.drawPic(x, y, faces.faces[health >= 100.0 ? 4 : Math.floor(health / 20.0)][0]);
  }

  /**
   * Draw the status bar, inventory bar, and score bar.
   */
  #drawStatusBar() {
    HUD.gfx.drawPic(0, 0, backgrounds.statusbar);

    // Draw armor
    if (this.game.clientdata.armorvalue > 0) {
      switch (true) {
        case (this.game.clientdata.items & items.IT_ARMOR3) !== 0:
          HUD.gfx.drawPic(0, 0, armors.armor3);
          break;
        case (this.game.clientdata.items & items.IT_ARMOR2) !== 0:
          HUD.gfx.drawPic(0, 0, armors.armor2);
          break;
        case (this.game.clientdata.items & items.IT_ARMOR1) !== 0:
          HUD.gfx.drawPic(0, 0, armors.armor1);
          break;
      }

      HUD.gfx.drawNumber(24, 0, this.game.clientdata.armorvalue, 3, this.game.clientdata.armorvalue <= 25 ? 1 : 0);
    }

    // Draw health
    HUD.gfx.drawNumber(136, 0, Math.max(0, this.game.clientdata.health), 3, this.game.clientdata.health <= 25 ? 1 : 0);

    // Draw face
    this.#drawFace(112, 0);

    // Draw current ammo
    if (weaponConfig.has(this.game.clientdata.weapon)) {
      const weapon = weaponConfig.get(this.game.clientdata.weapon);

      if (weapon.ammoSlot) {
        HUD.gfx.drawPic(224, 0, ammos[weapon.ammoSlot]);

        console.assert(this.game.clientdata[weapon.ammoSlot] !== undefined, `Ammo slot ${weapon.ammoSlot} not found in clientdata`);
        const ammo = this.game.clientdata[weapon.ammoSlot];
        HUD.gfx.drawNumber(248, 0, Math.max(0, ammo), 3, ammo <= 10 ? 1 : 0);
      }
    }
  }

  #drawInventory(offsetY = 0) {
    HUD.gfx.drawPic(0, offsetY, backgrounds.inventorybar);

    // TODO: the rest of the inventory
  }

  #drawScoreboard() {
    this.engine.DrawString(8, 8, 'Scoreboard is not implemented yet', 2.0, new Vector(1.0, 1.0, 0.0));
  }

  /**
   * Draws a mini info bar at the top of the screen with game stats and level name.
   */
  #drawMiniInfo(offsetY = 0) {
    HUD.gfx.drawPic(0, offsetY, backgrounds.scorebar);

    const monsters = `Monsters: ${this.stats.monsters_killed} / ${this.stats.monsters_total}`;
    const secrets = ` Secrets: ${this.stats.secrets_found} / ${this.stats.secrets_total}`;

    HUD.gfx.drawString(8, offsetY + 4,  `${monsters.padEnd(19)} ${Q.secsToTime(this.engine.CL.time).padStart(18)}`);
    HUD.gfx.drawString(8, offsetY + 12, `${secrets.padEnd(19)} ${new String(this.engine.CL.levelname).trim().padStart(18)}`.substring(0, 38));
  }

  draw() {
    if (HUD.#showScoreboard) {
      if (this.engine.CL.maxclients > 1) {
        this.#drawScoreboard();
      } else {
        this.#drawMiniInfo();
        return;
      }
    }

    if (this.engine.SCR.viewsize <= 90) {
      this.#drawMiniInfo(-48);
    }

    if (this.engine.SCR.viewsize <= 100) {
      this.#drawInventory(-24);
    }

    this.#drawStatusBar();
  }

  /**
   * @param {number} width viewport width
   * @param {number} height viewport height
   */
  static #viewportResize(width, height) {
    // TODO: scale is broken
    // if (width > 1024 && height > 768) {
    //   this.gfx.scale = 1.5;
    // }

    this.gfx.offsets[0] = width / 2 - 160 * this.gfx.scale;
    this.gfx.offsets[1] = height - 24 * this.gfx.scale;
  }

  /**
   * @param {ClientEngineAPI} engineAPI client engine API
   */
  static Init(engineAPI) {
    backgrounds.statusbar = engineAPI.LoadPicFromWad('SBAR');
    backgrounds.inventorybar = engineAPI.LoadPicFromWad('IBAR');
    backgrounds.scorebar = engineAPI.LoadPicFromWad('SCOREBAR');

    faces.face_invis = engineAPI.LoadPicFromWad('FACE_INVIS');
    faces.face_invuln = engineAPI.LoadPicFromWad('FACE_INVUL2');
    faces.face_invis_invuln = engineAPI.LoadPicFromWad('FACE_INV2');
    faces.face_quad = engineAPI.LoadPicFromWad('FACE_QUAD');

    for (let i = 0; i < 5; i++) {
      faces.faces[i][0] = engineAPI.LoadPicFromWad(`FACE${5 - i}`);
      faces.faces[i][1] = engineAPI.LoadPicFromWad(`FACE_P${5 - i}`);
    }

    ammos.ammo_shells = engineAPI.LoadPicFromWad('SB_SHELLS');
    ammos.ammo_nails = engineAPI.LoadPicFromWad('SB_NAILS');
    ammos.ammo_rockets = engineAPI.LoadPicFromWad('SB_ROCKET');
    ammos.ammo_cells = engineAPI.LoadPicFromWad('SB_CELLS');

    armors.armor1 = engineAPI.LoadPicFromWad('SB_ARMOR1');
    armors.armor2 = engineAPI.LoadPicFromWad('SB_ARMOR2');
    armors.armor3 = engineAPI.LoadPicFromWad('SB_ARMOR3');

    engineAPI.RegisterCommand('+showscores', () => { this.#showScoreboard = true; });
    engineAPI.RegisterCommand('-showscores', () => { this.#showScoreboard = false; });

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
  }
};
