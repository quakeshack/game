import { BaseClientEdictHandler } from '../../../../shared/ClientEdict.ts';
import Vector from '../../../../shared/Vector.ts';

import { colors, effect, items } from '../../Defs.ts';

/**
 * The joints of a skeletal player model that bend with where the player looks, and how much of the look pitch each takes. Together
 * they turn the head by the whole pitch. The LibreQuake player rig has them; a model without them keeps the old tilt of the body.
 */
const LOOK_JOINTS = [
  ['spine0', 0.15],
  ['spine1', 0.25],
  ['neck', 0.25],
  ['head', 0.35],
] as const;

/** How long after the frame that read it a shot is still worth a flash, in seconds: a flash lasts a fifth of a second. */
const SHOT_FRESH_TIME = 0.2;

/**
 * The server sends a third of the view pitch as the player entity's pitch (`angles[0] = -v_angle[0] / 3`), to tilt the body of an alias
 * model only a little. The look angle is what it was.
 */
const ENTITY_PITCH_TO_LOOK_PITCH = 3.0;

/**
 * Powerup glow, muzzle flash and the bend of the back of the players (`player`).
 */
export class PlayerClientEdictHandler extends BaseClientEdictHandler {
  static readonly classname = 'player';

  readonly #jointAngles = new Vector();

  /** The shots (`ClientEdict.muzzleFlashCount`) that the last `emit()` knew of, `null` before the first. */
  #shotsSeen: number | null = null;

  /**
   * How many shots were fired since the previous `emit()` and are still fresh, for the `emit()` that is running. The bit of `EF_MUZZLEFLASH`
   * can be set and cleared again between two frames (two datagrams read in one frame), so the count the engine keeps is what to ask;
   * a shot that the player was out of view for is left out, and the first `emit()` reports none.
   */
  protected _newShots = 0;

  #countNewShots(): void {
    const shots = this.clientEdict.muzzleFlashCount;
    const fresh = this.#shotsSeen === null ? 0 : shots - this.#shotsSeen;
    // the shot was stamped with the clock as it stood when the frame began to read messages, so by now it is one frame old whatever happened
    const recent = this.engine.CL.time - this.clientEdict.muzzleFlashTime < SHOT_FRESH_TIME + this.engine.CL.frametime;

    this.#shotsSeen = shots;
    this._newShots = fresh > 0 && recent ? fresh : 0;
  }

  /**
   * Bends the spine, neck and head of a skeletal player model with the look pitch, and keeps the body itself upright then. A model
   * that has none of those joints is left to tilt as a whole.
   */
  #bendWithLookPitch(): void {
    const pitch = this.clientEdict.lerp.angles[0];

    if (!Number.isFinite(pitch)) {
      return;
    }

    const lookPitch = pitch * ENTITY_PITCH_TO_LOOK_PITCH;
    let bent = false;

    for (const [joint, share] of LOOK_JOINTS) {
      this.#jointAngles.setTo(lookPitch * share, 0, 0);
      bent = this.engine.SetEntityJointAngles(this.clientEdict, joint, this.#jointAngles) || bent;
    }

    this.engine.SetEntityPitchesBody(this.clientEdict, !bent);
  }

  override emit(): void {
    this.#bendWithLookPitch();
    this.#countNewShots();

    const extended = this.clientEdict.extended;
    const extendedItems = extended?.items ?? 0;

    if ((+extendedItems & items.IT_QUAD) !== 0) {
      const dynamicLight = this.engine.AllocDlight(this.clientEdict.num);

      dynamicLight.color = new Vector(...this.engine.IndexToRGB(colors.HUD_CSHIFT_POWERUP_QUAD));
      dynamicLight.origin = this.clientEdict.origin.copy();
      dynamicLight.radius = 295 + Math.random() * 5;
      dynamicLight.die = this.engine.CL.time + 0.1;
    } else if ((+extendedItems & items.IT_INVULNERABILITY) !== 0) {
      const dynamicLight = this.engine.AllocDlight(this.clientEdict.num);

      dynamicLight.color = new Vector(...this.engine.IndexToRGB(colors.HUD_CSHIFT_POWERUP_INVULN));
      dynamicLight.origin = this.clientEdict.origin.copy();
      dynamicLight.radius = 295 + Math.random() * 5;
      dynamicLight.die = this.engine.CL.time + 0.1;
    }

    if ((this.clientEdict.effects & effect.EF_MUZZLEFLASH) !== 0 || this._newShots > 0) {
      const dynamicLight = this.engine.AllocDlight(this.clientEdict.num);
      const flashOrigin = new Vector();

      if (this.engine.GetMuzzleFlashOrigin(this.clientEdict, flashOrigin)) {
        // a player model with a tag at the muzzle, or a weapon in the hand that has one
        dynamicLight.origin = flashOrigin;
      } else {
        const forwardVector = this.clientEdict.angles.angleVectors().forward;
        dynamicLight.origin = new Vector(
          this.clientEdict.origin[0] + 20.0 * forwardVector[0],
          this.clientEdict.origin[1] + 20.0 * forwardVector[1],
          this.clientEdict.origin[2] + 16.0 + 20.0 * forwardVector[2],
        );
      }
      dynamicLight.radius = 200.0 + Math.random() * 32.0;
      dynamicLight.minlight = 32.0;
      dynamicLight.die = this.engine.CL.time + 0.2;
      dynamicLight.color = new Vector(1.0, 0.95, 0.85);
    }
  }
}
