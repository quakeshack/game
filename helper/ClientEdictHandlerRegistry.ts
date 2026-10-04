import type { BaseClientEdictHandler } from '../../../shared/ClientEdict.ts';
import type { ServerEngineAPI } from '../../../shared/GameInterfaces.ts';

/**
 * A client edict handler that can be registered by its own classname, the client-side counterpart
 * of `EntityClass`.
 */
export type ClientEdictHandlerClass = typeof BaseClientEdictHandler & {
  readonly classname: string;
};

/**
 * Maps classnames to the client edict handlers that drive them, the client-side counterpart of
 * `EntityRegistry`. Used for client-only entities (gibs, bubbles) and for static entities a map
 * entity turns itself into (`air_bubbles`), which have no server entity class to carry their
 * handler.
 */
export default class ClientEdictHandlerRegistry {
  readonly #registry = new Map<string, ClientEdictHandlerClass>();

  constructor(listOfHandlerClasses: readonly ClientEdictHandlerClass[]) {
    for (const handlerClass of listOfHandlerClasses) {
      console.assert(!this.#registry.has(handlerClass.classname), `duplicate client edict handler classname ${handlerClass.classname}`);

      this.#registry.set(handlerClass.classname, handlerClass);
    }
  }

  has(classname: string): boolean {
    return this.#registry.has(classname);
  }

  get(classname: string): ClientEdictHandlerClass | null {
    return this.#registry.get(classname) ?? null;
  }

  getAll(): IterableIterator<ClientEdictHandlerClass> {
    return this.#registry.values();
  }

  /**
   * Lets every registered handler declare what the server has to precache for it.
   */
  precacheAll(engineAPI: ServerEngineAPI): void {
    for (const handlerClass of this.#registry.values()) {
      handlerClass._precache(engineAPI);
    }
  }
}
