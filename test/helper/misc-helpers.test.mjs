import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const { serializable, serializableObject, Serializer } = await import('../../helper/MiscHelpers.ts');

// ——————————————————————————————————————————
// Minimal fixture classes.
// Decorator syntax is not available in .mjs files, so the TC39 decorator
// functions are called manually in the same order the runtime would invoke
// them: field decorators first (innermost-to-outermost), then the class
// decorator.
// ——————————————————————————————————————————

// @serializableObject class BaseClass { @serializable test = 'foo'; }
serializable(undefined, { name: 'test' });
class BaseClass {
  test = 'foo';
}
serializableObject(BaseClass, {});

// @serializableObject class SubClass extends BaseClass { @serializable test2 = 123; }
serializable(undefined, { name: 'test2' });
class SubClass extends BaseClass {
  test2 = 123;
}
serializableObject(SubClass, {});

// @serializableObject class AnotherSubClass extends SubClass { @serializable test3 = true; }
serializable(undefined, { name: 'test3' });
class AnotherSubClass extends SubClass {
  test3 = true;
}
serializableObject(AnotherSubClass, {});

// A subclass with no new @serializable fields.
class EmptySubClass extends BaseClass {}
serializableObject(EmptySubClass, {});

void describe('serializable / serializableObject decorators', () => {
  void describe('serializableFields static property', () => {
    // Each class's static serializableFields stores only the OWN fields
    // declared in that class body.  Cross-class merging is done by
    // Serializer.#collectSerializableFields at construction time.

    void test('base class holds only its own field', () => {
      assert.ok(Array.isArray(BaseClass.serializableFields));
      assert.ok(Object.isFrozen(BaseClass.serializableFields));
      assert.deepEqual(BaseClass.serializableFields, ['test']);
    });

    void test('subclass holds only its own field, not the inherited one', () => {
      assert.ok(Array.isArray(SubClass.serializableFields));
      assert.ok(Object.isFrozen(SubClass.serializableFields));
      assert.deepEqual(SubClass.serializableFields, ['test2']);
    });

    void test('deeply nested subclass holds only its own field', () => {
      assert.ok(Array.isArray(AnotherSubClass.serializableFields));
      assert.ok(Object.isFrozen(AnotherSubClass.serializableFields));
      assert.deepEqual(AnotherSubClass.serializableFields, ['test3']);
    });

    void test('subclass with no new @serializable fields gets an empty frozen array', () => {
      assert.ok(Array.isArray(EmptySubClass.serializableFields));
      assert.ok(Object.isFrozen(EmptySubClass.serializableFields));
      assert.deepEqual(EmptySubClass.serializableFields, []);
    });

    void test('base class serializableFields is not mutated by subclass decoration', () => {
      // Re-check after all subclass decorators have run.
      assert.deepEqual(BaseClass.serializableFields, ['test']);
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
  });
});
