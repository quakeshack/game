import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { statesOf } from '../../../../../test/support/entityStates.ts';
import { serializableFieldsOf } from '../../../../../test/support/serialization.ts';

await import('../../GameAPI.ts');

const { default: DemonMonster } = await import('../../entity/monster/Demon.ts');

DemonMonster._initStates();

void describe('DemonMonster save state', () => {
  void test('saves whether the demon is mid-leap', () => {
    assert.deepEqual(serializableFieldsOf(DemonMonster), ['_isLeaping']);
  });
});

void describe('DemonMonster state machine', () => {
  void test('the leap retries its airborne frames and lands back in the run loop', () => {
    const states = statesOf(DemonMonster);

    assert.equal(states.demon1_jump10.nextState, 'demon1_jump1');
    assert.equal(states.demon1_jump11.nextState, 'demon1_jump12');
    assert.equal(states.demon1_jump12.nextState, 'demon1_run1');
  });

  void test('attack and pain return to running, death stays down', () => {
    const states = statesOf(DemonMonster);

    assert.equal(states.demon1_atta15.nextState, 'demon1_run1');
    assert.equal(states.demon1_pain6.nextState, 'demon1_run1');
    assert.equal(states.demon1_die9.nextState, null);
  });
});
