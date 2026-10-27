import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

// Establish correct ESM evaluation order — GameAPI is the production entry point.
import { statesOf } from '../../../../../test/support/entityStates.ts';

await import('../../GameAPI.ts');

const { default: FishMonsterEntity } = await import('../../entity/monster/Fish.ts');

// _initStates is normally called by the game registry during bootstrap.
// In unit tests we trigger it manually so the state machine is available.
FishMonsterEntity._initStates();

void describe('FishMonsterEntity state machine', () => {
  void test('swims twice as fast when running by skipping every other swim frame', () => {
    const states = statesOf(FishMonsterEntity);
    const keyframes = Array.from({ length: 9 }, (_, i) => states[`f_run${i + 1}`].keyframe);

    assert.deepEqual(keyframes, ['swim1', 'swim3', 'swim5', 'swim7', 'swim9', 'swim11', 'swim13', 'swim15', 'swim17']);
    assert.equal(states.f_run9.nextState, 'f_run1');
  });

  void test('attack and pain return to running, death stays down', () => {
    const states = statesOf(FishMonsterEntity);

    assert.equal(states.f_atta18.nextState, 'f_run1');
    assert.equal(states.f_pain9.nextState, 'f_run1');
    assert.equal(states.f_death21.nextState, null);
  });
});
