import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { K as KeyCode } from '../../../../shared/Keys.ts';
import { Action, KeyBindItem, MenuItem, SaveSlotItem, Toggle } from '../../../../engine/client/menu/MenuItem.ts';
import type { MenuPage } from '../../../../engine/client/menu/MenuPage.ts';
import type { Id1MenuOptions } from '../../client/Menu.ts';
import { asClientEngineAPI, captureRegisteredPages, createMockClientEngine, createMockSessionsChannel, type MockTexture } from './fixtures.ts';

await import('../../GameAPI.ts');

const { K } = await import('../../../../shared/Keys.ts');
const { default: Id1Menu } = await import('../../client/Menu.ts');

type Widget<T extends MenuItem> = abstract new (...args: never[]) => T;

/**
 * Finds a page the menu registered.
 * @param pages The captured pages.
 * @param name The page name.
 * @returns The page.
 */
function pageNamed(pages: Map<string, MenuPage>, name: string): MenuPage {
  const page = pages.get(name);
  assert.ok(page, `page "${name}" is registered`);
  return page;
}

/**
 * Reads an item of a page as the widget it is.
 * @param page The page.
 * @param index Where the item is in the page, negative from the end.
 * @param WidgetClass The widget class the item is an instance of.
 * @returns The item.
 */
function itemAt<T extends MenuItem>(page: MenuPage, index: number, WidgetClass: Widget<T>): T {
  const item = page.items.at(index);
  assert.ok(item instanceof WidgetClass, `item ${index} of the page is a ${WidgetClass.name}`);
  return item;
}

/**
 * Finds an item of a page by its label.
 * @param page The page.
 * @param label The label of the item.
 * @param WidgetClass The widget class the item is an instance of.
 * @returns The item.
 */
function itemLabelled<T extends MenuItem>(page: MenuPage, label: string, WidgetClass: Widget<T>): T {
  const item = page.items.find((candidate) => candidate.label === label);
  assert.ok(item instanceof WidgetClass, `the page has a ${WidgetClass.name} labelled "${label}"`);
  return item;
}

/**
 * The name of a page's picture, which the mock engine hands out as a {@link MockTexture}.
 * @param pic The picture of the page.
 * @returns Its name.
 */
function textureName(pic: MenuPage['titlePic']): string | undefined {
  // The pictures come from the mock engine's LoadPic*, which makes MockTextures where the real one makes GLTextures.
  return (pic as unknown as MockTexture | null | undefined)?.name;
}

/**
 * Initialize Id1Menu against a fresh mock engine and let any pending microtasks (e.g. the
 * async menuplyr translate-texture load) settle.
 * @param options options forwarded to Id1Menu.Init
 * @returns engine and captured pages
 */
async function initId1Menu(options?: Id1MenuOptions) {
  const engine = createMockClientEngine();
  const pages = captureRegisteredPages(engine);

  Id1Menu.Init(asClientEngineAPI(engine), options);
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
    const mainPage = pageNamed(pages, 'main');

    assert.equal(mainPage.items.length, 5);

    engine.Menu.Open('main');
    void itemAt(mainPage, 0, Action).action();
    assert.equal(engine.Menu.IsOpen('singleplayer'), true);

    assert.ok(mainPage.onEscape);
    mainPage.onEscape();
    assert.equal(engine.Menu.IsEmpty(), true);
  });

  void test('singleplayer page starts a new game, disconnecting first if a server is active', async () => {
    const { engine, pages } = await initId1Menu();
    const singlePlayerPage = pageNamed(pages, 'singleplayer');
    engine.SV.active = true;

    void itemAt(singlePlayerPage, 0, Action).action();

    assert.deepEqual(engine.appendedConsoleText, ['disconnect\n']);
    assert.equal(engine.Menu.IsEmpty(), true);
  });

  void test('save action is a no-op unless a single-player server is running and not mid-intermission', async () => {
    const { engine, pages } = await initId1Menu();
    const singlePlayerPage = pageNamed(pages, 'singleplayer');
    engine.Menu.Open('singleplayer');

    // Not hosting at all.
    void itemAt(singlePlayerPage, 2, Action).action();
    assert.equal(engine.Menu.IsOpen('save'), false);

    // Hosting, but mid-intermission.
    engine.SV.active = true;
    engine.CL.intermission = true;
    void itemAt(singlePlayerPage, 2, Action).action();
    assert.equal(engine.Menu.IsOpen('save'), false);

    // Hosting, not mid-intermission, single player.
    engine.CL.intermission = false;
    void itemAt(singlePlayerPage, 2, Action).action();
    assert.equal(engine.Menu.IsOpen('save'), true);
  });

  void test('load/save pages scan slots on entry and reflect SaveSlots.List', async () => {
    const { engine, pages } = await initId1Menu();
    engine.SaveSlots.List = (maxSlots) => Array.from({ length: maxSlots }, (_, index) => (
      index === 0
        ? { index, label: 'Before the boss', mapname: 'e1m8', hasData: true }
        : { index, label: 'Empty slot', mapname: null, hasData: false }
    ));

    const loadPage = pageNamed(pages, 'load');
    loadPage.onEnter();

    assert.equal(loadPage.items[0].label, 'Before the boss');
    assert.equal(loadPage.items[0].enabled, true);
    assert.equal(itemAt(loadPage, 0, SaveSlotItem).canDelete, true);
    assert.equal(loadPage.items[1].enabled, false);

    const savePage = pageNamed(pages, 'save');
    savePage.onEnter();
    assert.equal(savePage.items[0].label, 'Before the boss');
    assert.equal(itemAt(savePage, 0, SaveSlotItem).canDelete, true);
  });

  void test('activating an empty load slot is a no-op; a filled one closes the menu and issues load', async () => {
    const { engine, pages } = await initId1Menu();
    const loadPage = pageNamed(pages, 'load');
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
    const optionsPage = pageNamed(pages, 'options');
    const alwaysRun = itemLabelled(optionsPage, 'Always Run', Toggle);

    assert.equal(alwaysRun.isOn(), false);

    alwaysRun.toggle();

    assert.equal(engine.GetCvar('cl_forwardspeed').value, 400);
    assert.equal(engine.GetCvar('cl_backspeed').value, 400);
    assert.equal(alwaysRun.isOn(), true);
  });

  void test('options page inverts m_pitch for Invert Mouse', async () => {
    const { engine, pages } = await initId1Menu();
    engine.SetCvar('m_pitch', '1');
    const optionsPage = pageNamed(pages, 'options');
    const invertMouse = itemLabelled(optionsPage, 'Invert Mouse', Toggle);

    invertMouse.toggle();

    assert.equal(engine.GetCvar('m_pitch').value, -1);
  });

  void test('keys page has one KeyBindItem per bindable command', async () => {
    const { pages } = await initId1Menu();
    const keysPage = pageNamed(pages, 'keys');

    assert.ok(keysPage.items.length > 0);
    assert.ok(keysPage.items.every((item) => 'command' in item));
    assert.ok(keysPage.items.some((item) => item instanceof KeyBindItem && item.command === '+attack'));
  });

  void test('help page cycles pages on Up/Down/Left/Right and falls back to default handling otherwise', async () => {
    const { pages } = await initId1Menu();
    const helpPage = pageNamed(pages, 'help');

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
    const quitPage = pageNamed(pages, 'quit');
    let forceQuitCalled = false;
    engine.Menu.ForceQuit = () => { forceQuitCalled = true; };

    engine.Menu.Open('main');
    engine.Menu.Push('quit');

    assert.equal(quitPage.handleInput('n'.charCodeAt(0) as KeyCode), true); // 'n'
    assert.equal(engine.Menu.IsOpen('main'), true);

    engine.Menu.Push('quit');
    assert.equal(quitPage.handleInput('y'.charCodeAt(0) as KeyCode), true); // 'y'
    assert.equal(forceQuitCalled, true);
  });

  void test('host.quit-requested opens the quit page once', async () => {
    const { engine } = await initId1Menu();

    engine.moduleEventBus.publish('host.quit-requested');
    assert.equal(engine.Menu.IsOpen('quit'), true);
  });

  void test('host.alert opens the alert page with the event title/message, and Enter dismisses it', async () => {
    const { engine, pages } = await initId1Menu();
    const alertPage = pageNamed(pages, 'alert');

    engine.moduleEventBus.publish('host.alert', { title: 'Host Error', message: 'boom', severity: 'error' });

    assert.equal(engine.Menu.IsOpen('alert'), true);

    assert.ok(alertPage.onConfirm);
    alertPage.onConfirm();
    assert.equal(engine.Menu.IsEmpty(), true);
  });

  void test('host.alert still opens the alert page after the per-connection eventBus is wiped', async () => {
    // Id1Menu subscribes on moduleEventBus specifically because engine.eventBus (CL.state's
    // per-connection bus) gets fully cleared on every disconnect/reconnect -- simulate that here
    // to prove the subscription doesn't live there and so isn't affected.
    const { engine } = await initId1Menu();

    engine.eventBus.unsubscribeAll();
    engine.moduleEventBus.publish('host.alert', { title: 'Host Error', message: 'boom', severity: 'error' });

    assert.equal(engine.Menu.IsOpen('alert'), true);
  });

  void test('multiplayer page pre-fills name/color from cvars and toggles the join label by connection state', async () => {
    const { engine, pages } = await initId1Menu();
    engine.SetCvar('_cl_name', 'Ranger');
    engine.SetCvar('_cl_color', String((3 << 4) + 5));
    const multiplayerPage = pageNamed(pages, 'multiplayer');
    const joinAction = itemAt(multiplayerPage, -1, Action);

    engine.CL.connected = false;
    multiplayerPage.onEnter();
    assert.equal(joinAction.label, 'Join Game');

    engine.CL.connected = true;
    multiplayerPage.onEnter();
    assert.equal(joinAction.label, 'Accept Changes');
  });

  void test('multiplayer join pushes launch_server while disconnected, closes the menu while connected', async () => {
    const { engine, pages } = await initId1Menu();
    const multiplayerPage = pageNamed(pages, 'multiplayer');
    const joinAction = itemAt(multiplayerPage, -1, Action);

    engine.Menu.Open('multiplayer');
    engine.CL.connected = false;
    multiplayerPage.onEnter();

    void joinAction.action();
    assert.equal(engine.Menu.IsOpen('launch_server'), true);

    engine.Menu.Clear();
    engine.Menu.Open('multiplayer');
    engine.CL.connected = true;
    multiplayerPage.onEnter();

    void joinAction.action();
    assert.equal(engine.Menu.IsEmpty(), true);
  });

  void test('multiplayer join only sends name/color console commands when they actually changed', async () => {
    const { engine, pages } = await initId1Menu();
    engine.SetCvar('_cl_name', 'Ranger');
    engine.SetCvar('_cl_color', String((3 << 4) + 5));
    const multiplayerPage = pageNamed(pages, 'multiplayer');
    const joinAction = itemAt(multiplayerPage, -1, Action);

    engine.CL.connected = true; // so action() just closes the menu instead of pushing launch_server
    multiplayerPage.onEnter(); // pre-fills name/color from the cvars above, unmodified since

    void joinAction.action();

    // Neither field changed from what onEnter pre-filled -- a regression here (e.g. always
    // sending `color` even when unchanged) would spam the console with no-op commands on every
    // join/accept, not just when the player actually edited something.
    assert.deepEqual(engine.appendedConsoleText, []);
  });

  void test('launch_server page builds its static items and lists sessions on entry', async () => {
    const { engine, pages } = await initId1Menu();
    const channel = createMockSessionsChannel([
      { sessionId: 'abc', hostname: 'UNNAMED', map: 'dm3', currentPlayers: 2, maxPlayers: 8, colo: 'sea', country: 'US', settings: {}, ping: null, pingUnreachable: false },
    ]);
    engine.Multiplayer.SubscribeSessions = channel.SubscribeSessions;

    const launchServerPage = pageNamed(pages, 'launch_server');
    launchServerPage.onEnter();

    const labels = launchServerPage.items.map((item) => item.label);
    assert.ok(labels.includes('Private Session'));
    assert.ok(labels.some((label) => label?.startsWith('dm3 near')));
  });

  void test('launch_server page re-subscribes on every entry and unsubscribes on exit', async () => {
    const { engine, pages } = await initId1Menu();
    const channel = createMockSessionsChannel([]);
    engine.Multiplayer.SubscribeSessions = channel.SubscribeSessions;

    const launchServerPage = pageNamed(pages, 'launch_server');

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

    const launchServerPage = pageNamed(pages, 'launch_server');
    launchServerPage.onEnter();

    const refreshButton = itemAt(launchServerPage, -1, Action);
    assert.equal(refreshButton.label, 'Refresh Sessions');

    void refreshButton.action();
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
    let rootPageName: string | null = null;
    engine.Menu.SetRootPage = (name) => { rootPageName = name; };

    Id1Menu.Init(asClientEngineAPI(engine), { classicFrontend: false });
    await Promise.resolve();

    assert.equal(rootPageName, null);
  });

  void test('options page still has its titlePic/logoPic and toggles cl_forwardspeed for Always Run', async () => {
    const { pages } = await initId1Menu({ classicFrontend: false });
    const optionsPage = pageNamed(pages, 'options');
    const alwaysRun = itemLabelled(optionsPage, 'Always Run', Toggle);

    assert.equal(textureName(optionsPage.titlePic), 'p_option');
    assert.equal(textureName(optionsPage.logoPic), 'qplaque');

    alwaysRun.toggle();

    assert.equal(alwaysRun.isOn(), true);
  });

  void test('keys page still has its titlePic and one KeyBindItem per bindable command', async () => {
    const { pages } = await initId1Menu({ classicFrontend: false });
    const keysPage = pageNamed(pages, 'keys');

    assert.equal(textureName(keysPage.titlePic), 'ttl_cstm');
    assert.ok(keysPage.items.length > 0);
    assert.ok(keysPage.items.some((item) => item instanceof KeyBindItem && item.command === '+attack'));
  });

  void test('host.quit-requested still opens the quit page', async () => {
    const { engine } = await initId1Menu({ classicFrontend: false });

    engine.moduleEventBus.publish('host.quit-requested');
    assert.equal(engine.Menu.IsOpen('quit'), true);
  });

  void test('host.alert still opens the alert page', async () => {
    const { engine } = await initId1Menu({ classicFrontend: false });

    engine.moduleEventBus.publish('host.alert', { title: 'Host Error', message: 'boom', severity: 'error' });
    assert.equal(engine.Menu.IsOpen('alert'), true);
  });
});
