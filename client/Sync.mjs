
/** @typedef {import('../../../shared/GameInterfaces').ClientEngineAPI} ClientEngineAPI  */

import { clientEvent, clientEventName } from '../Defs.mjs';

/**
 * Keeps track of game statistics during the current game.
 * NOTE: Make sure to keep it in sync with the server GameStats!
 */
export class ClientStats {
  monsters_total = 0;
  monsters_killed = 0;
  secrets_total = 0;
  secrets_found = 0;

  /**
   * @param {ClientEngineAPI} engineAPI client engine API
   */
  constructor(engineAPI) {
    // game stats base value
    engineAPI.eventBus.subscribe(clientEventName(clientEvent.STATS_INIT), (slot, value) => {
      console.assert(slot in this, `Unknown stat slot ${slot}`);
      this[slot] = value;
    });

    engineAPI.eventBus.subscribe(clientEventName(clientEvent.STATS_UPDATED), (slot, value) => {
      console.assert(slot in this, `Unknown stat slot ${slot}`);
      this[slot] = value;
    });
  }
};

/**
 * Keeps track of server information (all SERVER Cvars) of the current game.
 * @augments Record<string,string>
 */
export class ServerInfo {
  /** configured server name */
  hostname = '';
  /** '1' when coop mode */
  coop = '0';
  /** '1' when deathmatch mode */
  deathmatch = '0';
  /** skill level, 0, 1, 2 or 3 as a string */
  skill = '0';

  /**
   * @param {ClientEngineAPI} engineAPI client engine API
   */
  constructor(engineAPI) {
    engineAPI.eventBus.subscribe('client.server-info.ready', (serverInfo) => {
      Object.assign(this, serverInfo);
    });

    engineAPI.eventBus.subscribe('client.server-info.updated', (key, value) => {
      // NOTE: no assert, this is coming from the engine
      this[key] = value;
    });
  }
};
