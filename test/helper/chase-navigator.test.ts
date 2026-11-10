import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import Vector from '../../../../shared/Vector.ts';
import type { ServerEngineAPI } from '../../../../shared/GameInterfaces.ts';
import { createInertEdict, createInertGameApi, createMutableEngineApi } from '../../../../../test/support/entityMocks.ts';
import { serializableFieldsOf } from '../../../../../test/support/serialization.ts';

import { flags, worldType } from '../../Defs.ts';

await import('../../GameAPI.ts');
const { ChaseNavigator } = await import('../../helper/ChaseNavigator.ts');
const { default: OgreEntity } = await import('../../entity/monster/Ogre.ts');

/** The box a path is asked for. */
type NavigationBox = Parameters<ServerEngineAPI['NavigateAsync']>[2];

/** A path request the test answers when it wants to. */
interface PathRequest {
  readonly start: Vector;
  readonly goal: Vector;
  readonly box: NavigationBox | null;
  readonly resolve: (path: Vector[] | null) => void;
}

/** A monster with a navigator, a clock the test turns, and the path requests it sent. */
interface Harness {
  readonly monster: InstanceType<typeof OgreEntity>;
  readonly navigator: InstanceType<typeof ChaseNavigator>;
  readonly requests: PathRequest[];
  readonly clock: { time: number };
}

/**
 * Builds a monster at the origin with a navigator of its own.
 * @returns The harness.
 */
function createHarness(): Harness {
  const requests: PathRequest[] = [];
  const engine = createMutableEngineApi({
    NavigateAsync(start: Vector, goal: Vector, box: NavigationBox | null = null) {
      return new Promise<Vector[] | null>((resolve) => {
        requests.push({ start: start.copy(), goal: goal.copy(), box, resolve });
      });
    },
    ConsoleDebug() {},
    eventBus: { publish() {} },
  });
  const gameAPI = createInertGameApi({
    time: 10,
    worldspawn: { worldtype: worldType.MEDIEVAL },
    gameAI: { _sightEntity: null, _sightEntityTime: 0, _sightEntityLastOrigin: new Vector() },
  }, engine);
  const edict = createInertEdict();
  const monster = new OgreEntity(edict, gameAPI).initializeEntity();
  edict.entity = monster;
  monster.health = 200;
  monster.origin = new Vector();
  monster.flags = 0;

  const navigator = new ChaseNavigator(monster);
  navigator.reset();

  // the inert game API is a plain object, so its time can be turned like a clock
  return { monster, navigator, requests, clock: gameAPI as unknown as { time: number } };
}

/**
 * Something to chase at a point.
 * @returns The enemy.
 */
function enemyAt(harness: Harness, x: number, y: number, z: number): InstanceType<typeof OgreEntity> {
  const edict = createInertEdict();
  const enemy = new OgreEntity(edict, harness.monster.game).initializeEntity();
  edict.entity = enemy;
  enemy.origin = new Vector(x, y, z);
  return enemy;
}

/**
 * Answers a path request and lets the answer arrive.
 */
async function answer(request: PathRequest, waypoints: Vector[] | null): Promise<void> {
  request.resolve(waypoints === null ? null : [request.start.copy(), ...waypoints]);
  await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Plain numbers of a path, for comparing.
 * @returns The waypoints as arrays.
 */
function pointsOf(path: Vector[] | null): number[][] {
  return (path ?? []).map((point) => [...point]);
}

const originalRandom = Math.random;

void describe('ChaseNavigator', () => {
  beforeEach(() => {
    Math.random = () => 0; // no stagger between requests
  });

  afterEach(() => {
    Math.random = originalRandom;
  });

  void describe('steer', () => {
    void test('charges a visible enemy close by on its own level without asking for a path', () => {
      const harness = createHarness();
      const enemy = enemyAt(harness, 200, 0, 0);
      harness.navigator.remember(enemy.origin);

      assert.deepEqual([...harness.navigator.steer(enemy, true)!], [200, 0, 0]);
      assert.equal(harness.requests.length, 0);
    });

    void test('follows a path to a visible enemy far away on its own level', () => {
      // a straight line that looks clear over a long distance often runs into a ledge or a gap
      const harness = createHarness();
      const enemy = enemyAt(harness, 600, 0, 0);
      harness.navigator.remember(enemy.origin);

      assert.equal(harness.navigator.steer(enemy, true), null);
      assert.equal(harness.requests.length, 1);
    });

    void test('asks for a path a monster of its size walks', () => {
      // without its box the path would drop off ledges and squeeze through gaps the monster can't take
      const harness = createHarness();
      harness.monster.mins = new Vector(-32, -32, -24);
      harness.monster.maxs = new Vector(32, 32, 64);
      const enemy = enemyAt(harness, 600, 0, 0);
      harness.navigator.remember(enemy.origin);

      harness.navigator.steer(enemy, false);

      const box = harness.requests[0].box!;
      assert.deepEqual([...box.mins, ...box.maxs], [-32, -32, -24, 32, 32, 64]);
    });

    void test('leaves an enemy close by to the QuakeC chase, which stops when close enough', () => {
      const harness = createHarness();
      const enemy = enemyAt(harness, 64, 0, 0);
      harness.navigator.remember(enemy.origin);

      assert.equal(harness.navigator.steer(enemy, true), null);
    });

    void test('follows a path to a visible enemy one floor up', async () => {
      const harness = createHarness();
      const enemy = enemyAt(harness, 300, 0, 128);
      harness.navigator.remember(enemy.origin);

      assert.equal(harness.navigator.steer(enemy, true), null);
      assert.equal(harness.requests.length, 1);
      assert.deepEqual([...harness.requests[0].goal], [300, 0, 128]);

      await answer(harness.requests[0], [new Vector(100, 0, 0), new Vector(300, 0, 128)]);

      assert.deepEqual([...harness.navigator.steer(enemy, true)!], [100, 0, 0]);
    });

    void test('does not take a waypoint on the floor above as reached', async () => {
      // the old 2D check dropped a waypoint right above the monster and headed for the next one through the ceiling
      const harness = createHarness();
      const enemy = enemyAt(harness, 0, 300, 256);
      harness.navigator.remember(enemy.origin);
      harness.navigator.steer(enemy, false);

      await answer(harness.requests[0], [new Vector(8, 0, 128), new Vector(0, 300, 256)]);

      assert.deepEqual([...harness.navigator.steer(enemy, false)!], [8, 0, 128]);
    });

    void test('drops the waypoints it reached', async () => {
      const harness = createHarness();
      const enemy = enemyAt(harness, 400, 0, 0);
      harness.navigator.remember(enemy.origin);
      harness.navigator.steer(enemy, false);
      await answer(harness.requests[0], [new Vector(100, 0, 0), new Vector(200, 0, 0), new Vector(400, 0, 0)]);

      harness.monster.origin = new Vector(110, 10, 0);
      harness.clock.time += 0.1;

      assert.deepEqual([...harness.navigator.steer(enemy, false)!], [200, 0, 0]);
    });

    void test('drops an answer that arrives after the enemy changed', async () => {
      const harness = createHarness();
      const oldEnemy = enemyAt(harness, 400, 0, 0);
      harness.navigator.remember(oldEnemy.origin);
      harness.navigator.steer(oldEnemy, false);

      harness.navigator.reset();
      harness.navigator.remember(new Vector(-400, 0, 0));
      await answer(harness.requests[0], [new Vector(200, 0, 0), new Vector(400, 0, 0)]);

      assert.deepEqual(pointsOf(harness.navigator.path), []);
    });

    void test('asks at most once a second when the enemy keeps moving', async () => {
      const harness = createHarness();
      const enemy = enemyAt(harness, 400, 0, 0);
      harness.navigator.remember(enemy.origin);
      harness.navigator.steer(enemy, false);
      await answer(harness.requests[0], [new Vector(200, 0, 0), new Vector(400, 0, 0)]);

      harness.navigator.remember(new Vector(400, 300, 0));
      harness.clock.time += 0.5;
      harness.navigator.steer(enemy, false);
      assert.equal(harness.requests.length, 1);

      harness.clock.time += 0.5;
      harness.navigator.steer(enemy, false);
      assert.equal(harness.requests.length, 2);
      assert.deepEqual([...harness.requests[1].goal], [400, 300, 0]);
    });

    void test('asks for a new path when stuck, and skips the waypoint it got stuck on', async () => {
      const harness = createHarness();
      const enemy = enemyAt(harness, 600, 0, 0);
      const waypoints = [new Vector(200, 0, 0), new Vector(400, 0, 0), new Vector(600, 0, 0)];
      harness.navigator.remember(enemy.origin);
      harness.navigator.steer(enemy, false);
      await answer(harness.requests[0], waypoints);

      // the monster doesn't get anywhere
      for (let frame = 0; frame < 11; frame++) {
        harness.clock.time += 0.1;
        harness.navigator.steer(enemy, false);
      }

      assert.equal(harness.requests.length, 2);
      await answer(harness.requests[1], waypoints);
      assert.deepEqual([...harness.navigator.steer(enemy, false)!], [400, 0, 0]);
    });

    void test('takes the path for a while when charging a visible enemy makes no headway', () => {
      // an enemy behind a window or across a gap is visible and on the same level, but can't be walked to directly
      const harness = createHarness();
      const enemy = enemyAt(harness, 200, 0, 0);
      harness.navigator.remember(enemy.origin);

      // a little over a second of run frames without getting closer
      for (let frame = 0; frame < 12; frame++) {
        harness.clock.time += 0.1;
        harness.navigator.steer(enemy, true);
      }

      assert.equal(harness.requests.length, 1);
    });

    void test('a visible enemy walking away does not count as being stuck', () => {
      const harness = createHarness();
      const enemy = enemyAt(harness, 150, 0, 0);
      harness.navigator.remember(enemy.origin);

      // the monster runs 10 units a frame, the enemy gets away at 12
      for (let frame = 0; frame < 30; frame++) {
        harness.clock.time += 0.1;
        harness.monster.origin = new Vector(10 * frame, 0, 0);
        enemy.origin = new Vector(150 + 12 * frame, 0, 0);
        assert.deepEqual([...harness.navigator.steer(enemy, true)!], [...enemy.origin]);
      }

      assert.equal(harness.requests.length, 0);
    });

    void test('a pause between run frames, such as an attack, does not count as being stuck', () => {
      const harness = createHarness();
      const enemy = enemyAt(harness, 200, 0, 0);
      harness.navigator.remember(enemy.origin);
      harness.navigator.steer(enemy, true);

      harness.clock.time += 2.0;
      assert.deepEqual([...harness.navigator.steer(enemy, true)!], [200, 0, 0]);
      assert.equal(harness.requests.length, 0);
    });

    void test('flying and swimming monsters chase directly', () => {
      const harness = createHarness();
      const enemy = enemyAt(harness, 300, 0, 256);
      harness.monster.flags = flags.FL_FLY;
      harness.navigator.remember(enemy.origin);

      assert.equal(harness.navigator.steer(enemy, false), null);
      assert.equal(harness.requests.length, 0);
    });
  });

  void describe('serialization', () => {
    void test('saves where the chase is heading', () => {
      assert.deepEqual(serializableFieldsOf(ChaseNavigator), [
        '_lastKnownOrigin',
        '_hasMemory',
        '_path',
        '_pathGoal',
        '_replanWanted',
        '_nextRequestTime',
        '_pathOnlyUntil',
        '_stuckWaypoint',
        '_progressOrigin',
        '_progressTime',
        '_lastSteerTime',
      ]);
    });

    void test('a loaded game keeps the path and the remembered position', async () => {
      const harness = createHarness();
      const enemy = enemyAt(harness, 400, 0, 0);
      harness.navigator.remember(enemy.origin);
      harness.navigator.steer(enemy, false);
      await answer(harness.requests[0], [new Vector(200, 0, 0), new Vector(400, 0, 0)]);

      const loaded = new ChaseNavigator(harness.monster);
      loaded._serializer.deserialize(harness.navigator._serializer.serialize());

      assert.deepEqual(pointsOf(loaded.path), [[200, 0, 0], [400, 0, 0]]);
      assert.deepEqual([...loaded.lastKnownOrigin!], [400, 0, 0]);
    });
  });
});
