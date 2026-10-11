import type { ClientEngineAPI, ClientEventValue, ClientGameEventMap, ServerEngineAPI, ServerGameEventMap, TypedEventBus } from '../../shared/GameInterfaces.ts';
import type Vector from '../../shared/Vector.ts';
import type { clientEvent, decals } from './Defs.ts';
import type BaseEntity from './entity/BaseEntity.ts';
import type BaseMonster from './entity/monster/BaseMonster.ts';
import type { PlayerEntity } from './entity/Player.ts';

/**
 * The events the server side of id1 publishes on `ServerEngineAPI.eventBus`, and what they carry. Everything here is
 * documented in `docs/events.md` and the two are kept equal by `test/events-docs.test.mjs`.
 *
 * The types say what is published. A listener that wants more (a `PlayerEntity` that is a Hellwave player) narrows with
 * `instanceof` instead of declaring a narrower parameter.
 */
export interface Id1ServerEvents {
  'game.monster.spawned': [monster: BaseMonster];
  'game.monster.injured': [monster: BaseEntity, attacker: BaseEntity, inflictor: BaseEntity];
  'game.monster.killed': [monster: BaseEntity, attacker: BaseEntity];
  'game.player.died': [player: PlayerEntity, attacker: BaseEntity];
  'game.secret.found': [secret: BaseEntity, finder: BaseEntity];
  'game.secret.spawned': [secret: BaseEntity];
}

/**
 * What a client event of id1 carries on `ClientEngineAPI.eventBus`, keyed by its opcode (`clientEvent`). The server
 * sends them with `BroadcastClientEvent`/`DispatchClientEvent`, the client game republishes them as
 * `client.event-received.<opcode>`.
 */
export interface Id1ClientEventArguments {
  [clientEvent.BONUS_FLASH]: [];
  [clientEvent.DAMAGE_FLASH]: [];
  [clientEvent.STATS_UPDATED]: [slot: string, value: number | string];
  [clientEvent.STATS_INIT]: [slot: string, value: number | string];
  [clientEvent.ITEM_PICKED]: [itemEntity: object | null, itemNames: string[], netname: string | null, pickupItems?: number];
  [clientEvent.WEAPON_SELECTED]: [weapon: number];
  [clientEvent.OBITUARY]: [victimEdictId: number | null, attackerEdictId: number | null, weapon: number, items: number];
  [clientEvent.INTERMISSION_START]: [message: string | null, origin: Vector, angles: Vector];
  [clientEvent.EMIT_DECAL]: [origin: Vector, normal: Vector, texture: decals];
  [clientEvent.HUD_MESSAGE]: [message: string, color: Vector, duration: number];
  [clientEvent.DAMAGE_RECEIVED]: [damageReceived: number, armorLost: number, attackOrigin: Vector];
  [clientEvent.EMIT_GIB]: [model: string, origin: Vector, velocity: Vector];
  [clientEvent.EMIT_BUBBLES]: [origin: Vector, count: number];
  [clientEvent.TEST_EVENT]: ClientEventValue[];
}

/** Compile-time check that every opcode of `clientEvent` has its arguments declared in `Id1ClientEventArguments`. */
export const everyClientEventHasArguments: [Exclude<clientEvent, keyof Id1ClientEventArguments>] extends [never] ? true : false = true;

/**
 * The topics a map of client event arguments (keyed by opcode) is published under: `client.event-received.<opcode>`.
 * A module built on id1 declares its own opcodes the same way and gets its topics with this.
 */
export type ClientEventTopics<Arguments> = {
  readonly [Opcode in keyof Arguments as `client.event-received.${Extract<Opcode, number>}`]: Arguments[Opcode];
};

/** The events of the client side of id1: its own and the client events by their topic names. */
export type Id1ClientEvents = ClientEventTopics<Id1ClientEventArguments> & {
  /** `+showscores`/`-showscores`, published by the commands registered in `Q1HUD.Init`. */
  'hud.showscores': [showScoreboard: boolean];
};

/** What id1's server code gets to publish and listen for. */
export type Id1ServerEventBus = TypedEventBus<ServerGameEventMap & Id1ServerEvents>;

/** What id1's client code gets to publish and listen for. */
export type Id1ClientEventBus = TypedEventBus<ClientGameEventMap & Id1ClientEvents>;

/** The names of the events in `Id1ServerEvents`, for the test that compares them with `docs/events.md`. */
export const id1ServerEventNames = Object.freeze([
  'game.monster.spawned',
  'game.monster.injured',
  'game.monster.killed',
  'game.player.died',
  'game.secret.found',
  'game.secret.spawned',
] as const satisfies ReadonlyArray<keyof Id1ServerEvents>);

/**
 * The server game's event bus, with the events of id1 typed. The object is the engine's: this only says what it
 * carries, so a typo in a name or a wrong payload does not compile.
 * @param engine What the server code of the game got from the engine.
 * @returns The same bus the engine API hands out.
 */
export function serverEvents(engine: ServerEngineAPI): Id1ServerEventBus {
  return engine.eventBus as unknown as Id1ServerEventBus;
}

/**
 * The client game's event bus, with the events of id1 typed. The object is the engine's: this only says what it
 * carries, so a typo in a name or a wrong payload does not compile.
 * @param engine What the client code of the game got from the engine.
 * @returns The same bus the engine API hands out.
 */
export function clientEvents(engine: ClientEngineAPI): Id1ClientEventBus {
  return engine.eventBus as unknown as Id1ClientEventBus;
}
