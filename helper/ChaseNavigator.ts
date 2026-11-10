import Vector from '../../../shared/Vector.ts';

import { flags } from '../Defs.ts';
import type BaseEntity from '../entity/BaseEntity.ts';
import type BaseMonster from '../entity/monster/BaseMonster.ts';
import { EntityWrapper, serializable, serializableObject, Serializer } from './MiscHelpers.ts';

/**
 * Where a chasing monster heads, frame by frame: straight at an enemy it can see close by on its own level, as
 * QuakeC's monsters do, or along a navigation path to where it last saw the enemy. `QuakeEntityAI` owns one per monster and
 * tells it what the monster saw (`remember`) and when its enemy changed (`reset`); `steer` answers each run frame
 * with the point to pass to `moveToGoal`, or `null` to leave the chase to QuakeC's `movetogoal`.
 *
 * Path requests are asynchronous: at most one counts at a time, and an answer is dropped when a newer request was
 * sent, the enemy changed in between, or the monster died. Requests are sent at most once a second per monster.
 * The numbers here are measured with `scripts/simulate-monster-chase.mts` (`plans/monster-chase-navigation.md`).
 */
@serializableObject
export class ChaseNavigator<T extends BaseMonster = BaseMonster> extends EntityWrapper<T> {
  /** A waypoint counts as reached this close on the plane... */
  static readonly REACH_RADIUS = 24.0;
  /** ...and this close vertically, so one on the floor above or below does not count. */
  static readonly REACH_HEIGHT = 48.0;
  /** An enemy within this height difference is on the monster's level... */
  static readonly SAME_LEVEL_HEIGHT = 48.0;
  /**
   * ...and is charged straight on when visible and this close. Further away a straight line that looks clear more
   * often runs into a ledge or a gap, and charging stranded 2–7% of monsters the path got through.
   */
  static readonly CHARGE_DISTANCE = 256.0;
  /** Closer than this to its enemy the movement code stops for being close enough, which is not being stuck. */
  static readonly NEAR_ENEMY_DISTANCE = 96.0;
  /** A monster that hasn't made this much headway toward its target... */
  static readonly STUCK_HEADWAY = 8.0;
  /** ...for this many seconds is stuck. */
  static readonly STUCK_TIME = 1.0;
  /** How long a monster that got stuck charging directly follows the path instead. */
  static readonly PATH_ONLY_TIME = 3.0;
  /** The remembered position moved this far from where the path leads: ask for a new one. */
  static readonly GOAL_MOVED_DISTANCE = 64.0;
  /** Seconds between two path requests of one monster... */
  static readonly REQUEST_INTERVAL = 1.0;
  /** ...plus up to this much, so a room of monsters woken in the same frame doesn't ask in the same frame. */
  static readonly REQUEST_STAGGER = 0.3;
  /** Seconds before asking again when there was no path. */
  static readonly NO_PATH_INTERVAL = 3.0;
  /** A gap this long between two run frames (an attack, a pain animation) restarts the stuck timer. */
  static readonly STEER_GAP = 0.5;

  readonly _serializer: Serializer<ChaseNavigator<T>>;

  /** Where the monster last saw its enemy, or was told it is. */
  @serializable private _lastKnownOrigin = new Vector();
  /** Whether `_lastKnownOrigin` holds anything. */
  @serializable private _hasMemory = false;
  /** The waypoints still ahead, the next one first. */
  @serializable private _path: Vector[] = [];
  /** Where the current path leads, null without one. */
  @serializable private _pathGoal: Vector | null = null;
  /** Game time the current path was asked for: a door that started blocking since may stand across it. */
  @serializable private _pathTime = 0.0;
  /** Whether a new path should be asked for as soon as the throttle allows. */
  @serializable private _replanWanted = false;
  /** Game time before which no path is asked for. */
  @serializable private _nextRequestTime = 0.0;
  /** Game time until which the monster follows the path even when it sees its enemy. */
  @serializable private _pathOnlyUntil = 0.0;
  /** The waypoint the monster got stuck on, to skip it if the next path starts with it again. */
  @serializable private _stuckWaypoint: Vector | null = null;
  /** Where the monster stood when it last made headway. */
  @serializable private _progressOrigin = new Vector();
  /** Game time it last made headway. */
  @serializable private _progressTime = 0.0;
  /** Game time of the last `steer`. */
  @serializable private _lastSteerTime = -Infinity;

  /** Numbers the path requests; an answer to any but the latest is dropped. */
  #requestSequence = 0;
  /** Whether the latest request is still unanswered. */
  #requestPending = false;

  constructor(entity: T) {
    super(entity);
    this._serializer = new Serializer(this, entity.engine);
  }

  /**
   * The waypoints still ahead, for debugging and tests.
   * @returns A copy of the path.
   */
  get path(): Vector[] {
    return this._path.map((waypoint) => waypoint.copy());
  }

  /**
   * Where the monster thinks its enemy is, null when it has no idea.
   * @returns A copy of the remembered position.
   */
  get lastKnownOrigin(): Vector | null {
    return this._hasMemory ? this._lastKnownOrigin.copy() : null;
  }

  /**
   * Forgets the path and where the enemy was, for a new enemy or none. An answer to a request sent before is dropped.
   */
  reset(): void {
    this.#requestSequence++;
    this.#requestPending = false;
    this._hasMemory = false;
    this._path.length = 0;
    this._pathGoal = null;
    this._stuckWaypoint = null;
    this._replanWanted = true;
    this._pathOnlyUntil = 0.0;
    this._nextRequestTime = this._game.time + Math.random() * ChaseNavigator.REQUEST_STAGGER;
  }

  /**
   * Remembers where the enemy is: the monster saw it there, was hurt from there, or was told about it.
   */
  remember(origin: Vector): void {
    this._lastKnownOrigin.set(origin);
    this._hasMemory = true;
  }

  /**
   * Picks where to head this run frame. A visible enemy close by on the monster's level is charged straight at its
   * position (QuakeC's chase would keep a stale heading three times out of four); otherwise the next waypoint toward
   * where the monster last knew the enemy to be.
   * @param enemy The enemy the monster is chasing.
   * @param enemyVisible Whether the monster sees it this frame.
   * @returns The point to head for, or null to leave the chase to QuakeC's `movetogoal`: for flying and swimming
   * monsters, close to the enemy, and when there is no path (no navigation mesh, or the end of the path reached).
   */
  steer(enemy: BaseEntity, enemyVisible: boolean): Vector | null {
    const entity = this._entity;

    // the graph is for walkers
    if (entity.flags & (flags.FL_FLY | flags.FL_SWIM)) {
      return null;
    }

    const time = this._game.time;

    if (time - this._lastSteerTime > ChaseNavigator.STEER_GAP) {
      this.#restartProgress(time);
    }

    this._lastSteerTime = time;

    const enemyDistance = Math.hypot(enemy.origin[0] - entity.origin[0], enemy.origin[1] - entity.origin[1]);

    if (enemyVisible && time >= this._pathOnlyUntil && enemyDistance < ChaseNavigator.CHARGE_DISTANCE
      && Math.abs(enemy.origin[2] - entity.origin[2]) < ChaseNavigator.SAME_LEVEL_HEIGHT) {
      // close by, moveToGoal stops for being close enough, which is not being stuck
      if (enemyDistance < ChaseNavigator.NEAR_ENEMY_DISTANCE) {
        this.#restartProgress(time);
        return null;
      }

      if (!this.#isStuckChasing(enemy.origin, time)) {
        return enemy.origin;
      }

      // charging made no headway, perhaps a window or a gap between them: take the path for a while
      console.debug(`${entity} made no headway charging ${enemy}, following the path for a while`);
      this._pathOnlyUntil = time + ChaseNavigator.PATH_ONLY_TIME;
      this._replanWanted = true;
      this.#restartProgress(time);
    }

    return this.#followPath(time);
  }

  #followPath(time: number): Vector | null {
    if (!this._hasMemory) {
      return null;
    }

    const goal = this._lastKnownOrigin;

    if (this._pathGoal === null || this._pathGoal.distanceTo(goal) > ChaseNavigator.GOAL_MOVED_DISTANCE) {
      this._replanWanted = true;
    }

    if (this._path.length > 0 && this._pathTime < this._game.gameAI._navigationChangeTime) {
      this._replanWanted = true;
    }

    this.#advance(time);

    if (this._path.length === 0) {
      // the path ran out short of where the enemy was: ask again; there, chase the enemy itself as QuakeC does
      if (!this.#isReached(goal)) {
        this._replanWanted = true;
      }
    } else if (this.#isStuckChasing(this._path[0], time)) {
      console.debug(`${this._entity} is stuck on its way to ${this._path[0]}, asking for a new path`);
      this._stuckWaypoint = this._path[0].copy();
      this._replanWanted = true;
      this.#restartProgress(time);
    }

    if (this._replanWanted) {
      this.#request(time);
    }

    return this._path.length > 0 ? this._path[0] : null;
  }

  /**
   * Drops every waypoint the monster has reached.
   */
  #advance(time: number): void {
    let advanced = false;

    while (this._path.length > 0 && this.#isReached(this._path[0])) {
      this._path.shift();
      advanced = true;
    }

    if (advanced) {
      this.#restartProgress(time);
    }
  }

  #isReached(point: Vector): boolean {
    const origin = this._entity.origin;

    return Math.hypot(point[0] - origin[0], point[1] - origin[1]) < ChaseNavigator.REACH_RADIUS
      && Math.abs(point[2] - origin[2]) < ChaseNavigator.REACH_HEIGHT;
  }

  #restartProgress(time: number): void {
    this._progressOrigin.set(this._entity.origin);
    this._progressTime = time;
  }

  /**
   * Whether the monster made no headway toward a target for a while. Headway is how far it moved toward the target
   * since it last made some, so a target walking away doesn't count against it.
   * @returns True when stuck.
   */
  #isStuckChasing(target: Vector, time: number): boolean {
    const origin = this._entity.origin;
    const toTarget = target.copy().subtract(origin);
    toTarget[2] = 0.0;
    const distance = toTarget.len();
    const moved = origin.copy().subtract(this._progressOrigin);
    moved[2] = 0.0;
    const headway = distance > 0.0 ? moved.dot(toTarget) / distance : 0.0;

    if (headway >= ChaseNavigator.STUCK_HEADWAY) {
      this.#restartProgress(time);
      return false;
    }

    return time - this._progressTime >= ChaseNavigator.STUCK_TIME;
  }

  #request(time: number): void {
    if (this.#requestPending || time < this._nextRequestTime) {
      return;
    }

    const entity = this._entity;
    const sequence = ++this.#requestSequence;
    const goal = this._lastKnownOrigin.copy();
    const stuckWaypoint = this._stuckWaypoint;

    this.#requestPending = true;
    this._replanWanted = false;
    this._stuckWaypoint = null;
    this._nextRequestTime = time + ChaseNavigator.REQUEST_INTERVAL + Math.random() * ChaseNavigator.REQUEST_STAGGER;

    // with its box the path only takes links a monster of its size walks: no drops, nothing too narrow for it
    this._engine.NavigateAsync(entity.origin.copy(), goal, { mins: entity.mins, maxs: entity.maxs }).then((path) => {
      this.#receive(sequence, time, goal, stuckWaypoint, path);
    }).catch((error: unknown) => {
      console.error(`${entity} failed to compute a path to ${goal}: ${String(error)}`);
    });
  }

  #receive(sequence: number, requestTime: number, goal: Vector, stuckWaypoint: Vector | null, path: Vector[] | null): void {
    // a newer request was sent, or the enemy changed since
    if (sequence !== this.#requestSequence) {
      return;
    }

    this.#requestPending = false;

    const entity = this._entity;
    if (entity.edict === null || entity.edict.isFree() || entity.health <= 0) {
      return;
    }

    this._pathGoal = goal;
    this._pathTime = requestTime;

    if (path === null) {
      console.debug(`${entity} found no path to ${goal}`);
      this._path.length = 0;
      this._nextRequestTime = Math.max(this._nextRequestTime, this._game.time + ChaseNavigator.NO_PATH_INTERVAL);
      return;
    }

    // the first point is where the monster stood when it asked
    const waypoints = path.slice(1);

    // the same waypoint it got stuck on: try the one after it
    if (stuckWaypoint !== null && waypoints.length > 1 && waypoints[0].distanceTo(stuckWaypoint) < 1.0) {
      waypoints.shift();
    }

    this._path = waypoints;
    this.#restartProgress(this._game.time);
  }
}
