import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Vector from '../../../../shared/Vector.ts';
import { clientEvent } from '../../Defs.ts';

await import('../../GameAPI.ts');
const { Bubbles } = await import('../../entity/Bubbles.ts');

void describe('Bubbles', () => {
  void describe('emit', () => {
    void test('broadcasts one EMIT_BUBBLES event with the origin and the bubble count', () => {
      const events = [];
      const engine = {
        BroadcastClientEvent(expedited, eventCode, ...args) {
          events.push({ expedited, eventCode, args });
        },
      };

      Bubbles.emit(engine, new Vector(1, 2, 3), 20);

      assert.equal(events.length, 1);
      assert.equal(events[0].eventCode, clientEvent.EMIT_BUBBLES);
      assert.deepEqual([...events[0].args[0]], [1, 2, 3]);
      assert.equal(events[0].args[1], 20);
    });

    void test('sends an origin snapshot, not a reference to the caller origin', () => {
      const events = [];
      const engine = {
        BroadcastClientEvent(_expedited, _eventCode, ...args) {
          events.push(args);
        },
      };
      const origin = new Vector(1, 2, 3);

      Bubbles.emit(engine, origin, 5);
      origin.setTo(9, 9, 9);

      assert.deepEqual([...events[0][0]], [1, 2, 3]);
    });
  });
});
