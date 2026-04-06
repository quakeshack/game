/* eslint-disable jsdoc/require-returns */

import type BaseEntity from '../entity/BaseEntity.ts';
import type { ServerGameAPI } from '../GameAPI.ts';

import { SerializableEntity, type ServerEngineAPI } from '../../../shared/GameInterfaces.ts';
import Vector from '../../../shared/Vector.ts';

interface SerializableFieldsConstructor {
  readonly serializableFields?: readonly string[];
}

// ——————————————————————————————————————————
// Serialization Decorators
// ——————————————————————————————————————————

/**
 * Accumulator filled by @serializable field decorators during class definition.
 * Flushed by the @entity class decorator into the class's static serializableFields.
 */
let pendingSerializableFields: string[] = [];

/**
 * TC39 field decorator that marks a class field as serializable.
 * Must be used together with @entity on the enclosing class.
 */
export function serializable(_value: undefined, context: ClassFieldDecoratorContext): void {
  pendingSerializableFields.push(String(context.name));
}

/**
 * TC39 class decorator that finalizes @serializable field registration.
 * Collects all pending field names and freezes them into a static
 * serializableFields array on the class, compatible with the existing
 * collectSerializableFields() prototype-chain walk.
 */
export function entity<T extends abstract new (...args: never[]) => object>(
  target: T,
  _context: ClassDecoratorContext,
): T {
  const ownSerializableFields = Object.hasOwn(target, 'serializableFields')
    ? ((Object.getOwnPropertyDescriptor(target, 'serializableFields')?.value as readonly string[] | undefined) ?? [])
    : [];

  Object.defineProperty(target, 'serializableFields', {
    value: Object.freeze([...ownSerializableFields, ...pendingSerializableFields]),
    writable: false,
    enumerable: true,
    configurable: false,
  });
  pendingSerializableFields = [];
  return target;
}

type SerializablePrimitive = string | number | boolean | null;
type SerializableRecord = Record<string, SerializedToken>;
type SerializedSkip = ['X'];
type SerializedPrimitiveValue = ['P', SerializablePrimitive];
type SerializedInfinity = ['I', number];
type SerializedArray = ['A', SerializedToken[]];
type SerializedEdictReference = ['E', number | null];
type SerializedFunction = ['F', string];
type SerializedSerializable = ['S', SerializableRecord];
type SerializedVector = ['V', ...number[]];
type SerializedToken =
  | SerializedArray
  | SerializedEdictReference
  | SerializedFunction
  | SerializedInfinity
  | SerializedPrimitiveValue
  | SerializedSerializable
  | SerializedSkip
  | SerializedVector;

type SerializableContainer = Record<string, unknown> & {
  _serializer?: Serializer<object>;
};

export type { SerializableRecord, SerializedToken };

/**
 * Collect serializable fields declared across the constructor chain.
 */
function collectSerializableFields(instance: object): string[] {
  const constructors: SerializableFieldsConstructor[] = [];
  let currentConstructor = instance.constructor as SerializableFieldsConstructor | null;

  while (currentConstructor !== null && currentConstructor !== Function.prototype) {
    constructors.push(currentConstructor);
    currentConstructor = Object.getPrototypeOf(currentConstructor) as SerializableFieldsConstructor | null;
  }

  const fieldNames: string[] = [];
  constructors.reverse();

  for (const constructorValue of constructors) {
    for (const fieldName of constructorValue.serializableFields ?? []) {
      if (!fieldNames.includes(fieldName)) {
        fieldNames.push(fieldName);
      }
    }
  }

  return fieldNames;
}

/**
 * Return whether a value carries a nested serializer.
 */
function isSerializableContainer(value: unknown): value is SerializableContainer {
  return value !== null
    && typeof value === 'object'
    && '_serializer' in value
    && (value as SerializableContainer)._serializer instanceof Serializer;
}

/**
 * Return whether a value looks like an edict-backed entity reference.
 */
function isEntityReference(value: unknown): value is { readonly edictId: number | undefined } {
  return value !== null
    && typeof value === 'object'
    && 'edictId' in value;
}

/**
 * Ported directly from QuakeC (weapons.qc/crandom).
 */
export function crandom(): number {
  return 2.0 * (Math.random() - 0.5);
}

/**
 * Helper class to deal with flags stored in bits.
 * @deprecated Please do not use.
 */
export class Flag<EnumMap extends Record<string, number>> {
  readonly #enum: EnumMap;
  readonly #nullValue: string | null;
  #value = 0;

  constructor(enumMap: EnumMap, ...values: number[]) {
    this.#enum = enumMap;

    const nullValue = Object.entries(this.#enum).find(([, flag]) => flag === 0);
    this.#nullValue = nullValue ? nullValue[0] : null;

    this.set(...values);
  }

  toString(): string {
    if (this.#value === 0 && this.#nullValue !== null) {
      return this.#nullValue;
    }

    return Object.entries(this.#enum)
      .filter(([, flag]) => (flag > 0 && (this.#value & flag) === flag))
      .map(([name]) => name)
      .join(', ');
  }

  has(...flags: number[]): boolean {
    for (const flag of flags) {
      if ((this.#value & flag) === flag) {
        return true;
      }
    }

    return false;
  }

  set(...flags: number[]): this {
    const values = Object.values(this.#enum).reduce((previous, current) => previous + current, 0);

    for (const flag of flags) {
      if ((values & flag) !== flag) {
        throw new TypeError(`Unknown flag(s) ${flag}`);
      }

      this.#value |= flag;
    }

    return this;
  }

  unset(...flags: number[]): this {
    for (const flag of flags) {
      this.#value &= ~flag;
    }

    return this;
  }

  reset(): this {
    this.#value = 0;
    return this;
  }
}

/**
 * Shared wrapper for lightweight entity helper objects.
 */
export class EntityWrapper<T extends BaseEntity = BaseEntity> {
  readonly #entityReference: WeakRef<T>;

  constructor(entity: T) {
    this.#entityReference = new WeakRef(entity);
    this._assertEntity();
  }

  protected get _entity(): T {
    const entity = this.#entityReference.deref();
    console.assert(entity !== undefined, 'EntityWrapper requires a live entity');
    return entity!;
  }

  protected get _game(): ServerGameAPI {
    return this._entity.game;
  }

  protected get _engine(): ServerEngineAPI {
    return this._entity.engine;
  }

  protected _assertEntity(): void {
  }
}

/**
 * Serializes and deserializes game state objects.
 * It still supports the legacy startFields/endFields workflow for JS callers,
 * but TS classes can declare static serializableFields instead.
 */
export class Serializer<T extends object> {
  static readonly TYPE_SKIPPED = 'X';
  static readonly TYPE_PRIMITIVE = 'P';
  static readonly TYPE_INFINITY = 'I';
  static readonly TYPE_ARRAY = 'A';
  static readonly TYPE_EDICT = 'E';
  static readonly TYPE_FUNCTION = 'F';
  static readonly TYPE_SERIALIZABLE = 'S';
  static readonly TYPE_VECTOR = 'V';

  readonly #objectReference: WeakRef<T>;
  readonly #engineReference: WeakRef<ServerEngineAPI> | null;
  #serializableFields: string[];
  #markerStart: string[] | null = null;

  constructor(object: T, engine: ServerEngineAPI | null) {
    this.#objectReference = new WeakRef(object);
    this.#engineReference = engine ? new WeakRef(engine) : null;
    this.#serializableFields = collectSerializableFields(object);
  }

  #getObject(): T {
    const object = this.#objectReference.deref();
    console.assert(object !== undefined, 'Serializer requires a live object');
    return object!;
  }

  #getEngine(): ServerEngineAPI | null {
    if (this.#engineReference === null) {
      return null;
    }

    return this.#engineReference.deref() ?? null;
  }

  #setSerializableFields(fields: readonly string[]): void {
    this.#serializableFields = [...fields];
  }

  #serializeValue(value: unknown): SerializedToken {
    switch (true) {
      case value === undefined:
        return [Serializer.TYPE_SKIPPED];

      case value === Infinity:
        return [Serializer.TYPE_INFINITY, 1];

      case value === -Infinity:
        return [Serializer.TYPE_INFINITY, -1];

      case typeof value === 'string':
      case typeof value === 'boolean':
      case typeof value === 'number':
      case value === null:
        return [Serializer.TYPE_PRIMITIVE, value as SerializablePrimitive];

      case typeof value === 'function':
        return [Serializer.TYPE_FUNCTION, value.toString()];

      case value instanceof Vector:
        return [Serializer.TYPE_VECTOR, ...value];

      case Array.isArray(value):
        return [Serializer.TYPE_ARRAY, value.map((item) => this.#serializeValue(item))];

      case isEntityReference(value):
        return [Serializer.TYPE_EDICT, value.edictId ?? null];

      case value instanceof SerializableEntity:
        return [Serializer.TYPE_SERIALIZABLE, value.serialize() as unknown as SerializableRecord];

      case isSerializableContainer(value):
        return [Serializer.TYPE_SERIALIZABLE, value._serializer!.serialize()];
    }

    throw new TypeError(`Unknown type for serialization: ${typeof value}`);
  }

  #deserializeValue(value: SerializedToken): unknown {
    switch (value[0]) {
      case Serializer.TYPE_INFINITY:
        return value[1] * Infinity;

      case Serializer.TYPE_PRIMITIVE:
        return value[1];

      case Serializer.TYPE_ARRAY:
        return value[1].map((item) => this.#deserializeValue(item));

      case Serializer.TYPE_EDICT: {
        const engine = this.#getEngine();
        if (engine === null) {
          throw new Error('Serializer cannot resolve edict references without an engine.');
        }

        const edictId = value[1];
        if (edictId === null) {
          return null;
        }

        const edict = engine.GetEdictById(edictId);
        return edict !== null ? edict.entity : null;
      }

      case Serializer.TYPE_FUNCTION: {
        let code = value[1];

        if (code.startsWith('function ')) {
          // eslint-disable-next-line @typescript-eslint/no-implied-eval
          return (new Function(`return ${code}`))();
        }

        if (code.includes('=>')) {
          code = `function ${code.replace('=>', '{')}}`;
        } else {
          code = `function ${code}`;
        }

        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        return (new Function(`return ${code}`))();
      }

      case Serializer.TYPE_VECTOR:
        return new Vector(...(value.slice(1) as number[]));

      case Serializer.TYPE_SERIALIZABLE: {
        const object: Record<string, unknown> = {};
        const serializer = Serializer.makeSerializable(object, this.#getEngine());
        serializer.deserialize(value[1]);
        serializer.#setSerializableFields(Object.keys(object));
        return object;
      }
    }

    throw new TypeError(`Unknown type for deserialization: ${value[0]}`);
  }

  /**
   * Resets recorded fields.
   */
  resetFields(): void {
    this.#serializableFields = collectSerializableFields(this.#getObject());
    this.#markerStart = null;
  }

  /**
   * Adds fields to serialize.
   */
  addFields(...fields: string[]): void {
    for (const field of fields) {
      if (!this.#serializableFields.includes(field)) {
        this.#serializableFields.push(field);
      }
    }
  }

  /**
   * Starts recording newly added fields for legacy JS subclasses.
   */
  startFields(): void {
    this.#markerStart = Object.keys(this.#getObject());
  }

  /**
   * Stops recording newly added fields for legacy JS subclasses.
   */
  endFields(): void {
    const markerStart = this.#markerStart;
    console.assert(markerStart !== null, 'Serializer.endFields requires a matching startFields call');
    this.addFields(...Object.keys(this.#getObject()).filter((key) => !markerStart!.includes(key)));
    this.#markerStart = null;
  }

  serialize(): SerializableRecord {
    const data: SerializableRecord = {};
    const objectRecord = this.#getObject() as Record<string, unknown>;

    for (const field of this.#serializableFields) {
      const value = objectRecord[field];
      console.assert(value !== undefined, 'missing field', field);
      const serializedValue = this.#serializeValue(value);
      if (serializedValue[0] === Serializer.TYPE_SKIPPED) {
        continue;
      }

      data[field] = serializedValue;
    }

    return data;
  }

  deserialize(data: SerializableRecord): void {
    const objectRecord = this.#getObject() as Record<string, unknown>;

    for (const [key, value] of Object.entries(data)) {
      const currentValue = objectRecord[key];
      if (value[0] === Serializer.TYPE_SERIALIZABLE && isSerializableContainer(currentValue)) {
        currentValue._serializer!.deserialize(value[1]);
        continue;
      }

      objectRecord[key] = this.#deserializeValue(value);
    }
  }

  /**
   * Makes a plain object serializable through the same game save pipeline.
   * @returns The serializer attached to the object.
   */
  static makeSerializable<TObject extends Record<string, unknown>>(
    object: TObject,
    engine: ServerEngineAPI | null,
    fields: readonly string[] | null = null,
  ): Serializer<TObject> {
    console.assert(object._serializer === undefined, 'object is already serializable');

    const serializer = new Serializer(object, engine);

    Object.defineProperty(object, '_serializer', {
      enumerable: false,
      configurable: false,
      writable: false,
      value: serializer,
    });

    serializer.#setSerializableFields(fields ?? Object.keys(object));

    return serializer;
  }
}
