import Vector from '../../../../shared/Vector.ts';

import { attn, channel, flags, range, solid } from '../../Defs.ts';
import { ATTACK_STATE, QuakeEntityAI } from '../../helper/AI.ts';
import { serializableObject, serializable } from '../../helper/MiscHelpers.ts';
import type BaseEntity from '../BaseEntity.ts';
import { MeatSprayEntity, WalkMonster } from './BaseMonster.ts';

@serializableObject
export default class DemonMonster extends WalkMonster {
  static classname = 'monster_demon1';
  static _health = 300;
  static _size: [Vector, Vector] = [new Vector(-32.0, -32.0, -24.0), new Vector(32.0, 32.0, 64.0)];
  static _modelDefault = 'progs/demon.mdl';
  static _modelHead = 'progs/h_demon.mdl';

  static _modelQC = `
$cd id1/models/demon3
$scale	0.8
$origin 0 0 24
$base base
$skin base

$frame stand1 stand2 stand3 stand4 stand5 stand6 stand7 stand8 stand9
$frame stand10 stand11 stand12 stand13

$frame walk1 walk2 walk3 walk4 walk5 walk6 walk7 walk8

$frame run1 run2 run3 run4 run5 run6

$frame leap1 leap2 leap3 leap4 leap5 leap6 leap7 leap8 leap9 leap10
$frame leap11 leap12

$frame pain1 pain2 pain3 pain4 pain5 pain6

$frame death1 death2 death3 death4 death5 death6 death7 death8 death9

$frame attacka1 attacka2 attacka3 attacka4 attacka5 attacka6 attacka7 attacka8
$frame attacka9 attacka10 attacka11 attacka12 attacka13 attacka14 attacka15
`;

  @serializable private _isLeaping = false;

  get netname(): string {
    return 'a Fiend';
  }

  protected override _newEntityAI(): ReturnType<WalkMonster['_newEntityAI']> {
    return new QuakeEntityAI(this);
  }

  override _precache(): void {
    super._precache();

    for (const soundName of [
      'demon/ddeath.wav',
      'demon/dhit2.wav',
      'demon/djump.wav',
      'demon/dpain1.wav',
      'demon/idle1.wav',
      'demon/sight2.wav',
    ]) {
      this.engine.PrecacheSound(soundName);
    }
  }

  static override _initStates(): void {
    const standFrames = this._createFrameNames('stand', 13);
    this._defineSequence('demon1_stand', standFrames, function (this: DemonMonster): void {
      this._ai.stand();
    });

    const walkSpeeds = [8, 6, 6, 7, 4, 6, 10, 10];
    const walkFrames = this._createFrameNames('walk', walkSpeeds.length);
    this._defineSequence('demon1_walk', walkFrames,
      function (this: DemonMonster, frameIndex: number): void {
        if (frameIndex === 0) {
          this.idleSound();
        }

        this._ai.walk(walkSpeeds[frameIndex]);
      });

    const runSpeeds = [20, 15, 36, 20, 15, 36];
    const runFrames = this._createFrameNames('run', runSpeeds.length);
    this._defineSequence('demon1_run', runFrames,
      function (this: DemonMonster, frameIndex: number): void {
        if (frameIndex === 0) {
          this.idleSound();
        }

        this._ai.run(runSpeeds[frameIndex]);
      });

    const jumpFrames = this._createFrameNames('leap', 10);
    this._defineSequence('demon1_jump', jumpFrames,
      function (this: DemonMonster, frameIndex: number): void {
        if (frameIndex <= 2) {
          this._ai.face();
        }

        if (frameIndex === 2) {
          this._leap();
        }

        if (frameIndex === 9) {
          this.nextthink = this.game.time + 3;
        }
      });
    this._defineState('demon1_jump11', 'leap11', 'demon1_jump12');
    this._defineState('demon1_jump12', 'leap12', 'demon1_run1');

    const attackFrames = this._createFrameNames('attacka', 15);
    const attackCharges = [4, 0, 0, 1, 2, 1, 6, 8, 4, 2, null, 5, 8, 4, 4];
    const attackForces = [null, null, null, null, 200, null, null, null, null, null, -200, null, null, null, null];
    this._defineSequence('demon1_atta', attackFrames,
      function (this: DemonMonster, frameIndex: number): void {
        const charge = attackCharges[frameIndex];
        if (charge !== null) {
          this._ai.charge(charge);
        }

        const sideForce = attackForces[frameIndex];
        if (sideForce !== null) {
          this._meleeAttack(sideForce);
        }
      },
      false);
    this._defineState('demon1_atta15', 'attacka15', 'demon1_run1', function (this: DemonMonster): void {
      this._ai.charge(4);
    });

    const painFrames = this._createFrameNames('pain', 6);
    this._defineSequence('demon1_pain', painFrames, null, false);
    this._defineState('demon1_pain6', 'pain6', 'demon1_run1');

    const deathFrames = this._createFrameNames('death', 9);
    this._defineSequence('demon1_die', deathFrames,
      function (this: DemonMonster, frameIndex: number): void {
        if (frameIndex === 0) {
          this.deathSound();
        }

        if (frameIndex === 5) {
          this.solid = solid.SOLID_NOT;
        }
      },
      false);
  }

  override thinkStand(): void {
    this._runState('demon1_stand1');
  }

  override thinkWalk(): void {
    this._runState('demon1_walk1');
  }

  override thinkRun(): void {
    this._runState('demon1_run1');
  }

  override thinkMissile(): void {
    this._runState('demon1_jump1');
  }

  override thinkMelee(): void {
    this._runState('demon1_atta1');
  }

  override thinkPain(attackerEntity: BaseEntity, damage: number): void {
    if (this._isLeaping) {
      return;
    }

    this._ai.foundTarget(attackerEntity, true);

    if (this.pain_finished > this.game.time) {
      return;
    }

    this.pain_finished = this.game.time + 1;
    this.painSound();

    if (Math.random() * 200 > damage) {
      return;
    }

    this._runState('demon1_pain1');
  }

  override thinkDie(attackerEntity: BaseEntity): void {
    this._sub!.useTargets(attackerEntity);
    if (this.health < -80) {
      this._gib(true);
      return;
    }

    this._runState('demon1_die1');
  }

  override checkAttack(): number | null {
    if (this._ai.enemyRange === range.RANGE_MELEE) {
      return ATTACK_STATE.AS_MELEE;
    }

    if (this._checkJump()) {
      this.startSound(channel.CHAN_VOICE, 'demon/djump.wav');
      return ATTACK_STATE.AS_MISSILE;
    }

    return null;
  }

  override touch(touchedByEntity: BaseEntity, _pushVector: Vector): void {
    void _pushVector;

    if (!this._isLeaping) {
      return;
    }

    if (this.health <= 0) {
      return;
    }

    if (touchedByEntity.takedamage && this.velocity.len() > 400) {
      const damage = 40 + 10 * Math.random();
      this.damage(touchedByEntity, damage);
    }

    if (!this.isOnTheFloor()) {
      if (this.flags & flags.FL_ONGROUND) {
        this._isLeaping = false;
        this._runState('demon1_jump1');
      }
      return;
    }

    this._isLeaping = false;
    this._runState('demon1_jump11');
  }

  /**
   * Whether the fiend should perform a jump attack.
   * @returns True when the fiend should leap at its enemy.
   */
  private _checkJump(): boolean {
    if (!this.enemy) {
      return false;
    }

    if (this.origin[2] + this.mins[2] > this.enemy.origin[2] + this.enemy.mins[2] + 0.75 * this.enemy.size[2]) {
      return false;
    }

    if (this.origin[2] + this.maxs[2] < this.enemy.origin[2] + this.enemy.mins[2] + 0.25 * this.enemy.size[2]) {
      return false;
    }

    const distanceVector = this.enemy.origin.copy().subtract(this.origin);
    distanceVector[2] = 0;
    const distance = distanceVector.len();

    if (distance < 100) {
      return false;
    }

    if (distance > 200 && Math.random() < 0.9) {
      return false;
    }

    return true;
  }

  private _leap(): void {
    this._isLeaping = true;
    const { forward } = this.angles.angleVectors();
    this.origin[2]++;
    this.velocity.set(forward.multiply(600).add(new Vector(0, 0, 250)));
    this.flags &= ~flags.FL_ONGROUND;
  }

  override use(_userEntity: BaseEntity): void {
    void _userEntity;
  }

  /**
   * Fiend melee attack with optional side force for the meat spray.
   */
  private _meleeAttack(meleeSideForce: number): void {
    this._ai.face();
    this.walkMove(this.ideal_yaw, 12);

    if (!this.enemy) {
      return;
    }

    if (this.enemy.origin.distanceTo(this.origin) > 100) {
      return;
    }

    if (!this.enemy.canReceiveDamage(this)) {
      return;
    }

    this.attackSound();

    const damage = 10 + 5 * Math.random();
    this.damage(this.enemy, damage);

    const { forward, right } = this.angles.angleVectors();
    MeatSprayEntity.sprayMeat(this, forward.multiply(16.0).add(this.origin), right.multiply(meleeSideForce));
  }

  override idleSound(): void {
    if (Math.random() >= 0.2) {
      return;
    }

    this.startSound(channel.CHAN_VOICE, 'demon/idle1.wav', 1.0, attn.ATTN_IDLE);
  }

  override attackSound(): void {
    this.startSound(channel.CHAN_WEAPON, 'demon/dhit2.wav');
  }

  override painSound(): void {
    this.startSound(channel.CHAN_VOICE, 'demon/dpain1.wav');
  }

  override deathSound(): void {
    this.startSound(channel.CHAN_VOICE, 'demon/ddeath.wav');
  }

  protected override hasMeleeAttack(): boolean {
    return true;
  }

  protected override hasMissileAttack(): boolean {
    return true;
  }
}
