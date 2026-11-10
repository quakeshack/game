import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { statesOf } from '../../../../../test/support/entityStates.ts';
import { serializableFieldsOf } from '../../../../../test/support/serialization.ts';

await import('../../GameAPI.ts');

const { default: DogMonsterEntity } = await import('../../entity/monster/Dog.ts');

DogMonsterEntity._initStates();

void describe('DogMonsterEntity save state', () => {
  void test('saves whether the dog is mid-leap', () => {
    assert.deepEqual(serializableFieldsOf(DogMonsterEntity), ['_isLeaping']);
  });
});

void describe('DogMonsterEntity state machine', () => {
  void test('bite, leap and both pains return to running', () => {
    const states = statesOf(DogMonsterEntity);

    assert.equal(states.dog_atta8.nextState, 'dog_run1');
    assert.equal(states.dog_leap9.nextState, 'dog_run1');
    assert.equal(states.dog_pain6.nextState, 'dog_run1');
    assert.equal(states.dog_painb16.nextState, 'dog_run1');
  });

  void test('both deaths stay down', () => {
    const states = statesOf(DogMonsterEntity);

    assert.equal(states.dog_die9.nextState, null);
    assert.equal(states.dog_dieb9.nextState, null);
  });
});
