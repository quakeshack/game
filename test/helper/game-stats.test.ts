import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { EventBus } from '../../../../engine/common/EventBus.ts';
import type { ServerEdict } from '../../../../engine/server/Edict.ts';
import type { ServerEngineAPI } from '../../../../shared/GameInterfaces.ts';
import { createInertEdict, createInertEngineApi, createInertGameApi } from '../../../../../test/support/entityMocks.ts';
import { serializableFieldsOf } from '../../../../../test/support/serialization.ts';
import type { Id1ServerEvents } from '../../Events.ts';
import type BaseEntity from '../../entity/BaseEntity.ts';
import type BaseMonster from '../../entity/monster/BaseMonster.ts';

const { clientEvent } = await import('../../Defs.ts');
const gameStatsModule = await import('../../helper/GameStats.ts');

const GameStats = gameStatsModule.default;
const { gameStatSlots } = gameStatsModule;

interface StatsEngine {
  readonly engine: ServerEngineAPI;
  readonly eventBus: EventBus<Id1ServerEvents>;
  readonly broadcasts: unknown[][];
  readonly dispatches: unknown[][];
}

/**
 * Create the minimal engine API surface used by GameStats, with an event bus that really delivers.
 * @returns The engine API, its bus and what it was asked to send to clients.
 */
function createEngineAPI(): StatsEngine {
  const eventBus = new EventBus<Id1ServerEvents>('test');
  const broadcasts: unknown[][] = [];
  const dispatches: unknown[][] = [];

  const engine = createInertEngineApi({
    eventBus,
    BroadcastClientEvent(...args: unknown[]): void {
      broadcasts.push(args);
    },
    DispatchClientEvent(...args: unknown[]): void {
      dispatches.push(args);
    },
  });

  return { engine, eventBus, broadcasts, dispatches };
}

/**
 * Create a mock entity wrapper with an edict.
 * @returns Mock entity.
 */
function createEntity<T extends BaseEntity = BaseEntity>(): T & { readonly edict: ServerEdict } {
  // GameStats reads only `edict` of the entities the events carry.
  return { edict: createInertEdict() } as unknown as T & { readonly edict: ServerEdict };
}

void describe('GameStats', () => {
  void test('tracks decorated stat fields for serialization', () => {
    const engineAPI = createEngineAPI();
    const stats = new GameStats(createInertGameApi(), engineAPI.engine);

    assert.ok(Array.isArray(serializableFieldsOf(GameStats)));
    assert.ok(Object.isFrozen(serializableFieldsOf(GameStats)));
    assert.deepEqual(serializableFieldsOf(GameStats), [...gameStatSlots]);
    assert.deepEqual(stats._serializer.serialize(), {
      monsters_killed: ['P', 0],
      monsters_total: ['P', 0],
      secrets_found: ['P', 0],
      secrets_total: ['P', 0],
    });
  });

  void test('subscribes to gameplay events and broadcasts stat updates', () => {
    const engineAPI = createEngineAPI();
    const stats = new GameStats(createInertGameApi(), engineAPI.engine);
    const secretFinder = createEntity();
    const attacker = createEntity();

    stats.subscribeToEvents();

    engineAPI.eventBus.publish('game.secret.spawned', createEntity());
    engineAPI.eventBus.publish('game.monster.spawned', createEntity<BaseMonster>());
    engineAPI.eventBus.publish('game.secret.found', createEntity(), secretFinder);
    engineAPI.eventBus.publish('game.monster.killed', createEntity(), attacker);

    assert.equal(stats.secrets_total, 1);
    assert.equal(stats.monsters_total, 1);
    assert.equal(stats.secrets_found, 1);
    assert.equal(stats.monsters_killed, 1);
    assert.deepEqual(engineAPI.broadcasts, [
      [true, clientEvent.STATS_UPDATED, 'secrets_found', 1, secretFinder.edict],
      [true, clientEvent.STATS_UPDATED, 'monsters_killed', 1, attacker.edict],
    ]);
  });

  void test('sends every stat slot to a player in slot order', () => {
    const engineAPI = createEngineAPI();
    const stats = new GameStats(createInertGameApi(), engineAPI.engine);
    const playerEntity = createEntity();

    stats.monsters_total = 10;
    stats.monsters_killed = 4;
    stats.secrets_total = 3;
    stats.secrets_found = 2;

    stats.sendToPlayer(playerEntity);

    assert.deepEqual(engineAPI.dispatches, [
      [playerEntity.edict, true, clientEvent.STATS_INIT, 'monsters_total', 10],
      [playerEntity.edict, true, clientEvent.STATS_INIT, 'monsters_killed', 4],
      [playerEntity.edict, true, clientEvent.STATS_INIT, 'secrets_total', 3],
      [playerEntity.edict, true, clientEvent.STATS_INIT, 'secrets_found', 2],
    ]);
  });

  void test('reset clears all stat counters', () => {
    const engineAPI = createEngineAPI();
    const stats = new GameStats(createInertGameApi(), engineAPI.engine);

    stats.monsters_total = 8;
    stats.monsters_killed = 5;
    stats.secrets_total = 4;
    stats.secrets_found = 1;

    stats.reset();

    for (const statSlot of gameStatSlots) {
      assert.equal(stats[statSlot], 0);
    }
  });
});
