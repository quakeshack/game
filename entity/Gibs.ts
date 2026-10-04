import type { ServerEngineAPI } from '../../../shared/GameInterfaces.ts';
import type { PlayerEntity } from './Player.ts';
import type BaseMonster from './monster/BaseMonster.ts';

import Vector from '../../../shared/Vector.ts';

import { GibClientEdictHandler } from '../client/entity/Gibs.ts';
import { channel, clientEvent, damage, dead, flags, moveType, solid } from '../Defs.ts';
import { featureFlags } from '../featureFlags.ts';
import { crandom } from '../helper/MiscHelpers.ts';

/**
 * Return a launch velocity scaled to the damage that caused the gib.
 * @returns Gib launch velocity.
 */
function velocityForDamage(damagePoints: number): Vector {
  const velocity = new Vector(100.0 * crandom(), 100.0 * crandom(), 100.0 * crandom() + 200.0);

  if (damagePoints > -50) {
    velocity.multiply(0.7);
  } else if (damagePoints > -200) {
    velocity.multiply(2.0);
  } else {
    velocity.multiply(10.0);
  }

  return velocity;
}

/**
 * Server-side entry points for gibbing. The gibs themselves are purely cosmetic client-only
 * entities (see `client/entity/Gibs.ts`): the server only broadcasts `clientEvent.EMIT_GIB`
 * and never allocates an edict for them, so a kill costs no server entities and no per-frame
 * network updates.
 */
export class Gibs {
  /**
   * Launch a single gib on every client.
   */
  static throwGib(engineAPI: ServerEngineAPI, model: string, origin: Vector, velocity: Vector): void {
    engineAPI.BroadcastClientEvent(false, clientEvent.EMIT_GIB, model, origin.copy(), velocity);
  }

  static throwGibs(entity: BaseMonster | PlayerEntity, damagePoints: number | null = null, impact: Vector = Vector.origin): void {
    for (let i = 0, max = Math.ceil(entity.volume / 16000); i < max; i++) {
      const model = GibClientEdictHandler.models[Math.floor(Math.random() * GibClientEdictHandler.models.length)];
      console.assert(model !== undefined, 'gib model must exist');
      Gibs.throwGib(
        entity.engine,
        model,
        entity.origin,
        velocityForDamage(damagePoints !== null ? damagePoints : entity.health).add(impact),
      );
    }
  }

  static throwMeatGib(entity: BaseMonster | PlayerEntity, velocity: Vector, origin: Vector = entity.origin): void {
    Gibs.throwGib(entity.engine, GibClientEdictHandler.meatModel, origin, velocity);
  }

  static gibEntity(entity: BaseMonster | PlayerEntity, headModel: string, playSound = true): void {
    if (!entity.isActor() || entity.health > 0) {
      return;
    }

    const damagePoints = entity.health;

    entity.resetThinking();
    entity.setModel(headModel);
    entity.frame = 0;
    entity.movetype = moveType.MOVETYPE_BOUNCE;
    entity.takedamage = damage.DAMAGE_NO;
    entity.solid = solid.SOLID_NOT;
    entity.view_ofs = new Vector(0.0, 0.0, 8.0);
    entity.setSize(new Vector(-16.0, -16.0, 0.0), new Vector(16.0, 16.0, 56.0));
    entity.origin[2] -= 24.0;
    entity.flags &= ~flags.FL_ONGROUND;
    entity.avelocity = new Vector(0.0, 600.0, 0.0).multiply(crandom());
    entity.deadflag = dead.DEAD_DEAD;

    const impact = new Vector();

    if (featureFlags.includes('improved-gib-physics')) {
      entity.velocity.normalize();
      impact.set(entity.velocity.multiply(-5.0 * damagePoints));
      entity.velocity = velocityForDamage(damagePoints).add(impact);
    }

    Gibs.throwGibs(entity, damagePoints, impact);

    if (playSound) {
      entity.startSound(channel.CHAN_VOICE, Math.random() < 0.5 ? 'player/gib.wav' : 'player/udeath.wav');
    }
  }
}
