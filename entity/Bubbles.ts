import type { ServerEngineAPI } from '../../../shared/GameInterfaces.ts';

import type Vector from '../../../shared/Vector.ts';

import { clientEvent } from '../Defs.ts';

/**
 * Server-side entry point for bubbles. The bubbles themselves are purely cosmetic client-only
 * entities (see `client/entity/Bubbles.ts`): the server only broadcasts
 * `clientEvent.EMIT_BUBBLES` and never allocates an edict for them.
 */
export class Bubbles {
  /**
   * Releases a burst of bubbles on every client, used for the death of a player.
   * QuakeC: player.qc/DeathBubbles
   * @param origin Center of the burst.
   * @param bubbles How many bubbles to release, one every 0.1 seconds.
   */
  static emit(engineAPI: ServerEngineAPI, origin: Vector, bubbles: number): void {
    console.assert(bubbles > 0, 'emit() requires a positive number of bubbles');
    console.assert(bubbles < 50, 'emit() requires a number of bubbles less than 50');

    engineAPI.BroadcastClientEvent(false, clientEvent.EMIT_BUBBLES, origin.copy(), bubbles);
  }
}
