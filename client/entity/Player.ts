import { BaseClientEdictHandler } from '../../../../shared/ClientEdict.ts';
import Vector from '../../../../shared/Vector.ts';

import { colors, effect, items } from '../../Defs.ts';

/**
 * Powerup glow and muzzle flash of the players (`player`).
 */
export class PlayerClientEdictHandler extends BaseClientEdictHandler {
  static readonly classname = 'player';

  override emit(): void {
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

    if ((this.clientEdict.effects & effect.EF_MUZZLEFLASH) !== 0) {
      const dynamicLight = this.engine.AllocDlight(this.clientEdict.num);
      const forwardVector = this.clientEdict.angles.angleVectors().forward;
      dynamicLight.origin = new Vector(
        this.clientEdict.origin[0] + 20.0 * forwardVector[0],
        this.clientEdict.origin[1] + 20.0 * forwardVector[1],
        this.clientEdict.origin[2] + 16.0 + 20.0 * forwardVector[2],
      );
      dynamicLight.radius = 200.0 + Math.random() * 32.0;
      dynamicLight.minlight = 32.0;
      dynamicLight.die = this.engine.CL.time + 0.2;
      dynamicLight.color = new Vector(1.0, 0.95, 0.85);
    }
  }
}
