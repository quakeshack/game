import Vector from '../../../../shared/Vector.ts';

import { serializableObject, serializable } from '../../helper/MiscHelpers.ts';
import BaseEntity from '../BaseEntity.ts';
import { Sub } from '../Subs.ts';

export enum PropState {
  /**
   * End state: open.
   */
  STATE_TOP = 0,

  /**
   * End state: closed.
   */
  STATE_BOTTOM = 1,

  /**
   * Transitioning state: opening.
   */
  STATE_UP = 2,

  /**
   * Transitioning state: closing.
   */
  STATE_DOWN = 3,

  /**
   * No action taken in think.
   */
  STATE_DONE = -1,
}

export { PropState as state };

@serializableObject
export default abstract class BasePropEntity extends BaseEntity {
  /**
   * Either a CD track number or sound number.
   */
  @serializable sounds = 0;
  /**
   * Contains filename to play.
   */
  @serializable noise: string | null = null;
  /**
   * Contains filename to play.
   */
  @serializable noise1: string | null = null;
  /**
   * Contains filename to play.
   */
  @serializable noise2: string | null = null;
  /**
   * Contains filename to play.
   */
  @serializable noise3: string | null = null;

  // Top and bottom positions.
  @serializable pos1 = new Vector();
  @serializable pos2 = new Vector();

  /**
   * See PropState.
   */
  @serializable state = PropState.STATE_TOP;
  /**
   * Lip size in units.
   */
  @serializable lip: number | null = null;
  /**
   * Height in units.
   */
  @serializable height = 0;
  /**
   * Time in seconds from firing to restarting.
   */
  @serializable wait = 0;
  /**
   * Time in seconds from activation to firing.
   */
  @serializable delay = 0;
  /**
   * Speed in units.
   */
  @serializable speed = 0;

  protected override _declareFields(): void {
    super._declareFields();
    // Movement helpers live on Sub during the transition away from QuakeC helpers.
    this._sub ??= new Sub(this);
  }

  override spawn(): void {
    console.assert(false, 'Missing spawn implementation');
  }
}

