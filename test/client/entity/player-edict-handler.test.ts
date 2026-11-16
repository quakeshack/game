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
  const engine = {
    CL: { time: 10 },
    AllocDlight(): Flash {
      const light = { origin: new Vector(), radius: 0, die: 0, color: new Vector(), minlight: 0 };
      lights.push(light);
      return light;
    },
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

  return { handler: new PlayerClientEdictHandler(clientEdict, asClientEngineAPI(engine)), lights, asked, clientEdict };
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
