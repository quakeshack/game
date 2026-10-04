import type { ClientEngineAPI, SerializedData, ServerEngineAPI } from '../../../../shared/GameInterfaces.ts';

import { BaseClientEdictHandler, type ClientSpawnParameters } from '../../../../shared/ClientEdict.ts';
import ClientSerialization from '../../../../shared/ClientSerialization.ts';
import Vector from '../../../../shared/Vector.ts';

import { content, effect } from '../../Defs.ts';
import { crandom } from '../../helper/MiscHelpers.ts';

/**
 * How long a bubble lives at most, counted from the moment it appears.
 */
const BUBBLE_LIFETIME = 10.0;

/**
 * Upward speed in units per second, give or take `crandom()`.
 */
const BUBBLE_RISE_SPEED = 15.0;

/**
 * Horizontal drift per axis in units per second, re-rolled every `BUBBLE_DRIFT_INTERVAL`.
 */
const BUBBLE_DRIFT_SPEED = 2.0;
const BUBBLE_DRIFT_INTERVAL = 1.0;

/**
 * How often a bubble checks whether it is still in water and clear of the world above it. Bubbles
 * move at about 15 units per second, so four checks per second keep each one within a few units
 * and spare the world trace on every frame.
 */
const BUBBLE_CHECK_INTERVAL = 0.25;

/**
 * A bubble pops when the world is this close above it, the half-size of the trigger box the former
 * server-side bubble had.
 */
const BUBBLE_RADIUS = 8.0;

/**
 * Time between the bubbles of a death burst.
 */
const BURST_INTERVAL = 0.1;

/**
 * How far a death burst spreads its bubbles around the origin, per axis.
 */
const BURST_SPREAD = 5.0;

/**
 * Pure-cosmetic air bubble: rises with a slight drift while it stays in water, and pops when it
 * leaves the water, gets close to a ceiling or reaches the end of its life. Replaces the former
 * server-side `misc_bubble`, so neither a dying player nor a map's `air_bubbles` cost server
 * edicts or per-frame network updates.
 *
 * A bubble can be spawned with a start delay and stays hidden until it has elapsed, which is how a
 * death burst staggers its bubbles. Persistent: captured by save games.
 */
export class BubbleClientEdictHandler extends BaseClientEdictHandler {
  static readonly classname = 'client_bubble';
  static readonly model = 'progs/s_bubble.spr';

  readonly #nextOrigin = new Vector();
  readonly #probeEnd = new Vector();
  #appearTime = 0.0;
  #dieTime = 0.0;
  #appeared = false;
  #nextDriftTime = 0.0;
  #nextCheckTime = 0.0;

  static override _precache(engineAPI: ServerEngineAPI): void {
    engineAPI.PrecacheModel(BubbleClientEdictHandler.model);
  }

  /**
   * Spawns one bubble.
   * @param origin Where the bubble starts.
   * @param delay Seconds until the bubble shows up.
   * @param age Seconds the bubble has already been rising, to spawn it where it would be by now.
   */
  static spawnBubble(engine: ClientEngineAPI, origin: Vector, delay = 0.0, age = 0.0): void {
    const bubble = engine.SpawnClientEntity(BubbleClientEdictHandler.classname);

    bubble.model = engine.ModForName(BubbleClientEdictHandler.model);
    bubble.angles.clear();

    if (age > 0.0) {
      const risenOrigin = origin.copy();
      risenOrigin[2] += BUBBLE_RISE_SPEED * age;
      bubble.setOrigin(risenOrigin);
    } else {
      bubble.setOrigin(origin);
    }

    bubble.spawn({ delay, age });
  }

  /**
   * Spawns the bubbles of a death or drowning burst, one every 0.1 seconds.
   * @param origin Center of the burst.
   * @param count How many bubbles to spawn.
   */
  static spawnBurst(engine: ClientEngineAPI, origin: Vector, count: number): void {
    const bubbleOrigin = new Vector();

    for (let i = 0; i < count; i++) {
      bubbleOrigin.setTo(
        origin[0] + crandom() * BURST_SPREAD,
        origin[1] + crandom() * BURST_SPREAD,
        origin[2] + crandom() * BURST_SPREAD,
      );

      BubbleClientEdictHandler.spawnBubble(engine, bubbleOrigin, (i + 1) * BURST_INTERVAL);
    }
  }

  override spawn(parameters?: ClientSpawnParameters): void {
    const delay = typeof parameters?.delay === 'number' ? parameters.delay : 0.0;
    const age = typeof parameters?.age === 'number' ? parameters.age : 0.0;

    this.#appearTime = this.engine.CL.time + delay;
    this.#dieTime = this.#appearTime + BUBBLE_LIFETIME - age;
    this.#appeared = false;

    // hidden until the start delay has elapsed
    this.clientEdict.effects |= effect.EF_NODRAW;
  }

  override think(): void {
    const time = this.engine.CL.time;

    if (time >= this.#dieTime) {
      this.remove();
      return;
    }

    if (!this.#appeared) {
      if (time < this.#appearTime) {
        return;
      }

      this.#appear(time);
    }

    const clientEdict = this.clientEdict;

    if (time >= this.#nextDriftTime) {
      clientEdict.velocity[0] = crandom() * BUBBLE_DRIFT_SPEED;
      clientEdict.velocity[1] = crandom() * BUBBLE_DRIFT_SPEED;
      this.#nextDriftTime = time + BUBBLE_DRIFT_INTERVAL;
    }

    this.#nextOrigin.set(clientEdict.velocity).multiply(this.engine.CL.frametime).add(clientEdict.origin);
    clientEdict.setOrigin(this.#nextOrigin);

    if (time >= this.#nextCheckTime) {
      this.#nextCheckTime = time + BUBBLE_CHECK_INTERVAL;

      if (!this.#isFloating()) {
        this.remove();
      }
    }
  }

  override serialize(): SerializedData {
    const time = this.engine.CL.time;

    return ClientSerialization.serialize({
      appeared: this.#appeared,
      appearIn: this.#appeared ? 0.0 : this.#appearTime - time,
      dieIn: this.#dieTime - time,
    });
  }

  override deserialize(data: SerializedData): void {
    const saved = ClientSerialization.deserialize(data);
    const time = this.engine.CL.time;

    this.#appeared = saved.appeared as boolean;
    this.#appearTime = time + (saved.appearIn as number);
    this.#dieTime = time + (saved.dieIn as number);

    if (this.#appeared) {
      this.clientEdict.effects &= ~effect.EF_NODRAW;
    }
  }

  #appear(time: number): void {
    this.#appeared = true;
    this.clientEdict.effects &= ~effect.EF_NODRAW;
    this.clientEdict.velocity.setTo(0.0, 0.0, BUBBLE_RISE_SPEED + crandom());
    this.#nextDriftTime = time;
    this.#nextCheckTime = time;
  }

  /**
   * @returns True while the bubble is in water with no world right above it.
   */
  #isFloating(): boolean {
    const origin = this.clientEdict.origin;

    const contents: content = this.engine.DetermineStaticWorldContents(origin);

    if (contents !== content.CONTENT_WATER) {
      return false;
    }

    this.#probeEnd.set(origin);
    this.#probeEnd[2] += BUBBLE_RADIUS;

    return this.engine.Traceline(origin, this.#probeEnd).fraction === 1.0;
  }
}

/**
 * The map's `air_bubbles`: a static client entity (see `StaticBubbleSpawnerEntity`) that releases a
 * bubble right away and then one every 1 to 2 seconds. Not persistent, the server's signon creates
 * it again on every (re)connect.
 *
 * It only releases bubbles while the player could see it (its leafs are in the PVS of the view).
 * When it comes back into view it replays the bubbles it missed, each one already risen as far as
 * it would have by now, so a column of bubbles is there at once instead of slowly filling up.
 */
export class AirBubblesClientEdictHandler extends BaseClientEdictHandler {
  static readonly classname = 'air_bubbles';

  #nextBubbleTime = 0.0;

  override spawn(): void {
    this.#nextBubbleTime = this.engine.CL.time;
  }

  override think(): void {
    if (!this.engine.IsInPVS(this.clientEdict)) {
      return;
    }

    const time = this.engine.CL.time;

    // a bubble that would be dead by now is not worth replaying
    this.#nextBubbleTime = Math.max(this.#nextBubbleTime, time - BUBBLE_LIFETIME);

    while (this.#nextBubbleTime <= time) {
      BubbleClientEdictHandler.spawnBubble(this.engine, this.clientEdict.origin, 0.0, time - this.#nextBubbleTime);
      this.#nextBubbleTime += 1.0 + Math.random();
    }
  }
}
