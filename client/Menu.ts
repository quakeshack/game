import type { ClientEngineAPI, HostAlertEvent, KeyBindItem, MenuPage, MenuPic, SaveSlotItem } from '../../../shared/GameInterfaces.ts';

import { K } from '../../../shared/Keys.ts';
import { ServerGameAPI } from '../GameAPI.ts';

const MAX_SAVEGAMES = 12;

const bindnames: [string, string][] = [
  ['+attack', 'attack'],
  ['impulse 10', 'change weapon'],
  ['+jump', 'jump / swim up'],
  ['+forward', 'walk forward'],
  ['+back', 'backpedal'],
  ['+left', 'turn left'],
  ['+right', 'turn right'],
  ['+speed', 'run'],
  ['+moveleft', 'step left'],
  ['+moveright', 'step right'],
  ['+strafe', 'sidestep'],
  ['+lookup', 'look up'],
  ['+lookdown', 'look down'],
  ['centerview', 'center view'],
  ['+mlook', 'mouse look'],
  ['+klook', 'keyboard look'],
  ['+moveup', 'swim up'],
  ['+movedown', 'swim down'],
];

type QuitMessage = [string, string, string, string];

const quitMessage: QuitMessage[] = [
  ['  Are you gonna quit', '  this game just like', '   everything else?', ''],
  [' Milord, methinks that', '   thou art a lowly', ' quitter. Is this true?', ''],
  [' Do I need to bust your', '  face open for trying', '        to quit?', ''],
  [' Man, I oughta smack you', '   for trying to quit!', '     Press Y to get', '      smacked out.'],
  [' Press Y to quit like a', '   big loser in life.', '  Press N to stay proud', '    and successful!'],
  ['   If you press Y to', '  quit, I will summon', '  Satan all over your', '      hard drive!'],
  ['  Um, Asmodeus dislikes', ' his children trying to', ' quit. Press Y to return', '   to your Tinkertoys.'],
  ['  If you quit now, I\'ll', '  throw a blanket-party', '   for you next time!', ''],
];

interface MenuPics {
  qplaque: MenuPic;
  p_option: MenuPic;
  ttl_cstm: MenuPic;
  // Only loaded when `classicFrontend` is enabled (see `Id1MenuOptions`) -- read with `!` inside
  // the classic-only page builders, which only ever run alongside the load below.
  ttl_main?: MenuPic;
  mainmenu?: MenuPic;
  ttl_sgl?: MenuPic;
  sp_menu?: MenuPic;
  p_load?: MenuPic;
  p_save?: MenuPic;
  p_multi?: MenuPic;
  bigbox?: MenuPic;
  menuplyr?: MenuPic;
  help_pages?: MenuPic[];
}

/**
 * Options for `Id1Menu.Init`.
 */
export interface Id1MenuOptions {
  /**
   * Whether to build id1's classic single-player front end (main/singleplayer/load/save/
   * multiplayer/launch_server/help pages, and the pics/sound only they use). Total-conversion
   * mods that replace the main menu (e.g. hellwave) should pass `false` -- they still get the
   * shared options/keys/quit/alert pages, which every mod needs.
   */
  readonly classicFrontend?: boolean;
}

let pics: MenuPics = null!;
let sfxMenu2: ReturnType<ClientEngineAPI['LoadSound']> = null!;

// Mutable state for the alert dialog -- updated by the `host.alert` subscriber, read by the
// page's customDraw/customGetBackButtonAnchor. Composition (no subclassing) means this can't
// live as fields on a custom MenuPage subclass, so it's module-level instead, matching the
// pattern hellwave's HUD.ts buy menu already uses for per-frame mutable label state.
let currentAlert = { title: '', message: '' };

/**
 * id1's default menu tree -- the classic Quake screens (main, singleplayer, load/save,
 * multiplayer, options, keys, help, quit, alert), ported from the engine's built-in
 * implementation to game code so the engine no longer has any opinion on menu content. Built
 * entirely through `ClientEngineAPI.Menu`'s composition hooks (`customDraw`/`customHandleInput`/
 * `customGetBackButtonAnchor`) rather than subclassing, since game code never imports engine
 * internals directly and can't extend `MenuPage`/`Textbox` the way the old engine code did.
 */
export default class Id1Menu {
  static #loadSlotItems: SaveSlotItem[] = [];
  static #saveSlotItems: SaveSlotItem[] = [];

  static Init(engineAPI: ClientEngineAPI, options: Id1MenuOptions = {}): void {
    const { classicFrontend = true } = options;
    const { Menu } = engineAPI;

    pics = {
      qplaque: engineAPI.LoadPicFromLump('qplaque'),
      p_option: engineAPI.LoadPicFromLump('p_option'),
      ttl_cstm: engineAPI.LoadPicFromLump('ttl_cstm'),
    };

    if (classicFrontend) {
      pics.ttl_main = engineAPI.LoadPicFromLump('ttl_main');
      pics.mainmenu = engineAPI.LoadPicFromLump('mainmenu');
      pics.ttl_sgl = engineAPI.LoadPicFromLump('ttl_sgl');
      pics.sp_menu = engineAPI.LoadPicFromLump('sp_menu');
      pics.p_load = engineAPI.LoadPicFromLump('p_load');
      pics.p_save = engineAPI.LoadPicFromLump('p_save');
      pics.p_multi = engineAPI.LoadPicFromLump('p_multi');
      pics.bigbox = engineAPI.LoadPicFromLump('bigbox');
      pics.menuplyr = engineAPI.LoadPicFromLump('menuplyr');
      pics.help_pages = ['help0', 'help1', 'help2', 'help3', 'help4', 'help5'].map((name) => engineAPI.LoadPicFromLump(name));

      // The player-color translate texture needs the raw LMP bytes parsed first, so it can't be
      // ready synchronously like the deferred pic above -- populated a little later, well before
      // the multiplayer setup screen (the only page that uses it) is reachable.
      Menu.LoadTranslatablePic('menuplyr').then((pic) => {
        pics.menuplyr = pic;
      }).catch((error: Error) => {
        engineAPI.ConsoleError(`failed to load menuplyr translate texture: ${error.message}\n`);
      });

      sfxMenu2 = engineAPI.LoadSound('misc/menu2.wav');

      Id1Menu.#buildMainPage(engineAPI);
      Id1Menu.#buildSinglePlayerPage(engineAPI);
      Id1Menu.#buildLoadSavePages(engineAPI);
      Id1Menu.#buildMultiplayerPage(engineAPI);
      Id1Menu.#buildLaunchServerPage(engineAPI);
      Id1Menu.#buildHelpPage(engineAPI);
    }

    Id1Menu.#buildOptionsPage(engineAPI);
    Id1Menu.#buildKeysPage(engineAPI);
    Id1Menu.#buildQuitPage(engineAPI);
    Id1Menu.#buildAlertPage(engineAPI);

    if (classicFrontend) {
      Menu.SetRootPage('main');
    }

    // Host.EndGame/Host.Error report faults via the event bus (see docs/events.md#host)
    // instead of calling into the menu system directly -- id1 decides how to present them.
    engineAPI.eventBus.subscribe('host.alert', (event: HostAlertEvent): void => {
      if (Menu.IsOpen('alert')) {
        return;
      }

      currentAlert = { title: event.title, message: event.message };
      Menu.Open('alert');
    });

    // The `quit` command asks for confirmation this way rather than calling into the menu
    // system directly -- see docs/events.md#host.
    engineAPI.eventBus.subscribe('host.quit-requested', (): void => {
      if (!Menu.IsOpen('quit')) {
        Menu.Open('quit');
      }
    });
  }

  static #buildMainPage(engineAPI: ClientEngineAPI): void {
    const { Menu } = engineAPI;
    const { Action, MenuPage: MenuPageClass, ImageBasedLayout } = Menu;

    const mainPage = new MenuPageClass({
      logoPic: pics.qplaque,
      titlePic: pics.ttl_main,
      layout: new ImageBasedLayout({ backgroundPic: pics.mainmenu }),
      items: [
        new Action({ action: () => { Menu.Push('singleplayer'); } }),
        new Action({ action: () => { Menu.Push('multiplayer'); } }),
        new Action({ action: () => { Menu.Push('options'); } }),
        new Action({ action: () => { Menu.Push('help'); } }),
        new Action({ action: () => { Menu.Push('quit'); } }),
      ],
      onEscape: () => { Menu.Close(); },
    });

    Menu.RegisterPage('main', mainPage);
  }

  static #buildSinglePlayerPage(engineAPI: ClientEngineAPI): void {
    const { Menu } = engineAPI;
    const { Action, MenuPage: MenuPageClass, ImageBasedLayout } = Menu;

    const singlePlayerPage = new MenuPageClass({
      logoPic: pics.qplaque,
      titlePic: pics.ttl_sgl,
      layout: new ImageBasedLayout({ backgroundPic: pics.sp_menu }),
      items: [
        new Action({
          action: () => {
            if (engineAPI.SV.active) {
              engineAPI.AppendConsoleText('disconnect\n');
            }
            Menu.ForceClose();
            Menu.StartSingleplayerGame();
          },
        }),
        new Action({ action: () => { Menu.Push('load'); } }),
        new Action({
          action: () => {
            if (!engineAPI.SV.active || engineAPI.CL.intermission || engineAPI.CL.maxclients !== 1) {
              return;
            }
            Menu.Push('save');
          },
        }),
      ],
      onEscape: () => { Menu.Pop(); },
    });

    Menu.RegisterPage('singleplayer', singlePlayerPage);
  }

  static #scanSaves(engineAPI: ClientEngineAPI): void {
    for (const slot of engineAPI.SaveSlots.List(MAX_SAVEGAMES)) {
      const loadItem = Id1Menu.#loadSlotItems[slot.index];
      const saveItem = Id1Menu.#saveSlotItems[slot.index];

      loadItem.label = slot.label;
      loadItem.enabled = slot.hasData;
      loadItem.canDelete = slot.hasData;
      saveItem.label = slot.label;
      saveItem.canDelete = slot.hasData;
    }
  }

  static #buildLoadSavePages(engineAPI: ClientEngineAPI): void {
    const { Menu } = engineAPI;
    const { SaveSlotItem: SaveSlotItemClass, ListPage, ListLayout } = Menu;

    Id1Menu.#loadSlotItems = Array.from({ length: MAX_SAVEGAMES }, (_, index) => new SaveSlotItemClass({
      label: 'Empty slot',
      onActivate: () => {
        engineAPI.PlaySound(sfxMenu2);
        if (!Id1Menu.#loadSlotItems[index].enabled) {
          return;
        }
        Menu.Close();
        engineAPI.AppendConsoleText(`load s${index}\n`);
      },
      onDelete: () => {
        if (!confirm('Delete selected game?')) {
          return;
        }
        engineAPI.SaveSlots.Delete(index);
        Id1Menu.#scanSaves(engineAPI);
      },
    }));

    const loadPage = new ListPage({
      titlePic: pics.p_load,
      layout: new ListLayout(),
      items: Id1Menu.#loadSlotItems,
      onEscape: () => { Menu.Pop(); },
      onEnter: () => { Id1Menu.#scanSaves(engineAPI); },
    });

    Id1Menu.#saveSlotItems = Array.from({ length: MAX_SAVEGAMES }, (_, index) => new SaveSlotItemClass({
      label: 'Empty slot',
      onActivate: () => {
        Menu.Close();
        engineAPI.AppendConsoleText(`save s${index}\n`);
      },
      onDelete: () => {
        if (!confirm('Delete selected game?')) {
          return;
        }
        engineAPI.SaveSlots.Delete(index);
        Id1Menu.#scanSaves(engineAPI);
      },
    }));

    const savePage = new ListPage({
      titlePic: pics.p_save,
      layout: new ListLayout(),
      items: Id1Menu.#saveSlotItems,
      onEscape: () => { Menu.Pop(); },
      onEnter: () => { Id1Menu.#scanSaves(engineAPI); },
    });

    Menu.RegisterPage('load', loadPage);
    Menu.RegisterPage('save', savePage);
  }

  static #buildMultiplayerPage(engineAPI: ClientEngineAPI): void {
    const { Menu } = engineAPI;
    const { Action, ColorPicker, MenuPage: MenuPageClass, Textbox, VerticalLayout } = Menu;

    let top = 0;
    let bottom = 0;
    let oldTop = 0;
    let oldBottom = 0;

    const nameTextbox = new Textbox({
      label: 'Your name',
      width: 16,
      maxLength: 14,
      heightOverride: 24,
      // Matches the original multiplayer screen's layout: label on the left, input box in a
      // fixed column to the right (rather than stacked below the label), so it doesn't compete
      // for horizontal space with the player skin preview next to it.
      customDraw: (textbox, x, y) => {
        if (!textbox.visible) {
          return;
        }

        const boxX = 160;
        Menu.Print(x, y, textbox.label);
        Menu.DrawTextBox(boxX, y - 8, textbox.width, 1);
        Menu.PrintWhite(boxX + 8, y, textbox.getValue());

        const glyph = textbox.getCursorGlyph();
        if (glyph !== null) {
          Menu.DrawCharacter(boxX + 8 + textbox.cursorPos * 8, y, glyph);
        }
      },
    });

    const joinAction = new Action({ label: 'Join Game' });

    const multiplayerSetupPage = new MenuPageClass({
      logoPic: pics.qplaque,
      titlePic: pics.p_multi,
      layout: new VerticalLayout({ startY: 48, spacing: 0, labelX: 64, cursorX: 56 }),
      items: [
        nameTextbox,
        new ColorPicker({
          label: 'Shirt color',
          heightOverride: 24,
          getValue: () => top,
          setValue: (value) => { top = value; },
        }),
        new ColorPicker({
          label: 'Pants color',
          heightOverride: 36,
          getValue: () => bottom,
          setValue: (value) => { bottom = value; },
        }),
        joinAction,
      ],
      onEscape: () => { Menu.Pop(); },
      onEnter: () => {
        nameTextbox.value = engineAPI.GetCvar('_cl_name')?.string ?? '';
        const color = engineAPI.GetCvar('_cl_color')?.value ?? 0;
        top = oldTop = color >> 4;
        bottom = oldBottom = color & 15;
        joinAction.label = engineAPI.CL.connected ? 'Accept Changes' : 'Join Game';
      },
      customDraw: (page) => {
        page.layout?.draw(page.items, page.cursor);

        Menu.DrawPic(160, 56, pics.bigbox!);
        Menu.DrawPicTranslate(
          172, 64, pics.menuplyr!,
          (top << 4) + (top >= 8 ? 4 : 11),
          (bottom << 4) + (bottom >= 8 ? 4 : 11),
        );
      },
    });

    joinAction.action = () => {
      if ((engineAPI.GetCvar('_cl_name')?.string ?? '') !== nameTextbox.getValue()) {
        engineAPI.AppendConsoleText(`name "${nameTextbox.getValue()}"\n`);
      }

      if (top !== oldTop || bottom !== oldBottom) {
        oldTop = top;
        oldBottom = bottom;
        engineAPI.AppendConsoleText(`color ${top} ${bottom}\n`);
      }

      if (!engineAPI.CL.connected) {
        Menu.Push('launch_server');
        return;
      }

      Menu.Close();
    };

    Menu.RegisterPage('multiplayer', multiplayerSetupPage);
  }

  static #buildLaunchServerPage(engineAPI: ClientEngineAPI): void {
    const { Menu } = engineAPI;
    const { Action, Label, Spacer, Toggle, MenuPage: MenuPageClass, VerticalLayout } = Menu;

    let staticItemCount = 0;

    const addRefreshSessionsButton = (page: MenuPage): void => {
      page.items.push(new Spacer());
      page.items.push(new Action({
        label: 'Refresh Sessions',
        action: async () => { await refreshSessions(page); },
      }));
    };

    const refreshSessions = async (page: MenuPage): Promise<void> => {
      if (page.items.length > staticItemCount) {
        page.items.length = staticItemCount;
      }

      page.items.push(new Label({ label: 'Finding sessions...' }));

      try {
        const sessions = await engineAPI.Multiplayer.ListSessions();

        // `page` is always the same `launchServerPage` instance -- there's no concurrent call
        // this could race with.
        // eslint-disable-next-line require-atomic-updates
        page.items.length = staticItemCount;
        page.items.push(new Spacer());
        page.items.push(new Label({ label: 'Online Sessions:' }));

        if (sessions.length === 0) {
          page.items.push(new Label({ label: 'No sessions found.' }));
          addRefreshSessionsButton(page);
          return;
        }

        for (const session of sessions) {
          const players = `${session.currentPlayers}/${session.maxPlayers}`;

          page.items.push(new Action({
            label: `${session.map} near ${[session.colo, session.country].filter(Boolean).join(', ')} [${players}]`,
            action: () => {
              Menu.Close();
              engineAPI.AppendConsoleText(`connect webrtc://${session.sessionId}\n`);
            },
          }));
        }

        addRefreshSessionsButton(page);
      } catch (error: unknown) {
        const lastItem = page.items[page.items.length - 1];
        if (lastItem && lastItem.label === 'Finding sessions...') {
          page.items.length = staticItemCount + 1;
        }
        page.items.push(new Label({ label: 'Unable to fetch sessions' }));
        addRefreshSessionsButton(page);
        console.error('Failed to fetch sessions:', error);
      }
    };

    const launchServerPage: MenuPage = new MenuPageClass({
      layout: new VerticalLayout({ startY: 40, spacing: 8, labelX: 48, cursorX: 32 }),
      onEnter: () => {
        if (staticItemCount > 0) {
          return;
        }

        launchServerPage.items.push(new Label({ label: 'Start Game:' }));

        launchServerPage.items.push(new Toggle({
          label: 'Private Session',
          cvar: 'sv_public',
          onValue: 0,
          offValue: 1,
          onLabel: 'yes',
          offLabel: 'no',
        }));

        const serverActions = ServerGameAPI.GetStartServerList();
        for (const serverAction of serverActions ?? []) {
          launchServerPage.items.push(new Action({
            label: serverAction.label,
            action: () => {
              Menu.Close();
              serverAction.callback(engineAPI);
            },
          }));
        }

        launchServerPage.items.push(new Spacer());

        staticItemCount = launchServerPage.items.length;

        void refreshSessions(launchServerPage);
      },
      onEscape: () => { Menu.Close(); },
    });

    Menu.RegisterPage('launch_server', launchServerPage);
  }

  static #buildOptionsPage(engineAPI: ClientEngineAPI): void {
    const { Menu } = engineAPI;
    const { Action, Slider, Toggle, MenuPage: MenuPageClass, VerticalLayout } = Menu;

    const optionsPage = new MenuPageClass({
      logoPic: pics.qplaque,
      titlePic: pics.p_option,
      layout: new VerticalLayout({ startY: 32, spacing: 0, valueX: 220, cursorX: 200 }),
      items: [
        new Action({ label: 'Customize controls', action: () => { Menu.Push('keys'); } }),
        new Action({
          label: 'Go to console',
          action: () => {
            Menu.Close();
            Menu.ToggleConsole();
          },
        }),
        new Action({ label: 'Reset to defaults', action: () => { engineAPI.AppendConsoleText('exec default.cfg\n'); } }),
        new Slider({ label: 'Screen size', cvar: 'viewsize', min: 30, max: 120, step: 10 }),
        new Slider({ label: 'Brightness', cvar: 'gamma', min: 0.5, max: 1.0, step: 0.05, invert: true }),
        new Slider({ label: 'Mouse Speed', cvar: 'sensitivity', min: 1, max: 11, step: 0.5 }),
        new Slider({ label: 'CD Music Volume', cvar: 'bgmvolume', min: 0, max: 1, step: 0.1 }),
        new Slider({ label: 'Sound Volume', cvar: 'volume', min: 0, max: 1, step: 0.1 }),
        new Toggle({
          label: 'Always Run',
          getValue: () => ((engineAPI.GetCvar('cl_forwardspeed')?.value ?? 0) > 200.0 ? 1 : 0),
          setValue: (value) => {
            const speed = value ? '400' : '200';
            engineAPI.SetCvar('cl_forwardspeed', speed);
            engineAPI.SetCvar('cl_backspeed', speed);
          },
        }),
        new Toggle({
          label: 'Invert Mouse',
          getValue: () => ((engineAPI.GetCvar('m_pitch')?.value ?? 0) < 0.0 ? 1 : 0),
          setValue: () => {
            const current = engineAPI.GetCvar('m_pitch')?.value ?? 0;
            engineAPI.SetCvar('m_pitch', String(-current));
          },
        }),
        new Toggle({ label: 'Lookspring', cvar: 'lookspring' }),
        new Toggle({ label: 'Lookstrafe', cvar: 'lookstrafe' }),
      ],
      onEscape: () => { Menu.Pop(); },
    });

    Menu.RegisterPage('options', optionsPage);
  }

  static #buildKeysPage(engineAPI: ClientEngineAPI): void {
    const { Menu } = engineAPI;
    const { KeyBindItem: KeyBindItemClass, MenuPage: MenuPageClass, VerticalLayout } = Menu;

    const keysPage = new MenuPageClass({
      titlePic: pics.ttl_cstm,
      layout: new VerticalLayout({ startY: 48, spacing: 0, labelX: 16, showCursor: false }),
      items: bindnames.map(([command, label]) => new KeyBindItemClass({ label, command })),
      onEscape: () => { Menu.Pop(); },
      customDraw: (page) => {
        page.layout?.draw(page.items, page.cursor);

        const focused = page.items[page.cursor] as KeyBindItem | undefined;
        const capturing = focused instanceof KeyBindItemClass && focused.capturing;

        if (capturing) {
          Menu.Print(12, 32, 'Press a key or button for this action');
        } else {
          Menu.Print(18, 32, 'Enter to change, backspace to clear');
        }
      },
    });

    Menu.RegisterPage('keys', keysPage);
  }

  static #buildHelpPage(engineAPI: ClientEngineAPI): void {
    const { Menu } = engineAPI;
    const { MenuPage: MenuPageClass } = Menu;

    // Only called when classicFrontend is enabled, alongside the pics.help_pages load in Init.
    const helpPages = pics.help_pages!;

    let pageIndex = 0;

    const helpPage = new MenuPageClass({
      onEscape: () => { Menu.Pop(); },
      onEnter: () => { pageIndex = 0; },
      customDraw: () => {
        Menu.DrawPic(0, 0, helpPages[pageIndex]);
      },
      customHandleInput: (key, _page, defaultHandleInput) => {
        if (key === K.UPARROW || key === K.RIGHTARROW) {
          engineAPI.PlaySound(sfxMenu2);
          pageIndex = (pageIndex + 1) % helpPages.length;
          return true;
        }

        if (key === K.DOWNARROW || key === K.LEFTARROW) {
          engineAPI.PlaySound(sfxMenu2);
          pageIndex = (pageIndex - 1 + helpPages.length) % helpPages.length;
          return true;
        }

        return defaultHandleInput(key);
      },
    });

    Menu.RegisterPage('help', helpPage);
  }

  static #buildQuitPage(engineAPI: ClientEngineAPI): void {
    const { Menu } = engineAPI;
    const { DialogPage } = Menu;

    const boxX = 56;
    const boxY = 76;
    const boxWidth = 24; // in DrawTextBox's content-width units (8px each)
    const boxLines = 5; // 4 flavor-text lines + 1 Yes/No prompt row
    const promptY = 116;
    const yesX = 88;
    const noX = 168;

    let messageIndex = 0;

    const isOverPrompt = (x: number, label: string): boolean => Menu.mouseX >= x && Menu.mouseX < x + label.length * 8
      && Menu.mouseY >= promptY && Menu.mouseY < promptY + 8;

    const drawPrompt = (x: number, label: string): void => {
      if (isOverPrompt(x, label)) {
        Menu.PrintWhite(x, promptY, label);
      } else {
        Menu.Print(x, promptY, label);
      }
    };

    const confirmQuit = (): void => {
      // The player already confirmed via this dialog -- skip the `quit` command's own
      // confirmation gate.
      Menu.ForceQuit();
    };

    const quitPage = new DialogPage({
      onEscape: () => { Menu.Pop(); },
      onEnter: () => { messageIndex = Math.floor(Math.random() * quitMessage.length); },
      getBackdrop: () => Menu.GetPreviousPage(),
      customDraw: () => {
        const message = quitMessage[messageIndex];
        Menu.DrawTextBox(boxX, boxY, boxWidth, boxLines);
        Menu.Print(64, 84, message[0]);
        Menu.Print(64, 92, message[1]);
        Menu.Print(64, 100, message[2]);
        Menu.Print(64, 108, message[3]);
        drawPrompt(yesX, 'Yes');
        drawPrompt(noX, 'No');
      },
      customGetBackButtonAnchor: () => {
        const totalWidth = 16 + boxWidth * 8;
        const boxBottom = boxY + (boxLines + 2) * 8;
        return { centerX: boxX + totalWidth / 2, y: boxBottom + 8 };
      },
      customHandleInput: (key, _page, defaultHandleInput) => {
        if (key === 110 as K) { // 'n'
          Menu.Pop();
          return true;
        }

        if (key === 121 as K) { // 'y'
          confirmQuit();
          return true;
        }

        if (key === K.MOUSE1 && isOverPrompt(yesX, 'Yes')) {
          confirmQuit();
          return true;
        }

        if (key === K.MOUSE1 && isOverPrompt(noX, 'No')) {
          Menu.Pop();
          return true;
        }

        return defaultHandleInput(key);
      },
    });

    Menu.RegisterPage('quit', quitPage);
  }

  static #buildAlertPage(engineAPI: ClientEngineAPI): void {
    const { Menu } = engineAPI;
    const { MenuPage: MenuPageClass } = Menu;

    const boxY = 52;
    const boxWidth = 64; // in DrawTextBox's content-width units (8px each)

    const computeBoxMetrics = (): { x: number; totalLines: number; lines: Array<string | null> } => {
      const titleLines = currentAlert.title ? currentAlert.title.split('\n') : [];
      const messageLines = currentAlert.message ? currentAlert.message.split('\n') : [];

      const lines: Array<string | null> = [];
      if (titleLines.length) {
        lines.push(...titleLines);
        lines.push(`\x1d${'\x1e'.repeat(60)}\x1f`);
      }

      lines.push(null);

      if (messageLines.length) {
        lines.push(...messageLines);
      }

      lines.push(null);
      lines.push('Press enter to continue.');

      const totalLines = lines.length;
      const x = (320 - boxWidth * 8) / 2;

      return { x, totalLines, lines };
    };

    const alertPage = new MenuPageClass({
      onEscape: () => { Menu.Close(); },
      onConfirm: () => { Menu.Close(); },
      customDraw: () => {
        const { x, totalLines, lines } = computeBoxMetrics();

        Menu.DrawTextBox(x, boxY, boxWidth, totalLines + 2);

        for (let i = 0, y = 68; i < totalLines; i++, y += 8) {
          if (lines[i]) {
            // Limit each line to 62 characters for safe drawing.
            Menu.PrintWhite(x + 16, y, lines[i]!.substring(0, 62));
          }
        }
      },
      customGetBackButtonAnchor: () => {
        const { x, totalLines } = computeBoxMetrics();
        const totalWidth = 16 + boxWidth * 8;
        const boxBottom = boxY + (totalLines + 2 + 2) * 8;
        return { centerX: x + totalWidth / 2, y: boxBottom + 8 };
      },
    });

    Menu.RegisterPage('alert', alertPage);
  }
}
