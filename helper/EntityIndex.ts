import type BaseEntity from '../entity/BaseEntity.ts';

export default class EntityIndex {
  readonly #index: Record<string, Map<string, Set<BaseEntity>>> = {};

  clear(): void {
    for (const key of Object.keys(this.#index)) {
      delete this.#index[key];
    }
  }

  reindexEntity(field: string, prev: string | null, current: string | null, entity: BaseEntity): void {
  }

  freeEntity(entity: BaseEntity): void {
  }

  findAllEntitiesByFieldAndValue(field: string, value: string): BaseEntity[] {
    return [];
  }
}

export class EntityIndexWIP { // TODO: implement properly, this is a work in progress
  readonly #index: Record<string, Map<string, Set<BaseEntity>>> = {};

  clear(): void {
    for (const key of Object.keys(this.#index)) {
      delete this.#index[key];
    }
  }

  reindexEntity(field: string, prev: string | null, current: string | null, entity: BaseEntity): void {
    if (!(field in this.#index)) {
      this.#index[field] = new Map<string, Set<BaseEntity>>();
    }

    const fieldMap = this.#index[field];

    if (prev !== null) {
      const prevSet = fieldMap.get(prev);
      if (prevSet !== undefined) {
        prevSet.delete(entity);
        if (prevSet.size === 0) {
          fieldMap.delete(prev);
        }
      }
    }

    if (!entity.edict?.free && current !== null) {
      let curSet = fieldMap.get(current);
      if (curSet === undefined) {
        curSet = new Set<BaseEntity>();
        fieldMap.set(current, curSet);
      }
      curSet.add(entity);
    }

    if (fieldMap.size === 0) {
      delete this.#index[field];
    }
  }

  freeEntity(entity: BaseEntity): void {
    for (const [field, fieldMap] of Object.entries(this.#index)) {
      for (const [value, entitySet] of fieldMap) {
        entitySet.delete(entity);
        if (entitySet.size === 0) {
          fieldMap.delete(value);
        }
      }
      if (fieldMap.size === 0) {
        delete this.#index[field];
      }
    }
  }

  findAllEntitiesByFieldAndValue(field: string, value: string): BaseEntity[] {
    const entitySet = this.#index[field]?.get(value);
    return entitySet !== undefined ? Array.from(entitySet) : [];
  }
}
