import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { serializableFieldsOf } from '../../../../../test/support/serialization.ts';

const { serializable, serializableObject, Serializer } = await import('../../helper/MiscHelpers.ts');

// ——————————————————————————————————————————
// Minimal fixture classes.
// ——————————————————————————————————————————

@serializableObject
class BaseClass {
  @serializable test = 'foo';
}

@serializableObject
class SubClass extends BaseClass {
  @serializable test2 = 123;
}

@serializableObject
class AnotherSubClass extends SubClass {
  @serializable test3 = true;
}

// A subclass with no new @serializable fields.
@serializableObject
class EmptySubClass extends BaseClass {}

void describe('serializable / serializableObject decorators', () => {
  void describe('serializableFields static property', () => {
    // Each class's static serializableFields stores only the OWN fields
    // declared in that class body.  Cross-class merging is done by
    // Serializer.#collectSerializableFields at construction time.

    void test('base class holds only its own field', () => {
      assert.ok(Array.isArray(serializableFieldsOf(BaseClass)));
      assert.ok(Object.isFrozen(serializableFieldsOf(BaseClass)));
      assert.deepEqual(serializableFieldsOf(BaseClass), ['test']);
    });

    void test('subclass holds only its own field, not the inherited one', () => {
      assert.ok(Array.isArray(serializableFieldsOf(SubClass)));
      assert.ok(Object.isFrozen(serializableFieldsOf(SubClass)));
      assert.deepEqual(serializableFieldsOf(SubClass), ['test2']);
    });

    void test('deeply nested subclass holds only its own field', () => {
      assert.ok(Array.isArray(serializableFieldsOf(AnotherSubClass)));
      assert.ok(Object.isFrozen(serializableFieldsOf(AnotherSubClass)));
      assert.deepEqual(serializableFieldsOf(AnotherSubClass), ['test3']);
    });

    void test('subclass with no new @serializable fields gets an empty frozen array', () => {
      assert.ok(Array.isArray(serializableFieldsOf(EmptySubClass)));
      assert.ok(Object.isFrozen(serializableFieldsOf(EmptySubClass)));
      assert.deepEqual(serializableFieldsOf(EmptySubClass), []);
    });

    void test('base class serializableFields is not mutated by subclass decoration', () => {
      // Re-check after all subclass decorators have run.
      assert.deepEqual(serializableFieldsOf(BaseClass), ['test']);
    });
  });

  void describe('Serializer: full chain collected at construction time', () => {
    void test('base class instance serializes its own field', () => {
      const instance = new BaseClass();
      const serializer = new Serializer(instance, null);
      const data = serializer.serialize();

      assert.deepEqual(Object.keys(data), ['test']);
      assert.deepEqual(data.test, ['P', 'foo']);
    });

    void test('subclass instance serializes inherited and own fields', () => {
      const instance = new SubClass();
      const serializer = new Serializer(instance, null);
      const data = serializer.serialize();

      assert.ok('test' in data, 'inherited field "test" must be serialized');
      assert.ok('test2' in data, 'own field "test2" must be serialized');
      assert.deepEqual(data.test, ['P', 'foo']);
      assert.deepEqual(data.test2, ['P', 123]);
    });

    void test('deeply nested subclass serializes the full three-field chain', () => {
      const instance = new AnotherSubClass();
      const serializer = new Serializer(instance, null);
      const data = serializer.serialize();

      assert.deepEqual(Object.keys(data), ['test', 'test2', 'test3']);
      assert.deepEqual(data.test3, ['P', true]);
    });

    void test('subclass with no new fields serializes only the inherited field', () => {
      const instance = new EmptySubClass();
      const serializer = new Serializer(instance, null);
      const data = serializer.serialize();

      assert.deepEqual(Object.keys(data), ['test']);
    });

    void test('base class is not affected — serializes only its own field', () => {
      // Regression: decorating subclasses must not widen the base class.
      const instance = new BaseClass();
      const serializer = new Serializer(instance, null);
      const data = serializer.serialize();

      assert.deepEqual(Object.keys(data), ['test']);
    });

    void test('serialized subclass data round-trips back to correct values', () => {
      const original = new SubClass();
      const serializer = new Serializer(original, null);
      const data = serializer.serialize();

      const restored = new SubClass();
      const restoredSerializer = new Serializer(restored, null);
      restoredSerializer.deserialize(data);

      assert.equal(restored.test, 'foo');
      assert.equal(restored.test2, 123);
    });

    void test('map fields round-trip as maps instead of plain objects', () => {
      const original = {
        invincible_sound_time: new Map([[1, 2], [7, 15]]),
      };
      const serializer = Serializer.makeSerializable(original, null);
      const data = serializer.serialize();

      const restored = {
        invincible_sound_time: new Map<number, number>(),
      };
      const restoredSerializer = Serializer.makeSerializable(restored, null);
      restoredSerializer.deserialize(data);

      assert.equal(restored.invincible_sound_time instanceof Map, true);
      assert.equal(restored.invincible_sound_time.get(1), 2);
      assert.equal(restored.invincible_sound_time.get(7), 15);
    });
  });
});
