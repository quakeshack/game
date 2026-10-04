import { FireballClientEdictHandler } from '../Misc.ts';

/**
 * The lava balls Chthon throws look like the fireballs of `misc_fireball`.
 */
export class BossLavaballClientEdictHandler extends FireballClientEdictHandler {
  static override readonly classname: string = 'monster_boss_lavaball';
}
