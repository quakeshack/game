import type { ClientEdict, ClientEventValue } from '../../../../shared/GameInterfaces.ts';

import Vector from '../../../../shared/Vector.ts';

type CommandHandler = (...args: string[]) => void | Promise<void>;
type CvarInput = string | number | boolean;

interface MockClientScore {
  isActive: boolean;
  frags: number;
  name: string;
  ping: number;
  colors: number;
}

interface MockCvar {
  name: string;
  string: string;
  value: number;
  set(value: CvarInput): MockCvar;
  free(): void;
}

export interface MockTexture {
  name: string;
  width: number;
  height: number;
  freed: boolean;
  lockedTextureMode: string | null;
  free(): void;
  lockTextureMode(mode: string): MockTexture;
  wrapClamped(): MockTexture;
}

export interface MockSound {
  name: string;
  playCount: number;
  play(): void;
}

export interface MockEventBus {
  subscribe(eventName: string, handler: (...args: readonly ClientEventValue[]) => void): () => void;
  publish(eventName: string, ...args: readonly ClientEventValue[]): void;
}

interface MockViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MockClientState {
  gametime: number;
  frametime: number;
  entityNum: number;
  intermission: boolean;
  intermissionState: number;
  levelname: string;
  maxclients: number;
  time: number;
  viewangles: Vector;
  vieworigin: Vector;
  score(index: number): MockClientScore;
}

interface MockScreenState {
  viewsize: number;
  viewRect: MockViewRect;
}

interface MockVideoState {
  width: number;
  height: number;
}

interface MockClientEngineOverrides extends Partial<Omit<MockClientEngine, 'VID' | 'SCR' | 'CL'>> {
  VID?: Partial<MockVideoState>;
  SCR?: Partial<Omit<MockScreenState, 'viewRect'>> & { viewRect?: Partial<MockViewRect> };
  CL?: Partial<MockClientState>;
}

interface MockClientEngineOptions {
  cvars?: Record<string, CvarInput>;
  visibleEntities?: readonly ClientEdict[];
}

export interface MockClientEngine {
  eventBus: MockEventBus;
  sounds: MockSound[];
  commands: Map<string, CommandHandler>;
  consolePrints: Array<{ message: string; color: Vector }>;
  drawPics: Array<{ x: number; y: number; pic: MockTexture; scale: number }>;
  drawRects: Array<{ x: number; y: number; width: number; height: number; color: Vector; alpha: number }>;
  drawStrings: Array<{ x: number; y: number; text: string; scale: number; color: Vector }>;
  contentShifts: Array<{ slot: number; color: Vector; alpha: number }>;
  rocketTrails: Array<{ start: Vector; end: Vector; type: number }>;
  cvarSets: Array<[string, CvarInput]>;
  appendedConsoleText: string[];
  DrawPic(x: number, y: number, pic: MockTexture, scale?: number): void;
  DrawRect(x: number, y: number, width: number, height: number, color: Vector, alpha?: number): void;
  DrawString(x: number, y: number, text: string, scale?: number, color?: Vector): void;
  LoadPicFromWad(name: string): MockTexture;
  LoadPicFromLump(name: string): MockTexture;
  LoadPicFromFile(name: string): Promise<MockTexture>;
  LoadSound(name: string): MockSound;
  RegisterCommand(name: string, handler: CommandHandler): void;
  UnregisterCommand(name: string): void;
  RegisterCvar(name: string, value: string): MockCvar;
  GetCvar(name: string): MockCvar;
  ConsoleDebug(message: string): void;
  ConsoleError(message: string): void;
  ConsolePrint(message: string, color?: Vector): void;
  ConsoleWarning(message: string): void;
  ContentShift(slot: number, color: Vector, alpha?: number): void;
  IndexToRGB(index: number): [number, number, number];
  PlaceDecal(origin: Vector, normal: Vector, texture: MockTexture): void;
  ModForName(name: string): { name: string };
  AllocDlight(entityId: number): Record<string, ClientEventValue>;
  WorldToScreen(origin: Vector): Vector | null;
  GetVisibleEntities(filter?: ((entity: ClientEdict) => boolean) | null): Generator<ClientEdict, void, void>;
  RocketTrail(start: Vector, end: Vector, type: number): void;
  AppendConsoleText(text: string): void;
  VID: MockVideoState;
  SCR: MockScreenState;
  CL: MockClientState;
  PostProcess: {
    setStack(stack: unknown): void;
    clearStack(): void;
    hasStack(): boolean;
  };
}

/**
 * Create an event bus with subscribe and publish support.
 * @returns Mock event bus.
 */
export function createEventBus(): MockEventBus {
  const listeners = new Map<string, Array<(...args: readonly ClientEventValue[]) => void>>();

  return {
    subscribe(eventName: string, handler: (...args: readonly ClientEventValue[]) => void): () => void {
      const handlers = listeners.get(eventName) ?? [];
      handlers.push(handler);
      listeners.set(eventName, handlers);

      return (): void => {
        const currentHandlers = listeners.get(eventName) ?? [];
        listeners.set(eventName, currentHandlers.filter((currentHandler) => currentHandler !== handler));
      };
    },

    publish(eventName: string, ...args: readonly ClientEventValue[]): void {
      for (const handler of listeners.get(eventName) ?? []) {
        handler(...args);
      }
    },
  };
}

/**
 * Create a mock texture with the surface expected by the client HUD and API tests.
 * @returns Mock texture.
 */
export function createMockTexture(name: string, width = 24, height = 24): MockTexture {
  return {
    name,
    width,
    height,
    freed: false,
    lockedTextureMode: null,
    free(): void {
      this.freed = true;
    },
    lockTextureMode(mode: string): MockTexture {
      this.lockedTextureMode = mode;
      return this;
    },
    wrapClamped(): MockTexture {
      return this;
    },
  };
}

/**
 * Create a mock sound object.
 * @returns Mock sound.
 */
export function createMockSound(name: string): MockSound {
  return {
    name,
    playCount: 0,
    play(): void {
      this.playCount += 1;
    },
  };
}

/**
 * Create a minimal client engine API mock for client HUD and ClientGameAPI tests.
 * @returns Mock client engine plus test trackers.
 */
export function createMockClientEngine(
  overrides: MockClientEngineOverrides = {},
  options: MockClientEngineOptions = {},
): MockClientEngine {
  const eventBus = createEventBus();
  const sounds: MockSound[] = [];
  const commands = new Map<string, CommandHandler>();
  const consolePrints: Array<{ message: string; color: Vector }> = [];
  const drawPics: Array<{ x: number; y: number; pic: MockTexture; scale: number }> = [];
  const drawRects: Array<{ x: number; y: number; width: number; height: number; color: Vector; alpha: number }> = [];
  const drawStrings: Array<{ x: number; y: number; text: string; scale: number; color: Vector }> = [];
  const contentShifts: Array<{ slot: number; color: Vector; alpha: number }> = [];
  const rocketTrails: Array<{ start: Vector; end: Vector; type: number }> = [];
  const cvarSets: Array<[string, CvarInput]> = [];
  const appendedConsoleText: string[] = [];
  const cvarValues = new Map<string, CvarInput>(Object.entries(options.cvars ?? {}));
  const cvars = new Map<string, MockCvar>();

  /**
   * Normalize a mock cvar value into its string form.
   * @returns String form of the mock cvar value.
   */
  function normalizeCvarString(value: CvarInput): string {
    return typeof value === 'string' ? value : String(value);
  }

  /**
   * Normalize a mock cvar value into its numeric form.
   * @returns Numeric form of the mock cvar value.
   */
  function normalizeCvarNumber(value: CvarInput): number {
    const numericValue = Number(value);
    return Number.isNaN(numericValue) ? 0 : numericValue;
  }

  /**
   * Return an existing mock cvar or create one with the supplied default.
   * @returns Existing or newly created mock cvar.
   */
  function getOrCreateCvar(name: string, defaultValue: CvarInput): MockCvar {
    const existingCvar = cvars.get(name);

    if (existingCvar !== undefined) {
      return existingCvar;
    }

    const initialValue = cvarValues.get(name) ?? defaultValue;
    const cvar: MockCvar = {
      name,
      string: normalizeCvarString(initialValue),
      value: normalizeCvarNumber(initialValue),
      set(value: CvarInput): MockCvar {
        this.string = normalizeCvarString(value);
        this.value = normalizeCvarNumber(value);
        cvarValues.set(name, value);
        cvarSets.push([name, value]);
        return this;
      },
      free(): void {
      },
    };

    cvars.set(name, cvar);

    return cvar;
  }

  const baseEngine: MockClientEngine = {
    eventBus,
    sounds,
    commands,
    consolePrints,
    drawPics,
    drawRects,
    drawStrings,
    contentShifts,
    rocketTrails,
    cvarSets,
    appendedConsoleText,
    DrawPic(x: number, y: number, pic: MockTexture, scale = 1.0): void {
      drawPics.push({ x, y, pic, scale });
    },
    DrawRect(x: number, y: number, width: number, height: number, color: Vector, alpha = 1.0): void {
      drawRects.push({ x, y, width, height, color, alpha });
    },
    DrawString(x: number, y: number, text: string, scale = 1.0, color = new Vector(1.0, 1.0, 1.0)): void {
      drawStrings.push({ x, y, text, scale, color });
    },
    LoadPicFromWad(name: string): MockTexture {
      return createMockTexture(name);
    },
    LoadPicFromLump(name: string): MockTexture {
      return createMockTexture(name, 64, 16);
    },
    LoadPicFromFile(name: string): Promise<MockTexture> {
      return Promise.resolve(createMockTexture(name, 320, 200));
    },
    LoadSound(name: string): MockSound {
      const sound = createMockSound(name);
      sounds.push(sound);
      return sound;
    },
    RegisterCommand(name: string, handler: CommandHandler): void {
      commands.set(name, handler);
    },
    UnregisterCommand(name: string): void {
      commands.delete(name);
    },
    RegisterCvar(name: string, value: string): MockCvar {
      return getOrCreateCvar(name, value);
    },
    GetCvar(name: string): MockCvar {
      return getOrCreateCvar(name, '0');
    },
    ConsoleDebug(_message: string): void {
    },
    ConsoleError(_message: string): void {
    },
    ConsolePrint(message: string, color = new Vector(1.0, 1.0, 1.0)): void {
      consolePrints.push({ message, color });
    },
    ConsoleWarning(_message: string): void {
    },
    ContentShift(slot: number, color: Vector, alpha = 1.0): void {
      contentShifts.push({ slot, color, alpha });
    },
    IndexToRGB(_index: number): [number, number, number] {
      return [1.0, 1.0, 1.0];
    },
    PlaceDecal(_origin: Vector, _normal: Vector, _texture: MockTexture): void {
    },
    ModForName(name: string): { name: string } {
      return { name };
    },
    AllocDlight(entityId: number): Record<string, ClientEventValue> {
      return { entityId };
    },
    WorldToScreen(origin: Vector): Vector {
      return new Vector(origin[0], origin[1], 0.0);
    },
    *GetVisibleEntities(filter: ((entity: ClientEdict) => boolean) | null = null): Generator<ClientEdict, void, void> {
      const visibleEntities = options.visibleEntities ?? [];

      for (const entity of visibleEntities) {
        if (filter === null || filter(entity)) {
          yield entity;
        }
      }
    },
    RocketTrail(start: Vector, end: Vector, type: number): void {
      rocketTrails.push({ start, end, type });
    },
    AppendConsoleText(text: string): void {
      appendedConsoleText.push(text);
    },
    PostProcess: {
      setStack(_stack: unknown): void {},
      clearStack(): void {},
      hasStack(): boolean { return false; },
    },
    VID: {
      width: 320,
      height: 200,
    },
    SCR: {
      viewsize: 100,
      viewRect: {
        x: 0,
        y: 0,
        width: 320,
        height: 200,
      },
    },
    CL: {
      gametime: 0,
      frametime: 0.1,
      entityNum: 1,
      intermission: false,
      intermissionState: 0,
      levelname: 'e1m1',
      maxclients: 1,
      time: 0,
      viewangles: new Vector(),
      vieworigin: new Vector(),
      score(): MockClientScore {
        return {
          isActive: false,
          frags: 0,
          name: '',
          ping: 0,
          colors: 0,
        };
      },
    },
  };

  return {
    ...baseEngine,
    ...overrides,
    VID: {
      ...baseEngine.VID,
      ...(overrides.VID ?? {}),
    },
    SCR: {
      ...baseEngine.SCR,
      ...(overrides.SCR ?? {}),
      viewRect: {
        ...baseEngine.SCR.viewRect,
        ...(overrides.SCR?.viewRect ?? {}),
      },
    },
    CL: {
      ...baseEngine.CL,
      ...(overrides.CL ?? {}),
    },
  };
}
