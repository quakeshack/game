import type { ClientEngineAPI, SerializedData, ServerEngineAPI } from '../../../../shared/GameInterfaces.ts';

import { BaseClientEdictHandler } from '../../../../shared/ClientEdict.ts';
import ClientSerialization from '../../../../shared/ClientSerialization.ts';
import Vector from '../../../../shared/Vector.ts';

import { moveType } from '../../Defs.ts';

/**
 * Tumble rate ceiling (degrees per second) per axis, as the server-side gib used.
 */
const GIB_MAX_TUMBLE = 600.0;

/**
 * Pure-cosmetic gib: tumbles through the air, bounces off the world, comes to rest on the floor
 * and disappears after 10 to 20 seconds. The engine moves it (`MOVETYPE_BOUNCE`, see
 * `ClientEntityPhysics`), the handler only sets that up and removes it once its time is up. Spawned by `ClientGameAPI` in response to
 * `clientEvent.EMIT_GIB`, it replaces the former server-side `GibEntity`, so a kill no longer
 * costs server edicts or per-frame network updates. Each client simulates its own copies, so
 * spin and lifetime are not synchronized between players.
 *
 * Persistent: it is captured by save games (`ClientEdict.persistent`) the same way particles are,
 * since nothing else would bring it back after a load.
 */
export class GibClientEdictHandler extends BaseClientEdictHandler {
  static readonly classname = 'client_gib';

  /** Models of the regular gibs. */
  static readonly models = [
    'progs/gib1.mdl',
    'progs/gib2.mdl',
    'progs/gib3.mdl',
  ] as const;

  /** Model of the meat gib zombies throw. */
  static readonly meatModel = 'progs/zom_gib.mdl';

  #dieTime = 0.0;

  static override _precache(engineAPI: ServerEngineAPI): void {
    for (const model of GibClientEdictHandler.models) {
      engineAPI.PrecacheModel(model);
    }

    engineAPI.PrecacheModel(GibClientEdictHandler.meatModel);
  }

  /**
   * Launches one gib.
   * @param modelName Name of the precached gib model.
   * @param origin Where the gib starts.
   * @param velocity Launch velocity.
   */
  static spawnGib(engine: ClientEngineAPI, modelName: string, origin: Vector, velocity: Vector): void {
    const gib = engine.SpawnClientEntity(GibClientEdictHandler.classname);

    gib.model = engine.ModForName(modelName);
    // a fresh ClientEdict starts with Infinity angles, which would poison the tumble's quaternion math
    gib.angles.clear();
    gib.velocity.set(velocity);
    gib.setOrigin(origin);
    gib.spawn();
  }

  override spawn(): void {
    this.clientEdict.movetype = moveType.MOVETYPE_BOUNCE;
    this.clientEdict.avelocity.setTo(Math.random(), Math.random(), Math.random()).multiply(GIB_MAX_TUMBLE);
    this.#dieTime = this.engine.CL.time + 10.0 + Math.random() * 10.0;
  }

  override think(): void {
    if (this.engine.CL.time >= this.#dieTime) {
      this.remove();
    }
  }

  override serialize(): SerializedData {
    return ClientSerialization.serialize({
      dieIn: this.#dieTime - this.engine.CL.time,
    });
  }

  override deserialize(data: SerializedData): void {
    const saved = ClientSerialization.deserialize(data);

    this.#dieTime = this.engine.CL.time + (saved.dieIn as number);
  }
}
