import { serializableObject } from '../../helper/MiscHelpers.ts';
import BaseEntity from '../BaseEntity.ts';

/**
 * QUAKED misc_entity_remover (0 0 0) (-8 -8 -8) (8 8 8)
 * Removes all entities of a given targetname when triggered.
 * You must set the "target" field, and create an object with a "targetname" field that matches.
 */
@serializableObject
export class EntityRemover extends BaseEntity {
  static classname = 'misc_entity_remover';

  override use(_usedByEntity: BaseEntity): void {
    // remove all referenced entities with the given targetname
    for (const entity of this.findAllEntitiesByFieldAndValue('targetname', this.target!)) {
      entity.remove();
    }

    // no longer needed, remove self
    this.remove();
  }

  override spawn(): void {
    console.assert(this.target !== null, 'misc_entity_remover must have a target field set.');

    if (this.target === null) {
      this.engine.ConsoleWarning(`${this} has no target field set, removing.\n`);
      this.remove();
      return;
    }

    super.spawn();
  }
}
