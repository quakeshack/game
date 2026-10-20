import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import Vector from '../../../../shared/Vector.ts';
import type { ServerEdict } from '../../../../engine/server/Edict.ts';
import type BaseEntity from '../../entity/BaseEntity.ts';
import type { PlayerEntity } from '../../entity/Player.ts';
import { createInertEdict, createInertEngineApi, createInertGameApi } from '../../../../../test/support/entityMocks.ts';
import { moveType } from '../../Defs.ts';

await import('../../GameAPI.ts');

const { BodyqueEntity, CopyToBodyQue, WorldspawnEntity } = await import('../../entity/Worldspawn.ts');

type Worldspawn = InstanceType<typeof WorldspawnEntity>;

/**
 * Create a mock server edict that keeps entity fields in sync.
 * @param num Edict slot number.
 * @returns The mock edict and the call that attaches the entity built around it.
 */
function createMockEdict(num: number): { edict: ServerEdict; bindEntity: (entity: BaseEntity) => void } {
  let current: BaseEntity | null = null;
  const edict = createInertEdict();

  Object.assign(edict, {
    num,
    setOrigin(origin: Vector): void {
      current!.origin = origin.copy();
    },
    setModel(model: string | null): void {
      current!.model = model;
    },
    setMinMaxSize(mins: Vector, maxs: Vector): void {
      current!.mins = mins.copy();
      current!.maxs = maxs.copy();
    },
  });

  return {
    edict,
    bindEntity(entity: BaseEntity): void {
      current = entity;
      edict.entity = entity;
    },
  };
}

/**
 * Create a minimal worldspawn fixture with spawnable body queue entities.
 * @returns Fixture data.
 */
function createWorldspawnFixture() {
  const precachedSounds: string[] = [];
  const precachedModels: string[] = [];
  const lightstyles: Array<{ style: number; value: string }> = [];
  const cvars: Array<{ name: string; value: string }> = [];
  const spawnClassnames: string[] = [];
  let nextEdictNum = 10;

  const engine = createInertEngineApi({
    PrecacheSound(sound: string): void {
      precachedSounds.push(sound);
    },
    PrecacheModel(model: string): void {
      precachedModels.push(model);
    },
    SetCvar(name: string, value: string): void {
      cvars.push({ name, value });
    },
    Lightstyle(style: number, value: string): void {
      lightstyles.push({ style, value });
    },
    SpawnEntity(classname: string) {
      spawnClassnames.push(classname);
      if (classname !== BodyqueEntity.classname) {
        return { entity: null };
      }

      const { edict, bindEntity } = createMockEdict(nextEdictNum++);
      const entity = new BodyqueEntity(edict, gameAPI).initializeEntity().precacheEntity();
      bindEntity(entity);
      return { entity };
    },
  });

  const gameAPI = createInertGameApi({
    worldspawn: null,
    lastspawn: null,
    bodyque_head: null,
  }, engine);

  const { edict: worldspawnEdict, bindEntity } = createMockEdict(1);
  const worldspawn = new WorldspawnEntity(worldspawnEdict, gameAPI).initializeEntity().precacheEntity();
  bindEntity(worldspawn);
  worldspawn.origin = new Vector();
  worldspawn.model = 'maps/start.bsp';

  return { worldspawn, gameAPI, precachedSounds, precachedModels, lightstyles, cvars, spawnClassnames };
}

void describe('WorldspawnEntity spawn', () => {
  void test('creates a four-entry QC body queue ring and initializes world lighting', () => {
    // Only compared by identity.
    const previousWorldspawn = { marker: 'previous' } as unknown as Worldspawn;
    const { worldspawn, gameAPI, cvars, lightstyles, spawnClassnames, precachedSounds, precachedModels } = createWorldspawnFixture();

    gameAPI.worldspawn = previousWorldspawn;
    worldspawn.model = 'maps/e1m8.bsp';

    worldspawn.spawn();

    assert.equal(gameAPI.lastspawn, previousWorldspawn);
    assert.equal(gameAPI.worldspawn, worldspawn);
    assert.equal(spawnClassnames.length, 4);
    const head = gameAPI.bodyque_head;
    assert.ok(head instanceof BodyqueEntity);
    assert.equal(head.owner?.owner?.owner?.owner, head);
    assert.deepEqual(cvars, [{ name: 'sv_gravity', value: '100' }]);
    assert.equal(lightstyles.length, 13);
    assert.deepEqual(lightstyles[0], { style: 0, value: 'm' });
    assert.deepEqual(lightstyles.at(-1), { style: 63, value: 'a' });
    assert.ok(precachedSounds.includes('demon/dland2.wav'));
    assert.ok(precachedSounds.includes('misc/talk.wav'));
    assert.ok(precachedModels.includes('progs/bolt3.mdl'));
  });

  void test('uses normal gravity outside END and copies corpse data into the body queue', () => {
    const { worldspawn, gameAPI, cvars } = createWorldspawnFixture();
    worldspawn.spawn();

    const firstBody = gameAPI.bodyque_head;
    assert.ok(firstBody);
    const nextBody = firstBody.owner;
    // CopyToBodyQue reads these members of the player.
    const player = {
      angles: new Vector(10, 20, 30),
      model: 'progs/player.mdl',
      frame: 7,
      colormap: 5,
      movetype: moveType.MOVETYPE_WALK,
      velocity: new Vector(1, 2, 3),
      origin: new Vector(100, 200, 300),
      mins: new Vector(-16, -16, -24),
      maxs: new Vector(16, 16, 32),
    };

    CopyToBodyQue(gameAPI, player as unknown as PlayerEntity);

    assert.deepEqual(cvars, [{ name: 'sv_gravity', value: '800' }]);
    assert.ok(firstBody.angles.equalsTo(10, 20, 30));
    assert.equal(firstBody.model, 'progs/player.mdl');
    assert.equal(firstBody.frame, 7);
    assert.equal(firstBody.colormap, 5);
    assert.equal(firstBody.movetype, moveType.MOVETYPE_WALK);
    assert.ok(firstBody.velocity.equalsTo(1, 2, 3));
    assert.ok(firstBody.origin.equalsTo(100, 200, 300));
    assert.ok(firstBody.mins.equalsTo(-16, -16, -24));
    assert.ok(firstBody.maxs.equalsTo(16, 16, 32));
    assert.equal(gameAPI.bodyque_head, nextBody);

    player.angles.setTo(1, 1, 1);
    player.velocity.setTo(9, 9, 9);
    assert.ok(firstBody.angles.equalsTo(10, 20, 30));
    assert.ok(firstBody.velocity.equalsTo(1, 2, 3));
  });
});
