import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { content } from '../../../../shared/Defs.ts';
import Vector from '../../../../shared/Vector.ts';
import { createMockClientEngine } from './fixtures.ts';

const { clientEvent, clientEventName, items } = await import('../../Defs.ts');
await import('../../GameAPI.ts');

const { ColorShifts } = await import('../../client/ColorShifts.ts');
const { ServerInfo } = await import('../../client/Sync.ts');
const { Q1HUD } = await import('../../client/HUD.ts');

/**
 * Reads the numbers of an entry of the stack or of a pulse the way the engine would apply them.
 * @param {{ color?: ArrayLike<number>, alpha?: number }} settings The settings of a `color-shift` entry.
 * @returns {{ color: number[], alpha: number }} The color in 0 to 255, rounded, and the alpha in 0 to 255.
 */
function inQuakeUnits(settings) {
  return {
    color: Array.from(settings.color, (value) => Math.round(value * 255)),
    alpha: Math.round(settings.alpha * 255 * 1000) / 1000,
  };
}

/**
 * Builds the colors with a mock engine.
 * @returns {{ engine: ReturnType<typeof createMockClientEngine>, shifts: InstanceType<typeof ColorShifts> }} Both.
 */
function create() {
  const engine = createMockClientEngine();
  const shifts = new ColorShifts(engine);

  shifts.init();
  engine.postProcessStacks.length = 0;

  return { engine, shifts };
}

void describe('id1 ColorShifts', () => {
  void test('creates the channels in the order Quake mixes the tints in', () => {
    const engine = createMockClientEngine();

    new ColorShifts(engine).init();

    assert.deepEqual(engine.postProcessStacks.map(({ options }) => options.channel), [
      'id1.liquid', 'id1.damage', 'id1.bonus', 'id1.powerup', 'id1.info',
    ]);
  });

  void describe('liquid', () => {
    void test('tints the view by the liquid the eye is in', () => {
      const { engine, shifts } = create();

      shifts.liquid(content.CONTENT_WATER);
      shifts.liquid(content.CONTENT_SLIME);
      shifts.liquid(content.CONTENT_LAVA);

      assert.deepEqual(engine.postProcessStacks.map(({ options, stack }) => [options.channel, inQuakeUnits(stack[0].settings)]), [
        ['id1.liquid', { color: [130, 80, 50], alpha: 128 }],
        ['id1.liquid', { color: [0, 25, 5], alpha: 150 }],
        ['id1.liquid', { color: [255, 80, 0], alpha: 150 }],
      ]);
    });

    void test('sets the stack once for a liquid, not every frame', () => {
      const { engine, shifts } = create();

      shifts.liquid(content.CONTENT_WATER);
      shifts.liquid(content.CONTENT_WATER);
      shifts.liquid(content.CONTENT_WATER);

      assert.equal(engine.postProcessStacks.length, 1);
    });

    void test('takes the tint off in clear air', () => {
      const { engine, shifts } = create();

      shifts.liquid(content.CONTENT_WATER);
      shifts.liquid(content.CONTENT_EMPTY);

      assert.deepEqual(engine.postProcessStacks[1].stack, []);
    });

    void test('keeps the tint for contents that have none, a player in the solid has the one before', () => {
      const { engine, shifts } = create();

      shifts.liquid(content.CONTENT_WATER);
      shifts.liquid(content.CONTENT_SOLID);

      assert.equal(engine.postProcessStacks.length, 1);
    });
  });

  void describe('damage', () => {
    void test('flashes red for flesh damage, 3 alpha per point of half the damage, at least 10, and falls at 150', () => {
      const { engine, shifts } = create();

      shifts.damage(0, 20);

      const [{ descriptor, options }] = engine.postProcessPulses;
      assert.equal(options.channel, 'id1.damage');
      assert.equal(descriptor.key, 'damage');
      assert.deepEqual(inQuakeUnits(descriptor.settings), { color: [255, 0, 0], alpha: 30 });
      // 30 alpha units at 150 per second
      assert.equal(descriptor.timing.fadeOut, 30 / 150);
    });

    void test('is pink when armor took most of it, and between when armor took some', () => {
      const { engine, shifts } = create();

      shifts.damage(30, 10);
      shifts.damage(10, 30);

      assert.deepEqual(engine.postProcessPulses.map(({ descriptor }) => inQuakeUnits(descriptor.settings).color), [
        [200, 100, 100],
        [220, 50, 50],
      ]);
    });

    void test('adds a hit to what is left of the last flash, up to 150', () => {
      const { engine, shifts } = create();

      shifts.damage(0, 20); // 30
      shifts.frame(0.1); // 15 fell off: 15 left
      shifts.damage(0, 20); // 15 + 30

      assert.deepEqual(engine.postProcessPulses.map(({ descriptor }) => inQuakeUnits(descriptor.settings).alpha), [30, 45]);

      for (let hit = 0; hit < 10; hit++) {
        shifts.damage(0, 200);
      }

      assert.equal(inQuakeUnits(engine.postProcessPulses.at(-1).descriptor.settings).alpha, 150);
    });

    void test('lets the flash fall to nothing', () => {
      const { engine, shifts } = create();

      shifts.damage(0, 20);
      shifts.frame(10);
      shifts.damage(0, 20);

      assert.equal(inQuakeUnits(engine.postProcessPulses[1].descriptor.settings).alpha, 30);
    });
  });

  void describe('flash', () => {
    void test('flashes for a pickup and falls at 100 alpha units per second', () => {
      const { engine, shifts } = create();

      shifts.flash('bonus', new Vector(0.5, 0.25, 1), 0.2);

      const [{ descriptor, options }] = engine.postProcessPulses;
      assert.equal(options.channel, 'id1.bonus');
      assert.equal(descriptor.key, 'bonus');
      assert.equal(descriptor.settings.alpha, 0.2);
      // 0.2 * 255 = 51 alpha units at 100 per second
      assert.equal(descriptor.timing.fadeOut, 51 / 100);
    });

    void test('keeps a channel of its own for the other flash, so that the two mix in a fixed order', () => {
      const { engine, shifts } = create();

      shifts.flash('info', new Vector(1, 1, 0), 0.2);

      assert.equal(engine.postProcessPulses[0].options.channel, 'id1.info');
    });
  });

  void describe('powerup', () => {
    void test('is a tint that stays, set again every frame with the alpha of the moment', () => {
      const { engine, shifts } = create();
      const color = new Vector(0, 0, 1);

      shifts.powerup(color, 0.3);
      shifts.powerup(color, 0.27);

      assert.deepEqual(engine.postProcessStacks.map(({ options, stack }) => [options.channel, stack[0].settings.alpha]), [
        ['id1.powerup', 0.3],
        ['id1.powerup', 0.27],
      ]);
    });

    void test('is taken off once, when the powerup is gone', () => {
      const { engine, shifts } = create();

      shifts.powerup(new Vector(0, 0, 1), 0.3);
      shifts.powerup(null, 0);
      shifts.powerup(null, 0);

      assert.equal(engine.postProcessStacks.length, 2);
      assert.deepEqual(engine.postProcessStacks[1].stack, []);
    });
  });

  void describe('reset', () => {
    void test('takes every tint off and forgets the flash, so that the next hit starts from nothing', () => {
      const { engine, shifts } = create();

      shifts.liquid(content.CONTENT_LAVA);
      shifts.damage(0, 100);
      engine.postProcessStacks.length = 0;

      shifts.reset();

      assert.equal(engine.postProcessStacks.length, 5);
      assert.ok(engine.postProcessStacks.every(({ stack }) => stack.length === 0));

      shifts.damage(0, 20);

      assert.equal(inQuakeUnits(engine.postProcessPulses.at(-1).descriptor.settings).alpha, 30);
    });
  });
});

void describe('id1 HUD color shifts', () => {
  /**
   * Builds a HUD on a mock engine that is ready to receive events.
   * @param {object} [clientdata] What the HUD reads of the player.
   * @returns {{ engine: ReturnType<typeof createMockClientEngine>, hud: InstanceType<typeof Q1HUD> }} Both.
   */
  function createHud(clientdata = {}) {
    const engine = createMockClientEngine();
    const game = {
      clientdata: { health: 100, armorvalue: 0, armortype: 0, items: 0, ...clientdata },
      serverInfo: new ServerInfo(engine),
    };
    const hud = new Q1HUD(game, engine);

    hud.init();

    return { engine, hud };
  }

  void test('flashes for a hit the engine tells about, with the armor and the damage that got through', () => {
    const { engine } = createHud();

    engine.eventBus.publish('client.damage', { damageReceived: 10, armorLost: 30, attackOrigin: new Vector(1, 0, 0) });

    const [{ descriptor, options }] = engine.postProcessPulses;
    assert.equal(options.channel, 'id1.damage');
    assert.deepEqual(inQuakeUnits(descriptor.settings).color, [200, 100, 100]);
  });

  void test('flashes for a pickup and for a secret', () => {
    const { engine } = createHud();

    engine.eventBus.publish(clientEventName(clientEvent.BONUS_FLASH));
    engine.eventBus.publish(clientEventName(clientEvent.STATS_UPDATED), 'secrets_found', 1);

    assert.deepEqual(engine.postProcessPulses.map(({ descriptor }) => descriptor.key), ['bonus', 'info']);
  });

  void test('tints for the liquid the eye is in, from the first frame the eye is in it', () => {
    const { engine, hud } = createHud();
    engine.CL.viewContents = content.CONTENT_WATER;

    hud.startFrame();

    const last = engine.postProcessStacks.at(-1);
    assert.equal(last.options.channel, 'id1.liquid');
    assert.deepEqual(inQuakeUnits(last.stack[0].settings), { color: [130, 80, 50], alpha: 128 });
  });

  void test('tints for the quad, and takes it off when it is gone', () => {
    const { engine, hud } = createHud({ items: items.IT_QUAD });
    engine.IndexToRGB = () => [0, 0, 1];

    hud.startFrame();

    const withQuad = engine.postProcessStacks.filter(({ options }) => options.channel === 'id1.powerup').at(-1);
    assert.deepEqual(Array.from(withQuad.stack[0].settings.color), [0, 0, 1]);
    assert.ok(withQuad.stack[0].settings.alpha >= 0.25 && withQuad.stack[0].settings.alpha <= 0.35);

    hud.game.clientdata.items = 0;
    hud.startFrame();

    assert.deepEqual(engine.postProcessStacks.filter(({ options }) => options.channel === 'id1.powerup').at(-1).stack, []);
  });

  void test('takes the tints off when the client disconnects', () => {
    const { engine } = createHud();
    engine.CL.viewContents = content.CONTENT_LAVA;

    engine.eventBus.publish('client.disconnected');

    const resets = engine.postProcessStacks.slice(-5);
    assert.deepEqual(resets.map(({ options }) => options.channel), ['id1.liquid', 'id1.damage', 'id1.bonus', 'id1.powerup', 'id1.info']);
    assert.ok(resets.every(({ stack }) => stack.length === 0));
  });
});
