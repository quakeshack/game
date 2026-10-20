import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type Vector from '../../../../shared/Vector.ts';
import type { ScheduledThinkCallback } from '../../entity/BaseEntity.ts';
import type { Sub } from '../../entity/Subs.ts';
import { createInertEdict, createInertGameApi, createMutableEngineApi, createSubStub, type MutableEngineApi } from '../../../../../test/support/entityMocks.ts';
import { channel, items, solid, tentType, worldType } from '../../Defs.ts';

await import('../../GameAPI.ts');

const { PlayerEntity } = await import('../../entity/Player.ts');
const {
  BackpackEntity,
  HealthItemEntity,
  ItemShellsEntity,
  SilverKeyEntity,
  SuperDamageEntity,
} = await import('../../entity/Items.ts');

type Player = InstanceType<typeof PlayerEntity>;

/** A backpack that lets a test run the touch aftermath and read the model it hides. */
class TestBackpack extends BackpackEntity {
  afterTouch(player: Player): void {
    this._afterTouch(player);
  }

  get originalModel(): string | null {
    return this._model_original;
  }
}

/** A shell box that lets a test run the pickup. */
class TestShellBox extends ItemShellsEntity {
  pickup(player: Player): boolean {
    return this._pickup(player);
  }
}

/** A key that lets a test run what spawn does for the world type and what a pickup lists. */
class TestKey extends SilverKeyEntity {
  setInfo(): void {
    this._setInfo();
  }

  collectItems(player: Player, priorItems: number): string[] {
    return this._collectItems(player, priorItems);
  }
}

/** A health item that lets a test run the touch aftermath. */
class TestHealthItem extends HealthItemEntity {
  afterTouch(player: Player): void {
    this._afterTouch(player);
  }
}

/** A powerup whose movement helper a test replaces. */
class TestQuad extends SuperDamageEntity {
  useSub(sub: Sub): void {
    this._sub = sub;
  }
}

interface GameOverrides {
  readonly engine?: object;
  readonly worldspawn?: object;
  readonly time?: number;
  readonly deathmatch?: number;
}

/**
 * Create the minimal game API surface required by the item tests.
 * @param overrides Optional engine/game overrides.
 * @returns Mock game API and its engine.
 */
function createMockGameAPI(overrides: GameOverrides = {}): { gameAPI: ReturnType<typeof createInertGameApi>; engine: MutableEngineApi } {
  const engine = createMutableEngineApi({
    DispatchTempEntityEvent() {},
    SpawnEntity() {
      return null;
    },
    ...overrides.engine,
  });

  const gameAPI = createInertGameApi({
    deathmatch: 0,
    coop: 0,
    serverflags: 0,
    worldspawn: {
      worldtype: worldType.MEDIEVAL,
      findNextEntityByFieldAndValue() {
        return null;
      },
    },
    ...overrides,
    engine,
  }, engine);

  return { gameAPI, engine };
}

/**
 * Create a player entity around an edict that is not free.
 * @param gameAPI The game API the player is built with.
 * @returns The player.
 */
function createPlayer(gameAPI: ReturnType<typeof createInertGameApi>): Player {
  const edict = createInertEdict();
  edict.isFree = () => false;
  return new PlayerEntity(edict, gameAPI).initializeEntity();
}

void describe('Items', () => {
  void test('serializes shared pickup fields and backpack timeout fields', () => {
    const backpack = new BackpackEntity(null, createMockGameAPI().gameAPI).initializeEntity();
    const serialized = backpack.serialize();

    for (const field of [
      'ammo_shells',
      'ammo_nails',
      'ammo_rockets',
      'ammo_cells',
      'items',
      'weapon',
      'regeneration_time',
      '_model_original',
      'noise',
      'netname',
      'remove_after',
    ]) {
      assert.ok(field in serialized, `missing serialized field "${field}"`);
    }
  });

  void test('hides picked items in deathmatch and restores them on regeneration', () => {
    const { gameAPI, engine } = createMockGameAPI({ deathmatch: 1, time: 12 });
    const activator = createPlayer(gameAPI);
    const backpack = new TestBackpack(null, gameAPI).initializeEntity();
    const scheduled: Array<{ time: number; callback: ScheduledThinkCallback<typeof backpack>; identifier: string | null | undefined }> = [];
    const sounds: Array<{ soundChannel: number; sfxName: string }> = [];
    const tempEvents: Array<{ eventType: number; origin: Vector }> = [];

    backpack.model = 'progs/backpack.mdl';
    backpack.regeneration_time = 30;
    backpack._scheduleThink = (time, callback, identifier) => {
      scheduled.push({ time, callback, identifier });
    };
    backpack.setOrigin = () => {};
    backpack.startSound = (soundChannel, sfxName) => {
      sounds.push({ soundChannel, sfxName });
    };
    engine.DispatchTempEntityEvent = (eventType, origin) => {
      tempEvents.push({ eventType, origin: origin.copy() });
    };

    backpack.afterTouch(activator);

    assert.equal(backpack.solid, solid.SOLID_NOT);
    assert.equal(backpack.model, null);
    assert.equal(backpack.originalModel, 'progs/backpack.mdl');
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].time, 42);

    scheduled[0].callback.call(backpack, backpack);

    assert.equal(backpack.model, 'progs/backpack.mdl');
    assert.equal(backpack.solid, solid.SOLID_TRIGGER);
    assert.deepEqual(sounds, [{ soundChannel: channel.CHAN_VOICE, sfxName: 'items/itembk2.wav' }]);
    assert.equal(tempEvents.length, 1);
    assert.equal(tempEvents[0].eventType, tentType.TE_TELEPORT);
  });

  void test('prefers the super shotgun when a shell pickup makes it usable', () => {
    const shellBox = new TestShellBox(null, createMockGameAPI().gameAPI).initializeEntity();
    let appliedBackpack = false;

    shellBox.ammo_shells = 20;
    shellBox.weapon = items.IT_SHOTGUN;

    // The pickup reads three members of the player.
    const player = {
      items: items.IT_SUPER_SHOTGUN,
      ammo_shells: 0,
      applyBackpack(entity: unknown): boolean {
        appliedBackpack = entity === shellBox;
        return true;
      },
    } as unknown as Player;

    assert.equal(shellBox.pickup(player), true);
    assert.equal(shellBox.weapon, items.IT_SUPER_SHOTGUN);
    assert.equal(appliedBackpack, true);
  });

  void test('falls back to medieval key assets for unknown world types', () => {
    const key = new TestKey(null, createMockGameAPI({
      worldspawn: { worldtype: 99 },
    }).gameAPI).initializeEntity();

    key.setInfo();

    assert.equal(key.noise, 'misc/medkey.wav');
    assert.equal(key.netname, 'silver key');
    assert.equal(key.model, 'progs/w_s_key.mdl');
  });

  void test('chips megahealth back to max and clears the superhealth flag', () => {
    const { gameAPI } = createMockGameAPI({ time: 5 });
    const megaHealth = new TestHealthItem(null, gameAPI).initializeEntity();
    const scheduled: Array<{ time: number; callback: ScheduledThinkCallback<typeof megaHealth>; identifier: string | null | undefined }> = [];
    let removed = false;

    megaHealth.spawnflags = HealthItemEntity.H_MEGA;
    megaHealth.model = 'maps/b_bh100.bsp';
    megaHealth._scheduleThink = (time, callback, identifier) => {
      scheduled.push({ time, callback, identifier });
    };
    megaHealth.remove = () => {
      removed = true;
    };

    const player = createPlayer(gameAPI);
    player.health = 101;
    player.max_health = 100;
    player.items = items.IT_SUPERHEALTH;

    megaHealth.afterTouch(player);

    assert.equal(megaHealth.owner, player);
    assert.equal(megaHealth.model, null);
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].time, 10);

    scheduled.length = 0;
    megaHealth._takeHealth();
    assert.equal(player.health, 100);
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].time, 6);

    scheduled.length = 0;
    megaHealth._takeHealth();
    assert.equal(player.items & items.IT_SUPERHEALTH, 0);
    assert.equal(megaHealth.owner, null);
    assert.equal(removed, true);
  });

  void test('_collectItems names a newly granted item but stays silent for one already owned', () => {
    const key = new TestKey(null, createMockGameAPI().gameAPI).initializeEntity();
    const player = createPlayer(createMockGameAPI().gameAPI);
    key.items = items.IT_KEY1;

    assert.deepEqual(key.collectItems(player, items.IT_AXE), ['Silver Key']);
    assert.deepEqual(key.collectItems(player, items.IT_AXE | items.IT_KEY1), []);
  });

  void test('picking up a powerup reports its name instead of "an empty item"', () => {
    const { gameAPI } = createMockGameAPI();
    const quad = new TestQuad(null, gameAPI).initializeEntity();
    const dispatched: Array<{ eventType: number; args: unknown[] }> = [];

    quad.useSub(createSubStub());
    quad.remove = () => {};
    quad.items = items.IT_QUAD;

    const player = createPlayer(gameAPI);
    player.health = 100;
    player.items = items.IT_AXE | items.IT_SHOTGUN;
    player.startSound = () => {};
    player.dispatchExpeditedEvent = (eventType: number, ...args: unknown[]) => {
      dispatched.push({ eventType, args });
    };

    quad.touch(player);

    assert.equal(dispatched.length, 1);
    const [itemEntity, itemNames, netname] = dispatched[0].args;
    assert.equal(itemEntity, quad.edict);
    assert.deepEqual(itemNames, ['Quad Damage']);
    // SuperDamageEntity never sets its own netname, so the client must fall back to itemNames
    // rather than reporting "You found an empty item."
    assert.equal(netname, null);
  });
});
