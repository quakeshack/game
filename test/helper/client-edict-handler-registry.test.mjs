import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BaseClientEdictHandler } from '../../../../shared/ClientEdict.ts';

await import('../../GameAPI.ts');
const { default: ClientEdictHandlerRegistry } = await import('../../helper/ClientEdictHandlerRegistry.ts');
const { ClientGameAPI } = await import('../../client/ClientAPI.ts');
const { ServerGameAPI } = await import('../../GameAPI.ts');
const { clientEdictHandlerClasses } = await import('../../client/entity/ClientEdictHandlers.ts');
const { AirBubblesClientEdictHandler, BubbleClientEdictHandler } = await import('../../client/entity/Bubbles.ts');
const { GibClientEdictHandler } = await import('../../client/entity/Gibs.ts');
const { FireballClientEdictHandler } = await import('../../client/entity/Misc.ts');
const { BossLavaballClientEdictHandler } = await import('../../client/entity/monster/Boss.ts');
const { PlayerClientEdictHandler } = await import('../../client/entity/Player.ts');

class FirstHandler extends BaseClientEdictHandler {
  static classname = 'test_first';
}

class SecondHandler extends BaseClientEdictHandler {
  static classname = 'test_second';
}

void describe('ClientEdictHandlerRegistry', () => {
  void test('looks handlers up by their own static classname', () => {
    const registry = new ClientEdictHandlerRegistry([FirstHandler, SecondHandler]);

    assert.equal(registry.get('test_first'), FirstHandler);
    assert.equal(registry.get('test_second'), SecondHandler);
    assert.equal(registry.has('test_first'), true);
  });

  void test('answers null for a classname nothing is registered for', () => {
    const registry = new ClientEdictHandlerRegistry([FirstHandler]);

    assert.equal(registry.get('test_unknown'), null);
    assert.equal(registry.has('test_unknown'), false);
  });

  void test('lists every registered handler', () => {
    const registry = new ClientEdictHandlerRegistry([FirstHandler, SecondHandler]);

    assert.deepEqual([...registry.getAll()], [FirstHandler, SecondHandler]);
  });
});

void describe('ClientEdictHandlerRegistry.precacheAll', () => {
  void test('lets every registered handler declare what the server has to precache', () => {
    const precached = [];

    class PrecachingHandler extends BaseClientEdictHandler {
      static classname = 'test_precaching';

      static _precache(engineAPI) {
        precached.push(engineAPI);
      }
    }

    const engine = {};

    new ClientEdictHandlerRegistry([PrecachingHandler, FirstHandler]).precacheAll(engine);

    // FirstHandler declares nothing, which is the default
    assert.deepEqual(precached, [engine]);
  });
});

void describe('ServerGameAPI._precacheResources', () => {
  void test('precaches the models of the client-only entities through the handler registry', () => {
    const models = [];
    const engine = {
      PrecacheModel: (name) => models.push(name),
      PrecacheSound() {},
      PrecacheEntity() {},
    };

    ServerGameAPI.prototype._precacheResources.call({ engine, constructor: ServerGameAPI });

    for (const model of ['progs/gib1.mdl', 'progs/gib2.mdl', 'progs/gib3.mdl', 'progs/zom_gib.mdl', 'progs/s_bubble.spr']) {
      assert.ok(models.includes(model), `${model} is precached`);
    }
  });

  void test('uses the registry of the mod subclass it is called on', () => {
    const precached = [];

    class MarkerHandler extends BaseClientEdictHandler {
      static classname = 'test_marker';

      static _precache() {
        precached.push('marker');
      }
    }

    class ModServerGameAPI extends ServerGameAPI {
      static _clientEdictHandlerRegistry = new ClientEdictHandlerRegistry([MarkerHandler]);
    }

    ServerGameAPI.prototype._precacheResources.call({
      engine: { PrecacheModel() {}, PrecacheSound() {} },
      constructor: ModServerGameAPI,
    });

    assert.deepEqual(precached, ['marker']);
  });
});

void describe('ClientGameAPI.GetClientEdictHandler', () => {
  void test('resolves the client-only and static handlers through the registry', () => {
    assert.equal(ClientGameAPI.GetClientEdictHandler('client_gib'), GibClientEdictHandler);
    assert.equal(ClientGameAPI.GetClientEdictHandler('client_bubble'), BubbleClientEdictHandler);
    assert.equal(ClientGameAPI.GetClientEdictHandler('air_bubbles'), AirBubblesClientEdictHandler);
  });

  void test('resolves the handlers of the players and of the fireballs', () => {
    assert.equal(ClientGameAPI.GetClientEdictHandler('player'), PlayerClientEdictHandler);
    assert.equal(ClientGameAPI.GetClientEdictHandler('misc_fireball_fireball'), FireballClientEdictHandler);
    assert.equal(ClientGameAPI.GetClientEdictHandler('monster_boss_lavaball'), BossLavaballClientEdictHandler);
  });

  void test('the boss lava balls behave like fireballs', () => {
    assert.ok(BossLavaballClientEdictHandler.prototype instanceof FireballClientEdictHandler);
  });

  void test('answers null for a classname with no handler', () => {
    assert.equal(ClientGameAPI.GetClientEdictHandler('test_unknown'), null);
  });

  void test('exports the id1 handler classes, so a mod can extend them with its own', () => {
    assert.deepEqual(
      clientEdictHandlerClasses.map((handlerClass) => handlerClass.classname).sort(),
      ['air_bubbles', 'client_bubble', 'client_gib', 'misc_fireball_fireball', 'monster_boss_lavaball', 'player'],
    );

    class ModClientGameAPI extends ClientGameAPI {
      static _clientEdictHandlerRegistry = new ClientEdictHandlerRegistry([...clientEdictHandlerClasses, FirstHandler]);
    }

    assert.equal(ModClientGameAPI.GetClientEdictHandler('test_first'), FirstHandler);
    assert.equal(ModClientGameAPI.GetClientEdictHandler('client_gib'), GibClientEdictHandler);
    // the base module is not affected by what a mod registers
    assert.equal(ClientGameAPI.GetClientEdictHandler('test_first'), null);
  });

  void test('uses the registry of the mod subclass it is called on', () => {
    class ModClientGameAPI extends ClientGameAPI {
      static _clientEdictHandlerRegistry = new ClientEdictHandlerRegistry([FirstHandler]);
    }

    assert.equal(ModClientGameAPI.GetClientEdictHandler('test_first'), FirstHandler);
    assert.equal(ModClientGameAPI.GetClientEdictHandler('client_gib'), null);
  });
});
