import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Vector from '../../../../../shared/Vector.ts';
import { ClientEdict } from '../../../../../engine/client/ClientEntities.ts';
import { content } from '../../../../../shared/Defs.ts';
import { effect } from '../../../Defs.ts';
import { eventBus, registry } from '../../../../../engine/registry.ts';

await import('../../../GameAPI.ts');
const { AirBubblesClientEdictHandler, BubbleClientEdictHandler } = await import('../../../client/entity/Bubbles.ts');

const FRAMETIME = 0.1;

/**
 * A trace result for a probe that hits nothing, or hits the world at the given fraction.
 * @param {number} fraction how far the probe got
 * @returns {object} a GameTrace-shaped mock trace
 */
function trace(fraction) {
  return {
    solid: { all: false, start: false },
    fraction,
    plane: { normal: new Vector(0, 0, -1), distance: 0 },
    contents: { inOpen: true, inWater: true },
    point: new Vector(),
    entity: null,
  };
}

/**
 * A mock ClientEngineAPI with water below `surfaceZ`, a ceiling at `ceilingZ`, and a controllable
 * clock. Records the world probes so tests can tell how often the handler traces.
 * @param {{time: number}} clock the mutable client clock
 * @param {{surfaceZ?: number, ceilingZ?: number}} world water surface and ceiling heights
 * @returns {object} the mock engine
 */
function createWaterEngine(clock, { surfaceZ = 1000, ceilingZ = 10000 } = {}) {
  const engine = {
    probes: 0,
    contentsQueries: 0,
    CL: {
      get time() {
        return clock.time;
      },
      frametime: FRAMETIME,
    },
    DetermineStaticWorldContents(origin) {
      engine.contentsQueries += 1;
      return origin[2] < surfaceZ ? content.CONTENT_WATER : content.CONTENT_EMPTY;
    },
    Traceline(start, end) {
      engine.probes += 1;
      return trace(end[2] > ceilingZ ? (ceilingZ - start[2]) / (end[2] - start[2]) : 1.0);
    },
  };

  return engine;
}

/**
 * Runs a callback with a trivial single-leaf worldmodel installed so `setOrigin()` links for real.
 * @param {() => void} callback
 */
function withWorldmodel(callback) {
  const previousCL = registry.CL;

  registry.CL = { state: { worldmodel: { nodes: [{ contents: content.CONTENT_EMPTY, num: 0 }] } } };
  eventBus.publish('registry.frozen');

  try {
    callback();
  } finally {
    registry.CL = previousCL;
    eventBus.publish('registry.frozen');
  }
}

/**
 * Creates a bubble handler at the given origin and spawns it with the given start delay.
 * @param {object} engine the mock engine
 * @param {Vector} origin start position
 * @param {number} delay start delay in seconds
 * @returns {{handler: BubbleClientEdictHandler, clientEdict: ClientEdict}} the handler and its edict
 */
function spawnBubble(engine, origin, delay = 0) {
  const clientEdict = new ClientEdict(-1);
  clientEdict.model = { name: 'progs/s_bubble.spr', mins: new Vector(-8, -8, -8), maxs: new Vector(8, 8, 8) };
  clientEdict.angles.clear();
  clientEdict.setOrigin(origin);

  const handler = new BubbleClientEdictHandler(clientEdict, engine);
  handler.spawn({ delay });

  return { handler, clientEdict };
}

/**
 * Advances the clock and thinks once, like one client frame.
 * @param {{time: number}} clock the mutable client clock
 * @param {BubbleClientEdictHandler} handler the handler to run
 */
function frame(clock, handler) {
  clock.time += FRAMETIME;
  handler.think();
}

void describe('BubbleClientEdictHandler', () => {
  void test('stays hidden and still until its start delay has elapsed', () => {
    withWorldmodel(() => {
      const clock = { time: 0 };
      const { handler, clientEdict } = spawnBubble(createWaterEngine(clock), new Vector(0, 0, 0), 0.5);

      assert.equal((clientEdict.effects & effect.EF_NODRAW) !== 0, true);

      frame(clock, handler); // 0.1
      frame(clock, handler); // 0.2

      assert.equal((clientEdict.effects & effect.EF_NODRAW) !== 0, true);
      assert.deepEqual([...clientEdict.origin], [0, 0, 0]);
    });
  });

  void test('shows up and rises at about 15 units per second once the delay has elapsed', () => {
    withWorldmodel(() => {
      const clock = { time: 0 };
      const { handler, clientEdict } = spawnBubble(createWaterEngine(clock), new Vector(0, 0, 0), 0.25);

      for (let i = 0; i < 13; i++) {
        frame(clock, handler); // appears on the third frame (0.3), then rises for ten frames
      }

      assert.equal((clientEdict.effects & effect.EF_NODRAW) !== 0, false);
      // 15 +/- 1 units/s for 1 s of rise (the appearing frame already moves)
      assert.ok(clientEdict.origin[2] > 13 && clientEdict.origin[2] < 18.5, `rose to ${clientEdict.origin[2]}`);
      // horizontal drift is at most 2 units/s per axis
      assert.ok(Math.abs(clientEdict.origin[0]) < 2.5 && Math.abs(clientEdict.origin[1]) < 2.5);
    });
  });

  void test('pops once it rises out of the water', () => {
    withWorldmodel(() => {
      const clock = { time: 0 };
      const { handler, clientEdict } = spawnBubble(createWaterEngine(clock, { surfaceZ: 10 }), new Vector(0, 0, 8), 0);

      for (let i = 0; i < 30 && !clientEdict.free; i++) {
        frame(clock, handler);
      }

      assert.equal(clientEdict.free, true);
    });
  });

  void test('pops when the world is within 8 units above it', () => {
    withWorldmodel(() => {
      const clock = { time: 0 };
      // ceiling 20 units up: the 8-unit probe starts hitting it once the bubble is above z = 12
      const { handler, clientEdict } = spawnBubble(createWaterEngine(clock, { ceilingZ: 20 }), new Vector(0, 0, 0), 0);

      for (let i = 0; i < 100 && !clientEdict.free; i++) {
        frame(clock, handler);
      }

      assert.equal(clientEdict.free, true);
      // the probe starts hitting at z = 12; checks run every 0.25 s (about 4 units of rise)
      assert.ok(clientEdict.origin[2] > 12 && clientEdict.origin[2] < 17, `popped at ${clientEdict.origin[2]}`);
    });
  });

  void test('checks water and ceiling a few times per second, not every frame', () => {
    withWorldmodel(() => {
      const clock = { time: 0 };
      const engine = createWaterEngine(clock);
      const { handler } = spawnBubble(engine, new Vector(0, 0, 0), 0);

      for (let i = 0; i < 20; i++) {
        frame(clock, handler); // two seconds
      }

      // one check on appearing plus one every 0.25 s, which lands on every third 0.1 s frame:
      // seven checks, nowhere near the twenty frames
      assert.ok(engine.contentsQueries >= 6 && engine.contentsQueries <= 10, `queried ${engine.contentsQueries} times`);
      assert.equal(engine.probes, engine.contentsQueries);
    });
  });

  void test('dies of old age ten seconds after it appeared', () => {
    withWorldmodel(() => {
      const clock = { time: 0 };
      const { handler, clientEdict } = spawnBubble(createWaterEngine(clock), new Vector(0, 0, -5000), 2);

      clock.time = 11.9;
      handler.think();
      assert.equal(clientEdict.free, false);

      clock.time = 12.1; // 2 s delay + 10 s lifetime
      handler.think();
      assert.equal(clientEdict.free, true);
    });
  });

  void describe('save/load', () => {
    void test('round-trips an appeared bubble, re-anchored to a new clock', () => {
      withWorldmodel(() => {
        const clock = { time: 100 };
        const { handler } = spawnBubble(createWaterEngine(clock), new Vector(0, 0, -5000), 0);

        for (let i = 0; i < 20; i++) {
          frame(clock, handler); // appeared, lived for 2 s
        }

        const saved = handler.serialize();

        const newClock = { time: 3 };
        const { handler: restored, clientEdict: restoredEdict } = spawnBubble(createWaterEngine(newClock), new Vector(0, 0, -5000), 5);
        restored.deserialize(saved);

        assert.equal((restoredEdict.effects & effect.EF_NODRAW) !== 0, false, 'an appeared bubble is drawn again');

        // 8 s of its 10 s life were left, so it is alive 7 s on and gone after 9
        newClock.time = 3 + 7;
        restored.think();
        assert.equal(restoredEdict.free, false);
        newClock.time = 3 + 9;
        restored.think();
        assert.equal(restoredEdict.free, true);
      });
    });

    void test('round-trips a bubble still waiting for its start delay', () => {
      withWorldmodel(() => {
        const clock = { time: 100 };
        const { handler } = spawnBubble(createWaterEngine(clock), new Vector(0, 0, -5000), 1.5);

        clock.time = 100.5;
        const saved = handler.serialize();

        const newClock = { time: 3 };
        const { handler: restored, clientEdict: restoredEdict } = spawnBubble(createWaterEngine(newClock), new Vector(0, 0, -5000), 0);
        restored.deserialize(saved);

        assert.equal((restoredEdict.effects & effect.EF_NODRAW) !== 0, true);

        newClock.time = 3.5; // 1 s of delay was left, so still hidden
        restored.think();
        assert.equal((restoredEdict.effects & effect.EF_NODRAW) !== 0, true);

        newClock.time = 4.1;
        restored.think();
        assert.equal((restoredEdict.effects & effect.EF_NODRAW) !== 0, false);
      });
    });
  });

  void describe('spawnBurst', () => {
    void test('spawns one delayed bubble per count, 0.1 s apart, around the origin', () => {
      const spawned = [];
      const engine = {
        SpawnClientEntity(classname) {
          const entity = {
            classname,
            model: null,
            angles: new Vector(Infinity, Infinity, Infinity),
            origin: null,
            parameters: null,
            setOrigin(origin) {
              entity.origin = origin.copy();
            },
            spawn(parameters) {
              entity.parameters = parameters;
            },
          };
          spawned.push(entity);
          return entity;
        },
        ModForName(name) {
          return { name };
        },
      };

      BubbleClientEdictHandler.spawnBurst(engine, new Vector(100, 200, 300), 4);

      assert.equal(spawned.length, 4);
      assert.ok(spawned.every((bubble) => bubble.classname === 'client_bubble'));
      assert.ok(spawned.every((bubble) => bubble.model.name === 'progs/s_bubble.spr'));
      assert.deepEqual(spawned.map((bubble) => Math.round(bubble.parameters.delay * 10)), [1, 2, 3, 4]);
      // spread is +/- 5 per axis; every bubble got its own origin snapshot
      for (const bubble of spawned) {
        assert.ok(Math.abs(bubble.origin[0] - 100) <= 5 && Math.abs(bubble.origin[1] - 200) <= 5 && Math.abs(bubble.origin[2] - 300) <= 5);
        assert.deepEqual([...bubble.angles], [0, 0, 0]);
      }
      assert.equal(new Set(spawned.map((bubble) => bubble.origin.toString())).size, 4);
    });
  });
});

void describe('BubbleClientEdictHandler._precache', () => {
  void test('precaches the bubble sprite so clients can resolve it on any map', () => {
    const models = [];

    BubbleClientEdictHandler._precache({ PrecacheModel: (name) => models.push(name) });

    assert.deepEqual(models, ['progs/s_bubble.spr']);
  });
});

void describe('AirBubblesClientEdictHandler', () => {
  void test('releases a bubble right away, then one every one to two seconds', () => {
    withWorldmodel(() => {
      const clock = { time: 50 };
      const spawnTimes = [];
      const engine = {
        CL: {
          get time() {
            return clock.time;
          },
          frametime: FRAMETIME,
        },
        IsInPVS() {
          return true;
        },
        SpawnClientEntity() {
          spawnTimes.push(clock.time);
          return {
            model: null,
            angles: new Vector(),
            setOrigin() {},
            spawn() {},
          };
        },
        ModForName(name) {
          return { name };
        },
      };
      const clientEdict = new ClientEdict(-1);
      clientEdict.origin.setTo(5, 6, 7);
      const handler = new AirBubblesClientEdictHandler(clientEdict, engine);
      handler.spawn();

      for (let i = 0; i < 100; i++) {
        handler.think();
        clock.time += FRAMETIME; // ten seconds
      }

      assert.equal(spawnTimes[0], 50, 'first bubble comes out right away');
      // between 1 and 2 s apart: 5 to 10 bubbles in ten seconds, plus the first
      assert.ok(spawnTimes.length >= 6 && spawnTimes.length <= 11, `spawned ${spawnTimes.length}`);

      for (let i = 1; i < spawnTimes.length; i++) {
        const gap = spawnTimes[i] - spawnTimes[i - 1];
        // frames are 0.1 s apart, so a 1..2 s gap shows up as 1.0..2.1 s
        assert.ok(gap >= 0.99 && gap <= 2.11, `gap ${gap}`);
      }
    });
  });

  void describe('view culling', () => {
    /**
     * An engine whose PVS answer the test controls, recording every spawned bubble.
     * @param {{time: number}} clock the mutable client clock
     * @param {{visible: boolean}} view whether the spawner is in the PVS
     * @returns {{engine: object, spawned: Array<{time: number, origin: Vector, parameters: object}>}} the mock engine and its spawns
     */
    function createCullingEngine(clock, view) {
      const spawned = [];
      const engine = {
        CL: {
          get time() {
            return clock.time;
          },
          frametime: FRAMETIME,
        },
        IsInPVS() {
          return view.visible;
        },
        SpawnClientEntity() {
          const entity = {
            origin: null,
            parameters: null,
            model: null,
            angles: new Vector(),
            setOrigin(origin) {
              entity.origin = origin.copy();
            },
            spawn(parameters) {
              entity.parameters = parameters;
              spawned.push({ time: clock.time, origin: entity.origin, parameters });
            },
          };
          return entity;
        },
        ModForName(name) {
          return { name };
        },
      };

      return { engine, spawned };
    }

    void test('releases nothing while the spawner is out of the PVS', () => {
      const clock = { time: 0 };
      const view = { visible: false };
      const { engine, spawned } = createCullingEngine(clock, view);
      const handler = new AirBubblesClientEdictHandler(new ClientEdict(-1), engine);
      handler.spawn();

      for (let i = 0; i < 100; i++) {
        handler.think();
        clock.time += FRAMETIME; // ten seconds
      }

      assert.equal(spawned.length, 0);
    });

    void test('replays the bubbles it missed once back in view, each already risen as far as it would be', () => {
      const clock = { time: 0 };
      const view = { visible: true };
      const { engine, spawned } = createCullingEngine(clock, view);
      const clientEdict = new ClientEdict(-1);
      clientEdict.origin.setTo(10, 20, 100);
      const handler = new AirBubblesClientEdictHandler(clientEdict, engine);
      handler.spawn();
      handler.think(); // the first bubble comes out right away, at age 0

      view.visible = false;
      clock.time = 6;
      handler.think();
      assert.equal(spawned.length, 1, 'nothing is released while out of view');

      view.visible = true;
      handler.think();

      const replayed = spawned.slice(1);
      // one bubble every 1 to 2 seconds over the six missed ones: three to six of them
      assert.ok(replayed.length >= 3 && replayed.length <= 6, `replayed ${replayed.length}`);

      for (const bubble of replayed) {
        const age = bubble.parameters.age;
        assert.ok(age >= 0 && age <= 6, `age ${age}`);
        // 15 units per second of rise from the spawner's own height
        assert.ok(Math.abs(bubble.origin[2] - (100 + 15 * age)) < 1e-4);
        assert.equal(bubble.origin[0], 10);
      }
    });

    void test('does not replay bubbles older than their lifetime', () => {
      const clock = { time: 0 };
      const view = { visible: true };
      const { engine, spawned } = createCullingEngine(clock, view);
      const handler = new AirBubblesClientEdictHandler(new ClientEdict(-1), engine);
      handler.spawn();
      handler.think();

      view.visible = false;
      clock.time = 600; // ten minutes out of view
      handler.think();
      view.visible = true;
      handler.think();

      const replayed = spawned.slice(1);
      // at most the last ten seconds: 5 to 10 bubbles, not 400
      assert.ok(replayed.length >= 5 && replayed.length <= 11, `replayed ${replayed.length}`);
      assert.ok(replayed.every((bubble) => bubble.parameters.age <= 10));
    });
  });

  void describe('age', () => {
    void test('a bubble spawned with an age lives that much shorter', () => {
      withWorldmodel(() => {
        const clock = { time: 0 };
        const clientEdict = new ClientEdict(-1);
        clientEdict.model = { name: 'progs/s_bubble.spr', mins: new Vector(-8, -8, -8), maxs: new Vector(8, 8, 8) };
        clientEdict.setOrigin(new Vector(0, 0, -5000));
        const handler = new BubbleClientEdictHandler(clientEdict, createWaterEngine(clock));
        handler.spawn({ delay: 0, age: 7 });

        clock.time = 2.9;
        handler.think();
        assert.equal(clientEdict.free, false);

        clock.time = 3.1; // 10 s lifetime - 7 s already lived
        handler.think();
        assert.equal(clientEdict.free, true);
      });
    });

    void test('spawnBubble raises the origin by the rise of the age', () => {
      let origin = null;
      const engine = {
        SpawnClientEntity() {
          const entity = {
            model: null,
            angles: new Vector(),
            setOrigin(value) {
              origin = value.copy();
            },
            spawn() {},
          };
          return entity;
        },
        ModForName(name) {
          return { name };
        },
      };
      const start = new Vector(1, 2, 3);

      BubbleClientEdictHandler.spawnBubble(engine, start, 0, 4);

      assert.deepEqual([...origin], [1, 2, 63]); // 4 s * 15 units/s
      assert.deepEqual([...start], [1, 2, 3], 'the caller origin is left alone');
    });
  });
});
