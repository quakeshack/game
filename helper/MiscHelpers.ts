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
 * Flushed by the @serializableObject class decorator into the class's static serializableFields.
 */
let pendingSerializableFields: string[] = [];

/**
 * TC39 field decorator that marks a class field as serializable.
 * Must be used together with @serializableObject on the enclosing class.
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
export function serializableObject<T extends abstract new (...args: never[]) => object>(
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

enum SerializedType {
  SKIPPED = 'X',
  PRIMITIVE = 'P',
  INFINITY = 'I',
  ARRAY = 'A',
  EDICT = 'E',
  FUNCTION = 'F',
  SERIALIZABLE = 'S',
  VECTOR = 'V',
  MAP = 'M',
}

type SerializablePrimitive = string | number | boolean | null;
type SerializableRecord = Record<string, SerializedToken>;
type SerializedSkip = [SerializedType.SKIPPED];
type SerializedPrimitiveValue = [SerializedType.PRIMITIVE, SerializablePrimitive];
type SerializedInfinity = [SerializedType.INFINITY, number];
type SerializedArray = [SerializedType.ARRAY, SerializedToken[]];
type SerializedEdictReference = [SerializedType.EDICT, number | null];
type SerializedFunction = [SerializedType.FUNCTION, string];
type SerializedSerializable = [SerializedType.SERIALIZABLE, SerializableRecord];
type SerializedVector = [SerializedType.VECTOR, ...number[]];
type SerializedMap = [SerializedType.MAP, [string, SerializedToken][]];
type SerializedToken =
  | SerializedArray
  | SerializedEdictReference
  | SerializedFunction
  | SerializedInfinity
  | SerializedPrimitiveValue
  | SerializedSerializable
  | SerializedSkip
  | SerializedVector
  | SerializedMap;

type SerializableContainer = Record<string, unknown> & {
  _serializer?: Serializer<object>;
};

type SerializableObject<T extends object> = T & {
  _serializer: Serializer<T>;
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
 * Returns a random integer between min and max, inclusive.
 * @param min integer minimum value
 * @param max integer maximum value
 * @returns random number between min and max, inclusive
 */
export function irandom(min: number, max: number): number {
  console.assert(Number.isInteger(min) && Number.isInteger(max), 'irandom requires integer arguments');
  console.assert(max >= min, 'irandom requires max to be greater than or equal to min');
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
 * Serializes and deserializes game or helper state objects.
 * TS classes declare serializable fields via @serializable + @serializableObject decorators.
 * The engine reference is optional and is only needed when entity references must be resolved during deserialization.
 */
export class Serializer<T extends object> {
  readonly #objectReference: WeakRef<T>;
  readonly #engineReference: WeakRef<ServerEngineAPI> | null;
  #serializableFields: string[];

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
        return [SerializedType.SKIPPED];

      case value === Infinity:
        return [SerializedType.INFINITY, 1];

      case value === -Infinity:
        return [SerializedType.INFINITY, -1];

      case typeof value === 'string':
      case typeof value === 'boolean':
      case typeof value === 'number':
      case value === null:
        return [SerializedType.PRIMITIVE, value as SerializablePrimitive];

      case typeof value === 'function':
        return [SerializedType.FUNCTION, value.toString()];

      case value instanceof Vector:
        return [SerializedType.VECTOR, ...value];

      case value instanceof Map:
        return [SerializedType.MAP, Array.from(value.entries()).map(([key, val]) => [key, this.#serializeValue(val)])];

      case Array.isArray(value):
        return [SerializedType.ARRAY, value.map((item) => this.#serializeValue(item))];

      case isEntityReference(value):
        return [SerializedType.EDICT, value.edictId ?? null];

      case value instanceof SerializableEntity:
        return [SerializedType.SERIALIZABLE, value.serialize() as unknown as SerializableRecord];

      case isSerializableContainer(value):
        return [SerializedType.SERIALIZABLE, value._serializer!.serialize()];
    }

    throw new TypeError(`Unknown type for serialization: ${typeof value}`);
  }

  #deserializeValue(value: SerializedToken): unknown {
    switch (value[0]) {
      case SerializedType.INFINITY:
        return value[1] * Infinity;

      case SerializedType.PRIMITIVE:
        return value[1];

      case SerializedType.ARRAY:
        return value[1].map((item) => this.#deserializeValue(item));

      case SerializedType.EDICT: {
        const edictId = value[1];
        if (edictId === null) {
          return null;
        }

        const edict = this.#getEngine()!.GetEdictById(edictId);
        return edict !== null ? edict.entity : null;
      }

      case SerializedType.FUNCTION: {
        let code = value[1];

        if (code.startsWith('function ') || code.startsWith('function(')) { // regular function
          // eslint-disable-next-line @typescript-eslint/no-implied-eval
          return (new Function(`return ${code}`))();
        }

        if (code.includes('=>')) { // arrow functions are actually not supported, we need to hack them into regular functions
          code = `function ${code.replace('=>', '{')}}`;
        } else {
          code = `function ${code}`;
        }

        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        return (new Function(`return ${code}`))();
      }

      case SerializedType.VECTOR:
        return new Vector(...(value.slice(1) as number[]));

      case SerializedType.MAP: {
        const map = new Map<string, unknown>();

        for (const [key, val] of value[1]) {
          map.set(key, this.#deserializeValue(val));
        }

        return map;
      }

      case SerializedType.SERIALIZABLE: {
        const object: Record<string, unknown> = {};
        const serializer = Serializer.makeSerializable(object, this.#getEngine());
        serializer.deserialize(value[1]);
        serializer.#setSerializableFields(Object.keys(object));
        return object;
      }
    }

    throw new TypeError(`Unknown type for deserialization: ${value[0]}`);
  }

  serialize(): SerializableRecord {
    const data: SerializableRecord = {};
    const objectRecord = this.#getObject() as Record<string, unknown>;

    for (const field of this.#serializableFields) {
      const value = objectRecord[field];
      console.assert(value !== undefined, 'missing field', field);
      const serializedValue = this.#serializeValue(value);
      if (serializedValue[0] === SerializedType.SKIPPED) {
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
      if (value[0] === SerializedType.SERIALIZABLE && isSerializableContainer(currentValue)) {
        currentValue._serializer!.deserialize(value[1]);
        continue;
      }

      objectRecord[key] = this.#deserializeValue(value);
    }
  }

  /**
   * Makes an object serializable through the same game save pipeline.
   * Pass null for engine when the object does not need edict-backed entity resolution.
   * @returns The serializer attached to the object.
   */
  static makeSerializable<TObject extends object>(
    object: TObject,
    engine: ServerEngineAPI | null,
    fields: readonly string[] | null = null,
  ): Serializer<TObject> {
    const serializableObject = object as TObject & { _serializer?: Serializer<TObject> };

    console.assert(serializableObject._serializer === undefined, 'object is already serializable');

    const serializer = new Serializer(object, engine);

    Object.defineProperty(serializableObject, '_serializer', {
      enumerable: false,
      configurable: false,
      writable: false,
      value: serializer,
    });

    serializer.#setSerializableFields(fields ?? Object.keys(object as Record<string, unknown>));

    return serializer;
  }

  /**
   * Makes a plain object serializable through the same game save pipeline.
   * Pass null for engine when the object does not need edict-backed entity resolution.
   */
  static makeSerializableObject<TObject extends object>(
    object: TObject,
    engine: ServerEngineAPI | null,
  ) {
    const serializableObject = object as TObject & { _serializer?: Serializer<TObject> };

    console.assert(serializableObject._serializer === undefined, 'object is already serializable');

    this.makeSerializable(serializableObject, engine);

    return serializableObject as SerializableObject<TObject>;
  }
}
