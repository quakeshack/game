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

const labels = {
  /** @type {GLTexture} */
  ranking: null,
  /** @type {GLTexture} */
  complete: null,
  /** @type {GLTexture} */
  inter: null,
  /** @type {GLTexture} */
  finale: null,
};

const inventory = [
  // weapons
  { item: items.IT_SHOTGUN, icon: null, iconInactive: null, iconWidth: 0, iconSuffix: 'SHOTGUN', iconPrefix: 'INV' },
  { item: items.IT_SUPER_SHOTGUN, icon: null, iconInactive: null, iconWidth: 0, iconSuffix: 'SSHOTGUN', iconPrefix: 'INV' },
  { item: items.IT_NAILGUN, icon: null, iconInactive: null, iconWidth: 0, iconSuffix: 'NAILGUN', iconPrefix: 'INV' },
  { item: items.IT_SUPER_NAILGUN, icon: null, iconInactive: null, iconWidth: 0, iconSuffix: 'SNAILGUN', iconPrefix: 'INV' },
  { item: items.IT_GRENADE_LAUNCHER, icon: null, iconInactive: null, iconWidth: 0, iconSuffix: 'RLAUNCH', iconPrefix: 'INV' },
  { item: items.IT_ROCKET_LAUNCHER, icon: null, iconInactive: null, iconWidth: 0, iconSuffix: 'SRLAUNCH', iconPrefix: 'INV' },
  { item: items.IT_LIGHTNING, icon: null, iconInactive: null, iconWidth: 0, iconSuffix: 'LIGHTNG', iconPrefix: 'INV' },

  // keys
  { item: items.IT_KEY1, icon: null, iconInactive: null, iconWidth: 0, iconSuffix: 'KEY1', iconPrefix: 'SB' },
  { item: items.IT_KEY2, icon: null, iconInactive: null, iconWidth: 0, iconSuffix: 'KEY2', iconPrefix: 'SB' },

  // powerups
  { item: items.IT_INVISIBILITY, icon: null, iconInactive: null, iconWidth: 0, iconSuffix: 'INVIS', iconPrefix: 'SB' },
  { item: items.IT_INVULNERABILITY, icon: null, iconInactive: null, iconWidth: 0, iconSuffix: 'INVULN', iconPrefix: 'SB' },
  { item: items.IT_SUIT, icon: null, iconInactive: null, iconWidth: 0, iconSuffix: 'SUIT', iconPrefix: 'SB' },
  { item: items.IT_QUAD, icon: null, iconInactive: null, iconWidth: 0, iconSuffix: 'QUAD', iconPrefix: 'SB' },

  // runes
  { item: items.IT_SIGIL1, icon: null, iconInactive: null, iconWidth: 0, iconSuffix: 'SIGIL1', iconPrefix: 'SB' },
  { item: items.IT_SIGIL2, icon: null, iconInactive: null, iconWidth: 0, iconSuffix: 'SIGIL2', iconPrefix: 'SB' },
  { item: items.IT_SIGIL3, icon: null, iconInactive: null, iconWidth: 0, iconSuffix: 'SIGIL3', iconPrefix: 'SB' },
  { item: items.IT_SIGIL4, icon: null, iconInactive: null, iconWidth: 0, iconSuffix: 'SIGIL4', iconPrefix: 'SB' },
];

/**
 * Graphics helper class for the HUD.
 * Used to draw pictures, strings, numbers, and rectangles within a defined layout.
 */
class Gfx {
  offsets = [0, 0];
  scale = 1.0;

  /** @type {number[]} stores layout rect independend from the scale */
  #size = [0, 0];

  static #nums = [
    new Array(11).fill(null),
    new Array(11).fill(null),
  ];

  /** @type {GLTexture} */
  static #colon = null;
  /** @type {GLTexture} */
  static #slash = null;

  /**
   * @param {ClientEngineAPI} clientEngineAPI client engine API
   * @param {number} width viewport width
   * @param {number} height viewport height
   * @param {number} scale scale factor for the HUD
   */
  constructor(clientEngineAPI, width, height, scale = 1.0) {
    this.clientEngineAPI = clientEngineAPI;
    this.#size[0] = width;
    this.#size[1] = height;
    this.scale = scale;
  }

  /**
   * @param {ClientEngineAPI} clientEngineAPI
   */
  static loadAssets(clientEngineAPI) {
    for (let i = 0; i < 10; i++) {
      this.#nums[0][i] = clientEngineAPI.LoadPicFromWad(`NUM_${i}`);
      this.#nums[1][i] = clientEngineAPI.LoadPicFromWad(`ANUM_${i}`);
    }

    this.#nums[0][10] = clientEngineAPI.LoadPicFromWad('NUM_MINUS');
    this.#nums[1][10] = clientEngineAPI.LoadPicFromWad('ANUM_MINUS');

    this.#colon = clientEngineAPI.LoadPicFromWad('NUM_COLON');
    this.#slash = clientEngineAPI.LoadPicFromWad('NUM_SLASH');
  }

  get width() {
    return this.#size[0] * this.scale;
  }

  get height() {
    return this.#size[1] * this.scale;
  }

  alignCenterHorizontally(width) {
    return (this.#size[0] - width * this.scale) / 2;
  }

  drawPic(x, y, pic) {
    this.clientEngineAPI.DrawPic((x + this.offsets[0]), (y + this.offsets[1]), pic, this.scale);
  }

  drawString(x, y, text, scale = 1.0, color = new Vector(1.0, 1.0, 1.0)) {
    this.clientEngineAPI.DrawString((x + this.offsets[0]), (y + this.offsets[1]), text, scale * this.scale, color);
  }

  drawRect(x, y, width, height, color, alpha) {
    this.clientEngineAPI.DrawRect((x + this.offsets[0]), (y + this.offsets[1]), width * this.scale, height * this.scale, color, alpha);
  }

  drawBorderedRect(x, y, width, height, color, alpha, border = 1.0) {
    this.clientEngineAPI.DrawRect((x + this.offsets[0]), (y + this.offsets[1]), width * this.scale, height * this.scale, color, alpha);

    this.clientEngineAPI.DrawRect((x + this.offsets[0]), (y + this.offsets[1]), width * this.scale, border * this.scale, color); // top
    this.clientEngineAPI.DrawRect((x + this.offsets[0]), (y + this.offsets[1] + height - border * this.scale), width * this.scale, border * this.scale, color); // bottom
    this.clientEngineAPI.DrawRect((x + this.offsets[0]), (y + this.offsets[1]), border * this.scale, height * this.scale, color); // left
    this.clientEngineAPI.DrawRect((x + this.offsets[0] + width - border * this.scale), (y + this.offsets[1]), border * this.scale, height * this.scale, color); // right
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
      this.drawPic(x, y, Gfx.#nums[color][frame === 45 ? 10 : frame - 48]);
      x += 24;
    }
  }

  drawSymbol(x, y, symbol) {
    switch (symbol) {
      case ':':
        this.drawPic(x, y, Gfx.#colon);
        break;
      case '/':
        this.drawPic(x, y, Gfx.#slash);
        break;
      default:
        console.assert(false, `Unknown symbol: ${symbol}`);
    }
  }
}

const ammoLowColor = new Vector(1.0, 1.0, 1.0);
const ammoColor = new Vector(1.0, 1.0, 1.0);

export default class HUD {
  /** +showscores/-showscores */
  static #showScoreboard = false;

  /** gamewide stats */
  stats = {
    monsters_total: 0,
    monsters_killed: 0,
    secrets_total: 0,
    secrets_found: 0,
  };

  /** damage related states */
  damage = {
    /** time when the last damage was received based on CL.time */
    time: -Infinity,

    /** attack origin vector */
    attackOrigin: new Vector(0, 0, 0),

    /** damage received, it will automatically decrease over time */
    damageReceived: 0,
  };

  intermission = {
    running: false,
    message: null,
    mapCompletedTime: 0,
  };

  /** @type {Gfx} drawing things within the layout of the status bar */
  sbar = null;
  /** @type {Gfx} drawing things within the layout of any overlay (intermission, rankings etc.) */
  overlay = null;

  /**
   * @param {ClientGameAPI} clientGameAPI this game’s API
   * @param {ClientEngineAPI} clientEngineAPI engine API
   */
  constructor(clientGameAPI, clientEngineAPI) {
    this.game = clientGameAPI;
    this.engine = clientEngineAPI;
    Object.seal(this);
    Object.seal(this.stats);

    // setup the viewport
    this.sbar = new Gfx(this.engine, 320, 24);
    this.overlay = new Gfx(this.engine, 640, 480);
  }

  init() {
    // make sure the HUD is initialized with the correct viewport size
    const { width, height } = this.engine.VID;
    this.#viewportResize(width, height);

    // observe notable events
    this.#subscribeToEvents();

    ammoColor.set(this.engine.IndexToRGB(127));
    ammoLowColor.set(this.engine.IndexToRGB(250));
  }

  shutdown() {
  }

  #subscribeToEvents() {
    // subscribe to viewsize resize events
    this.engine.eventBus.subscribe('cvar.changed', (name) => {
      switch (name) {
        case 'viewsize': {
          const { width, height } = this.engine.VID;
          this.#viewportResize(width, height);
        }
        break;
      }
    });

    // subscribe to viewport resize events
    this.engine.eventBus.subscribe('vid.resize', ({ width, height }) => this.#viewportResize(width, height));

    // damage received
    this.engine.eventBus.subscribe('client.damage', (/** @type {import('../../../shared/GameInterfaces').ClientDamageEvent} */ clientDamageEvent) => {
      this.damage.time = this.engine.CL.time;
      this.damage.attackOrigin.set(clientDamageEvent.attackOrigin);
      this.damage.damageReceived += clientDamageEvent.damageReceived;

      if (this.damage.damageReceived > 150) {
        this.damage.damageReceived = 150; // cap the damage to prevent a stuck damage screen
      }
    });

    // picked up an item
    this.engine.eventBus.subscribe(clientEventName(clientEvent.ITEM_PICKED), (itemEntity, itemNames, netname, items) => {
      if (netname !== null) {
        this.engine.ConsolePrint(`You got ${netname}.\n`);
      } else if (itemNames.length > 0) {
        this.engine.ConsolePrint(`You got ${itemNames.join(', ')}.\n`);
      } else {
        this.engine.ConsolePrint('You found an empty item.\n');
      }

      // TODO: do the picked up animation effect
      console.debug(`Picked up item: ${itemEntity.classname} (items = ${items})`);

      this.engine.BonusFlash(this.engine.IndexToRGB(111), 0.25);
    });

    // still used for some fading item effects
    this.engine.eventBus.subscribe(clientEventName(clientEvent.BONUS_FLASH), () => {
      this.engine.BonusFlash(this.engine.IndexToRGB(111), 0.33);
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

    // intermission screen
    this.engine.eventBus.subscribe(clientEventName(clientEvent.INTERMISSION_START), (message, origin, angles) => {
      this.intermission.running = true;
      this.intermission.message = message || null;
      this.intermission.mapCompletedTime = this.engine.CL.time;

      this.engine.CL.intermission = true;

      console.debug('Intermission started:', this.intermission.message, 'origin: ' + origin, 'angles:' + angles);
    });
  }

  #drawFace(x, y) {
    const citems = this.game.clientdata.items;

    if (citems & (items.IT_INVISIBILITY | items.IT_INVULNERABILITY)) {
      this.sbar.drawPic(x, y, faces.face_invis_invuln);
      return;
    }

    if (citems & (items.IT_QUAD)) {
      this.sbar.drawPic(x, y, faces.face_quad);
      return;
    }

    if (citems & (items.IT_INVISIBILITY)) {
      this.sbar.drawPic(x, y, faces.face_invis);
      return;
    }

    if (citems & (items.IT_INVULNERABILITY)) {
      this.sbar.drawPic(x, y, faces.face_invuln);
      return;
    }

    const health = Math.max(0, this.game.clientdata.health);

    this.sbar.drawPic(x, y, faces.faces[health >= 100.0 ? 4 : Math.floor(health / 20.0)][this.damage.damageReceived > 0 ? 1 : 0]);
  }

  /**
   * Draw the status bar, inventory bar, and score bar.
   */
  #drawStatusBar() {
    const isFullscreen = this.engine.SCR.viewsize === 120;

    if (!isFullscreen) {
      this.sbar.drawPic(0, 0, backgrounds.statusbar);
    }

    // Draw armor
    if (this.game.clientdata.armorvalue >= 0) {
      switch (true) {
        case (this.game.clientdata.items & items.IT_ARMOR3) !== 0:
          this.sbar.drawPic(0, 0, armors.armor3);
          break;
        case (this.game.clientdata.items & items.IT_ARMOR2) !== 0:
          this.sbar.drawPic(0, 0, armors.armor2);
          break;
        case isFullscreen:
        case (this.game.clientdata.items & items.IT_ARMOR1) !== 0:
          this.sbar.drawPic(0, 0, armors.armor1);
          break;
      }

      // Draw armor value
      this.sbar.drawNumber(24, 0, this.game.clientdata.armorvalue, 3, this.game.clientdata.armorvalue <= 25 ? 1 : 0);
    }

    // Draw health
    this.sbar.drawNumber(136, 0, Math.max(0, this.game.clientdata.health), 3, this.game.clientdata.health <= 25 ? 1 : 0);

    // Draw face
    this.#drawFace(112, 0);

    // Draw current ammo
    if (weaponConfig.has(this.game.clientdata.weapon)) {
      const weapon = weaponConfig.get(this.game.clientdata.weapon);

      if (weapon.ammoSlot) {
        this.sbar.drawPic(224, 0, ammos[weapon.ammoSlot]);

        console.assert(this.game.clientdata[weapon.ammoSlot] !== undefined, `Ammo slot ${weapon.ammoSlot} not found in clientdata`);
        const ammo = this.game.clientdata[weapon.ammoSlot];
        this.sbar.drawNumber(248, 0, Math.max(0, ammo), 3, ammo <= 10 ? 1 : 0);
      }
    }
  }

  #drawInventory(offsetY = 0) {
    this.sbar.drawPic(0, offsetY, backgrounds.inventorybar);

    // Draw ammo slots
    const ammoSlots = ['ammo_shells', 'ammo_nails', 'ammo_rockets', 'ammo_cells'];
    for (let i = 0; i < ammoSlots.length; i++) {
      const ammoSlot = ammoSlots[i];
      if (this.game.clientdata[ammoSlot] > 0) {
        this.sbar.drawString((6 * i + 1) * 8 - 2, -24, this.game.clientdata[ammoSlot].toFixed(0).padStart(3), 1.0, this.game.clientdata[ammoSlot] <= 10 ? ammoLowColor : ammoColor);
      }
    }

    // Draw inventory slots (both weapons and items)
    for (let i = 0, wsOffsetX = 0; i < inventory.length; i++) {
      const inv = inventory[i];
      // TODO: do the picked up animation effect
      if (this.game.clientdata.items & inv.item) {
        if (this.game.clientdata.health > 0 && this.game.clientdata.weapon === inv.item) {
          this.sbar.drawPic(wsOffsetX, offsetY + 8, inv.icon);
        } else {
          this.sbar.drawPic(wsOffsetX, offsetY + 8, inv.iconInactive);
        }
      }
      wsOffsetX += inv.iconWidth;
    }
  }

  #drawScoreboard() {
    this.overlay.drawPic(this.overlay.alignCenterHorizontally(labels.ranking.width), 32, labels.ranking);

    const x = 0;
    const y = 64;

    const scores = [];

    for (let i = 0; i < this.engine.CL.maxclients; i++) {
      if (!this.engine.CL.score(i).isActive) {
        continue;
      }

      scores.push(this.engine.CL.score(i));
    }

    scores.sort((a, b) => b.frags - a.frags);

    this.overlay.drawBorderedRect(x, y, this.overlay.width, this.overlay.height - 88, this.engine.IndexToRGB(20), 0.66);

    for (let i = 0; i < scores.length; i++) {
      const score = scores[i];

      this.overlay.drawRect(x + 8, y + 24 * i + 8, 80, 8, this.engine.IndexToRGB((score.colors & 0xf0) + 8));
      this.overlay.drawRect(x + 8, y + 24 * i + 16, 80, 8, this.engine.IndexToRGB((score.colors & 0xf) * 16 + 8));
      this.overlay.drawString(x + 8, y + 24 * i + 8, `[${score.frags.toFixed(0).padStart(3)}] ${score.name.padEnd(25)} ${score.ping.toFixed(0).padStart(4)} ms`, 2.0);
    }
  }

  #drawIntermission() {
    if (this.intermission.message) {
      this.overlay.drawString(16, 16, 'TODO: Intermission Message', 2.0);
      // TODO: draw the intermission message
    } else {
      // draw the default intermission screen
      this.overlay.drawPic(this.overlay.alignCenterHorizontally(labels.complete.width), 24, labels.complete);
      this.overlay.drawPic(132, 76, labels.inter);

      // draw the time in minutes and seconds
      const dig = Math.floor(this.intermission.mapCompletedTime / 60);
      const num = Math.floor(this.intermission.mapCompletedTime - dig * 60);
      this.overlay.drawNumber(140+48+160, 82, dig, 4);
      this.overlay.drawSymbol(234+48+160, 82, ':');
      this.overlay.drawNumber(246+48+160, 82, Math.floor(num / 10), 1);
      this.overlay.drawNumber(266+48+160, 82, num % 10, 1);

      // draw secrets
      this.overlay.drawNumber(140+160, 122, this.stats.secrets_found, 3);
      this.overlay.drawSymbol(234+160, 122, '/');
      this.overlay.drawNumber(266+160, 122, this.stats.secrets_total, 3);

      // draw monsters
      this.overlay.drawNumber(140+160, 162, this.stats.monsters_killed, 3);
      this.overlay.drawSymbol(234+160, 162, '/');
      this.overlay.drawNumber(266+160, 162, this.stats.monsters_total, 3);
    }
  }

  /**
   * Draws a mini info bar at the top of the screen with game stats and level name.
   * @param {number} offsetY vertical offset for the mini info bar
   */
  #drawMiniInfo(offsetY = 0) {
    this.sbar.drawPic(0, offsetY, backgrounds.scorebar);

    const monsters = `Monsters: ${this.stats.monsters_killed} / ${this.stats.monsters_total}`;
    const secrets = ` Secrets: ${this.stats.secrets_found} / ${this.stats.secrets_total}`;

    this.sbar.drawString(8, offsetY + 4,  `${monsters.padEnd(19)} ${Q.secsToTime(this.engine.CL.time).padStart(18)}`);
    this.sbar.drawString(8, offsetY + 12, `${secrets.padEnd(19)} ${new String(this.engine.CL.levelname).trim().padStart(18)}`.substring(0, 38));
  }

  draw() {
    if (this.intermission.running) {
      if (this.engine.CL.maxclients > 1) {
        this.#drawScoreboard();
      } else {
        this.#drawIntermission();
      }
      return;
    }

    if (HUD.#showScoreboard) {
      if (this.engine.CL.maxclients > 1) {
        this.#drawScoreboard();
      } else {
        if (this.engine.SCR.viewsize === 120 || this.engine.SCR.viewsize <= 100) {
          this.#drawInventory(-24);
        }
        this.#drawMiniInfo();
        return;
      }
    }

    if (this.engine.SCR.viewsize <= 100) {
      this.#drawInventory(-24);
    }

    this.#drawStatusBar();
  }

  startFrame() {
    if (this.damage.damageReceived > 0) {
      this.damage.damageReceived -= this.engine.CL.frametime * 25; // decrease damage over time

      if (this.damage.damageReceived < 0) {
        this.damage.damageReceived = 0;
      }
    }
  }

  saveState() {
    return {
      damage: this.damage,
      intermission: this.intermission,
      stats: this.stats,
    };
  }

  loadState(state) {
    this.damage = Object.assign(this.damage, state.damage);
    this.damage.attackOrigin = new Vector(...state.damage.attackOrigin);
    this.intermission = Object.assign(this.intermission, state.intermission);
    this.stats = Object.assign(this.stats, state.stats);
  }

  /**
   * @param {number} width viewport width
   * @param {number} height viewport height
   */
  #viewportResize(width, height) {
    // TODO: scale is broken
    // if (width > 1024 && height > 768) {
    //   this.gfx.scale = 1.5;
    // }

    this.sbar.offsets[0] = Math.floor(width / 2 - this.sbar.width / 2);
    this.sbar.offsets[1] = Math.floor(height - this.sbar.height);

    /** making sure we vertically center the box within the view height, not the full height */
    const viewHeight = height - Math.floor((20 - Math.max(0, this.engine.SCR.viewsize - 100)) * 2.4);

    this.overlay.offsets[0] = Math.floor((width - this.overlay.width) / 2);
    this.overlay.offsets[1] = Math.floor((viewHeight - this.overlay.height) / 2);
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

    labels.ranking = engineAPI.LoadPicFromLump('ranking');
    labels.complete = engineAPI.LoadPicFromLump('complete');
    labels.inter = engineAPI.LoadPicFromLump('inter');
    labels.finale = engineAPI.LoadPicFromLump('finale');

    for (const weapon of inventory) {
      if (weapon.iconPrefix === 'INV') {
        weapon.icon = engineAPI.LoadPicFromWad(`INV2_${weapon.iconSuffix}`);
        weapon.iconInactive = engineAPI.LoadPicFromWad(`INV_${weapon.iconSuffix}`);
      } else {
        weapon.icon = engineAPI.LoadPicFromWad(`${weapon.iconPrefix}_${weapon.iconSuffix}`);
        weapon.iconInactive = weapon.icon; // no inactive icon for keys
      }

      weapon.iconWidth = weapon.icon.width;
    }

    engineAPI.RegisterCommand('+showscores', () => { this.#showScoreboard = true; });
    engineAPI.RegisterCommand('-showscores', () => { this.#showScoreboard = false; });

    Gfx.loadAssets(engineAPI);
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
