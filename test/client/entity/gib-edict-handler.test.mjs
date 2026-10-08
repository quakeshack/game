import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Vector from '../../../../../shared/Vector.ts';
import ClientEntities from '../../../../../engine/client/ClientEntities.ts';
import GameModule from '../../../../../engine/common/GameModule.ts';
import { content } from '../../../../../shared/Defs.ts';
import { registry } from '../../../../../engine/registry.ts';
import { eventBus } from '../../../../../engine/common/EventBus.ts';
import { moveType } from '../../../Defs.ts';
import { useClientStateOf } from '../../../../../../test/support/clientState.ts';
import { useHostOf } from '../../../../../../test/support/host.ts';
import { installPageServices } from '../../../../../engine/client/PageServices.ts';
import { createClientEngineApi } from '../../../../../../test/support/clientEngineApi.ts';

// Handlers are constructed with the page's engine API.
installPageServices({ engineApi: createClientEngineApi() });

await import('../../../GameAPI.ts');
const { GibClientEdictHandler } = await import('../../../client/entity/Gibs.ts');

const FRAMETIME = 0.1;
const FLOOR_Z = 0;

/**
 * A world trace result matching `CollisionTrace`'s shape.
 * @param {Vector} end where the trace ended
 * @param {number} fraction how far it got
 * @param {Vector} normal the plane it hit
 * @returns {object} a CollisionTrace-shaped mock trace
 */
function worldTrace(end, fraction = 1.0, normal = new Vector()) {
  return {
    fraction,
    allsolid: false,
    startsolid: false,
    endpos: end.copy(),
    plane: { normal, dist: 0 },
    inopen: true,
    inwater: false,
    ent: null,
  };
}

/**
 * A world with a single floor at FLOOR_Z, clipping a traced segment to the plane like a real trace.
 * @param {Vector} start trace start
 * @param {Vector} end trace end
 * @returns {object} the mock trace
 */
function floorWorld(start, end) {
  if (end[2] >= FLOOR_Z) {
    return worldTrace(end);
  }

  const fraction = (FLOOR_Z - start[2]) / (end[2] - start[2]);

  return worldTrace(start.copy().add(end.copy().subtract(start).multiply(fraction)), fraction, new Vector(0, 0, 1));
}

/**
 * Runs a callback in a world with gravity 800, a floor at FLOOR_Z and a controllable clock.
 * @param {{time: number}} clock the mutable client clock
 * @param {() => void} callback
 */
function withWorld(clock, callback) {
  const previous = { CL: registry.CL, Host: registry.Host };
  const state = { worldmodel: { nodes: [{ contents: content.CONTENT_EMPTY, num: 0 }] }, paused: false };

  Object.defineProperty(state, 'time', { get: () => clock.time });
  registry.CL = { pmove: { movevars: { gravity: 800 } }, state, nolerp: { value: 0 }, collision: { traceStaticWorldLine: floorWorld } };
  const restoreClientState = useClientStateOf(registry.CL);
  registry.Host = { frametime: FRAMETIME };
  const restoreHost = useHostOf(registry.Host);
  eventBus.publish('registry.frozen');

  try {
    callback();
  } finally {
    restoreHost();
    restoreClientState();
    Object.assign(registry, previous);
    eventBus.publish('registry.frozen');
  }
}

/**
 * Spawns a gib the way the game's client code does, through a real `ClientEntities`.
 * @param {{time: number}} clock the mutable client clock
 * @param {Vector} origin start position
 * @param {Vector} velocity launch velocity
 * @returns {{clientEntities: ClientEntities, gib: import('../../../../../engine/client/ClientEntities.ts').ClientEdict}} the entities and the gib
 */
function spawnGib(clock, origin, velocity) {
  const previous = GameModule.active;
  GameModule.active = {
    identification: { name: 'Test Game', author: 'test', version: [1, 0, 0], capabilities: [] },
    ClientGameAPI: { GetClientEdictHandler: (classname) => (classname === 'client_gib' ? GibClientEdictHandler : null) },
  };

  try {
    const clientEntities = new ClientEntities();
    const engine = {
      CL: {
        get time() {
          return clock.time;
        },
      },
      SpawnClientEntity: (classname) => clientEntities.allocateSimulatedEntity(classname),
      ModForName: (name) => ({ name, mins: new Vector(-8, -8, -8), maxs: new Vector(8, 8, 8) }),
    };

    GibClientEdictHandler.spawnGib(engine, 'progs/gib1.mdl', origin, velocity);

    return { clientEntities, gib: [...clientEntities.getEntities()][0] };
  } finally {
    GameModule.active = previous;
  }
}

/**
 * Advances the clock and runs one client frame, physics included.
 * @param {{time: number}} clock the mutable client clock
 * @param {ClientEntities} clientEntities the entities to run
 */
function frame(clock, clientEntities) {
  clock.time += FRAMETIME;
  clientEntities.think();
}

void describe('GibClientEdictHandler', () => {
  void test('sets the entity up for the engine to toss: bouncing, tumbling, with a lifetime', () => {
    const clock = { time: 5 };

    withWorld(clock, () => {
      const { gib } = spawnGib(clock, new Vector(0, 0, 500), new Vector(1, 2, 3));

      assert.equal(gib.movetype, moveType.MOVETYPE_BOUNCE);
      assert.equal(gib.persistent, true);
      assert.deepEqual([...gib.velocity], [1, 2, 3]);
      // a random tumble of up to 600 degrees per second on each axis
      assert.ok(!gib.avelocity.isOrigin() && [...gib.avelocity].every((rate) => rate >= 0 && rate <= 600));
    });
  });

  void test('falls, bounces and tumbles under the engine physics, then lies still on the floor', () => {
    const clock = { time: 0 };

    withWorld(clock, () => {
      const { clientEntities, gib } = spawnGib(clock, new Vector(0, 0, 300), new Vector(30, 0, 0));
      let bounced = false;

      for (let i = 0; i < 60 && !gib.onGround; i++) {
        frame(clock, clientEntities);
        bounced ||= gib.velocity[2] > 0;
      }

      assert.equal(gib.onGround, true, 'it comes to rest on the floor');
      assert.equal(bounced, true, 'on its way it bounced');
      assert.ok(gib.origin[0] > 0, 'it kept moving sideways while flying');
      assert.ok(Math.abs(gib.origin[2] - FLOOR_Z) < 1e-6);
      assert.deepEqual([...gib.velocity], [0, 0, 0]);
      assert.deepEqual([...gib.avelocity], [0, 0, 0]);

      const restingOrigin = [...gib.origin];
      const restingAngles = [...gib.angles];
      frame(clock, clientEntities);

      assert.deepEqual([...gib.origin], restingOrigin);
      assert.deepEqual([...gib.angles], restingAngles);
    });
  });

  void test('removes itself once its 10-20 second lifetime has run out, and not before', () => {
    const clock = { time: 0 };

    withWorld(clock, () => {
      const { clientEntities, gib } = spawnGib(clock, new Vector(0, 0, 0), new Vector());

      clock.time = 9.9;
      clientEntities.think();
      assert.equal(gib.free, false);

      clock.time = 20.1;
      clientEntities.think();
      assert.equal(gib.free, true);
    });
  });

  void describe('save/load', () => {
    void test('round-trips the remaining lifetime and the physics state through ClientEntities', () => {
      const clock = { time: 100 };
      let saved;

      withWorld(clock, () => {
        const { clientEntities, gib } = spawnGib(clock, new Vector(0, 0, 300), new Vector(30, 0, 0));

        for (let i = 0; i < 20; i++) {
          frame(clock, clientEntities); // in the air or already on the floor, two seconds in
        }

        assert.equal(gib.free, false);
        saved = clientEntities.serialize();
      });

      assert.equal(saved.length, 1);
      assert.equal(saved[0].movetype, moveType.MOVETYPE_BOUNCE);

      // a brand new session with an unrelated clock
      const newClock = { time: 3 };

      withWorld(newClock, () => {
        const previous = GameModule.active;
        GameModule.active = {
          identification: { name: 'Test Game', author: 'test', version: [1, 0, 0], capabilities: [] },
          ClientGameAPI: { GetClientEdictHandler: () => GibClientEdictHandler },
        };

        try {
          const restoredEntities = new ClientEntities();
          registry.CL.state.model_precache = [undefined, { name: 'progs/gib1.mdl', mins: new Vector(-8, -8, -8), maxs: new Vector(8, 8, 8) }];
          restoredEntities.deserialize(saved);

          const [restored] = [...restoredEntities.getEntities()];
          assert.equal(restored.movetype, moveType.MOVETYPE_BOUNCE, 'the saved physics state wins over spawn()');
          assert.equal(restored.onGround, saved[0].onGround);
          assert.deepEqual([...restored.avelocity], saved[0].avelocity);

          // The saved die time was relative (at most 18 s left of the 10..20 s lifetime), so it is
          // re-anchored to the new clock. Were the old absolute time (about 112..122) restored
          // instead, the gib would still be alive 20 s into the new session.
          newClock.time = 3 + 20;
          restoredEntities.think();
          assert.equal(restored.free, true);
        } finally {
          GameModule.active = previous;
        }
      });
    });
  });

  void describe('spawnGib', () => {
    void test('sets up and spawns a client-only gib with the given model, origin and velocity', () => {
      let spawned = null;
      const engine = {
        SpawnClientEntity(classname) {
          spawned = {
            classname,
            model: null,
            angles: new Vector(Infinity, Infinity, Infinity),
            velocity: new Vector(),
            origin: null,
            spawnCalls: 0,
            setOrigin(origin) {
              spawned.origin = origin.copy();
            },
            spawn() {
              spawned.spawnCalls += 1;
            },
          };
          return spawned;
        },
        ModForName(name) {
          return { name };
        },
      };

      GibClientEdictHandler.spawnGib(engine, 'progs/gib2.mdl', new Vector(1, 2, 3), new Vector(4, 5, 6));

      assert.equal(spawned.classname, 'client_gib');
      assert.equal(spawned.model.name, 'progs/gib2.mdl');
      assert.deepEqual([...spawned.origin], [1, 2, 3]);
      assert.deepEqual([...spawned.velocity], [4, 5, 6]);
      // a fresh ClientEdict starts with Infinity angles, which would poison the tumble's quaternion math
      assert.deepEqual([...spawned.angles], [0, 0, 0]);
      assert.equal(spawned.spawnCalls, 1);
    });
  });

  void describe('_precache', () => {
    void test('precaches every gib model and the meat gib so clients can resolve them', () => {
      const models = [];

      GibClientEdictHandler._precache({ PrecacheModel: (name) => models.push(name) });

      assert.deepEqual(models, ['progs/gib1.mdl', 'progs/gib2.mdl', 'progs/gib3.mdl', 'progs/zom_gib.mdl']);
    });
  });
});
