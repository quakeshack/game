import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Vector from '../../../../../shared/Vector.ts';
import ClientEntities from '../../../../../engine/client/ClientEntities.ts';
import GameModule from '../../../../../engine/common/GameModule.ts';
import { moveType } from '../../../Defs.ts';
import { asClientEngineAPI } from '../fixtures.ts';
import { createInertEngineApi } from '../../../../../../test/support/entityMocks.ts';
import { createGameModuleStub } from '../../../../../../test/support/fixtures.ts';
import { useClientStateOf } from '../../../../../../test/support/clientState.ts';
import { createSingleLeafWorld } from '../../../../../../test/support/bspTree.ts';
import { useHostOf } from '../../../../../../test/support/host.ts';
import { installPageServices } from '../../../../../engine/client/PageServices.ts';
import { createClientEngineApi } from '../../../../../../test/support/clientEngineApi.ts';
import { engineMocks } from '../../../../../../test/support/engineMocks.ts';

// Handlers are constructed with the page's engine API.
installPageServices({ engineApi: createClientEngineApi() });

await import('../../../GameAPI.ts');
const { GibClientEdictHandler } = await import('../../../client/entity/Gibs.ts');

const FRAMETIME = 0.1;
const FLOOR_Z = 0;

interface Clock {
  time: number;
}

interface WorldState {
  worldmodel: ReturnType<typeof createSingleLeafWorld>;
  paused: boolean;
  model_precache?: unknown[];
}

/**
 * A world trace result matching `CollisionTrace`'s shape.
 * @param end where the trace ended
 * @param fraction how far it got
 * @param normal the plane it hit
 * @returns a CollisionTrace-shaped mock trace
 */
function worldTrace(end: Vector, fraction = 1.0, normal = new Vector()) {
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
 * @param start trace start
 * @param end trace end
 * @returns the mock trace
 */
function floorWorld(start: Vector, end: Vector) {
  if (end[2] >= FLOOR_Z) {
    return worldTrace(end);
  }

  const fraction = (FLOOR_Z - start[2]) / (end[2] - start[2]);

  return worldTrace(start.copy().add(end.copy().subtract(start).multiply(fraction)), fraction, new Vector(0, 0, 1));
}

/**
 * Runs a callback in a world with gravity 800, a floor at FLOOR_Z and a controllable clock.
 * @param clock the mutable client clock
 * @param callback what to run, given the client state of the world
 */
function withWorld(clock: Clock, callback: (state: WorldState) => void): void {
  const previous = { CL: engineMocks.CL, Host: engineMocks.Host };
  const state: WorldState = { worldmodel: createSingleLeafWorld(), paused: false };

  Object.defineProperty(state, 'time', { get: () => clock.time });
  engineMocks.CL = { pmove: { movevars: { gravity: 800 } }, state, nolerp: { value: 0 }, collision: { traceStaticWorldLine: floorWorld } };
  const restoreClientState = useClientStateOf(engineMocks.CL);
  engineMocks.Host = { frametime: FRAMETIME };
  const restoreHost = useHostOf(engineMocks.Host);

  try {
    callback(state);
  } finally {
    restoreHost();
    restoreClientState();
    Object.assign(engineMocks, previous);
  }
}

/**
 * Spawns a gib the way the game's client code does, through a real `ClientEntities`.
 * @param clock the mutable client clock
 * @param origin start position
 * @param velocity launch velocity
 * @returns the entities and the gib
 */
function spawnGib(clock: Clock, origin: Vector, velocity: Vector) {
  const previous = GameModule.active;
  GameModule.active = createGameModuleStub({
    ClientGameAPI: { GetClientEdictHandler: (classname: string) => (classname === 'client_gib' ? GibClientEdictHandler : null) },
  });

  try {
    const clientEntities = new ClientEntities();
    const engine = {
      CL: {
        get time() {
          return clock.time;
        },
      },
      SpawnClientEntity: (classname: string) => clientEntities.allocateSimulatedEntity(classname),
      ModForName: (name: string) => ({ name, mins: new Vector(-8, -8, -8), maxs: new Vector(8, 8, 8) }),
    };

    GibClientEdictHandler.spawnGib(asClientEngineAPI(engine), 'progs/gib1.mdl', origin, velocity);

    return { clientEntities, gib: [...clientEntities.getEntities()][0] };
  } finally {
    GameModule.active = previous;
  }
}

/**
 * Advances the clock and runs one client frame, physics included.
 * @param clock the mutable client clock
 * @param clientEntities the entities to run
 */
function frame(clock: Clock, clientEntities: ClientEntities): void {
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
      let saved: ReturnType<ClientEntities['serialize']> = [];

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

      withWorld(newClock, (state) => {
        const previous = GameModule.active;
        GameModule.active = createGameModuleStub({
          ClientGameAPI: { GetClientEdictHandler: () => GibClientEdictHandler },
        });

        try {
          const restoredEntities = new ClientEntities();
          state.model_precache = [undefined, { name: 'progs/gib1.mdl', mins: new Vector(-8, -8, -8), maxs: new Vector(8, 8, 8) }];
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
      interface SpawnedGib {
        classname: string;
        model: { name: string } | null;
        angles: Vector;
        velocity: Vector;
        origin: Vector | null;
        spawnCalls: number;
        setOrigin(origin: Vector): void;
        spawn(): void;
      }

      let spawnedGib: SpawnedGib | null = null;
      const engine = {
        SpawnClientEntity(classname: string): SpawnedGib {
          const gib: SpawnedGib = {
            classname,
            model: null,
            angles: new Vector(Infinity, Infinity, Infinity),
            velocity: new Vector(),
            origin: null,
            spawnCalls: 0,
            setOrigin(origin: Vector): void {
              gib.origin = origin.copy();
            },
            spawn(): void {
              gib.spawnCalls += 1;
            },
          };
          spawnedGib = gib;
          return gib;
        },
        ModForName(name: string): { name: string } {
          return { name };
        },
      };

      GibClientEdictHandler.spawnGib(asClientEngineAPI(engine), 'progs/gib2.mdl', new Vector(1, 2, 3), new Vector(4, 5, 6));

      const spawned = spawnedGib as SpawnedGib | null;
      assert.ok(spawned);
      assert.equal(spawned.classname, 'client_gib');
      assert.equal(spawned.model?.name, 'progs/gib2.mdl');
      assert.deepEqual([...(spawned.origin ?? [])], [1, 2, 3]);
      assert.deepEqual([...spawned.velocity], [4, 5, 6]);
      // a fresh ClientEdict starts with Infinity angles, which would poison the tumble's quaternion math
      assert.deepEqual([...spawned.angles], [0, 0, 0]);
      assert.equal(spawned.spawnCalls, 1);
    });
  });

  void describe('_precache', () => {
    void test('precaches every gib model and the meat gib so clients can resolve them', () => {
      const models: string[] = [];

      GibClientEdictHandler._precache(createInertEngineApi({ PrecacheModel: (name: string) => models.push(name) }));

      assert.deepEqual(models, ['progs/gib1.mdl', 'progs/gib2.mdl', 'progs/gib3.mdl', 'progs/zom_gib.mdl']);
    });
  });
});
