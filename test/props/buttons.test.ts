import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import Vector from '../../../../shared/Vector.ts';
import type { ScheduledThinkCallback } from '../../entity/BaseEntity.ts';
import type { Sub } from '../../entity/Subs.ts';
import { createInertEdict, createInertEngineApi, createInertGameApi, createSubStub, finishMove, type CalcMoveCall } from '../../../../../test/support/entityMocks.ts';
import { damage, moveType, solid } from '../../Defs.ts';

await import('../../GameAPI.ts');

const { PlayerEntity } = await import('../../entity/Player.ts');
const { ButtonEntity } = await import('../../entity/props/Buttons.ts');
const { state } = await import('../../entity/props/BasePropEntity.ts');

/** A button whose movement helper a test replaces, which the entity keeps to itself. */
class TestButton extends ButtonEntity {
  useSub(sub: Sub): void {
    this._sub = sub;
  }
}

/**
 * Create a minimal button fixture for focused behavior tests.
 * @returns Button fixture data.
 */
function createButtonFixture(): { button: TestButton; setModelCalls: string[]; precachedSounds: string[] } {
  const setModelCalls: string[] = [];
  const precachedSounds: string[] = [];
  const edict = createInertEdict();
  edict.setModel = (model: string): void => {
    setModelCalls.push(model);
  };

  const engine = createInertEngineApi({
    PrecacheSound(sound: string): void {
      precachedSounds.push(sound);
    },
    DispatchTempEntityEvent() {},
    eventBus: {
      publish() {},
    },
  });

  const gameAPI = createInertGameApi({
    time: 3,
    deathmatch: 0,
    nomonsters: 0,
  }, engine);

  const button = new TestButton(edict, gameAPI).initializeEntity().precacheEntity();
  edict.entity = button;
  button.origin = new Vector(10, 20, 30);
  button.angles = new Vector();
  button.size = new Vector(64, 16, 8);
  button.model = 'progs/button.bsp';

  return { button, setModelCalls, precachedSounds };
}

void describe('ButtonEntity spawn', () => {
  void test('applies QC defaults and computes the travel destination', () => {
    const { button, precachedSounds, setModelCalls } = createButtonFixture();
    let setMovedirCalls = 0;

    button.useSub(createSubStub({
      setMovedir() {
        setMovedirCalls++;
        button.movedir.setTo(1, 0, 0);
      },
    }));

    button.spawn();

    assert.deepEqual(precachedSounds, ['buttons/airbut1.wav']);
    assert.equal(setMovedirCalls, 1);
    assert.deepEqual(setModelCalls, ['progs/button.bsp']);
    assert.equal(button.movetype, moveType.MOVETYPE_PUSH);
    assert.equal(button.solid, solid.SOLID_BSP);
    assert.equal(button.speed, 40);
    assert.equal(button.wait, 1);
    assert.equal(button.lip, 4);
    assert.equal(button.state, state.STATE_BOTTOM);
    assert.ok(button.pos1.equalsTo(10, 20, 30));
    assert.ok(button.pos2.equalsTo(70, 20, 30));
  });

  void test('enables takedamage and stores max health for shootable buttons', () => {
    const { button } = createButtonFixture();

    button.useSub(createSubStub({
      setMovedir() {
        button.movedir.setTo(0, 1, 0);
      },
    }));
    button.health = 25;

    button.spawn();

    assert.equal(button.max_health, 25);
    assert.equal(button.takedamage, damage.DAMAGE_YES);
  });
});

void describe('ButtonEntity interaction', () => {
  void test('touch ignores non-player entities and shootable buttons', () => {
    const { button } = createButtonFixture();
    const player = Object.create(PlayerEntity.prototype) as InstanceType<typeof PlayerEntity>;
    const pushVector = new Vector();
    const calcMoveCalls: CalcMoveCall[] = [];

    // Firing a button starts its move, which is what a touch that is not ignored would do.
    button.useSub(createSubStub({
      calcMove(target, speed, callback) {
        calcMoveCalls.push({ target, speed, callback });
      },
    }));
    button.noise = 'buttons/switch02.wav';
    button.state = state.STATE_BOTTOM;

    button.touch(button, pushVector);
    button.max_health = 5;
    button.touch(player, pushVector);

    assert.deepEqual(calcMoveCalls, []);
    assert.equal(button.state, state.STATE_BOTTOM);
  });

  void test('use starts the opening move and ignores repeat triggers while already active', () => {
    const { button } = createButtonFixture();
    const calcMoveCalls: CalcMoveCall[] = [];
    const soundCalls: string[] = [];
    const userEntity = button;

    button.useSub(createSubStub({
      calcMove(target, speed, callback) {
        calcMoveCalls.push({ target, speed, callback });
      },
    }));
    button.pos2 = new Vector(100, 20, 30);
    button.speed = 55;
    button.noise = 'buttons/switch02.wav';
    button.state = state.STATE_BOTTOM;
    button.startSound = (_channel, soundName) => {
      soundCalls.push(soundName);
    };

    button.use(userEntity);
    button.use(userEntity);

    assert.equal(button.state, state.STATE_UP);
    assert.deepEqual(soundCalls, ['buttons/switch02.wav']);
    assert.equal(calcMoveCalls.length, 1);
    assert.ok(calcMoveCalls[0].target.equalsTo(100, 20, 30));
    assert.equal(calcMoveCalls[0].speed, 55);
    assert.equal(typeof calcMoveCalls[0].callback, 'function');
  });

  void test('wait, return, and death preserve the QC button cycle', () => {
    const { button } = createButtonFixture();
    const calcMoveCalls: CalcMoveCall[] = [];
    const scheduledThinks: Array<{ nextThink: number; callback: ScheduledThinkCallback<TestButton> }> = [];
    const usedTargets: unknown[] = [];
    const attacker = button;

    button.useSub(createSubStub({
      calcMove(target, speed, callback) {
        calcMoveCalls.push({ target, speed, callback });
      },
      useTargets(userEntity) {
        usedTargets.push(userEntity);
      },
    }));
    button._scheduleThink = (nextThink, callback) => {
      scheduledThinks.push({ nextThink, callback });
    };
    button.pos1 = new Vector(10, 20, 30);
    button.speed = 30;
    button.wait = 2;
    button.ltime = 5;
    button.health = 9;
    button.max_health = 9;
    button.takedamage = damage.DAMAGE_YES;
    button.noise = 'buttons/airbut1.wav';
    button.state = state.STATE_BOTTOM;

    button.thinkDie(attacker);

    assert.equal(button.health, 9);
    assert.equal(button.takedamage, damage.DAMAGE_NO);
    assert.equal(button.state, state.STATE_UP);
    assert.equal(calcMoveCalls.length, 1);

    finishMove(calcMoveCalls[0], button);

    assert.equal(button.state, state.STATE_TOP);
    assert.equal(button.frame, 1);
    assert.deepEqual(usedTargets, [attacker]);
    assert.equal(scheduledThinks.length, 1);
    assert.equal(scheduledThinks[0].nextThink, 7);

    scheduledThinks[0].callback.call(button, button);

    assert.equal(button.state, state.STATE_DOWN);
    assert.equal(button.frame, 0);
    assert.equal(button.takedamage, damage.DAMAGE_YES);
    assert.equal(calcMoveCalls.length, 2);
    assert.ok(calcMoveCalls[1].target.equalsTo(10, 20, 30));
    assert.equal(calcMoveCalls[1].speed, 30);

    finishMove(calcMoveCalls[1], button);

    assert.equal(button.state, state.STATE_BOTTOM);
  });
});
