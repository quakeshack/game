import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Vector from '../../../../shared/Vector.ts';
import { clientEvent } from '../../Defs.ts';

await import('../../GameAPI.ts');
const { Gibs } = await import('../../entity/Gibs.ts');
const { GibClientEdictHandler } = await import('../../client/entity/Gibs.ts');

/**
 * A stand-in for the actor being gibbed: just what `Gibs.throwGibs()`/`throwMeatGib()` read, plus
 * a ServerEngineAPI mock that records every broadcast client event.
 * @param {number} volume bounding volume of the actor; one gib is thrown per 16000 units
 * @returns {{entity: object, events: object[]}} the mock actor and its recorded events
 */
function createGibbedActor(volume) {
  const events = [];

  return {
    events,
    entity: {
      volume,
      health: -30,
      origin: new Vector(10, 20, 30),
      engine: {
        BroadcastClientEvent(expedited, eventCode, ...args) {
          events.push({ expedited, eventCode, args });
        },
      },
    },
  };
}

void describe('Gibs', () => {
  void describe('throwGibs', () => {
    void test('broadcasts one EMIT_GIB per 16000 units of volume, rounded up', () => {
      // 32768 (a 32x32x32 monster) / 16000 = 2.05 -> 3 gibs
      const { entity, events } = createGibbedActor(32768);

      Gibs.throwGibs(entity);

      assert.equal(events.length, 3);
      assert.ok(events.every((event) => event.eventCode === clientEvent.EMIT_GIB));
    });

    void test('sends a gib model, the actor origin and a launch velocity as the event arguments', () => {
      const { entity, events } = createGibbedActor(16000);

      Gibs.throwGibs(entity);

      const [model, origin, velocity] = events[0].args;
      assert.ok(GibClientEdictHandler.models.includes(model));
      assert.deepEqual([...origin], [10, 20, 30]);
      // velocityForDamage() always launches upwards: 100 * crandom() + 200 > 0 before scaling
      assert.ok(velocity[2] > 0);
    });

    void test('sends an origin snapshot, not a reference to the actor origin', () => {
      const { entity, events } = createGibbedActor(16000);

      Gibs.throwGibs(entity);
      entity.origin.setTo(999, 999, 999);

      assert.deepEqual([...events[0].args[1]], [10, 20, 30]);
    });

    void test('adds the impact vector to the launch velocity', () => {
      const { entity, events } = createGibbedActor(16000);

      Gibs.throwGibs(entity, -30, new Vector(1e6, 0, 0));

      // crandom() is within [-1, 1], so the random part is far smaller than the impact
      assert.ok(events[0].args[2][0] > 1e5);
    });
  });

  void describe('throwMeatGib', () => {
    void test('launches the zombie meat gib with the given velocity from the given origin', () => {
      const { entity, events } = createGibbedActor(16000);

      Gibs.throwMeatGib(entity, new Vector(1, 2, 3), new Vector(4, 5, 6));

      const [model, origin, velocity] = events[0].args;
      assert.equal(events.length, 1);
      assert.equal(events[0].eventCode, clientEvent.EMIT_GIB);
      assert.equal(model, 'progs/zom_gib.mdl');
      assert.deepEqual([...origin], [4, 5, 6]);
      assert.deepEqual([...velocity], [1, 2, 3]);
    });
  });
});
