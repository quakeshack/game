import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { statesOf } from '../../../../../test/support/entityStates.ts';
import { serializableFieldsOf } from '../../../../../test/support/serialization.ts';

await import('../../GameAPI.ts');

const { default: OgreMonsterEntity } = await import('../../entity/monster/Ogre.ts');

OgreMonsterEntity._initStates();

void describe('OgreMonsterEntity metadata', () => {
  void test('saves nothing beyond the base monster state', () => {
    assert.deepEqual(serializableFieldsOf(OgreMonsterEntity), []);
  });
});

void describe('OgreMonsterEntity state machine', () => {
  void test('melee and missile attacks return to the run loop', () => {
    const states = statesOf(OgreMonsterEntity);

    assert.equal(states.ogre_swing14.nextState, 'ogre_run1');
    assert.equal(states.ogre_smash14.nextState, 'ogre_run1');
    assert.equal(states.ogre_nail7.nextState, 'ogre_run1');
  });

  void test('pain variants return to the run loop', () => {
    const states = statesOf(OgreMonsterEntity);

    assert.equal(states.ogre_pain5.nextState, 'ogre_run1');
    assert.equal(states.ogre_pain1b3.nextState, 'ogre_run1');
    assert.equal(states.ogre_pain1c6.nextState, 'ogre_run1');
    assert.equal(states.ogre_pain1d16.nextState, 'ogre_run1');
    assert.equal(states.ogre_pain1e15.nextState, 'ogre_run1');
  });

  void test('death chains terminate correctly', () => {
    const states = statesOf(OgreMonsterEntity);

    assert.equal(states.ogre_die14.nextState, null);
    assert.equal(states.ogre_bdie10.nextState, null);
  });
});
