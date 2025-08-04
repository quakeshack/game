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

const ammoLowColor = new Vector(1.0, 1.0, 1.0);
const ammoColor = new Vector(1.0, 1.0, 1.0);

export default class HUD {
  /** +showscores/-showscores */
  static #showScoreboard = false;

  /** @type {Gfx} */
  static gfx = null;

  static viewport = {
    /** viewport width */
    width: 0,
    /** viewport height */
    height: 0,
  };

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
  };

  /**
   * @param {ClientGameAPI} clientGameAPI this game’s API
   * @param {ClientEngineAPI} clientEngineAPI engine API
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

    ammoColor.set(this.engine.IndexToRGB(127));
    ammoLowColor.set(this.engine.IndexToRGB(250));
  }

  shutdown() {
  }

  #subscribeToEvents() {
    // subscribe to viewport resize events
    this.engine.eventBus.subscribe('vid.resize', ({ width, height }) => HUD.#viewportResize(width, height));

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
    this.engine.eventBus.subscribe(clientEventName(clientEvent.ITEM_PICKED), (itemEntity, itemName, items) => {
      if (itemName !== null) {
        this.engine.ConsolePrint(`You got ${itemName} (${itemEntity.classname}, ${items}).\n`);
      } else {
        this.engine.ConsolePrint('You found an empty item.\n');
      }

      // TODO: do the picked up animation effect

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

    // intermission screen
    this.engine.eventBus.subscribe(clientEventName(clientEvent.INTERMISSION_START), (message) => {
      this.intermission.running = true;
      this.intermission.message = message || null;

      this.engine.CL.intermission = true;
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

    HUD.gfx.drawPic(x, y, faces.faces[health >= 100.0 ? 4 : Math.floor(health / 20.0)][this.damage.damageReceived > 0 ? 1 : 0]);
  }

  /**
   * Draw the status bar, inventory bar, and score bar.
   */
  #drawStatusBar() {
    const isFullscreen = this.engine.SCR.viewsize === 120;

    if (!isFullscreen) {
      HUD.gfx.drawPic(0, 0, backgrounds.statusbar);
    }

    // Draw armor
    if (this.game.clientdata.armorvalue >= 0) {
      switch (true) {
        case (this.game.clientdata.items & items.IT_ARMOR3) !== 0:
          HUD.gfx.drawPic(0, 0, armors.armor3);
          break;
        case (this.game.clientdata.items & items.IT_ARMOR2) !== 0:
          HUD.gfx.drawPic(0, 0, armors.armor2);
          break;
        case isFullscreen:
        case (this.game.clientdata.items & items.IT_ARMOR1) !== 0:
          HUD.gfx.drawPic(0, 0, armors.armor1);
          break;
      }

      // Draw armor value
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

    // Draw ammo slots
    const ammoSlots = ['ammo_shells', 'ammo_nails', 'ammo_rockets', 'ammo_cells'];
    for (let i = 0; i < ammoSlots.length; i++) {
      const ammoSlot = ammoSlots[i];
      if (this.game.clientdata[ammoSlot] > 0) {
        HUD.gfx.drawString((6 * i + 1) * 8 - 2, -24, this.game.clientdata[ammoSlot].toFixed(0).padStart(3), 1.0, this.game.clientdata[ammoSlot] <= 10 ? ammoLowColor : ammoColor);
      }
    }

    // Draw inventory slots (both weapons and items)
    for (let i = 0, wsOffsetX = 0; i < inventory.length; i++) {
      const inv = inventory[i];
      // TODO: do the picked up animation effect
      if (this.game.clientdata.items & inv.item) {
        if (this.game.clientdata.health > 0 && this.game.clientdata.weapon === inv.item) {
          HUD.gfx.drawPic(wsOffsetX, offsetY + 8, inv.icon);
        } else {
          HUD.gfx.drawPic(wsOffsetX, offsetY + 8, inv.iconInactive);
        }
      }
      wsOffsetX += inv.iconWidth;
    }
  }

  #drawScoreboard() {
    this.engine.DrawPic((HUD.viewport.width - labels.ranking.width) / 2, 32, labels.ranking);

    const x = HUD.viewport.width / 2 - 240;
    const y = 64;

    const scores = [];

    for (let i = 0; i < this.engine.CL.maxclients; i++) {
      if (!this.engine.CL.score(i).isActive) {
        continue;
      }

      scores.push(this.engine.CL.score(i));
    }

    scores.sort((a, b) => b.frags - a.frags);

    for (let i = 0; i < scores.length; i++) {
      const score = scores[i];

      this.engine.DrawRect(x, y + 24 * i + 0, 80, 8, this.engine.IndexToRGB((score.colors & 0xf0) + 8));
      this.engine.DrawRect(x, y + 24 * i + 8, 80, 8, this.engine.IndexToRGB((score.colors & 0xf) * 16 + 8));

      this.engine.DrawString(x, y + 24 * i, `[${score.frags.toFixed(0).padStart(3)}] ${score.name.padEnd(16)} (${score.ping.toFixed(1)} ms)`, 2.0);
    }
  }

  /**
   * Draws a mini info bar at the top of the screen with game stats and level name.
   * @param {number} offsetY vertical offset for the mini info bar
   */
  #drawMiniInfo(offsetY = 0) {
    HUD.gfx.drawPic(0, offsetY, backgrounds.scorebar);

    const monsters = `Monsters: ${this.stats.monsters_killed} / ${this.stats.monsters_total}`;
    const secrets = ` Secrets: ${this.stats.secrets_found} / ${this.stats.secrets_total}`;

    HUD.gfx.drawString(8, offsetY + 4,  `${monsters.padEnd(19)} ${Q.secsToTime(this.engine.CL.time).padStart(18)}`);
    HUD.gfx.drawString(8, offsetY + 12, `${secrets.padEnd(19)} ${new String(this.engine.CL.levelname).trim().padStart(18)}`.substring(0, 38));
  }

  draw() {
    if (this.intermission.running) {
      this.engine.DrawString(16, 16, 'TODO: Intermission', 2.0);
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

  /**
   * @param {number} width viewport width
   * @param {number} height viewport height
   */
  static #viewportResize(width, height) {
    // TODO: scale is broken
    // if (width > 1024 && height > 768) {
    //   this.gfx.scale = 1.5;
    // }

    this.viewport.width = width;
    this.viewport.height = height;

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
