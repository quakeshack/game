import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type Cvar from '../../../../engine/common/Cvar.ts';
import type { ServerEdict } from '../../../../engine/server/Edict.ts';
import type EntityRegistry from '../../helper/Registry.ts';
import { createInertEdict, createInertEngineApi } from '../../../../../test/support/entityMocks.ts';
import { createMutableCvarStub } from '../../../../../test/support/cvarStub.ts';
import { serializableFieldsOf } from '../../../../../test/support/serialization.ts';

const { ServerGameAPI } = await import('../../GameAPI.ts');
const { default: BaseEntity } = await import('../../entity/BaseEntity.ts');

type GameAPI = InstanceType<typeof ServerGameAPI>;
type StaticCvars = typeof ServerGameAPI._cvars;

/**
 * Create the static cvar table used by ServerGameAPI tests.
 * @param overrides Override values for selected cvars.
 * @returns Mock static cvar registry.
 */
function createStaticCvars(overrides: Partial<Record<keyof StaticCvars, Cvar>> = {}): Record<keyof StaticCvars, Cvar> {
  return {
    nomonster: createMutableCvarStub(0),
    fraglimit: createMutableCvarStub(20),
    timelimit: createMutableCvarStub(15),
    samelevel: createMutableCvarStub(0),
    noexit: createMutableCvarStub(0),
    skill: createMutableCvarStub(1),
    deathmatch: createMutableCvarStub(0),
    coop: createMutableCvarStub(0),
    ...overrides,
  };
}

/**
 * Create the minimal server engine surface required by ServerGameAPI construction tests.
 * @returns Mock server engine.
 */
function createMockServerEngine(): ReturnType<typeof createInertEngineApi> {
  const cvars: Record<string, Cvar> = {
    teamplay: createMutableCvarStub(0),
    sv_gravity: createMutableCvarStub(800),
    sv_nextmap: createMutableCvarStub(0),
  };

  return createInertEngineApi({
    GetCvar(name: string): Cvar {
      return cvars[name] ?? createMutableCvarStub(0);
    },
    eventBus: {
      subscribe() {
        return () => {};
      },
    },
    maxplayers: 1,
  });
}

/**
 * A game API that skipped its constructor, so a test sets just the members the method under test reads.
 * @param members The members to set.
 * @returns The game API.
 */
function createBareGameAPI(members: object): GameAPI {
  // The constructor needs a whole engine; these tests exercise single methods that read a few members.
  return Object.assign(Object.create(ServerGameAPI.prototype) as GameAPI, { constructor: ServerGameAPI }, members);
}

void describe('ServerGameAPI serialization', () => {
  void test('preserves the legacy serialized field set with decorator registration', () => {
    const gameAPI = new ServerGameAPI(createMockServerEngine());

    assert.deepEqual(serializableFieldsOf(ServerGameAPI), [
      'mapname',
      'force_retouch',
      'stats',
      'parm1',
      'parm2',
      'parm3',
      'parm4',
      'parm5',
      'parm6',
      'parm7',
      'parm8',
      'parm9',
      'parm10',
      'parm11',
      'parm12',
      'parm13',
      'parm14',
      'parm15',
      'parm16',
      'serverflags',
      'time',
      'framecount',
      'frametime',
      'worldspawn',
      'lastspawn',
      'gameover',
      'intermission_running',
      'intermission_exittime',
      'nextmap',
    ]);

    const serialized = gameAPI.serialize();

    assert.deepEqual(Object.keys(serialized), serializableFieldsOf(ServerGameAPI));
    assert.deepEqual(serialized.stats, ['S', {
      monsters_total: ['P', 0],
      monsters_killed: ['P', 0],
      secrets_total: ['P', 0],
      secrets_found: ['P', 0],
    }]);
    assert.equal(Object.hasOwn(serialized, 'gameAI'), false);
    assert.equal(Object.hasOwn(serialized, 'bodyque_head'), false);
  });
});

void describe('ServerGameAPI cvar access', () => {
  void test('getters read initialized cvars directly', () => {
    const originalCvars = ServerGameAPI._cvars;

    try {
      ServerGameAPI._cvars = createStaticCvars({
        skill: createMutableCvarStub(3),
        deathmatch: createMutableCvarStub(1),
      });

      const gameAPI = createBareGameAPI({
        _cvars: {
          teamplay: createMutableCvarStub(2),
          gravity: createMutableCvarStub(900),
          nextmap: createMutableCvarStub(0),
        },
      });

      assert.equal(gameAPI.skill, 3);
      assert.equal(gameAPI.deathmatch, 1);
      assert.equal(gameAPI.teamplay, 2);
      assert.equal(gameAPI.gravity, 900);
    } finally {
      ServerGameAPI._cvars = originalCvars;
    }
  });

  void test('init normalizes guaranteed cvars in place', () => {
    const originalCvars = ServerGameAPI._cvars;
    let subscribedToEvents = false;
    let precachedResources = false;
    let initializedNextMap = false;

    try {
      const cvars = createStaticCvars({
        coop: createMutableCvarStub(1),
        deathmatch: createMutableCvarStub(1),
        skill: createMutableCvarStub(9),
      });
      ServerGameAPI._cvars = cvars;

      const gameAPI = createBareGameAPI({
        mapname: null,
        serverflags: 0,
        stats: {
          subscribeToEvents() {
            subscribedToEvents = true;
          },
        },
        _precacheResources: () => {
          precachedResources = true;
        },
        _initNextMap: () => {
          initializedNextMap = true;
        },
      });

      gameAPI.init('e1m1', 7);

      assert.equal(gameAPI.mapname, 'e1m1');
      assert.equal(gameAPI.serverflags, 7);
      assert.equal(cvars.coop.value, 1);
      assert.equal(cvars.deathmatch.value, 0);
      assert.equal(cvars.skill.value, 3);
      assert.equal(subscribedToEvents, true);
      assert.equal(precachedResources, true);
      assert.equal(initializedNextMap, true);
    } finally {
      ServerGameAPI._cvars = originalCvars;
    }
  });
});

void describe('ServerGameAPI entity lifecycle', () => {
  void test('prepareEntity precaches after assigned initial data is applied', () => {
    class DeferredInitEntity extends BaseEntity {
      static classname = 'deferred_init_entity';
      static serializableFields = ['initializerReady', 'constructorValue', 'precacheObservedValue'];

      declare initializerReady: number;
      declare constructorValue: number;
      declare precacheObservedValue: number;

      constructor(edict: ServerEdict | null, gameAPI: GameAPI) {
        super(edict, gameAPI);
        this.constructorValue = 3;
      }

      override _initComponents(): void {
        super._initComponents();
        this.initializerReady = 0;
        this.constructorValue = 0;
        this.precacheObservedValue = -1;
      }

      _precache(): void {
        this.precacheObservedValue = this.initializerReady;
      }
    }

    const originalRegistry = ServerGameAPI._entityRegistry;
    const originalCvars = ServerGameAPI._cvars;

    try {
      ServerGameAPI._cvars = createStaticCvars();
      // Only the two lookups prepareEntity makes; the real registry has a private table to fill.
      ServerGameAPI._entityRegistry = {
        has(classname: string): boolean {
          return classname === DeferredInitEntity.classname;
        },
        get(classname: string): typeof DeferredInitEntity | null {
          return classname === DeferredInitEntity.classname ? DeferredInitEntity : null;
        },
      } as unknown as EntityRegistry;

      const gameAPI = createBareGameAPI({
        engine: createInertEngineApi({ ConsoleWarning() {} }),
        _missingEntityClassStats: {},
        _isPreparingEntityAllowed: () => true,
      });

      const edict = createInertEdict();

      const prepared = gameAPI.prepareEntity(edict, DeferredInitEntity.classname, {
        initializerReady: 7,
      });

      assert.equal(prepared, true);
      assert.ok(edict.entity instanceof DeferredInitEntity);
      assert.equal(edict.entity.precacheObservedValue, 7);
      assert.equal(edict.entity.constructorValue, 0);
    } finally {
      ServerGameAPI._entityRegistry = originalRegistry;
      ServerGameAPI._cvars = originalCvars;
    }
  });
});
