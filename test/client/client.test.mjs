import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Vector from '../../../../shared/Vector.ts';
import { createMockClientEngine, createMockTexture } from './fixtures.ts';

const { clientEvent, clientEventName, effect, items } = await import('../../Defs.ts');
await import('../../GameAPI.ts');

const syncModule = await import('../../client/Sync.ts');
const hudModule = await import('../../client/HUD.ts');
const clientApiModule = await import('../../client/ClientAPI.ts');

const { ClientStats, ServerInfo } = syncModule;
const { Q1HUD } = hudModule;
const { ClientGameAPI } = clientApiModule;

/**
 * Create a minimal clientdata map for HUD and client API tests.
 * @param {object} overrides Override values.
 * @returns {object} Mock clientdata.
 */
function createClientdata(overrides = {}) {
  return {
    health: 100,
    armorvalue: 0,
    armortype: 0,
    items: 0,
    ammo_shells: 0,
    ammo_nails: 0,
    ammo_rockets: 0,
    ammo_cells: 0,
    weapon: 0,
    weaponframe: 0,
    effects: 0,
    ...overrides,
  };
}

void describe('id1 client sync', () => {
  void test('updates stats and server info from client events', () => {
    const engine = createMockClientEngine();
    const stats = new ClientStats(engine);
    const serverInfo = new ServerInfo(engine);

    engine.eventBus.publish(clientEventName(clientEvent.STATS_INIT), 'monsters_total', 13);
    engine.eventBus.publish(clientEventName(clientEvent.STATS_UPDATED), 'secrets_found', 2);
    engine.eventBus.publish('client.server-info.ready', {
      hostname: 'Shub Hub',
      coop: '1',
      deathmatch: '0',
      skill: '3',
      map: 'e1m8',
    });
    engine.eventBus.publish('client.server-info.updated', 'hostname', 'Slipgate Complex');

    assert.equal(stats.monsters_total, 13);
    assert.equal(stats.secrets_found, 2);
    assert.equal(serverInfo.hostname, 'Slipgate Complex');
    assert.equal(serverInfo.coop, '1');
    assert.equal(serverInfo.map, 'e1m8');
  });

  void test('parses numeric stat strings and ignores non-numeric stat strings', () => {
    const engine = createMockClientEngine();
    const stats = new ClientStats(engine);

    engine.eventBus.publish(clientEventName(clientEvent.STATS_INIT), 'monsters_total', '13');
    engine.eventBus.publish(clientEventName(clientEvent.STATS_UPDATED), 'secrets_found', ' 2 ');
    engine.eventBus.publish(clientEventName(clientEvent.STATS_UPDATED), 'monsters_killed', 'not-a-number');

    assert.equal(stats.monsters_total, 13);
    assert.equal(stats.secrets_found, 2);
    assert.equal(stats.monsters_killed, 0);
  });
});

void describe('id1 client HUD state', () => {
  void test('restores saved vectors and stat counters when loading HUD state', () => {
    const engine = createMockClientEngine();
    const game = {
      clientdata: createClientdata(),
      serverInfo: new ServerInfo(engine),
    };
    const hud = new Q1HUD(game, engine);

    hud.init();
    hud.damage.time = 4;
    hud.damage.attackOrigin = new Vector(1, 2, 3);
    hud.damage.damageReceived = 9;
    hud.intermission.running = true;
    hud.intermission.message = 'Episode complete';
    hud.intermission.mapCompletedTime = 17;
    hud.stats.monsters_total = 10;
    hud.stats.monsters_killed = 7;
    hud.stats.secrets_total = 5;
    hud.stats.secrets_found = 4;

    const savedState = hud.saveState();

    hud.damage.time = 0;
    hud.damage.attackOrigin = new Vector();
    hud.damage.damageReceived = 0;
    hud.intermission.running = false;
    hud.intermission.message = null;
    hud.intermission.mapCompletedTime = 0;
    hud.stats.monsters_total = 0;
    hud.stats.monsters_killed = 0;
    hud.stats.secrets_total = 0;
    hud.stats.secrets_found = 0;

    hud.loadState(savedState);

    assert.ok(hud.damage.attackOrigin instanceof Vector);
    assert.deepEqual(Array.from(hud.damage.attackOrigin), [1, 2, 3]);
    assert.equal(hud.damage.damageReceived, 9);
    assert.equal(hud.intermission.message, 'Episode complete');
    assert.equal(hud.stats.monsters_killed, 7);
  });

  void test('draws the invulnerability disc and 666 armor value', () => {
    const engine = createMockClientEngine();

    Q1HUD.Init(engine);

    try {
      const game = {
        clientdata: createClientdata({
          items: items.IT_INVULNERABILITY,
          armorvalue: 42,
        }),
        serverInfo: new ServerInfo(engine),
      };
      const hud = new Q1HUD(game, engine);

      hud.init();
      hud.draw();

      assert.equal(engine.drawPics.some(({ pic }) => pic.name === 'DISC'), true);
      assert.equal(engine.drawPics.filter(({ pic }) => pic.name === 'ANUM_6').length, 3);
    } finally {
      Q1HUD.Shutdown(engine);
    }
  });

  void test('frees loaded HUD textures and unregisters score commands on shutdown', () => {
    const loadedTextures = [];
    const engine = createMockClientEngine({
      LoadPicFromWad(name) {
        const texture = createMockTexture(name);
        loadedTextures.push(texture);
        return texture;
      },
      LoadPicFromLump(name) {
        const texture = createMockTexture(name, 64, 16);
        loadedTextures.push(texture);
        return texture;
      },
    });

    Q1HUD.Init(engine);

    assert.equal(loadedTextures.length > 0, true);
    assert.equal(engine.commands.has('+showscores'), true);
    assert.equal(engine.commands.has('-showscores'), true);

    Q1HUD.Shutdown(engine);

    assert.equal(loadedTextures.every((texture) => texture.freed), true);
    assert.equal(engine.commands.has('+showscores'), false);
    assert.equal(engine.commands.has('-showscores'), false);
  });

  void test('shows the solo scoreboard automatically when the player is dead', () => {
    const engine = createMockClientEngine();

    Q1HUD.Init(engine);

    try {
      const game = {
        clientdata: createClientdata({ health: 0 }),
        serverInfo: new ServerInfo(engine),
      };
      const hud = new Q1HUD(game, engine);

      hud.init();
      hud.draw();

      assert.equal(engine.drawPics.some(({ pic }) => pic.name === 'SCOREBAR'), true);
      assert.equal(engine.drawPics.some(({ pic }) => pic.name === 'SBAR'), false);
    } finally {
      Q1HUD.Shutdown(engine);
    }
  });

  void test('draws finale text from center-print during intermission', () => {
    const engine = createMockClientEngine();

    Q1HUD.Init(engine);

    try {
      const game = {
        clientdata: createClientdata(),
        serverInfo: new ServerInfo(engine),
      };
      const hud = new Q1HUD(game, engine);

      hud.init();
      engine.eventBus.publish(clientEventName(clientEvent.INTERMISSION_START), null, new Vector(), new Vector());
      engine.eventBus.publish('client.center-print', 'Rune of Earth');
      engine.CL.time = 10;

      hud.draw();

      assert.equal(engine.drawPics.some(({ pic }) => pic.name === 'finale'), true);
      assert.equal(engine.drawStrings.some(({ text }) => text.includes('Rune of Earth')), true);
    } finally {
      Q1HUD.Shutdown(engine);
    }
  });

  void test('draws engine finale text without the legacy Sbar overlay', () => {
    const engine = createMockClientEngine({
      CL: {
        gametime: 0,
        frametime: 0.1,
        entityNum: 1,
        intermission: true,
        intermissionState: 2,
        levelname: 'end',
        maxclients: 1,
        time: 0,
        viewangles: new Vector(),
        vieworigin: new Vector(),
        score() {
          return {
            isActive: false,
            frags: 0,
            name: '',
            ping: 0,
            colors: 0,
          };
        },
      },
    });

    Q1HUD.Init(engine);

    try {
      const game = {
        clientdata: createClientdata(),
        serverInfo: new ServerInfo(engine),
      };
      const hud = new Q1HUD(game, engine);

      hud.init();
      engine.eventBus.publish('client.center-print', 'The End');
  engine.CL.time = 10;
      hud.draw();

      assert.equal(engine.drawPics.some(({ pic }) => pic.name === 'finale'), true);
      assert.equal(engine.drawStrings.some(({ text }) => text.includes('The End')), true);
      assert.equal(engine.drawPics.some(({ pic }) => pic.name === 'SBAR'), false);
    } finally {
      Q1HUD.Shutdown(engine);
    }
  });

  void test('draws engine cutscene text without the finale banner', () => {
    const engine = createMockClientEngine({
      CL: {
        gametime: 0,
        frametime: 0.1,
        entityNum: 1,
        intermission: true,
        intermissionState: 3,
        levelname: 'end',
        maxclients: 1,
        time: 0,
        viewangles: new Vector(),
        vieworigin: new Vector(),
        score() {
          return {
            isActive: false,
            frags: 0,
            name: '',
            ping: 0,
            colors: 0,
          };
        },
      },
    });

    Q1HUD.Init(engine);

    try {
      const game = {
        clientdata: createClientdata(),
        serverInfo: new ServerInfo(engine),
      };
      const hud = new Q1HUD(game, engine);

      hud.init();
      engine.eventBus.publish('client.center-print', 'You are in the slipgate complex.');
  engine.CL.time = 10;
      hud.draw();

      assert.equal(engine.drawPics.some(({ pic }) => pic.name === 'finale'), false);
      assert.equal(engine.drawStrings.some(({ text }) => text.includes('You are in the slipgate complex.')), true);
      assert.equal(engine.drawPics.some(({ pic }) => pic.name === 'SBAR'), false);
    } finally {
      Q1HUD.Shutdown(engine);
    }
  });

  void test('does not draw the wide mini multiplayer frag overlay anymore', () => {
    const engine = createMockClientEngine({
      VID: {
        width: 512,
        height: 200,
      },
      SCR: {
        viewsize: 100,
      },
      CL: {
        gametime: 0,
        frametime: 0.1,
        entityNum: 2,
        intermission: false,
        levelname: 'dm3',
        maxclients: 3,
        time: 0,
        viewangles: new Vector(),
        vieworigin: new Vector(),
        score(index) {
          return [
            { isActive: true, frags: 5, name: 'Ranger', ping: 45, colors: 0x4f },
            { isActive: true, frags: 8, name: 'Player', ping: 20, colors: 0xf4 },
            { isActive: true, frags: 2, name: 'Ogre', ping: 88, colors: 0x22 },
          ][index] ?? { isActive: false, frags: 0, name: '', ping: 0, colors: 0 };
        },
      },
    });

    Q1HUD.Init(engine);

    try {
      const game = {
        clientdata: createClientdata(),
        serverInfo: new ServerInfo(engine),
      };
      const hud = new Q1HUD(game, engine);

      hud.init();
      hud.draw();

      assert.equal(engine.drawRects.length, 0);
      assert.equal(engine.drawStrings.some(({ text, x }) => text === 'Player' && x === 372), false);
      assert.equal(engine.drawStrings.some(({ text, x }) => text === '[' && x === 324), false);
    } finally {
      Q1HUD.Shutdown(engine);
    }
  });

  void test('shows chat through the message bag even when the status bar is hidden', () => {
    const engine = createMockClientEngine({
      VID: {
        width: 768,
        height: 200,
      },
      SCR: {
        viewsize: 120,
      },
      CL: {
        gametime: 0,
        frametime: 0.1,
        entityNum: 1,
        intermission: false,
        levelname: 'dm2',
        maxclients: 2,
        time: 0,
        viewangles: new Vector(),
        vieworigin: new Vector(),
        score(index) {
          return [
            { isActive: true, frags: 4, name: 'Player', ping: 20, colors: 0x4f },
            { isActive: true, frags: 3, name: 'Ranger', ping: 45, colors: 0xf4 },
          ][index] ?? { isActive: false, frags: 0, name: '', ping: 0, colors: 0 };
        },
      },
    });

    Q1HUD.Init(engine);

    try {
      const game = {
        clientdata: createClientdata(),
        serverInfo: new ServerInfo(engine),
      };
      const hud = new Q1HUD(game, engine);

      hud.init();
      engine.eventBus.publish('client.chat.message', 'Ranger', 'Ready?', false);
      hud.draw();

      assert.equal(engine.consolePrints.some(({ message }) => message.includes('Ranger: Ready?')), true);
      assert.equal(engine.drawStrings.some(({ text }) => text === 'Ranger: Ready?'), true);
      assert.equal(engine.sounds.length, 0);
    } finally {
      Q1HUD.Shutdown(engine);
    }
  });

  void test('draws inventory ammo counts using the classic small glyph digits', () => {
    const engine = createMockClientEngine();

    Q1HUD.Init(engine);

    try {
      const game = {
        clientdata: createClientdata({
          items: items.IT_SHOTGUN,
          ammo_shells: 25,
        }),
        serverInfo: new ServerInfo(engine),
      };
      const hud = new Q1HUD(game, engine);

      hud.init();
      hud.draw();

      assert.equal(engine.drawStrings.some(({ text }) => (
        text.length === 3
        && text.charCodeAt(0) === 32
        && text.charCodeAt(1) === '2'.charCodeAt(0) - 30
        && text.charCodeAt(2) === '5'.charCodeAt(0) - 30
      )), true);
      assert.equal(engine.drawStrings.some(({ text }) => text === '025' || text === ' 25'), false);
    } finally {
      Q1HUD.Shutdown(engine);
    }
  });

  void test('draws the classic crosshair through the game HUD when enabled', () => {
    const engine = createMockClientEngine({
      SCR: {
        viewsize: 100,
        viewRect: {
          x: 16,
          y: 8,
          width: 288,
          height: 160,
        },
      },
    }, {
      cvars: {
        crosshair: 1,
        cl_crossx: 3,
        cl_crossy: -2,
      },
    });

    Q1HUD.Init(engine);

    try {
      const game = {
        clientdata: createClientdata(),
        serverInfo: new ServerInfo(engine),
      };
      const hud = new Q1HUD(game, engine);

      hud.init();
      hud.draw();

      assert.deepEqual(engine.drawStrings, [{
        x: 163,
        y: 86,
        text: '+',
        scale: 1.0,
        color: new Vector(1.0, 1.0, 1.0),
      }]);
    } finally {
      Q1HUD.Shutdown(engine);
    }
  });

  void test('does not draw the game-owned crosshair during intermission', () => {
    const engine = createMockClientEngine({
      SCR: {
        viewsize: 100,
        viewRect: {
          x: 0,
          y: 0,
          width: 320,
          height: 200,
        },
      },
    }, {
      cvars: {
        crosshair: 1,
        cl_crossx: 0,
        cl_crossy: 0,
      },
    });

    Q1HUD.Init(engine);

    try {
      const game = {
        clientdata: createClientdata(),
        serverInfo: new ServerInfo(engine),
      };
      const hud = new Q1HUD(game, engine);

      hud.init();
      engine.eventBus.publish(clientEventName(clientEvent.INTERMISSION_START), null, new Vector(), new Vector());
      hud.draw();

      assert.equal(engine.drawStrings.some(({ text }) => text === '+'), false);
    } finally {
      Q1HUD.Shutdown(engine);
    }
  });

  void test('flashes newly picked weapon icons before settling back to the selected icon', () => {
    const engine = createMockClientEngine();

    Q1HUD.Init(engine);

    try {
      const game = {
        clientdata: createClientdata({
          items: items.IT_SHOTGUN,
          weapon: items.IT_SHOTGUN,
          ammo_shells: 25,
        }),
        serverInfo: new ServerInfo(engine),
      };
      const hud = new Q1HUD(game, engine);

      hud.init();
      engine.eventBus.publish(clientEventName(clientEvent.ITEM_PICKED), {}, ['shotgun'], 'Shotgun', items.IT_SHOTGUN);
      hud.draw();

      assert.equal(engine.drawPics.some(({ pic }) => pic.name === 'INVA1_SHOTGUN'), true);

      engine.CL.time = 1.1;
      engine.drawPics.length = 0;
      hud.draw();

      assert.equal(engine.drawPics.some(({ pic }) => pic.name.startsWith('INVA')), false);
      assert.equal(engine.drawPics.some(({ pic }) => pic.name === 'INV2_SHOTGUN'), true);
    } finally {
      Q1HUD.Shutdown(engine);
    }
  });
});

void describe('id1 client API', () => {
  void test('publishes client events and restores saved game state', () => {
    const engine = createMockClientEngine();
    const receivedEvents = [];
    const clientGame = new ClientGameAPI(engine);

    clientGame.init();

    engine.eventBus.subscribe(clientEventName(clientEvent.TEST_EVENT), (...args) => {
      receivedEvents.push(args);
    });

    clientGame.clientdata.health = 33;
    clientGame.serverInfo.hostname = 'Old Name';
    clientGame.hud.damage.time = 2;
    clientGame.hud.damage.damageReceived = 11;
    clientGame.hud.damage.attackOrigin = new Vector(4, 5, 6);

    const savedGame = clientGame.saveGame();

    clientGame.clientdata.health = 100;
    clientGame.serverInfo.hostname = 'New Name';
    clientGame.handleClientEvent(clientEvent.TEST_EVENT, 'alpha', 7);
    clientGame.loadGame(savedGame);

    assert.deepEqual(receivedEvents, [['alpha', 7]]);
    assert.equal(clientGame.clientdata.health, 33);
    assert.equal(clientGame.serverInfo.hostname, 'Old Name');
    assert.ok(clientGame.hud.damage.attackOrigin instanceof Vector);
    assert.deepEqual(Array.from(clientGame.hud.damage.attackOrigin), [4, 5, 6]);
  });

  void test('updates the viewmodel and muzzleflash effects during the frame', () => {
    const dlight = {};
    const engine = createMockClientEngine({
      AllocDlight() {
        return dlight;
      },
      CL: {
        gametime: 0,
        frametime: 0.1,
        entityNum: 3,
        intermission: false,
        levelname: 'e1m1',
        maxclients: 1,
        time: 10,
        viewangles: new Vector(),
        vieworigin: new Vector(10, 20, 30),
        score() {
          return {
            isActive: false,
            frags: 0,
            name: '',
            ping: 0,
            colors: 0,
          };
        },
      },
    });
    const clientGame = new ClientGameAPI(engine);

    clientGame.init();
    clientGame.clientdata = createClientdata({
      weapon: items.IT_SHOTGUN,
      weaponframe: 3,
      effects: effect.EF_MUZZLEFLASH,
    });

    clientGame.startFrame();

    assert.equal(clientGame.viewmodel.visible, true);
    assert.equal(clientGame.viewmodel.model.name, 'progs/v_shot.mdl');
    assert.equal(clientGame.viewmodel.frame, 3);
    assert.deepEqual(Array.from(dlight.origin), [30, 20, 62]);
    assert.equal(dlight.minlight, 32);
    assert.equal(dlight.die, 10.2);
  });
});
