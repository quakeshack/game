import type { ServerEngineAPI } from '../../../shared/GameInterfaces.ts';

import type { EntityClass } from '../entity/BaseEntity.ts';

export default class EntityRegistry {
  readonly #registry = new Map<string, EntityClass>();

  constructor(listOfEntityClasses: readonly EntityClass[]) {
    for (const entityClass of listOfEntityClasses) {
      this.#registry.set(entityClass.classname, entityClass);
    }
  }

  has(classname: string): boolean {
    return this.#registry.has(classname);
  }

  get(classname: string): EntityClass | null {
    return this.#registry.get(classname) ?? null;
  }

  getAll(): IterableIterator<EntityClass> {
    return this.#registry.values();
  }

  precacheAll(engineAPI: ServerEngineAPI): void {
    for (const entityClass of this.#registry.values()) {
      entityClass._precache(engineAPI);
    }
  }

  initializeAll(engineAPI: ServerEngineAPI): void {
    for (const entityClass of this.#registry.values()) {
      entityClass._parseModelData(engineAPI);
      entityClass._initStates();
    }
  }

  getClientEntityFields(): Record<string, string[]> {
    const clientEntityFields: Record<string, string[]> = {};

    for (const [classname, entityClass] of this.#registry) {
      if (entityClass.clientEntityFields.length > 0) {
        clientEntityFields[classname] = entityClass.clientEntityFields;
      }
    }

    return clientEntityFields;
  }
}
