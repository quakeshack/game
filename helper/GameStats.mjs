import { clientEvent } from '../Defs.mjs';
import BaseEntity from '../entity/BaseEntity.mjs';
import { PlayerEntity } from '../entity/Player.mjs';
import { ServerGameAPI } from '../GameAPI.mjs';
import { Serializer } from './MiscHelpers.mjs';

/** @typedef {import("../../../shared/GameInterfaces").ServerEngineAPI} ServerEngineAPI */

/**
 * Game statistics class.
 * It tracks monsters and secrets.
 * It is used to send statistics to clients.
 * NOTE: Make sure the client side is up-to-date, see ClientStats!
 */
export default class GameStats {
  /**
   * @param {ServerGameAPI} gameAPI game API
   * @param {ServerEngineAPI} engineAPI engineAPI
   */
  constructor(gameAPI, engineAPI) {
    this.game = gameAPI;
    this.engine = engineAPI;

    this._serializer = new Serializer(this, engineAPI);
    this._serializer.startFields();
    this.reset();
    this._serializer.endFields();

    Object.seal(this);
  }

  reset() {
    this.monsters_total = 0;
    this.monsters_killed = 0;
    this.secrets_total = 0;
    this.secrets_found = 0;
  }

  subscribeToEvents() {
    this.engine.eventBus.subscribe('game.secret.spawned', () => { this.secrets_total++; });
    this.engine.eventBus.subscribe('game.secret.found', (/** @type {BaseEntity} */ secretEntity, /** @type {BaseEntity} */ finderEntity) => {
      this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'secrets_found', ++this.secrets_found, finderEntity.edict);
    });

    this.engine.eventBus.subscribe('game.monster.spawned', () => { this.monsters_total++; });
    this.engine.eventBus.subscribe('game.monster.killed', (/** @type {BaseEntity} */ monsterEntity, /** @type {BaseEntity} */ attackerEntity) => {
      this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'monsters_killed', ++this.monsters_killed, attackerEntity.edict);
    });
  }

  /**
   * @param {PlayerEntity} playerEntity client player entity
   */
  sendToPlayer(playerEntity) {
    this.engine.DispatchClientEvent(playerEntity.edict, true, clientEvent.STATS_INIT, 'monsters_total', this.monsters_total);
    this.engine.DispatchClientEvent(playerEntity.edict, true, clientEvent.STATS_INIT, 'monsters_killed', this.monsters_killed);
    this.engine.DispatchClientEvent(playerEntity.edict, true, clientEvent.STATS_INIT, 'secrets_total', this.secrets_total);
    this.engine.DispatchClientEvent(playerEntity.edict, true, clientEvent.STATS_INIT, 'secrets_found', this.secrets_found);
  }
};
