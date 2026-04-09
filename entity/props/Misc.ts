import { entity, serializable } from '../../helper/MiscHelpers.ts';
import { NullEntity } from '../Misc.ts';

/**
 * QUAKED func_fog
 *
 * Support entity for volumetric fog volumes.
 *
 * Fields:
 *  - fog_color - RGB color of the fog, as three space-separated integers (e.g. "128 128 128")
 *  - fog_density - Density of the fog, as a float (e.g. "0.01")
 *  - fog_max_opacity - Maximum opacity of the fog, as a float between 0 and 1 (e.g. "0.8")
 */
@entity
export class FogEntity extends NullEntity {
  static classname = 'func_fog';

  @serializable fog_color = '128 128 128';
  @serializable fog_density = 0.01;
  @serializable fog_max_opacity = 0.8;

  // TODO: make this entity more dynamic, allowing the game to change the parameters
}
