import type { ClientEngineAPI } from '../../../shared/GameInterfaces.ts';

import { clientEvent, clientEventName } from '../Defs.ts';

export const clientStatSlots = [
  'monsters_total',
  'monsters_killed',
  'secrets_total',
  'secrets_found',
] as const;

export type ClientStatSlot = (typeof clientStatSlots)[number];

export interface ClientStatsSnapshot {
  monsters_total: number;
  monsters_killed: number;
  secrets_total: number;
  secrets_found: number;
}

export interface ServerInfoSnapshot {
  [key: string]: string;
  hostname: string;
  coop: string;
  deathmatch: string;
  skill: string;
}

/**
 * Check whether an event bus stat slot belongs to the client stat table.
 * @returns True when the slot is one of the known client stat keys.
 */
function isClientStatSlot(slot: string): slot is ClientStatSlot {
  return clientStatSlots.includes(slot as ClientStatSlot);
}

/**
 * Coerce a stat payload into a finite number when the wire value looks numeric.
 * @returns Parsed numeric value, or null when the payload is not a usable number.
 */
export function parseNumericStatValue(value: number | string): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return null;
  }

  const parsedValue = Number(trimmedValue);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

/**
 * Keeps track of game statistics during the current game.
 * NOTE: Make sure to keep it in sync with the server GameStats!
 */
export class ClientStats {
  monsters_total = 0;
  monsters_killed = 0;
  secrets_total = 0;
  secrets_found = 0;

  constructor(engineAPI: ClientEngineAPI) {
    // game stats base value
    engineAPI.eventBus.subscribe(clientEventName(clientEvent.STATS_INIT), (slot: string, value: number | string): void => {
      this._setStat(slot, value);
    });

    engineAPI.eventBus.subscribe(clientEventName(clientEvent.STATS_UPDATED), (slot: string, value: number | string): void => {
      this._setStat(slot, value);
    });
  }

  /**
   * Apply a client stat event to the tracked stat table.
   */
  protected _setStat(slot: string, value: number | string): void {
    if (!isClientStatSlot(slot)) {
      return;
    }

    const numericValue = parseNumericStatValue(value);

    if (numericValue === null) {
      return;
    }

    const stats = this as Record<ClientStatSlot, number>;
    stats[slot] = numericValue;
  }
}

/**
 * Keeps track of server information (all SERVER Cvars) of the current game.
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
   * Apply a dynamically-named server info field.
   */
  private _setServerInfoField(key: string, value: string): void {
    Object.defineProperty(this, key, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }

  constructor(engineAPI: ClientEngineAPI) {
    engineAPI.eventBus.subscribe('client.server-info.ready', (serverInfo: Record<string, string>): void => {
      for (const [key, value] of Object.entries(serverInfo)) {
        this._setServerInfoField(key, value);
      }
    });

    engineAPI.eventBus.subscribe('client.server-info.updated', (key: string, value: string): void => {
      // NOTE: no assert, this is coming from the engine
      this._setServerInfoField(key, value);
    });
  }
}
