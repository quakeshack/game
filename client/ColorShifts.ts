import { content } from '../../../shared/Defs.ts';
import type { ClientEngineAPI } from '../../../shared/GameInterfaces.ts';
import Vector from '../../../shared/Vector.ts';

/**
 * The channels of the tints, in the order Quake mixes them in: each tint is laid over the ones before it. The engine
 * composes channels in the order they are first used, so they are created in this order.
 */
const CHANNELS = {
  liquid: 'id1.liquid',
  damage: 'id1.damage',
  bonus: 'id1.bonus',
  powerup: 'id1.powerup',
  info: 'id1.info',
} as const;

/** The tint of the liquid the eye is in, in Quake's units: red, green and blue 0 to 255 and the alpha. */
const LIQUID_TINTS = new Map<number, [number, number, number, number]>([
  [content.CONTENT_EMPTY, [130, 80, 50, 0]],
  [content.CONTENT_WATER, [130, 80, 50, 128]],
  [content.CONTENT_SLIME, [0, 25, 5, 150]],
  [content.CONTENT_LAVA, [255, 80, 0, 150]],
]);

/** How fast the damage flash falls, in alpha units (0 to 255) per second. */
const DAMAGE_DECAY = 150;

/** How fast the pickup and secret flashes fall, in alpha units (0 to 255) per second. */
const FLASH_DECAY = 100;

/** The most a run of hits adds up to, in alpha units. */
const DAMAGE_CAP = 150;

/**
 * What tints the view in Quake: the liquid the eye is in, a hit, a pickup, a secret, a powerup. They are set on the
 * post-process stack of the engine as entries of the `color-shift` effect, one channel each, and the engine mixes
 * them and honors `gl_cshiftpercent` and `gl_polyblend`.
 */
export class ColorShifts {
  readonly #engine: ClientEngineAPI;

  /** What is left of the damage flash, in alpha units, so that the next hit adds to it. */
  #damageAlpha = 0;

  /** The contents of the liquid that is tinted now, `null` for none. */
  #liquid: number | null = null;

  /** Whether a powerup tint is up. */
  #powerupShown = false;

  constructor(engine: ClientEngineAPI) {
    this.#engine = engine;
  }

  /**
   * Creates the channels, in mixing order.
   */
  init(): void {
    for (const channel of Object.values(CHANNELS)) {
      this.#engine.PostProcess.setStack([], { channel });
    }
  }

  /**
   * Takes every tint off, for a disconnect.
   */
  reset(): void {
    this.#damageAlpha = 0;
    this.#liquid = null;
    this.#powerupShown = false;

    for (const channel of Object.values(CHANNELS)) {
      this.#engine.PostProcess.setStack([], { channel });
    }
  }

  /**
   * Lets what is left of the damage flash fall, once per frame.
   * @param frametime Seconds since the last frame.
   */
  frame(frametime: number): void {
    this.#damageAlpha = Math.max(0, this.#damageAlpha - frametime * DAMAGE_DECAY);
  }

  /**
   * Tints the view by the liquid the eye is in. Contents that have no tint (solid, sky) keep the one before.
   * @param contents What the eye is in, `engine.CL.viewContents`.
   */
  liquid(contents: number): void {
    const tint = LIQUID_TINTS.get(contents);

    if (tint === undefined || this.#liquid === contents) {
      return;
    }

    this.#liquid = contents;

    this.#engine.PostProcess.setStack(tint[3] > 0
      ? [{ id: 'color-shift', settings: { color: [tint[0] / 255, tint[1] / 255, tint[2] / 255], alpha: tint[3] / 255 } }]
      : [], { channel: CHANNELS.liquid });
  }

  /**
   * Flashes the view red for a hit: 3 alpha units per point of half the damage (at least 10), added to what is
   * left of the last flash, at most 150; pink when armor took most of it.
   * @param armor How much damage the armor took.
   * @param blood How much damage reached the player.
   */
  damage(armor: number, blood: number): void {
    const count = Math.max(10, (blood + armor) * 0.5);

    this.#damageAlpha = Math.min(this.#damageAlpha + 3 * count, DAMAGE_CAP);

    let color: [number, number, number] = [255, 0, 0];

    if (armor > blood) {
      color = [200, 100, 100];
    } else if (armor !== 0) {
      color = [220, 50, 50];
    }

    this.#pulse(CHANNELS.damage, 'damage', new Vector(color[0] / 255, color[1] / 255, color[2] / 255), this.#damageAlpha / 255, DAMAGE_DECAY);
  }

  /**
   * Flashes the view for a moment, as Quake's pickup flash does.
   * @param slot Which flash: the pickup (`bonus`) or the one a game uses for what it wants to point out (`info`).
   * @param color Red, green and blue, each 0 to 1.
   * @param alpha How much it covers the view, 0 to 1.
   */
  flash(slot: 'bonus' | 'info', color: Vector, alpha: number): void {
    this.#pulse(CHANNELS[slot], slot, color, alpha, FLASH_DECAY);
  }

  /**
   * Tints the view for the powerup the player has, or takes the tint off.
   * @param color Red, green and blue, each 0 to 1, `null` for no powerup.
   * @param alpha How much it covers the view, 0 to 1.
   */
  powerup(color: Vector | null, alpha: number): void {
    if (color === null) {
      if (this.#powerupShown) {
        this.#powerupShown = false;
        this.#engine.PostProcess.setStack([], { channel: CHANNELS.powerup });
      }

      return;
    }

    this.#powerupShown = true;
    this.#engine.PostProcess.setStack([{ id: 'color-shift', settings: { color, alpha } }], { channel: CHANNELS.powerup });
  }

  /**
   * Starts a flash that falls to nothing at a fixed rate, which is Quake's way of fading a shift.
   * @param channel The channel of the flash.
   * @param key The name of the flash, so that a new one starts over.
   * @param color Red, green and blue, each 0 to 1.
   * @param alpha How much it covers the view at the start, 0 to 1.
   * @param decay How fast it falls, in alpha units (0 to 255) per second.
   */
  #pulse(channel: string, key: string, color: Vector, alpha: number, decay: number): void {
    this.#engine.PostProcess.pulse({
      id: 'color-shift',
      key,
      settings: { color, alpha },
      timing: { fadeOut: alpha * 255 / decay },
    }, { channel });
  }
}
