import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { captureRegisteredPages, createMockClientEngine, createMockSessionsChannel } from './fixtures.ts';

await import('../../GameAPI.ts');

const { K } = await import('../../../../shared/Keys.ts');
const { default: Id1Menu } = await import('../../client/Menu.ts');

/**
 * Initialize Id1Menu against a fresh mock engine and let any pending microtasks (e.g. the
 * async menuplyr translate-texture load) settle.
 * @param {import('../../client/Menu.ts').Id1MenuOptions} [options] options forwarded to Id1Menu.Init
 * @returns {Promise<{ engine: ReturnType<typeof createMockClientEngine>, pages: Map<string, object> }>} engine and captured pages
 */
async function initId1Menu(options) {
  const engine = createMockClientEngine();
  const pages = captureRegisteredPages(engine);

  Id1Menu.Init(engine, options);
  await Promise.resolve();

  return { engine, pages };
}

void describe('Id1Menu.Init', () => {
  void test('registers every built-in page and sets the root to main', async () => {
    const { engine, pages } = await initId1Menu();

    assert.deepEqual(
      [...pages.keys()].sort(),
      ['alert', 'help', 'keys', 'launch_server', 'load', 'main', 'multiplayer', 'options', 'quit', 'save', 'singleplayer'].sort(),
    );

    engine.Menu.Push('main');
    assert.equal(engine.Menu.IsOpen('main'), true);
  });

  void test('main page has the five navigation buttons and closes on Escape', async () => {
    const { engine, pages } = await initId1Menu();
    const mainPage = pages.get('main');

    assert.equal(mainPage.items.length, 5);

    engine.Menu.Open('main');
    mainPage.items[0].action();
    assert.equal(engine.Menu.IsOpen('singleplayer'), true);

    mainPage.onEscape();
    assert.equal(engine.Menu.IsEmpty(), true);
  });

  void test('singleplayer page starts a new game, disconnecting first if a server is active', async () => {
    const { engine, pages } = await initId1Menu();
    const singlePlayerPage = pages.get('singleplayer');
    engine.SV.active = true;

    singlePlayerPage.items[0].action();

    assert.deepEqual(engine.appendedConsoleText, ['disconnect\n']);
    assert.equal(engine.Menu.IsEmpty(), true);
  });

  void test('save action is a no-op unless a single-player server is running and not mid-intermission', async () => {
    const { engine, pages } = await initId1Menu();
    const singlePlayerPage = pages.get('singleplayer');
    engine.Menu.Open('singleplayer');

    // Not hosting at all.
    singlePlayerPage.items[2].action();
    assert.equal(engine.Menu.IsOpen('save'), false);

    // Hosting, but mid-intermission.
    engine.SV.active = true;
    engine.CL.intermission = true;
    singlePlayerPage.items[2].action();
    assert.equal(engine.Menu.IsOpen('save'), false);

    // Hosting, not mid-intermission, single player.
    engine.CL.intermission = false;
    singlePlayerPage.items[2].action();
    assert.equal(engine.Menu.IsOpen('save'), true);
  });

  void test('load/save pages scan slots on entry and reflect SaveSlots.List', async () => {
    const { engine, pages } = await initId1Menu();
    engine.SaveSlots.List = (maxSlots) => Array.from({ length: maxSlots }, (_, index) => (
      index === 0
        ? { index, label: 'Before the boss', mapname: 'e1m8', hasData: true }
        : { index, label: 'Empty slot', mapname: null, hasData: false }
    ));

    const loadPage = pages.get('load');
    loadPage.onEnter();

    assert.equal(loadPage.items[0].label, 'Before the boss');
    assert.equal(loadPage.items[0].enabled, true);
    assert.equal(loadPage.items[0].canDelete, true);
    assert.equal(loadPage.items[1].enabled, false);

    const savePage = pages.get('save');
    savePage.onEnter();
    assert.equal(savePage.items[0].label, 'Before the boss');
    assert.equal(savePage.items[0].canDelete, true);
  });

  void test('activating an empty load slot is a no-op; a filled one closes the menu and issues load', async () => {
    const { engine, pages } = await initId1Menu();
    const loadPage = pages.get('load');
    engine.Menu.Open('load');

    loadPage.items[0].handleInput(K.ENTER);
    assert.equal(engine.appendedConsoleText.length, 0);
    assert.equal(engine.Menu.IsOpen('load'), true);

    engine.SaveSlots.List = (maxSlots) => Array.from({ length: maxSlots }, (_, index) => (
      { index, label: index === 0 ? 'Save' : 'Empty slot', mapname: null, hasData: index === 0 }
    ));
    loadPage.onEnter();

    loadPage.items[0].handleInput(K.ENTER);
    assert.deepEqual(engine.appendedConsoleText, ['load s0\n']);
    assert.equal(engine.Menu.IsEmpty(), true);
  });

  void test('options page toggles cl_forwardspeed/cl_backspeed together for Always Run', async () => {
    const { engine, pages } = await initId1Menu();
    const optionsPage = pages.get('options');
    const alwaysRun = optionsPage.items.find((item) => item.label === 'Always Run');

    assert.equal(alwaysRun.isOn(), false);

    alwaysRun.toggle();

    assert.equal(engine.GetCvar('cl_forwardspeed').value, 400);
    assert.equal(engine.GetCvar('cl_backspeed').value, 400);
    assert.equal(alwaysRun.isOn(), true);
  });

  void test('options page inverts m_pitch for Invert Mouse', async () => {
    const { engine, pages } = await initId1Menu();
    engine.SetCvar('m_pitch', '1');
    const optionsPage = pages.get('options');
    const invertMouse = optionsPage.items.find((item) => item.label === 'Invert Mouse');

    invertMouse.toggle();

    assert.equal(engine.GetCvar('m_pitch').value, -1);
  });

  void test('keys page has one KeyBindItem per bindable command', async () => {
    const { pages } = await initId1Menu();
    const keysPage = pages.get('keys');

    assert.ok(keysPage.items.length > 0);
    assert.ok(keysPage.items.every((item) => 'command' in item));
    assert.ok(keysPage.items.some((item) => item.command === '+attack'));
  });

  void test('help page cycles pages on Up/Down/Left/Right and falls back to default handling otherwise', async () => {
    const { pages } = await initId1Menu();
    const helpPage = pages.get('help');

    assert.equal(helpPage.handleInput(K.RIGHTARROW), true);
    assert.equal(helpPage.handleInput(K.LEFTARROW), true);
    // Escape isn't handled by the page-turning logic -- falls through to the default handler,
    // which invokes onEscape.
    let popped = false;
    helpPage.onEscape = () => { popped = true; };
    helpPage.handleInput(K.ESCAPE);
    assert.equal(popped, true);
  });

  void test('quit page confirms on Y and cancels on N', async () => {
    const { engine, pages } = await initId1Menu();
    const quitPage = pages.get('quit');
    let forceQuitCalled = false;
    engine.Menu.ForceQuit = () => { forceQuitCalled = true; };

    engine.Menu.Open('main');
    engine.Menu.Push('quit');

    assert.equal(quitPage.handleInput(110), true); // 'n'
    assert.equal(engine.Menu.IsOpen('main'), true);

    engine.Menu.Push('quit');
    assert.equal(quitPage.handleInput(121), true); // 'y'
    assert.equal(forceQuitCalled, true);
  });

  void test('host.quit-requested opens the quit page once', async () => {
    const { engine } = await initId1Menu();

    engine.eventBus.publish('host.quit-requested');
    assert.equal(engine.Menu.IsOpen('quit'), true);
  });

  void test('host.alert opens the alert page with the event title/message, and Enter dismisses it', async () => {
    const { engine, pages } = await initId1Menu();
    const alertPage = pages.get('alert');

    engine.eventBus.publish('host.alert', { title: 'Host Error', message: 'boom', severity: 'error' });

    assert.equal(engine.Menu.IsOpen('alert'), true);

    alertPage.onConfirm();
    assert.equal(engine.Menu.IsEmpty(), true);
  });

  void test('multiplayer page pre-fills name/color from cvars and toggles the join label by connection state', async () => {
    const { engine, pages } = await initId1Menu();
    engine.SetCvar('_cl_name', 'Ranger');
    engine.SetCvar('_cl_color', String((3 << 4) + 5));
    const multiplayerPage = pages.get('multiplayer');
    const joinAction = multiplayerPage.items[multiplayerPage.items.length - 1];

    engine.CL.connected = false;
    multiplayerPage.onEnter();
    assert.equal(joinAction.label, 'Join Game');

    engine.CL.connected = true;
    multiplayerPage.onEnter();
    assert.equal(joinAction.label, 'Accept Changes');
  });

  void test('multiplayer join pushes launch_server while disconnected, closes the menu while connected', async () => {
    const { engine, pages } = await initId1Menu();
    const multiplayerPage = pages.get('multiplayer');
    const joinAction = multiplayerPage.items[multiplayerPage.items.length - 1];

    engine.Menu.Open('multiplayer');
    engine.CL.connected = false;
    multiplayerPage.onEnter();

    joinAction.action();
    assert.equal(engine.Menu.IsOpen('launch_server'), true);

    engine.Menu.Clear();
    engine.Menu.Open('multiplayer');
    engine.CL.connected = true;
    multiplayerPage.onEnter();

    joinAction.action();
    assert.equal(engine.Menu.IsEmpty(), true);
  });

  void test('launch_server page builds its static items and lists sessions on entry', async () => {
    const { engine, pages } = await initId1Menu();
    const channel = createMockSessionsChannel([
      { sessionId: 'abc', hostname: 'UNNAMED', map: 'dm3', currentPlayers: 2, maxPlayers: 8, colo: 'sea', country: 'US', settings: {} },
    ]);
    engine.Multiplayer.SubscribeSessions = channel.SubscribeSessions;

    const launchServerPage = pages.get('launch_server');
    launchServerPage.onEnter();

    const labels = launchServerPage.items.map((item) => item.label);
    assert.ok(labels.includes('Private Session'));
    assert.ok(labels.some((label) => label?.startsWith('dm3 near')));
  });

  void test('launch_server page re-subscribes on every entry and unsubscribes on exit', async () => {
    const { engine, pages } = await initId1Menu();
    const channel = createMockSessionsChannel([]);
    engine.Multiplayer.SubscribeSessions = channel.SubscribeSessions;

    const launchServerPage = pages.get('launch_server');

    launchServerPage.onEnter();
    assert.equal(channel.subscribeCount, 1);
    assert.equal(channel.activeSubscriberCount, 1);

    launchServerPage.onExit();
    assert.equal(channel.activeSubscriberCount, 0);

    // Static items (Start Game/Toggle/server actions/Spacer) are only built once, but the second
    // entry still needs a fresh subscription -- otherwise a second visit would show a stale list
    // with no live channel behind it at all.
    launchServerPage.onEnter();
    assert.equal(channel.subscribeCount, 2);
    assert.equal(channel.activeSubscriberCount, 1);

    launchServerPage.onExit();
    assert.equal(channel.activeSubscriberCount, 0);
  });

  void test('Refresh Sessions requests a fresh snapshot over the live channel instead of re-fetching', async () => {
    const { engine, pages } = await initId1Menu();
    let refreshRequests = 0;
    engine.Multiplayer.SubscribeSessions = createMockSessionsChannel([]).SubscribeSessions;
    engine.Multiplayer.RequestSessionsRefresh = () => { refreshRequests += 1; };

    const launchServerPage = pages.get('launch_server');
    launchServerPage.onEnter();

    const refreshButton = launchServerPage.items.at(-1);
    assert.equal(refreshButton.label, 'Refresh Sessions');

    refreshButton.action();
    assert.equal(refreshRequests, 1);
  });
});

void describe('Id1Menu.Init with classicFrontend: false', () => {
  void test('registers only the shared utility pages, not the classic single-player front end', async () => {
    const { pages } = await initId1Menu({ classicFrontend: false });

    assert.deepEqual([...pages.keys()].sort(), ['alert', 'keys', 'options', 'quit']);
  });

  void test('does not set a root page, leaving that to the mod that replaces the front end', async () => {
    const engine = createMockClientEngine();
    let rootPageName = null;
    engine.Menu.SetRootPage = (name) => { rootPageName = name; };

    Id1Menu.Init(engine, { classicFrontend: false });
    await Promise.resolve();

    assert.equal(rootPageName, null);
  });

  void test('options page still has its titlePic/logoPic and toggles cl_forwardspeed for Always Run', async () => {
    const { pages } = await initId1Menu({ classicFrontend: false });
    const optionsPage = pages.get('options');
    const alwaysRun = optionsPage.items.find((item) => item.label === 'Always Run');

    assert.equal(optionsPage.titlePic?.name, 'p_option');
    assert.equal(optionsPage.logoPic?.name, 'qplaque');

    alwaysRun.toggle();

    assert.equal(alwaysRun.isOn(), true);
  });

  void test('keys page still has its titlePic and one KeyBindItem per bindable command', async () => {
    const { pages } = await initId1Menu({ classicFrontend: false });
    const keysPage = pages.get('keys');

    assert.equal(keysPage.titlePic?.name, 'ttl_cstm');
    assert.ok(keysPage.items.length > 0);
    assert.ok(keysPage.items.some((item) => item.command === '+attack'));
  });

  void test('host.quit-requested still opens the quit page', async () => {
    const { engine } = await initId1Menu({ classicFrontend: false });

    engine.eventBus.publish('host.quit-requested');
    assert.equal(engine.Menu.IsOpen('quit'), true);
  });

  void test('host.alert still opens the alert page', async () => {
    const { engine } = await initId1Menu({ classicFrontend: false });

    engine.eventBus.publish('host.alert', { title: 'Host Error', message: 'boom', severity: 'error' });
    assert.equal(engine.Menu.IsOpen('alert'), true);
  });
});
