import type { ServerEdict, ServerEngineAPI } from '../../../shared/GameInterfaces.ts';
import type { ServerGameAPI } from '../GameAPI.ts';
import type BaseEntity from '../entity/BaseEntity.ts';

import { clientEvent } from '../Defs.ts';
import { serializableObject, serializable, Serializer } from './MiscHelpers.ts';

export const gameStatSlots = [
  'monsters_total',
  'monsters_killed',
  'secrets_total',
  'secrets_found',
] as const;

export type GameStatSlot = (typeof gameStatSlots)[number];

export interface GameStatsRecipient {
  readonly edict: ServerEdict | null;
}

/**
 * Tracks per-level monster and secret statistics and mirrors them to clients.
 * Keep the client-side sync code aligned with these slots.
 */
@serializableObject
export default class GameStats {
  readonly game: ServerGameAPI;
  readonly engine: ServerEngineAPI;
  readonly _serializer: Serializer<GameStats>;

  @serializable monsters_total = 0;
  @serializable monsters_killed = 0;
  @serializable secrets_total = 0;
  @serializable secrets_found = 0;

  constructor(gameAPI: ServerGameAPI, engineAPI: ServerEngineAPI) {
    this.game = gameAPI;
    this.engine = engineAPI;
    this._serializer = new Serializer(this, engineAPI);
  }

  reset(): void {
    this.monsters_total = 0;
    this.monsters_killed = 0;
    this.secrets_total = 0;
    this.secrets_found = 0;
  }

  subscribeToEvents(): void {
    this.engine.eventBus.subscribe('game.secret.spawned', () => {
      this.secrets_total += 1;
    });

    this.engine.eventBus.subscribe('game.secret.found', (_secretEntity: BaseEntity, finderEntity: BaseEntity) => {
      this.secrets_found += 1;
      console.assert(finderEntity.edict !== null, 'game.secret.found finder must have an edict');
      this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'secrets_found', this.secrets_found, finderEntity.edict!);
    });

    this.engine.eventBus.subscribe('game.monster.spawned', () => {
      this.monsters_total += 1;
    });

    this.engine.eventBus.subscribe('game.monster.killed', (_monsterEntity: BaseEntity, attackerEntity: BaseEntity) => {
      this.monsters_killed += 1;
      console.assert(attackerEntity.edict !== null, 'game.monster.killed attacker must have an edict');
      this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'monsters_killed', this.monsters_killed, attackerEntity.edict!);
    });
  }

  sendToPlayer(playerEntity: GameStatsRecipient): void {
    console.assert(playerEntity.edict !== null, 'sendToPlayer requires a player edict');

    for (const statSlot of gameStatSlots) {
      this.engine.DispatchClientEvent(playerEntity.edict!, true, clientEvent.STATS_INIT, statSlot, this[statSlot]);
    }
  }
}
