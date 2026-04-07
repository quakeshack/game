import type { ClientDamageEvent, ClientEngineAPI, GLTexture } from '../../../shared/GameInterfaces.ts';

import Q from '../../../shared/Q.ts';
import Vector from '../../../shared/Vector.ts';

import { clientEvent, clientEventName, colors, contentShift, items } from '../Defs.ts';
import { weaponConfig, type WeaponConfigKey } from '../entity/Weapons.ts';
import type { ClientGameAPI } from './ClientAPI.ts';
import { ClientStats, type ClientStatsSnapshot } from './Sync.ts';

type AmmoSlot = 'ammo_shells' | 'ammo_nails' | 'ammo_rockets' | 'ammo_cells';
type HUDColor = Vector;
type SerializedVector3 = [number, number, number];
type MutableTextureGroup = Record<string, GLTexture | null>;

interface HUDBackgrounds {
  statusbar: GLTexture | null;
  inventorybar: GLTexture | null;
  scorebar: GLTexture | null;
}

interface HUDFaces {
  face_invis: GLTexture | null;
  face_invuln: GLTexture | null;
  face_invis_invuln: GLTexture | null;
  face_quad: GLTexture | null;
  faces: Array<[GLTexture | null, GLTexture | null]>;
}

interface HUDArmors {
  armor1: GLTexture | null;
  armor2: GLTexture | null;
  armor3: GLTexture | null;
}

interface HUDAmmos {
  ammo_shells: GLTexture | null;
  ammo_nails: GLTexture | null;
  ammo_rockets: GLTexture | null;
  ammo_cells: GLTexture | null;
}

interface HUDLabels {
  ranking: GLTexture | null;
  complete: GLTexture | null;
  inter: GLTexture | null;
  finale: GLTexture | null;
}

interface InventoryEntry {
  readonly item: items;
  icon: GLTexture | null;
  iconInactive: GLTexture | null;
  iconWidth: number;
  readonly iconSuffix: string;
  readonly iconPrefix: 'INV' | 'SB';
}

interface HUDMessage {
  readonly message: string;
  readonly color: Vector;
  readonly endtime: number;
}

export interface HUDDamageState {
  time: number;
  attackOrigin: SerializedVector3 | Record<number, number>;
  damageReceived: number;
}

export interface HUDIntermissionState {
  running: boolean;
  message: string | null;
  mapCompletedTime: number;
}

export interface HUDSaveState {
  damage: HUDDamageState;
  intermission: HUDIntermissionState;
  stats: ClientStatsSnapshot;
}

const backgrounds: HUDBackgrounds = {
  statusbar: null,
  inventorybar: null,
  scorebar: null,
};

const faces: HUDFaces = {
  face_invis: null,
  face_invuln: null,
  face_invis_invuln: null,
  face_quad: null,
  faces: [
    [null, null],
    [null, null],
    [null, null],
    [null, null],
    [null, null],
  ],
};

const armors: HUDArmors = {
  armor1: null,
  armor2: null,
  armor3: null,
};

const ammos: HUDAmmos = {
  ammo_shells: null,
  ammo_nails: null,
  ammo_rockets: null,
  ammo_cells: null,
};

const labels: HUDLabels = {
  ranking: null,
  complete: null,
  inter: null,
  finale: null,
};

const ammoSlots = ['ammo_shells', 'ammo_nails', 'ammo_rockets', 'ammo_cells'] as const;

const inventory: InventoryEntry[] = [
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
 * Assert that a named HUD texture is loaded before accessing it.
 * @returns The loaded texture.
 */
function expectTexture(texture: GLTexture | null, name: string): GLTexture {
  console.assert(texture !== null, `${name} HUD texture must be loaded before use`);
  return texture as GLTexture;
}

/**
 * Collect a texture reference for later shutdown cleanup.
 */
function addTexture(textures: Set<GLTexture>, texture: GLTexture | null): void {
  if (texture !== null) {
    textures.add(texture);
  }
}

/**
 * Reset a mutable texture group back to its unloaded state.
 */
function clearTextureGroup(textures: MutableTextureGroup): void {
  for (const key of Object.keys(textures) as Array<keyof MutableTextureGroup>) {
    textures[key] = null;
  }
}

/**
 * Convert a saved vector payload into a stable tuple form.
 * @returns Serialized three-component vector data.
 */
function toSerializedVector3(value: Vector | readonly number[] | Record<number, number>): SerializedVector3 {
  return [
    value[0] ?? 0,
    value[1] ?? 0,
    value[2] ?? 0,
  ];
}

/**
 * Rebuild a Vector from saved HUD state.
 * @returns Hydrated vector value.
 */
function toVector(value: Vector | readonly number[] | Record<number, number>): Vector {
  const [x, y, z] = toSerializedVector3(value);
  return new Vector(x, y, z);
}

/**
 * Graphics helper class for the HUD.
 * Used to draw pictures, strings, numbers, and rectangles within a defined layout.
 */
export class Gfx {
  offsets: [number, number] = [0, 0];
  scale = 1.0;

  /** stores layout rect independend from the scale */
  #size: [number, number] = [0, 0];

  static #nums: Array<Array<GLTexture | null>> = [
    new Array<GLTexture | null>(11).fill(null),
    new Array<GLTexture | null>(11).fill(null),
  ];

  static #colon: GLTexture | null = null;
  static #slash: GLTexture | null = null;

  readonly clientEngineAPI: ClientEngineAPI;

  constructor(clientEngineAPI: ClientEngineAPI, width: number, height: number, scale = 1.0) {
    this.clientEngineAPI = clientEngineAPI;
    this.#size[0] = width;
    this.#size[1] = height;
    this.scale = scale;
  }

  static loadAssets(clientEngineAPI: ClientEngineAPI): void {
    for (let i = 0; i < 10; i++) {
      this.#nums[0][i] = clientEngineAPI.LoadPicFromWad(`NUM_${i}`);
      this.#nums[1][i] = clientEngineAPI.LoadPicFromWad(`ANUM_${i}`);
    }

    this.#nums[0][10] = clientEngineAPI.LoadPicFromWad('NUM_MINUS');
    this.#nums[1][10] = clientEngineAPI.LoadPicFromWad('ANUM_MINUS');

    this.#colon = clientEngineAPI.LoadPicFromWad('NUM_COLON');
    this.#slash = clientEngineAPI.LoadPicFromWad('NUM_SLASH');
  }

  static shutdown(): void {
    const textures = new Set<GLTexture>();

    for (const row of this.#nums) {
      for (const texture of row) {
        addTexture(textures, texture);
      }
    }

    addTexture(textures, this.#colon);
    addTexture(textures, this.#slash);

    for (const texture of textures) {
      texture.free();
    }

    for (const row of this.#nums) {
      row.fill(null);
    }

    this.#colon = null;
    this.#slash = null;
  }

  get width(): number {
    return this.#size[0] * this.scale;
  }

  get height(): number {
    return this.#size[1] * this.scale;
  }

  alignCenterHorizontally(width: number): number {
    return (this.#size[0] - width * this.scale) / 2;
  }

  drawPic(x: number, y: number, pic: GLTexture | null): void {
    if (pic === null) {
      console.assert(false, 'HUD picture must be loaded before drawing');
      return;
    }

    this.clientEngineAPI.DrawPic(x + this.offsets[0], y + this.offsets[1], pic, this.scale);
  }

  drawString(x: number, y: number, text: string, scale = 1.0, color = new Vector(1.0, 1.0, 1.0)): void {
    this.clientEngineAPI.DrawString(x + this.offsets[0], y + this.offsets[1], text, scale * this.scale, color);
  }

  drawRect(x: number, y: number, width: number, height: number, color: HUDColor, alpha = 1.0): void {
    this.clientEngineAPI.DrawRect(
      x + this.offsets[0],
      y + this.offsets[1],
      width * this.scale,
      height * this.scale,
      color,
      alpha,
    );
  }

  drawBorderedRect(x: number, y: number, width: number, height: number, color: HUDColor, alpha: number, border = 1.0): void {
    this.clientEngineAPI.DrawRect(x + this.offsets[0], y + this.offsets[1], width * this.scale, height * this.scale, color, alpha);

    this.clientEngineAPI.DrawRect(x + this.offsets[0], y + this.offsets[1], width * this.scale, border * this.scale, color); // top
    this.clientEngineAPI.DrawRect(x + this.offsets[0], y + this.offsets[1] + height - border * this.scale, width * this.scale, border * this.scale, color); // bottom
    this.clientEngineAPI.DrawRect(x + this.offsets[0], y + this.offsets[1], border * this.scale, height * this.scale, color); // left
    this.clientEngineAPI.DrawRect(x + this.offsets[0] + width - border * this.scale, y + this.offsets[1], border * this.scale, height * this.scale, color); // right
  }

  drawNumber(x: number, y: number, value: number, digits = 3, color = 0): void {
    let text = value.toFixed(0); // can only handle integers
    if (text.length > digits) {
      text = text.substring(text.length - digits, text.length);
    } else if (text.length < digits) {
      x += (digits - text.length) * 24;
    }

    for (let i = 0; i < text.length; i++) {
      const frame = text.charCodeAt(i);
      this.drawPic(x, y, Gfx.#nums[color][frame === 45 ? 10 : frame - 48]);
      x += 24;
    }
  }

  drawSymbol(x: number, y: number, symbol: string): void {
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

export class MessageBag {
  protected _engine: ClientEngineAPI;
  protected _gfx: Gfx;
  protected _messages: HUDMessage[] = [];
  protected _offset: [number, number] = [0, 0];

  constructor(engine: ClientEngineAPI, gfx: Gfx) {
    this._engine = engine;
    this._gfx = gfx;
  }

  /**
   * Adds a message to the bag.
   */
  addMessage(message: string, duration = 5.0, color = new Vector(1.0, 1.0, 1.0)): void {
    this._messages.push({
      message,
      color,
      endtime: this._engine.CL.gametime + duration,
    });

    this._engine.ConsolePrint(`\x03${message}\n`, color); // TODO: have a better system for this
  }

  /**
   * Draws messages from the bag. Also removes expired messages.
   */
  drawMessages(): void {
    const now = this._engine.CL.gametime;

    this._messages = this._messages.filter((message) => message.endtime > now);

    if (this._messages.length > 5) {
      this._messages = this._messages.slice(this._messages.length - 5);
    }

    for (let i = this._messages.length - 1; i >= 0; i--) {
      const message = this._messages[i];
      const offset = 1; // Math.min(1, (msg.endtime - now) / 1.0); // fade out in the last second
      this._gfx.drawString(-160 + this._offset[0], (this._messages.length - i + 1 + offset) * -16 + this._offset[1], message.message.trim(), 2.0, message.color);
    }
  }
}

export class Q1HUD {
  /** +showscores/-showscores */
  protected static _showScoreboard = false;

  protected static readonly _ammoLowColor = new Vector(1.0, 1.0, 1.0);
  protected static readonly _ammoColor = new Vector(1.0, 1.0, 1.0);

  protected stats: ClientStats | null = null;
  protected messageBag: MessageBag | null = null;

  protected damage = {
    /** time when the last damage was received based on CL.gametime */
    time: -Infinity,

    /** attack origin vector */
    attackOrigin: new Vector(0, 0, 0),

    /** damage received, it will automatically decrease over time */
    damageReceived: 0,
  };

  protected intermission = {
    running: false,
    message: null as string | null,
    mapCompletedTime: 0,
  };

  protected readonly sbar: Gfx;
  protected readonly overlay: Gfx;
  protected readonly game: ClientGameAPI;
  protected readonly engine: ClientEngineAPI;

  protected _newStats(): ClientStats {
    return new ClientStats(this.engine);
  }

  protected _newMessageBag(): MessageBag {
    return new MessageBag(this.engine, this.sbar);
  }

  constructor(clientGameAPI: ClientGameAPI, clientEngineAPI: ClientEngineAPI) {
    this.game = clientGameAPI;
    this.engine = clientEngineAPI;

    // setup the viewport
    this.sbar = new Gfx(this.engine, 320, 24);
    this.overlay = new Gfx(this.engine, 640, 480);
  }

  get hudStats(): ClientStats {
    return this.#requireStats();
  }

  get hudMessages(): MessageBag {
    return this.#requireMessageBag();
  }

  init(): void {
    // make sure the HUD is initialized with the correct viewport size
    const { width, height } = this.engine.VID;
    this._viewportResize(width, height);

    this.stats = this._newStats();
    this.messageBag = this._newMessageBag();

    this._initColors();

    // observe notable events
    this._subscribeToEvents();
  }

  shutdown(): void {
  }

  /**
   * Initializes color values.
   */
  protected _initColors(): void {
    const thisClass = this.constructor as typeof Q1HUD;

    thisClass._ammoColor.set(this.engine.IndexToRGB(colors.HUD_AMMO_NORMAL));
    thisClass._ammoLowColor.set(this.engine.IndexToRGB(colors.HUD_AMMO_WARNING));
  }

  /**
   * Subscribes to relevant events.
   */
  protected _subscribeToEvents(): void {
    // subscribe to viewsize resize events
    this.engine.eventBus.subscribe('cvar.changed', (name: string): void => {
      switch (name) {
        case 'viewsize': {
          const { width, height } = this.engine.VID;
          this._viewportResize(width, height);
        }
          break;
      }
    });

    // subscribe to viewport resize events
    this.engine.eventBus.subscribe('vid.resize', ({ width, height }: { width: number; height: number }): void => {
      this._viewportResize(width, height);
    });

    // damage received
    this.engine.eventBus.subscribe('client.damage', (clientDamageEvent: ClientDamageEvent): void => {
      this.damage.time = this.engine.CL.gametime;
      this.damage.attackOrigin.set(clientDamageEvent.attackOrigin);
      this.damage.damageReceived += clientDamageEvent.damageReceived;

      if (this.damage.damageReceived > 150) {
        this.damage.damageReceived = 150; // cap the damage to prevent a stuck damage screen
      }
    });

    // picked up an item
    this.engine.eventBus.subscribe(
      clientEventName(clientEvent.ITEM_PICKED),
      (_itemEntity: object, itemNames: string[], netname: string | null): void => {
        const messageBag = this.#requireMessageBag();
        if (netname !== null) {
          messageBag.addMessage(`You got ${netname}.`);
        } else if (itemNames.length > 0) {
          messageBag.addMessage(`You got ${itemNames.join(', ')}.`);
        } else {
          messageBag.addMessage('You found an empty item.');
        }

        // TODO: do the picked up animation effect
        // console.debug(`Picked up item: ${itemEntity.classname} (items = ${items})`);

        this.engine.ContentShift(contentShift.bonus, new Vector(...this.engine.IndexToRGB(colors.HUD_CSHIFT_BONUSFLASH)), 0.2);
      },
    );

    // still used for some fading item effects
    this.engine.eventBus.subscribe(clientEventName(clientEvent.BONUS_FLASH), (): void => {
      this.engine.ContentShift(contentShift.bonus, new Vector(...this.engine.IndexToRGB(colors.HUD_CSHIFT_BONUSFLASH)), 0.2);
    });

    // game stats updates during game play
    this.engine.eventBus.subscribe(clientEventName(clientEvent.STATS_UPDATED), (slot: string): void => {
      if (slot === 'secrets_found') {
        this.engine.ContentShift(contentShift.info, new Vector(...this.engine.IndexToRGB(colors.HUD_CSHIFT_SECRET)), 0.2);
      }
    });

    // intermission screen
    this.engine.eventBus.subscribe(
      clientEventName(clientEvent.INTERMISSION_START),
      (message: string | null, origin: Vector, angles: Vector): void => {
        this.intermission.running = true;
        this.intermission.message = message || null;
        this.intermission.mapCompletedTime = this.engine.CL.gametime;

        this.engine.CL.intermission = true;

        console.debug('Intermission started:', this.intermission.message, `origin: ${origin}`, `angles:${angles}`);
      },
    );

    // chat message
    this.engine.eventBus.subscribe('client.chat.message', (name: string, message: string, isDirect: boolean): void => {
      const color = isDirect ? new Vector(0.5, 1.0, 0.5) : new Vector(1.0, 1.0, 1.0);

      this.#requireMessageBag().addMessage(`${name}: ${message}`, 10.0, color);

      this.engine.LoadSound('misc/talk.wav').play();
    });

    // obituary event
    this.engine.eventBus.subscribe(clientEventName(clientEvent.OBITUARY), (...args: unknown[]): void => {
      console.info('OBITUARY event received, not implemented yet', args);
    });
  }

  /**
   * Draws our protagonist’s face.
   */
  protected _drawFace(x: number, y: number): void {
    const clientdata = this.game.clientdata;
    const currentItems = clientdata.items;

    if ((currentItems & (items.IT_INVISIBILITY | items.IT_INVULNERABILITY)) !== 0) {
      this.sbar.drawPic(x, y, faces.face_invis_invuln);
      return;
    }

    if ((currentItems & items.IT_QUAD) !== 0) {
      this.sbar.drawPic(x, y, faces.face_quad);
      return;
    }

    if ((currentItems & items.IT_INVISIBILITY) !== 0) {
      this.sbar.drawPic(x, y, faces.face_invis);
      return;
    }

    if ((currentItems & items.IT_INVULNERABILITY) !== 0) {
      this.sbar.drawPic(x, y, faces.face_invuln);
      return;
    }

    const health = Math.max(0, clientdata.health);

    this.sbar.drawPic(x, y, faces.faces[health >= 100.0 ? 4 : Math.floor(health / 20.0)][this.damage.damageReceived > 0 ? 1 : 0]);
  }

  /**
   * Draws the status bar, inventory bar, and score bar.
   */
  protected _drawStatusBar(): void {
    const clientdata = this.game.clientdata;
    const isFullscreen = this.engine.SCR.viewsize === 120;

    if (!isFullscreen) {
      this.sbar.drawPic(0, 0, backgrounds.statusbar);
    }

    // Draw armor
    if (clientdata.armorvalue >= 0) {
      switch (true) {
        case (clientdata.items & items.IT_ARMOR3) !== 0:
          this.sbar.drawPic(0, 0, armors.armor3);
          break;
        case (clientdata.items & items.IT_ARMOR2) !== 0:
          this.sbar.drawPic(0, 0, armors.armor2);
          break;
        case isFullscreen:
        case (clientdata.items & items.IT_ARMOR1) !== 0:
          this.sbar.drawPic(0, 0, armors.armor1);
          break;
      }

      // Draw armor value
      this.sbar.drawNumber(24, 0, clientdata.armorvalue, 3, clientdata.armorvalue <= 25 ? 1 : 0);
    }

    // Draw health
    this.sbar.drawNumber(136, 0, Math.max(0, clientdata.health), 3, clientdata.health <= 25 ? 1 : 0);

    // Draw face
    this._drawFace(112, 0);

    // Draw current ammo
    if (weaponConfig.has(clientdata.weapon as WeaponConfigKey)) {
      const weapon = weaponConfig.get(clientdata.weapon as WeaponConfigKey);

      if (weapon?.ammoSlot !== null && weapon !== undefined) {
        this.sbar.drawPic(224, 0, ammos[weapon.ammoSlot]);

        const ammo = clientdata[weapon.ammoSlot];
        this.sbar.drawNumber(248, 0, Math.max(0, ammo), 3, ammo <= 10 ? 1 : 0);
      }
    }
  }

  /**
   * Draws inventory.
   */
  protected _drawInventory(offsetY = 0): void {
    const clientdata = this.game.clientdata;
    const thisClass = this.constructor as typeof Q1HUD;
    const ammoLowColor = thisClass._ammoLowColor;
    const ammoColor = thisClass._ammoColor;

    this.sbar.drawPic(0, offsetY, backgrounds.inventorybar);

    // Draw ammo slots
    for (let i = 0; i < ammoSlots.length; i++) {
      const ammoSlot = ammoSlots[i] as AmmoSlot;
      if (clientdata[ammoSlot] > 0) {
        this.sbar.drawString((6 * i + 1) * 8 - 2, -24, clientdata[ammoSlot].toFixed(0).padStart(3), 1.0, clientdata[ammoSlot] <= 10 ? ammoLowColor : ammoColor);
      }
    }

    // Draw inventory slots (both weapons and items)
    for (let i = 0, wsOffsetX = 0; i < inventory.length; i++) {
      const entry = inventory[i];
      // TODO: do the picked up animation effect
      if ((clientdata.items & entry.item) !== 0) {
        if (clientdata.health > 0 && clientdata.weapon === entry.item) {
          this.sbar.drawPic(wsOffsetX, offsetY + 8, entry.icon);
        } else {
          this.sbar.drawPic(wsOffsetX, offsetY + 8, entry.iconInactive);
        }
      }
      wsOffsetX += entry.iconWidth;
    }
  }

  /**
   * Draws multiplayer scoreboard.
   */
  protected _drawScoreboard(): void {
    const rankingLabel = expectTexture(labels.ranking, 'ranking');
    const secondaryColor = new Vector(...this.engine.IndexToRGB(colors.HUD_RANKING_TEXT));

    this.overlay.drawPic(this.overlay.width - rankingLabel.width, 32, rankingLabel);
    this.overlay.drawString((rankingLabel.height - 16) / 2, 32, this.game.serverInfo.hostname, 2.0, secondaryColor);

    const x = 0;
    let y = 64;

    const scores: Array<ReturnType<typeof this.engine.CL.score>> = [];

    for (let i = 0; i < this.engine.CL.maxclients; i++) {
      const score = this.engine.CL.score(i);
      if (!score.isActive) {
        continue;
      }

      scores.push(score);
    }

    scores.sort((a, b) => b.frags - a.frags);

    this.overlay.drawBorderedRect(x, y, this.overlay.width, this.overlay.height - 88, new Vector(...this.engine.IndexToRGB(colors.HUD_RANKING_BACKGROUND)), 0.66);

    for (let i = 0; i < scores.length; i++) {
      const score = scores[i];

      this.overlay.drawRect(x + 8, y + 24 * i + 8, 80, 8, new Vector(...this.engine.IndexToRGB((score.colors & 0xf0) + 8)));
      this.overlay.drawRect(x + 8, y + 24 * i + 16, 80, 8, new Vector(...this.engine.IndexToRGB((score.colors & 0xf) * 16 + 8)));
      this.overlay.drawString(x + 8, y + 24 * i + 8, `[${score.frags.toFixed(0).padStart(3)}] ${score.name.padEnd(25)} ${score.ping.toFixed(0).padStart(4)} ms`, 2.0);
    }

    y += this.overlay.height - 88;

    if (this.game.serverInfo.coop !== '0') {
      const stats = this.#requireStats();
      const monsters = `Monsters: ${stats.monsters_killed.toFixed(0).padStart(3)} / ${stats.monsters_total.toFixed(0).padStart(3)}`;
      const secrets = `Secrets:  ${stats.secrets_found.toFixed(0).padStart(3)} / ${stats.secrets_total.toFixed(0).padStart(3)}`;
      this.overlay.drawString(x + 8, y + 8, monsters, 1.0, secondaryColor);
      this.overlay.drawString(x + 8, y + 16, secrets, 1.0, secondaryColor);

      const time = Q.secsToTime(this.engine.CL.gametime);
      this.overlay.drawString(this.overlay.width - 8 - 16 * time.length, y + 8, time, 2.0, secondaryColor);
    }
  }

  /**
   * Draws intermission screen.
   */
  protected _drawIntermission(): void {
    const stats = this.#requireStats();

    if (this.intermission.message) {
      this.overlay.drawString(16, 16, 'TODO: Intermission Message', 2.0);
      // TODO: draw the intermission message
    } else {
      const completeLabel = expectTexture(labels.complete, 'complete');
      const interLabel = expectTexture(labels.inter, 'inter');

      // draw the default intermission screen
      this.overlay.drawPic(this.overlay.alignCenterHorizontally(completeLabel.width), 24, completeLabel);
      this.overlay.drawPic(132, 76, interLabel);

      // draw the time in minutes and seconds
      const dig = Math.floor(this.intermission.mapCompletedTime / 60);
      const num = Math.floor(this.intermission.mapCompletedTime - dig * 60);
      this.overlay.drawNumber(140 + 48 + 160, 82, dig, 4);
      this.overlay.drawSymbol(234 + 48 + 160, 82, ':');
      this.overlay.drawNumber(246 + 48 + 160, 82, Math.floor(num / 10), 1);
      this.overlay.drawNumber(266 + 48 + 160, 82, num % 10, 1);

      // draw secrets
      this.overlay.drawNumber(140 + 160, 122, stats.secrets_found, 3);
      this.overlay.drawSymbol(234 + 160, 122, '/');
      this.overlay.drawNumber(266 + 160, 122, stats.secrets_total, 3);

      // draw monsters
      this.overlay.drawNumber(140 + 160, 162, stats.monsters_killed, 3);
      this.overlay.drawSymbol(234 + 160, 162, '/');
      this.overlay.drawNumber(266 + 160, 162, stats.monsters_total, 3);
    }
  }

  /**
   * Draws a mini info bar at the top of the screen with game stats and level name.
   */
  protected _drawMiniInfo(offsetY = 0): void {
    const stats = this.#requireStats();

    this.sbar.drawPic(0, offsetY, backgrounds.scorebar);

    const monsters = `Monsters: ${stats.monsters_killed} / ${stats.monsters_total}`;
    const secrets = ` Secrets: ${stats.secrets_found} / ${stats.secrets_total}`;

    this.sbar.drawString(8, offsetY + 4, `${monsters.padEnd(19)} ${Q.secsToTime(this.engine.CL.gametime).padStart(18)}`);
    this.sbar.drawString(8, offsetY + 12, `${secrets.padEnd(19)} ${this.engine.CL.levelname.trim().padStart(18)}`.substring(0, 38));
  }

  draw(): void {
    if (this.intermission.running) {
      if (this.engine.CL.maxclients > 1) {
        this._drawScoreboard();
      } else {
        this._drawIntermission();
      }
      return;
    }

    if (Q1HUD._showScoreboard) {
      if (this.engine.CL.maxclients > 1) {
        this._drawScoreboard();
      } else {
        if (this.engine.SCR.viewsize === 120 || this.engine.SCR.viewsize <= 100) {
          this._drawInventory(-24);
        }
        this._drawMiniInfo();
        return;
      }
    }

    if (this.engine.SCR.viewsize <= 100) {
      this._drawInventory(-24);
    }

    this._drawStatusBar();

    this.#requireMessageBag().drawMessages();
  }

  /**
   * Handles the power-up flash effect.
   */
  protected _powerupFlash(): void {
    const color = new Vector();

    let isFlickering = true;

    switch (true) {
      case (this.game.clientdata.items & items.IT_QUAD) !== 0:
        color.set(this.engine.IndexToRGB(colors.HUD_CSHIFT_POWERUP_QUAD));
        break;
      case (this.game.clientdata.items & items.IT_INVULNERABILITY) !== 0:
        color.set(this.engine.IndexToRGB(colors.HUD_CSHIFT_POWERUP_INVULN));
        break;
      case (this.game.clientdata.items & items.IT_SUIT) !== 0:
        color.set(this.engine.IndexToRGB(colors.HUD_CSHIFT_POWERUP_SUIT));
        isFlickering = false; // no flickering for suit
        break;
      case (this.game.clientdata.items & items.IT_INVISIBILITY) !== 0:
        color.set(this.engine.IndexToRGB(colors.HUD_CSHIFT_POWERUP_INVIS));
        break;
    }

    if (color.isOrigin()) {
      return;
    }

    this.engine.ContentShift(contentShift.powerup, color, isFlickering ? 0.25 + Math.random() * 0.1 : 0.3);
  }

  startFrame(): void {
    if (this.damage.damageReceived > 0) {
      this.damage.damageReceived -= this.engine.CL.frametime * 25; // decrease damage over time

      if (this.damage.damageReceived < 0) {
        this.damage.damageReceived = 0;
      }
    }

    this._powerupFlash();
  }

  saveState(): HUDSaveState {
    const stats = this.#requireStats();

    return {
      damage: {
        time: this.damage.time,
        attackOrigin: toSerializedVector3(this.damage.attackOrigin),
        damageReceived: this.damage.damageReceived,
      },
      intermission: {
        running: this.intermission.running,
        message: this.intermission.message,
        mapCompletedTime: this.intermission.mapCompletedTime,
      },
      stats: {
        monsters_total: stats.monsters_total,
        monsters_killed: stats.monsters_killed,
        secrets_total: stats.secrets_total,
        secrets_found: stats.secrets_found,
      },
    };
  }

  loadState(state: HUDSaveState): void {
    this.damage.time = state.damage.time;
    this.damage.damageReceived = state.damage.damageReceived;
    this.damage.attackOrigin = toVector(state.damage.attackOrigin);

    this.intermission.running = state.intermission.running;
    this.intermission.message = state.intermission.message;
    this.intermission.mapCompletedTime = state.intermission.mapCompletedTime;

    Object.assign(this.#requireStats(), state.stats);
  }

  /**
   * Handling viewport resize events.
   */
  protected _viewportResize(width: number, height: number): void {
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

  static Init(this: typeof Q1HUD, engineAPI: ClientEngineAPI): void {
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

      weapon.iconWidth = expectTexture(weapon.icon, `${weapon.iconPrefix}_${weapon.iconSuffix}`).width;
    }

    engineAPI.RegisterCommand('+showscores', (): void => {
      this._showScoreboard = true;
    });
    engineAPI.RegisterCommand('-showscores', (): void => {
      this._showScoreboard = false;
    });

    Gfx.loadAssets(engineAPI);
  }

  static Shutdown(_engineAPI: ClientEngineAPI): void {
    const textures = new Set<GLTexture>();

    for (const texture of Object.values(backgrounds)) {
      addTexture(textures, texture);
    }

    for (const texture of Object.values(armors)) {
      addTexture(textures, texture);
    }

    for (const texture of Object.values(ammos)) {
      addTexture(textures, texture);
    }

    for (const texture of Object.values(labels)) {
      addTexture(textures, texture);
    }

    addTexture(textures, faces.face_invis);
    addTexture(textures, faces.face_invuln);
    addTexture(textures, faces.face_invis_invuln);
    addTexture(textures, faces.face_quad);
    for (const textureRow of faces.faces) {
      for (const texture of textureRow) {
        addTexture(textures, texture);
      }
    }

    for (const weapon of inventory) {
      addTexture(textures, weapon.icon);
      addTexture(textures, weapon.iconInactive);
      weapon.icon = null;
      weapon.iconInactive = null;
      weapon.iconWidth = 0;
    }

    for (const texture of textures) {
      texture.free();
    }

    clearTextureGroup(backgrounds);
    clearTextureGroup(armors);
    clearTextureGroup(ammos);
    clearTextureGroup(labels);

    faces.face_invis = null;
    faces.face_invuln = null;
    faces.face_invis_invuln = null;
    faces.face_quad = null;
    for (const textureRow of faces.faces) {
      textureRow[0] = null;
      textureRow[1] = null;
    }

    Gfx.shutdown();

    _engineAPI.UnregisterCommand('+showscores');
    _engineAPI.UnregisterCommand('-showscores');
  }

  #requireMessageBag(): MessageBag {
    console.assert(this.messageBag !== null, 'HUD message bag must be initialized before use');
    return this.messageBag as MessageBag;
  }

  #requireStats(): ClientStats {
    console.assert(this.stats !== null, 'HUD stats must be initialized before use');
    return this.stats as ClientStats;
  }
}
