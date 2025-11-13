import BaseEntity from '../entity/BaseEntity.mjs';

/** @typedef {import("../../../shared/GameInterfaces").ServerEngineAPI} ServerEngineAPI */

export default class EntityRegistry {
  /**
   * @param {typeof BaseEntity[]} listOfEntityClasses entity classes to register
   */
  constructor(listOfEntityClasses) {
    /** @type {Map<string, typeof BaseEntity>} */
    this._registry = new Map();
    for (const entityClass of listOfEntityClasses) {
      this._registry.set(entityClass.classname, entityClass);
    }
  }

  /**
   * @param {string} classname entity’s class name
   * @returns {boolean} true if the entity class is registered
   */
  has(classname) {
    return this._registry.has(classname);
  }

  /**
   * @param {string} classname entity’s class name
   * @returns {typeof BaseEntity|null} the entity class, or null if not found
   */
  get(classname) {
    return this._registry.get(classname) || null;
  }

  /** @param {ServerEngineAPI} engineAPI engine API for server game code */
  precacheAll(engineAPI) {
    for (const entityClass of this._registry.values()) {
      entityClass._precache(engineAPI);
    }
  }

  /** @param {ServerEngineAPI} engineAPI engine API for server game code */
  initializeAll(engineAPI) {
    for (const entityClass of this._registry.values()) {
      entityClass._parseModelData(engineAPI);
      entityClass._initStates();
    }
  }

  getClientEntityFields() {
    /** @type {Record<string, string[]>} */
    const clientEntityFields = {};

    for (const [classname, entityClass] of this._registry) {
      if (entityClass.clientEntityFields.length > 0) {
        clientEntityFields[classname] = entityClass.clientEntityFields;
      }
    }

    return clientEntityFields;
  }
};
