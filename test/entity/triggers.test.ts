import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Vector from '../../../../shared/Vector.ts';
import type { ScheduledThinkCallback } from '../../entity/BaseEntity.ts';
import type { Sub } from '../../entity/Subs.ts';
import { createInertGameApi, createMutableEngineApi, createSubStub } from '../../../../../test/support/entityMocks.ts';

await import('../../GameAPI.ts');

const { damage, flags, solid } = await import('../../Defs.ts');
const { default: BaseEntity } = await import('../../entity/BaseEntity.ts');
const { TeleportEffectEntity } = await import('../../entity/Misc.ts');
const { PlayerEntity, TelefragTriggerEntity } = await import('../../entity/Player.ts');
const {
  CountTriggerEntity,
  InfoTeleportDestination,
  MultipleTriggerEntity,
  TeleportTriggerEntity,
  TriggerMonsterjumpEntity,
} = await import('../../entity/Triggers.ts');

type Entity = InstanceType<typeof BaseEntity>;
type Player = InstanceType<typeof PlayerEntity>;

interface GameOverrides {
  readonly engine?: object;
  readonly time?: number;
}

/** A multiple trigger that lets a test replace its movement helper and run the trigger. */
class TestMultipleTrigger extends MultipleTriggerEntity {
  useSub(sub: Sub): void {
    this._sub = sub;
  }

  trigger(activator: Entity): void {
    this._trigger(activator);
  }

  get isActive(): boolean {
    return this._isActive;
  }
}

/** A count trigger whose movement helper a test replaces. */
class TestCountTrigger extends CountTriggerEntity {
  useSub(sub: Sub): void {
    this._sub = sub;
  }
}

/** A teleport trigger whose movement helper a test replaces. */
class TestTeleportTrigger extends TeleportTriggerEntity {
  useSub(sub: Sub): void {
    this._sub = sub;
  }
}

/**
 * Create a minimal mock game API for trigger tests.
 * @param overrides Optional engine/game overrides.
 * @returns Mock game API object.
 */
function createMockGameAPI(overrides: GameOverrides = {}): ReturnType<typeof createInertGameApi> {
  const engine = createMutableEngineApi({
    SpawnEntity() {
      return null;
    },
    BroadcastPrint() {},
    SetCvar() {},
    eventBus: {
      publish() {},
    },
    ...overrides.engine,
  });

  return createInertGameApi({
    time: overrides.time ?? 0,
    noexit: 0,
    mapname: 'e1m1',
    coop: 0,
    deathmatch: 0,
    force_retouch: 0,
    loadNextMap() {},
    startIntermission() {},
  }, engine);
}

class TestEntity extends BaseEntity {
  static classname = 'test_trigger_entity';

  removed = false;

  override remove(): void {
    this.removed = true;
  }
}

/**
 * Build a player-shaped test double that satisfies instanceof checks.
 * @param overrides Optional field or method overrides.
 * @returns Player-like test entity.
 */
function createPlayerStub(overrides: Partial<Player> = {}): Player {
  return Object.assign(Object.create(PlayerEntity.prototype) as Player, {
    health: 100,
    solid: solid.SOLID_SLIDEBOX,
    flags: flags.FL_ONGROUND,
    origin: new Vector(),
    angles: new Vector(),
    velocity: new Vector(),
    fixangle: false,
    teleport_time: 0,
    fly_time: 0,
    netname: 'Player',
    centerPrint() {},
    startSound() {},
    setOrigin(this: Player, origin: Vector) {
      this.origin.set(origin);
    },
    ...overrides,
  });
}

void describe('Triggers port', () => {
  void test('MultipleTriggerEntity applies QC defaults and rearms health-gated triggers', () => {
    const scheduledThinks: Array<{ nextThink: number; callback: ScheduledThinkCallback<typeof entity> }> = [];
    const entity = new TestMultipleTrigger(null, createMockGameAPI()).initializeEntity();
    entity.model = '*1';
    entity.health = 12;
    entity.setModel = () => {};
    entity.setOrigin = () => {};
    entity._scheduleThink = (nextThink, callback) => {
      scheduledThinks.push({ nextThink, callback });
    };

    entity.spawn();

    assert.equal(entity.wait, 0.2);
    assert.equal(entity.max_health, 12);
    assert.equal(entity.takedamage, damage.DAMAGE_YES);
    assert.equal(entity.solid, solid.SOLID_BBOX);

    entity.useSub(createSubStub());
    entity.trigger(new TestEntity(null, createMockGameAPI()).initializeEntity());

    assert.equal(scheduledThinks.length, 1);
    scheduledThinks[0].callback.call(entity, entity);
    assert.equal(entity.isActive, false);
    assert.equal(entity.health, 12);
  });

  void test('CountTriggerEntity shows countdown text and fires when it reaches zero', () => {
    const prints: string[] = [];
    const usedTargets: Entity[] = [];
    const player = createPlayerStub({
      centerPrint(message: string) {
        prints.push(message);
      },
    });
    const entity = new TestCountTrigger(null, createMockGameAPI()).initializeEntity();
    entity.useSub(createSubStub({
      useTargets(userEntity) {
        usedTargets.push(userEntity);
      },
    }));
    entity.lazyRemove = () => {};
    entity.count = 2;

    entity.use(player);
    entity.use(player);

    assert.deepEqual(prints, ['Only 1 more to go...', 'Sequence completed!']);
    assert.deepEqual(usedTargets, [player]);
  });

  void test('TeleportTriggerEntity moves players, spawns effects, and sets exit velocity', () => {
    const spawnRequests: Array<{ classname: string; initialData: object }> = [];
    const usedTargets: Entity[] = [];
    const player = createPlayerStub();
    player.origin.setTo(10, 20, 30);
    player.velocity.setTo(1, 2, 3);

    const destination = new InfoTeleportDestination(null, createMockGameAPI()).initializeEntity();
    destination.origin.setTo(100, 200, 300);
    destination.mangle.setTo(0, 0, 0);

    const entity = new TestTeleportTrigger(null, createMockGameAPI({
      time: 5,
      engine: {
        SpawnEntity(classname: string, initialData: object) {
          spawnRequests.push({ classname, initialData });
          return { entity: null };
        },
      },
    })).initializeEntity();
    entity.useSub(createSubStub({
      useTargets(userEntity) {
        usedTargets.push(userEntity);
      },
    }));
    entity.target = 'tele_dest';
    entity.findFirstEntityByFieldAndValue = () => destination;

    entity.touch(player);

    assert.deepEqual(usedTargets, [player]);
    assert.equal(spawnRequests.length, 3);
    assert.equal(spawnRequests[0].classname, TeleportEffectEntity.classname);
    assert.equal(spawnRequests[1].classname, TeleportEffectEntity.classname);
    assert.equal(spawnRequests[2].classname, TelefragTriggerEntity.classname);
    assert.ok(player.origin.equalsTo(100, 200, 300));
    assert.ok(player.angles.equalsTo(0, 0, 0));
    assert.equal(player.fixangle, true);
    assert.equal(player.teleport_time, 5.7);
    assert.ok(player.velocity.equalsTo(300, 0, 0));
    assert.equal((player.flags & flags.FL_ONGROUND) === 0, true);
  });

  void test('TriggerMonsterjumpEntity applies defaults and launches grounded monsters', () => {
    const entity = new TriggerMonsterjumpEntity(null, createMockGameAPI()).initializeEntity();
    entity.model = '*2';
    entity.setModel = () => {};
    entity.spawn();

    assert.equal(entity.speed, 200);
    assert.equal(entity.height, 200);
    entity.movedir.setTo(1, 0, 0);

    const monster = new TestEntity(null, createMockGameAPI()).initializeEntity();
    monster.flags = flags.FL_MONSTER | flags.FL_ONGROUND;
    monster.velocity.setTo(0, 0, 5);

    entity.touch(monster);

    assert.ok(monster.velocity.equalsTo(200, 0, 200));
    assert.equal((monster.flags & flags.FL_ONGROUND) === 0, true);
  });
});
