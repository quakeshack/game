import { BaseClientEdictHandler } from '../../../../shared/ClientEdict.ts';
import Vector from '../../../../shared/Vector.ts';

import { colors } from '../../Defs.ts';

/**
 * Lights up a fireball and leaves a fiery trail behind it (`misc_fireball_fireball`).
 */
export class FireballClientEdictHandler extends BaseClientEdictHandler {
  static readonly classname: string = 'misc_fireball_fireball';

  override emit(): void {
    const dl = this.engine.AllocDlight(this.clientEdict.num);

    dl.color = new Vector(...this.engine.IndexToRGB(colors.FIRE));
    dl.origin = this.clientEdict.origin.copy();
    dl.radius = 285 + Math.random() * 15;
    dl.die = this.engine.CL.time + 0.1;

    this.engine.RocketTrail(this.clientEdict.originPrevious, this.clientEdict.origin, 1);
    this.engine.RocketTrail(this.clientEdict.originPrevious, this.clientEdict.origin, 6);
  }
}
