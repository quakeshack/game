import type { ClientEdictHandlerClass } from '../../helper/ClientEdictHandlerRegistry.ts';

import { AirBubblesClientEdictHandler, BubbleClientEdictHandler } from './Bubbles.ts';
import { GibClientEdictHandler } from './Gibs.ts';
import { FireballClientEdictHandler } from './Misc.ts';
import { BossLavaballClientEdictHandler } from './monster/Boss.ts';
import { PlayerClientEdictHandler } from './Player.ts';

/**
 * Every client edict handler of this module, registered by its own classname. Mods spread it into
 * their own registry, the way they do with the server's `entityClasses`.
 */
export const clientEdictHandlerClasses: readonly ClientEdictHandlerClass[] = [
  PlayerClientEdictHandler,
  FireballClientEdictHandler,
  BossLavaballClientEdictHandler,
  GibClientEdictHandler,
  BubbleClientEdictHandler,
  AirBubblesClientEdictHandler,
];
