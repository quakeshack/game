import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createInertGameApi } from '../../../../../test/support/entityMocks.ts';
import { serializableFieldsOf } from '../../../../../test/support/serialization.ts';

await import('../../GameAPI.ts');

const { FogEntity } = await import('../../entity/props/Misc.ts');

/**
 * Create a minimal game API surface for fog entity tests.
 * @returns Fixture data.
 */
function createFogFixture(): { entity: InstanceType<typeof FogEntity> } {
  const gameAPI = createInertGameApi();

  const entity = new FogEntity(null, gameAPI).initializeEntity();
  return { entity };
}

void describe('FogEntity', () => {
  void test('uses decorated defaults for fog fields', () => {
    const { entity } = createFogFixture();
    const serialized = entity.serialize();

    assert.equal(entity.fog_color, '128 128 128');
    assert.equal(entity.fog_density, 0.01);
    assert.equal(entity.fog_max_opacity, 0.8);
    assert.ok(serializableFieldsOf(FogEntity)?.includes('fog_color'));
    assert.ok(serializableFieldsOf(FogEntity)?.includes('fog_density'));
    assert.ok(serializableFieldsOf(FogEntity)?.includes('fog_max_opacity'));
    assert.ok('fog_color' in serialized);
    assert.ok('fog_density' in serialized);
    assert.ok('fog_max_opacity' in serialized);
  });

  void test('assignInitialData overrides fog parameters with map values', () => {
    const { entity } = createFogFixture();

    entity.assignInitialData({
      fog_color: '10 20 30',
      fog_density: '0.05',
      fog_max_opacity: '0.4',
    });

    assert.equal(entity.fog_color, '10 20 30');
    assert.equal(entity.fog_density, 0.05);
    assert.equal(entity.fog_max_opacity, 0.4);
  });
});
