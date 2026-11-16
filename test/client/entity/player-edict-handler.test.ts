import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Vector from '../../../../../shared/Vector.ts';
import { ClientEdict } from '../../../../../engine/client/ClientEntities.ts';
import { effect } from '../../../Defs.ts';
import { assertNear } from '../../../../../../test/support/assertions.ts';
import { asClientEngineAPI } from '../fixtures.ts';

await import('../../../GameAPI.ts');
const { PlayerClientEdictHandler } = await import('../../../client/entity/Player.ts');

interface Flash {
  origin: Vector;
  radius: number;
  die: number;
  color: Vector;
  minlight: number;
}

/**
 * @param muzzle Where the engine says the muzzle is, `null` for a model without one.
 * @returns A handler for a player at (100, 200, 300) looking along +X with a muzzle flash, and the lights it made.
 */
function createFlashingPlayer(muzzle: Vector | null) {
  const lights: Flash[] = [];
  const asked: ClientEdict[] = [];
  const clock = { time: 10, frametime: 0.016 };
  const engine = {
    CL: clock,
    AllocDlight(): Flash {
      const light = { origin: new Vector(), radius: 0, die: 0, color: new Vector(), minlight: 0 };
      lights.push(light);
      return light;
    },
    SetEntityJointAngles(): boolean {
      return false;
    },
    SetEntityPitchesBody(): void {},
    GetMuzzleFlashOrigin(entity: ClientEdict, out: Vector): boolean {
      asked.push(entity);

      if (muzzle === null) {
        return false;
      }

      out.set(muzzle);
      return true;
    },
  };
  const clientEdict = new ClientEdict(3);
  clientEdict.origin.setTo(100, 200, 300);
  clientEdict.angles.setTo(0, 0, 0);
  clientEdict.effects = effect.EF_MUZZLEFLASH;

  return { handler: new PlayerClientEdictHandler(clientEdict, asClientEngineAPI(engine)), lights, asked, clientEdict, clock };
}

void describe('PlayerClientEdictHandler muzzle flash', () => {
  void test('the light goes where the engine puts the muzzle of the model or of the weapon in its hand', () => {
    const muzzle = new Vector(131, 207, 288);
    const { handler, lights, asked, clientEdict } = createFlashingPlayer(muzzle);

    handler.emit();

    assert.equal(lights.length, 1);
    assert.deepEqual(asked, [clientEdict]);
    assertNear(lights[0]!.origin[0], 131);
    assertNear(lights[0]!.origin[1], 207);
    assertNear(lights[0]!.origin[2], 288);
  });

  void test('a model without a muzzle keeps the fixed place: 20 units ahead and 16 up', () => {
    const { handler, lights } = createFlashingPlayer(null);

    handler.emit();

    assert.equal(lights.length, 1);
    assertNear(lights[0]!.origin[0], 120);
    assertNear(lights[0]!.origin[1], 200);
    assertNear(lights[0]!.origin[2], 316);
  });

  void test('no flash, no light and no question', () => {
    const { handler, lights, asked, clientEdict } = createFlashingPlayer(new Vector(1, 2, 3));
    clientEdict.effects = 0;

    handler.emit();

    assert.equal(lights.length, 0);
    assert.equal(asked.length, 0);
  });
});

void describe('PlayerClientEdictHandler shots read between frames', () => {
  void test('a shot whose bit was already cleared again when the frame came still lights, from where the engine puts the muzzle', () => {
    const { handler, lights, clientEdict, clock } = createFlashingPlayer(new Vector(131, 207, 288));
    clientEdict.effects = 0;
    handler.emit(); // the first frame: nothing was shot yet

    clock.time += 0.1;
    clientEdict.muzzleFlashCount++; // two datagrams in one frame: the bit came and went before the handler looked
    clientEdict.muzzleFlashTime = clock.time;
    handler.emit();

    assert.equal(lights.length, 1);
    assertNear(lights[0]!.origin[0], 131);
  });

  void test('a shot read at the start of a very slow frame still lights: the frame\'s own length does not make it old', () => {
    const { handler, lights, clientEdict, clock } = createFlashingPlayer(null);
    clientEdict.effects = 0;
    handler.emit();

    clientEdict.muzzleFlashCount++;
    clientEdict.muzzleFlashTime = clock.time; // read when the frame began ...
    clock.frametime = 0.45;
    clock.time += 0.45; // ... which then took 450 ms before the handlers ran
    handler.emit();

    assert.equal(lights.length, 1);
  });

  void test('the same shot lights once, and a shot that was read long ago does not light at all', () => {
    const { handler, lights, clientEdict, clock } = createFlashingPlayer(null);
    clientEdict.effects = 0;
    handler.emit();

    clientEdict.muzzleFlashCount++;
    clientEdict.muzzleFlashTime = clock.time;
    handler.emit();
    handler.emit();
    assert.equal(lights.length, 1);

    clientEdict.muzzleFlashCount++;
    clientEdict.muzzleFlashTime = clock.time;
    clock.time += 5; // the player was out of view
    handler.emit();
    assert.equal(lights.length, 1);
  });
});

interface JointCall {
  readonly joint: string;
  readonly angles: Vector;
}

/**
 * @param pitch The pitch of the player entity, a third of the look pitch.
 * @param joints The joints the model has; the engine says no to any other.
 * @returns A handler, and what it asked the engine to do.
 */
function createLookingPlayer(pitch: number, joints: readonly string[]) {
  const calls: JointCall[] = [];
  const pitchesBody: boolean[] = [];
  const engine = {
    CL: { time: 10, frametime: 0.016 },
    SetEntityJointAngles(_entity: ClientEdict, joint: string, angles: Vector): boolean {
      calls.push({ joint, angles: angles.copy() });
      return joints.includes(joint);
    },
    SetEntityPitchesBody(_entity: ClientEdict, value: boolean): void {
      pitchesBody.push(value);
    },
  };
  const clientEdict = new ClientEdict(3);
  clientEdict.angles.setTo(pitch, 90, 0);
  clientEdict.anglesPrevious.setTo(pitch, 90, 0);

  return { handler: new PlayerClientEdictHandler(clientEdict, asClientEngineAPI(engine)), calls, pitchesBody };
}

void describe('PlayerClientEdictHandler look pitch', () => {
  void test('three times the entity pitch is the look pitch, spread over the spine, neck and head so that the head takes the whole of it', () => {
    const { handler, calls } = createLookingPlayer(10, ['spine0', 'spine1', 'neck', 'head']);

    handler.emit();

    assert.deepEqual(calls.map((call) => call.joint), ['spine0', 'spine1', 'neck', 'head']);
    const shares = calls.map((call) => call.angles[0] / 30);
    assertNear(shares[0]!, 0.15);
    assertNear(shares[1]!, 0.25);
    assertNear(shares[2]!, 0.25);
    assertNear(shares[3]!, 0.35);
    assertNear(shares.reduce((sum, share) => sum + share, 0), 1.0);
    assert.ok(calls.every((call) => call.angles[1] === 0 && call.angles[2] === 0), 'pitch only');
  });

  void test('looking down bends the other way', () => {
    const { handler, calls } = createLookingPlayer(-20, ['spine0', 'spine1', 'neck', 'head']);

    handler.emit();

    assertNear(calls[3]!.angles[0], -21);
  });

  void test('a model that bends keeps its body upright', () => {
    const { handler, pitchesBody } = createLookingPlayer(10, ['spine0', 'spine1', 'neck', 'head']);

    handler.emit();

    assert.deepEqual(pitchesBody, [false]);
  });

  void test('a model without those joints (the alias player) keeps tilting as a whole', () => {
    const { handler, pitchesBody } = createLookingPlayer(10, []);

    handler.emit();

    assert.deepEqual(pitchesBody, [true]);
  });

  void test('a rig that has only some of the joints bends with those and keeps the body upright', () => {
    const { handler, pitchesBody } = createLookingPlayer(10, ['spine1', 'head']);

    handler.emit();

    assert.deepEqual(pitchesBody, [false]);
  });

  void test('an entity whose angles are not known yet is left alone', () => {
    const { handler, calls, pitchesBody } = createLookingPlayer(Infinity, ['spine0']);

    handler.emit();

    assert.equal(calls.length, 0);
    assert.equal(pitchesBody.length, 0);
  });
});
