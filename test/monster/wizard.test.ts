import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import Vector from '../../../../shared/Vector.ts';
import type BaseEntity from '../../entity/BaseEntity.ts';
import { createAiStub, createEntityStub, createInertEdict, createInertGameApi, createMutableEngineApi, type EntityConstructor } from '../../../../../test/support/entityMocks.ts';
import { range } from '../../Defs.ts';
import { ATTACK_STATE } from '../../helper/AI.ts';

import { statesOf } from '../../../../../test/support/entityStates.ts';

await import('../../GameAPI.ts');

const { default: WizardMonsterEntity } = await import('../../entity/monster/Wizard.ts');

WizardMonsterEntity._initStates();

/** A wizard that lets a test replace the animation state machine and run its protected steps. */
class TestWizard extends WizardMonsterEntity {
  stubRunState(handler: (nextState: string | null) => boolean): void {
    this._runState = handler;
  }

  runAttackFinished(): void {
    this._attackFinished();
  }
}

/**
 * Create a minimal Wizard fixture for focused behavior tests.
 * @param MonsterClass Monster constructor under test.
 * @returns Monster fixture instance.
 */
function createMonsterFixture<T extends BaseEntity>(MonsterClass: EntityConstructor<T>) {
  const edict = createInertEdict();

  const engine = createMutableEngineApi({
    IsLoading() {
      return false;
    },
    PrecacheModel() {},
    PrecacheSound() {},
    ParseQC() {
      return null;
    },
    StartSound() {},
    SpawnEntity() {
      return { entity: null };
    },
    eventBus: {
      publish() {},
    },
  });

  const gameAPI = createInertGameApi({
    time: 5,
    skill: 1,
    deathmatch: 0,
    nomonsters: 0,
  }, engine);

  const entity = new MonsterClass(edict, gameAPI).initializeEntity();
  edict.entity = entity;
  entity.origin = new Vector();
  entity.angles = new Vector();
  entity.enemy = createEntityStub({
    origin: new Vector(128, 0, 0),
    velocity: new Vector(),
    view_ofs: new Vector(0, 0, 22),
    mins: new Vector(-16, -16, -24),
    size: new Vector(32, 32, 56),
    health: 100,
  });

  return entity;
}

void describe('WizardMonsterEntity state machine', () => {
  void test('fast attack, pain, and death chains keep the original frame ordering', () => {
    const states = statesOf(WizardMonsterEntity);

    assert.equal(states.wiz_fast1.keyframe, 'magatt1');
    assert.equal(states.wiz_fast7.keyframe, 'magatt5');
    assert.equal(states.wiz_fast8.keyframe, 'magatt4');
    assert.equal(states.wiz_fast10.keyframe, 'magatt2');
    assert.equal(states.wiz_fast10.nextState, 'wiz_run1');

    assert.equal(states.wiz_pain4.nextState, 'wiz_run1');

    assert.equal(states.wiz_death8.nextState, null);
  });
});

void describe('WizardMonsterEntity QC fixes', () => {
  void test('pain can fail to flinch on low damage', () => {
    const wizard = createMonsterFixture(TestWizard);
    const originalRandom = Math.random;
    let stateName = null;

    wizard.startSound = () => {};
    wizard._ai.foundTarget = () => {};
    wizard.stubRunState((nextState: string | null) => {
      stateName = nextState;
      return true;
    });

    try {
      Math.random = () => 0.99;
      wizard.thinkPain(createEntityStub({ origin: new Vector() }), 10);
    } finally {
      Math.random = originalRandom;
    }

    assert.equal(stateName, null);
  });

  void test('pain still flinches when the damage check succeeds', () => {
    const wizard = createMonsterFixture(TestWizard);
    const originalRandom = Math.random;
    let stateName = null;

    wizard.startSound = () => {};
    wizard._ai.foundTarget = () => {};
    wizard.stubRunState((nextState: string | null) => {
      stateName = nextState;
      return true;
    });

    try {
      Math.random = () => 0;
      wizard.thinkPain(createEntityStub({ origin: new Vector() }), 10);
    } finally {
      Math.random = originalRandom;
    }

    assert.equal(stateName, 'wiz_pain1');
  });

  void test('attack finish applies the original cooldown and resumes straight movement at mid range', () => {
    const wizard = createMonsterFixture(TestWizard);
    let stateName = null;

    const ai = { enemyRange: range.RANGE_MID, enemyIsVisible: true, _attackState: ATTACK_STATE.AS_MISSILE };
    wizard._ai = createAiStub(ai);
    wizard.stubRunState((nextState: string | null) => {
      stateName = nextState;
      return true;
    });

    wizard.runAttackFinished();

    assert.equal(wizard.attack_finished, 7);
    assert.equal(ai._attackState, ATTACK_STATE.AS_STRAIGHT);
    assert.equal(stateName, 'wiz_run1');
  });

  void test('attack finish switches to sliding movement at close visible range', () => {
    const wizard = createMonsterFixture(TestWizard);
    let stateName = null;

    const ai = { enemyRange: range.RANGE_NEAR, enemyIsVisible: true, _attackState: ATTACK_STATE.AS_MISSILE };
    wizard._ai = createAiStub(ai);
    wizard.stubRunState((nextState: string | null) => {
      stateName = nextState;
      return true;
    });

    wizard.runAttackFinished();

    assert.equal(ai._attackState, ATTACK_STATE.AS_SLIDING);
    assert.equal(stateName, 'wiz_side1');
  });
});
