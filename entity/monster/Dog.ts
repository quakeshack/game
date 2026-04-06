import Vector from '../../../../shared/Vector.ts';

import { attn, channel, flags, range, solid } from '../../Defs.ts';
import { ATTACK_STATE, QuakeEntityAI } from '../../helper/AI.ts';
import { entity, serializable } from '../../helper/MiscHelpers.ts';
import BaseEntity from '../BaseEntity.ts';
import { WalkMonster } from './BaseMonster.ts';

@entity
export default class DogMonsterEntity extends WalkMonster {
  static classname = 'monster_dog';
  static _health = 25;
  static _size: [Vector, Vector] = [new Vector(-32, -32, -24), new Vector(32, 32, 40)];

  static _modelDefault = 'progs/dog.mdl';
  static _modelHead = 'progs/h_dog.mdl';

  static _modelQC = `
$cd id1/models/dog
$origin 0 0 24
$base base
$skin skin

$frame attack1 attack2 attack3 attack4 attack5 attack6 attack7 attack8

$frame death1 death2 death3 death4 death5 death6 death7 death8 death9

$frame deathb1 deathb2 deathb3 deathb4 deathb5 deathb6 deathb7 deathb8
$frame deathb9

$frame pain1 pain2 pain3 pain4 pain5 pain6

$frame painb1 painb2 painb3 painb4 painb5 painb6 painb7 painb8 painb9 painb10
$frame painb11 painb12 painb13 painb14 painb15 painb16

$frame run1 run2 run3 run4 run5 run6 run7 run8 run9 run10 run11 run12

$frame leap1 leap2 leap3 leap4 leap5 leap6 leap7 leap8 leap9

$frame stand1 stand2 stand3 stand4 stand5 stand6 stand7 stand8 stand9

$frame walk1 walk2 walk3 walk4 walk5 walk6 walk7 walk8
`;

  @serializable private _isLeaping = false;

  get netname(): string {
    return 'a Rottweiler';
  }

  protected override _newEntityAI(): ReturnType<WalkMonster['_newEntityAI']> {
    return new QuakeEntityAI(this);
  }

  override _precache(): void {
    super._precache();

    this.engine.PrecacheSound('dog/dattack1.wav');
    this.engine.PrecacheSound('dog/ddeath.wav');
    this.engine.PrecacheSound('dog/dpain1.wav');
    this.engine.PrecacheSound('dog/dsight.wav');
    this.engine.PrecacheSound('dog/idle.wav');
  }

  static override _initStates(): void {
    const standFrames = Array.from({ length: 9 }, (_, i) => `stand${i + 1}`);
    this._defineSequence('dog_stand', standFrames, function (this: DogMonsterEntity): void {
      this._ai.stand();
    });

    const walkFrames = Array.from({ length: 8 }, (_, i) => `walk${i + 1}`);
    this._defineSequence('dog_walk', walkFrames,
      function (this: DogMonsterEntity, frameIndex: number): void {
        if (frameIndex === 0) {
          this.idleSound();
        }

        this._ai.walk(8);
      });

    const runSpeeds = [16, 32, 32, 20, 64, 32, 16, 32, 32, 20, 64, 32];
    const runFrames = Array.from({ length: runSpeeds.length }, (_, i) => `run${i + 1}`);
    this._defineSequence('dog_run', runFrames,
      function (this: DogMonsterEntity, frameIndex: number): void {
        if (frameIndex === 0) {
          this._isLeaping = false;
          this.idleSound();
        }

        this._ai.run(runSpeeds[frameIndex]);
      });

    const attackFrames = Array.from({ length: 8 }, (_, i) => `attack${i + 1}`);
    this._defineSequence('dog_atta', attackFrames,
      function (this: DogMonsterEntity, frameIndex: number): void {
        if (frameIndex === 3) {
          this.attackSound();
          this._bite();
          return;
        }

        this._ai.charge(10);
      },
      false);
    this._defineState('dog_atta8', 'attack8', 'dog_run1', function (this: DogMonsterEntity): void {
      this._ai.charge(10);
    });

    const leapFrames = Array.from({ length: 9 }, (_, i) => `leap${i + 1}`);
    this._defineSequence('dog_leap', leapFrames,
      function (this: DogMonsterEntity, frameIndex: number): void {
        if (frameIndex === 0) {
          this._ai.face();
          return;
        }

        if (frameIndex === 1) {
          this._ai.face();
          this._leap();
        }
      },
      false);
    this._defineState('dog_leap9', 'leap9', 'dog_run1');

    const painFrames = Array.from({ length: 6 }, (_, i) => `pain${i + 1}`);
    this._defineSequence('dog_pain', painFrames, null, false);

    this._defineState('dog_pain6', 'pain6', 'dog_run1');

    const painBFrames = Array.from({ length: 16 }, (_, i) => `painb${i + 1}`);
    const painBSpeeds = [0, 4, 12, 12, 2, 0, 4, 0, 10, 0, 0, 0, 0, 0, 0, 0];
    this._defineSequence('dog_painb', painBFrames,
      function (this: DogMonsterEntity, frameIndex: number): void {
        const move = painBSpeeds[frameIndex];
        if (move > 0) {
          this._ai.pain(move);
        }
      },
      false);
    this._defineState('dog_painb16', 'painb16', 'dog_run1');

    const deathFrames = Array.from({ length: 9 }, (_, i) => `death${i + 1}`);
    this._defineSequence('dog_die', deathFrames, null, false);

    const deathBFrames = Array.from({ length: 9 }, (_, i) => `deathb${i + 1}`);
    this._defineSequence('dog_dieb', deathBFrames, null, false);
  }

  override touch(otherEntity: BaseEntity, _pushVector: Vector): void {
    if (!this._isLeaping || this.health < 0) {
      return;
    }

    if (otherEntity.takedamage && this.velocity.len() > 300) {
      const damage = 10 + Math.random() * 10;
      this.damage(otherEntity, damage);
    }

    if (!this.isOnTheFloor()) {
      return;
    }

    this._isLeaping = false;
    this._runState('dog_run1');
  }

  private _bite(): void {
    if (!this.enemy) {
      return;
    }

    this._ai.charge(10);

    if (!this.enemy.canReceiveDamage(this)) {
      return;
    }

    if (this.enemy.origin.distanceTo(this.origin) > 100) {
      return;
    }

    const damage = (Math.random() + Math.random() + Math.random()) * 8;
    this.damage(this.enemy, damage);
  }

  private _leap(): void {
    this._isLeaping = true;

    const { forward } = this.angles.angleVectors();
    this.origin[2]++;
    this.velocity.set(forward.multiply(300).add(new Vector(0, 0, 200)));
    this.flags &= ~flags.FL_ONGROUND;
  }

  /**
   * Testing command to perform a leap.
   */
  override use(_userEntity: BaseEntity): void {
    if (this.health < 0) {
      return;
    }

    this.idleSound();
    this._leap();
  }

  override thinkStand(): void {
    this._runState('dog_stand1');
  }

  override thinkWalk(): void {
    this._runState('dog_walk1');
  }

  override thinkRun(): void {
    this._runState('dog_run1');
  }

  override thinkMissile(): void {
    this._runState('dog_leap1');
  }

  override thinkMelee(): void {
    this._runState('dog_atta1');
  }

  override thinkPain(attackerEntity: BaseEntity, _damage: number): void {
    this._ai.foundTarget(attackerEntity, true);
    this.painSound();

    if (Math.random() > 0.5) {
      this._runState('dog_pain1');
      return;
    }

    this._runState('dog_painb1');
  }

  override thinkDie(attackerEntity: BaseEntity): void {
    this._sub!.useTargets(attackerEntity);

    if (this.health < -35) {
      this._gib(true);
      return;
    }

    this.deathSound();
    this.solid = solid.SOLID_NOT;

    if (Math.random() > 0.5) {
      this._runState('dog_die1');
      return;
    }

    this._runState('dog_dieb1');
  }

  override checkAttack(): number | null {
    if (this._checkMelee()) {
      return ATTACK_STATE.AS_MELEE;
    }

    if (this._checkJump()) {
      return ATTACK_STATE.AS_MISSILE;
    }

    return null;
  }

  private _checkMelee(): boolean {
    return this._ai.enemyRange === range.RANGE_MELEE;
  }

  private _checkJump(): boolean {
    const enemy = this.enemy;
    console.assert(enemy, 'active enemy required');
    if (!enemy) {
      return false;
    }

    if (this.origin[2] + this.mins[2] > enemy.origin[2] + enemy.mins[2] + 0.75 * enemy.size[2]) {
      return false;
    }

    if (this.origin[2] + this.maxs[2] < enemy.origin[2] + enemy.mins[2] + 0.25 * enemy.size[2]) {
      return false;
    }

    const dist = enemy.origin.copy().subtract(this.origin);
    dist[2] = 0.0;

    const horizontalDistance = dist.len();
    return !(horizontalDistance < 80 || horizontalDistance > 150);
  }

  override deathSound(): void {
    this.startSound(channel.CHAN_VOICE, 'dog/ddeath.wav');
  }

  override painSound(): void {
    this.startSound(channel.CHAN_VOICE, 'dog/dpain1.wav');
  }

  override sightSound(): void {
    this.startSound(channel.CHAN_VOICE, 'dog/dsight.wav');
  }

  override idleSound(): void {
    if (Math.random() >= 0.2) {
      return;
    }

    this.startSound(channel.CHAN_VOICE, 'dog/idle.wav', 1.0, attn.ATTN_IDLE);
  }

  override attackSound(): void {
    this.startSound(channel.CHAN_VOICE, 'dog/dattack1.wav');
  }

  protected override hasMeleeAttack(): boolean {
    return true;
  }
}
