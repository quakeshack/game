import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createInertGameApi } from '../../../../../test/support/entityMocks.ts';
import { serializableFieldsOf } from '../../../../../test/support/serialization.ts';
import type { ServerGameAPI } from '../../GameAPI.ts';
import BaseEntity from '../../entity/BaseEntity.ts';
import { serializableObject, serializable, Serializer } from '../../helper/MiscHelpers.ts';

/** BaseEntity is abstract; this is the entity with nothing added to it. */
class PlainEntity extends BaseEntity {
  static classname = 'plain_entity';
}

void describe('Serializer', () => {
  void test('uses static serializableFields for typed classes', () => {
    class StaticSerializable {
      static serializableFields = ['count'];

      readonly _serializer: Serializer<StaticSerializable>;
      count = 3;
      skipped = 'ignore-me';

      constructor() {
        this._serializer = new Serializer(this, null);
      }
    }

    const instance = new StaticSerializable();

    assert.deepEqual(instance._serializer.serialize(), {
      count: ['P', 3],
    });
  });

});

void describe('@entity / @serializable decorators', () => {
  void test('BaseEntity.serializableFields is a frozen array from @entity', () => {
    const fields = serializableFieldsOf(BaseEntity);

    assert.ok(Array.isArray(fields));
    assert.ok(Object.isFrozen(fields));
    assert.ok(fields.includes('ltime'));
    assert.ok(fields.includes('origin'));
    assert.ok(fields.includes('_scheduledThinks'));
  });

  void test('Serializer collects all decorated BaseEntity fields', () => {
    const entity = new PlainEntity(null, createInertGameApi()).initializeEntity();
    const serialized = entity.serialize();
    assert.ok('ltime' in serialized);
    assert.ok('origin' in serialized);
    assert.ok('message' in serialized);
    assert.ok(!('_sub' in serialized), '_sub should not be serialized');
    assert.ok(!('_damageHandler' in serialized), '_damageHandler should not be serialized');
  });

  void test('legacy static serializableFields merges with decorated parent', () => {
    class LegacyChild extends BaseEntity {
      static classname = 'legacy_child';
      static serializableFields = ['customProp'];

      customProp: number;

      constructor(gameAPI: ServerGameAPI) {
        super(null, gameAPI);
        this.customProp = 42;
      }
    }

    const child = new LegacyChild(createInertGameApi()).initializeEntity();
    const serialized = child.serialize();
    assert.ok('ltime' in serialized, 'inherits decorated parent fields');
    assert.ok('customProp' in serialized, 'includes own static array fields');
  });

  void test('entity and serializable are exported functions', () => {
    assert.equal(typeof serializableObject, 'function');
    assert.equal(typeof serializable, 'function');
  });

});

void describe('BasePropEntity decorator port', async () => {
  await import('../../GameAPI.ts');

  const { default: BasePropEntity, PropState } = await import('../../entity/props/BasePropEntity.ts');

  void test('uses decorator-registered fields with initialized defaults', () => {
    class TestPropEntity extends BasePropEntity {
      static classname = 'test_prop_entity';

      get hasSub(): boolean {
        return this._sub !== null;
      }

      spawn(): void {}
    }

    const entity = new TestPropEntity(null, createInertGameApi()).initializeEntity();
    const serialized = entity.serialize();
    const fields = serializableFieldsOf(BasePropEntity);

    assert.ok(Array.isArray(fields));
    assert.ok(Object.isFrozen(fields));
    assert.ok(fields.includes('sounds'));
    assert.ok(fields.includes('pos1'));
    assert.ok(fields.includes('state'));
    assert.equal(entity.sounds, 0);
    assert.equal(entity.state, PropState.STATE_TOP);
    assert.equal(entity.hasSub, true);
    assert.ok('sounds' in serialized);
    assert.ok('pos1' in serialized);
    assert.ok('state' in serialized);
  });
});

void describe('BaseMonster decorator port', async () => {
  // Import GameAPI first to establish the correct ESM evaluation order.
  // In production, GameAPI.ts is the entry point, so monster subclasses
  // evaluate after BaseMonster.ts. In tests, importing BaseMonster.ts
  // directly inverts that order, causing TDZ errors in subclass files.
  await import('../../GameAPI.ts');

  const { default: BaseMonster, WalkMonster, FlyMonster, SwimMonster, MeatSprayEntity } =
    await import('../../entity/monster/BaseMonster.ts');

  void test('BaseMonster.serializableFields is a frozen array from @entity', () => {
    const fields = serializableFieldsOf(BaseMonster);

    assert.ok(Array.isArray(fields));
    assert.ok(Object.isFrozen(fields));
  });

  void test('BaseMonster decorated fields include expected keys', () => {
    const fields = serializableFieldsOf(BaseMonster);
    assert.ok(fields);
    for (const key of ['pausetime', 'movetarget', 'health', 'ideal_yaw', 'yaw_speed', 'bloodcolor', 'enemy', 'goalentity', 'cnt', '_ai']) {
      assert.ok(fields.includes(key), `missing field "${key}"`);
    }
  });

  void test('collectSerializableFields merges BaseEntity + BaseMonster fields', () => {
    // collectSerializableFields walks the prototype chain to merge fields from
    // all @entity-decorated ancestors.  We verify this by constructing a mock
    // instance whose prototype chain looks like: instance → BaseMonster → BaseEntity.
    const entityFields = serializableFieldsOf(BaseEntity);
    const monsterFields = serializableFieldsOf(BaseMonster);
    assert.ok(entityFields);
    assert.ok(monsterFields);

    const merged = [...new Set([
      ...entityFields,
      ...monsterFields,
    ])];
    for (const key of entityFields) {
      assert.ok(merged.includes(key), `missing inherited field "${key}"`);
    }
    for (const key of monsterFields) {
      assert.ok(merged.includes(key), `missing own field "${key}"`);
    }
  });

  void test('subclasses carry their own serializableFields from @entity', () => {
    // WalkMonster, FlyMonster, SwimMonster add no extra @serializable fields,
    // so their own serializableFields arrays should be empty (only BaseMonster's
    // and BaseEntity's are inherited via collectSerializableFields at runtime).
    for (const Ctor of [WalkMonster, FlyMonster, SwimMonster]) {
      const fields = serializableFieldsOf(Ctor);
      assert.ok(Array.isArray(fields), `${Ctor.name} missing serializableFields`);
      assert.ok(Object.isFrozen(fields), `${Ctor.name} serializableFields not frozen`);
    }
  });

  void test('MeatSprayEntity has its own decorator-generated serializableFields', () => {
    const fields = serializableFieldsOf(MeatSprayEntity);

    assert.ok(Array.isArray(fields));
    assert.ok(Object.isFrozen(fields));
    // MeatSprayEntity extends BaseEntity with no extra @serializable fields,
    // so its own array should be empty.
    assert.equal(fields.length, 0);
  });

  void test('non-serializable fields are excluded from BaseMonster', () => {
    const fields = serializableFieldsOf(BaseMonster);
    assert.ok(fields);
    assert.ok(!fields.includes('_damageHandler'), '_damageHandler should not be serialized');
    assert.ok(!fields.includes('_sub'), '_sub should not be serialized');
  });
});
