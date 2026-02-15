import { NullEntity } from '../Misc.mjs';

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
export class FogEntity extends NullEntity {
  static classname = 'func_fog';

  _declareFields() {
    super._declareFields();
    this._serializer.startFields();
    this.fog_color = '128 128 128';
    this.fog_density = 0.01;
    this.fog_max_opacity = 0.8;
    this._serializer.endFields();
  }

  // TODO: make this entity more dynamic, allowing the game to change the parameters
}
