import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { clientEvent, clientEventName } from '../../Defs.ts';
import { id1ServerEventNames } from '../../Events.ts';

// `Events.ts` says which events id1 publishes and what they carry, `docs/events.md` documents them by hand. The
// compiler keeps the code honest about the first, this keeps the second equal to it.

const eventsDoc = readFileSync(new URL('../../docs/events.md', import.meta.url), 'utf8');

/**
 * Reads the names the event tables of the document list: the first cell of every row.
 * @returns {string[]} The documented event names, in the order of the document.
 */
function documentedNames() {
  const names = [];

  for (const line of eventsDoc.split('\n')) {
    const match = /^\|\s*([a-z][a-z0-9.-]*)\s*\|/.exec(line);

    if (match !== null && match[1] !== 'event') {
      names.push(match[1]);
    }
  }

  return names;
}

/**
 * The opcodes of `clientEvent` (a numeric enum also carries the reverse mapping, which is not one).
 * @returns {number[]} The opcodes.
 */
function clientEventOpcodes() {
  return Object.values(clientEvent).filter((value) => typeof value === 'number');
}

void describe('id1 docs/events.md', () => {
  void test('documents every event of the game, and nothing else', () => {
    const published = [
      'hud.showscores',
      ...id1ServerEventNames,
      ...clientEventOpcodes().map((opcode) => clientEventName(opcode)),
    ];
    const documented = documentedNames();

    assert.equal(new Set(documented).size, documented.length, 'an event is documented twice');
    assert.deepEqual([...documented].sort(), [...published].sort());
  });

  void test('names a client event by its opcode', () => {
    assert.equal(clientEventName(clientEvent.EMIT_GIB), 'client.event-received.12');
  });
});
