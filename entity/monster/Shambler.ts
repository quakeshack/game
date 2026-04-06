import Vector from '../../../../shared/Vector.ts';

import { attn, channel, effect, solid, tentType } from '../../Defs.ts';
import { QuakeEntityAI } from '../../helper/AI.ts';
import { entity } from '../../helper/MiscHelpers.ts';
import type BaseEntity from '../BaseEntity.ts';
import { LightGlobeDynamicEntity } from '../Misc.mjs';
import { DamageInflictor } from '../Weapons.mjs';
import { MeatSprayEntity, WalkMonster } from './BaseMonster.ts';

@entity
export default class ShamblerMonsterEntity extends WalkMonster {
  static classname = 'monster_shambler';
  static _health = 600;
  static _size: [Vector, Vector] = [new Vector(-32.0, -32.0, -24.0), new Vector(32.0, 32.0, 64.0)];
  static _modelDefault = 'progs/shambler.mdl';
  static _modelHead = 'progs/h_shams.mdl';

  static _modelQC = `
$cd id1/models/shams
$origin 0 0 24
$base base
$skin base

$frame stand1 stand2 stand3 stand4 stand5 stand6 stand7 stand8 stand9
$frame stand10 stand11 stand12 stand13 stand14 stand15 stand16 stand17

$frame walk1 walk2 walk3 walk4 walk5 walk6 walk7
$frame walk8 walk9 walk10 walk11 walk12

$frame	run1 run2 run3 run4 run5 run6

$frame smash1 smash2 smash3 smash4 smash5 smash6 smash7
$frame smash8 smash9 smash10 smash11 smash12

$frame swingr1 swingr2 swingr3 swingr4 swingr5
$frame swingr6 swingr7 swingr8 swingr9

$frame swingl1 swingl2 swingl3 swingl4 swingl5
$frame swingl6 swingl7 swingl8 swingl9

$frame magic1 magic2 magic3 magic4 magic5
$frame magic6 magic7 magic8 magic9 magic10 magic11 magic12

$frame pain1 pain2 pain3 pain4 pain5 pain6

$frame death1 death2 death3 death4 death5 death6
$frame death7 death8 death9 death10 death11
`;

  private _damageInflictor!: DamageInflictor;

  get netname(): string {
    return 'a Shambler';
  }

  protected override _declareFields(): void {
    super._declareFields();
    this._damageInflictor = new DamageInflictor(this);
  }

  protected override _newEntityAI(): ReturnType<WalkMonster['_newEntityAI']> {
    return new QuakeEntityAI(this);
  }

  override _precache(): void {
    super._precache();

    this.engine.PrecacheModel('progs/s_light.mdl');
    this.engine.PrecacheModel('progs/bolt.mdl');

    for (const soundName of [
      'shambler/sattck1.wav',
      'shambler/sboom.wav',
      'shambler/sdeath.wav',
      'shambler/shurt2.wav',
      'shambler/sidle.wav',
      'shambler/ssight.wav',
      'shambler/melee1.wav',
      'shambler/melee2.wav',
      'shambler/smack.wav',
    ]) {
      this.engine.PrecacheSound(soundName);
    }
  }

  static override _initStates(): void {
    this._defineSequence('sham_stand', this._createFrameNames('stand', 17), function (this: ShamblerMonsterEntity): void {
      this._ai.stand();
    });

    const walkSpeeds = [10, 9, 9, 5, 6, 12, 8, 3, 13, 9, 7, 7];
    this._defineSequence('sham_walk', this._createFrameNames('walk', walkSpeeds.length),
      function (this: ShamblerMonsterEntity, frameIndex: number): void {
        this._ai.walk(walkSpeeds[frameIndex]);
        if (frameIndex === walkSpeeds.length - 1) {
          this.idleSound();
        }
      });

    const runSpeeds = [20, 24, 20, 20, 24, 20];
    this._defineSequence('sham_run', this._createFrameNames('run', runSpeeds.length),
      function (this: ShamblerMonsterEntity, frameIndex: number): void {
        this._ai.run(runSpeeds[frameIndex]);
        if (frameIndex === runSpeeds.length - 1) {
          this.idleSound();
        }
      });

    const smashFrames = this._createFrameNames('smash', 12);
    const smashCharges = [2, 6, 6, 5, 4, 1, 0, 0, 0, null, 5, 4] as const;
    this._defineSequence('sham_smash', smashFrames,
      function (this: ShamblerMonsterEntity, frameIndex: number): void {
        const charge = smashCharges[frameIndex];
        if (charge !== null) {
          this._ai.charge(charge);
        }

        if (frameIndex === 0) {
          this.startSound(channel.CHAN_VOICE, 'shambler/melee1.wav');
        }

        if (frameIndex === 9) {
          this._ai.charge(0);
          this.smashAttack();
        }
      },
      false);
    this._defineState('sham_smash12', 'smash12', 'sham_run1', function (this: ShamblerMonsterEntity): void {
      this._ai.charge(4);
    });

    const swingLeftFrames = this._createFrameNames('swingl', 9);
    const swingLeftCharges = [5, 3, 7, 3, 7, 9, 5, 4, null] as const;
    this._defineSequence('sham_swingl', swingLeftFrames,
      function (this: ShamblerMonsterEntity, frameIndex: number): void {
        const charge = swingLeftCharges[frameIndex];
        if (charge !== null) {
          this._ai.charge(charge);
        }

        if (frameIndex === 0) {
          this.startSound(channel.CHAN_VOICE, 'shambler/melee2.wav');
        }

        if (frameIndex === 6) {
          this.shamClaw(250);
        }
      },
      false);
    this._defineState('sham_swingl9', 'swingl9', 'sham_run1', function (this: ShamblerMonsterEntity): void {
      this._ai.charge(8);
      if (Math.random() < 0.5) {
        this._runState('sham_swingr1');
      }
    });

    const swingRightFrames = this._createFrameNames('swingr', 9);
    const swingRightCharges = [1, 8, 14, 7, 3, 6, 6, 3, null] as const;
    this._defineSequence('sham_swingr', swingRightFrames,
      function (this: ShamblerMonsterEntity, frameIndex: number): void {
        const charge = swingRightCharges[frameIndex];
        if (charge !== null) {
          this._ai.charge(charge);
        }

        if (frameIndex === 0) {
          this.startSound(channel.CHAN_VOICE, 'shambler/melee1.wav');
        }

        if (frameIndex === 6) {
          this.shamClaw(-250);
        }
      },
      false);
    this._defineState('sham_swingr9', 'swingr9', 'sham_run1', function (this: ShamblerMonsterEntity): void {
      this._ai.charge(1);
      this._ai.charge(10);
      if (Math.random() < 0.5) {
        this._runState('sham_swingl1');
      }
    });

    this._defineSequence('sham_pain', this._createFrameNames('pain', 6), null, false);
    this._defineState('sham_pain6', 'pain6', 'sham_run1');

    this._defineSequence('sham_death', this._createFrameNames('death', 11),
      function (this: ShamblerMonsterEntity, frameIndex: number): void {
        if (frameIndex === 2) {
          this.solid = solid.SOLID_NOT;
        }
      },
      false);

    this._defineState('sham_magic1', 'magic1', 'sham_magic2', function (this: ShamblerMonsterEntity): void {
      this._ai.face();
      this.attackSound();
    });
    this._defineState('sham_magic2', 'magic2', 'sham_magic3', function (this: ShamblerMonsterEntity): void {
      this._ai.face();
    });
    this._defineState('sham_magic3', 'magic3', 'sham_magic3b', function (this: ShamblerMonsterEntity): void {
      this._ai.face();
      this._lightBolt();
    });
    this._defineState('sham_magic3b', 'magic3', 'sham_magic4', function (this: ShamblerMonsterEntity): void {
      this._ai.face();
    });
    this._defineState('sham_magic4', 'magic4', 'sham_magic5', function (this: ShamblerMonsterEntity): void {
      this.effects |= effect.EF_MUZZLEFLASH;
    });
    this._defineState('sham_magic5', 'magic5', 'sham_magic6', function (this: ShamblerMonsterEntity): void {
      this.effects |= effect.EF_MUZZLEFLASH;
    });
    this._defineState('sham_magic6', 'magic6', 'sham_magic9', function (this: ShamblerMonsterEntity): void {
      this.castLightning();
      this.startSound(channel.CHAN_WEAPON, 'shambler/sboom.wav');
    });
    this._defineState('sham_magic9', 'magic9', 'sham_magic10', function (this: ShamblerMonsterEntity): void {
      this.castLightning();
    });
    this._defineState('sham_magic10', 'magic10', 'sham_magic11', function (this: ShamblerMonsterEntity): void {
      this.castLightning();
    });
    this._defineState('sham_magic11', 'magic11', 'sham_magic12', function (this: ShamblerMonsterEntity): void {
      if (this.game.skill === 3) {
        this.castLightning();
      }
    });
    this._defineState('sham_magic12', 'magic12', 'sham_run1');
  }

  override thinkStand(): void {
    this._runState('sham_stand1');
  }

  override thinkWalk(): void {
    this._runState('sham_walk1');
  }

  override thinkRun(): void {
    this._runState('sham_run1');
  }

  override thinkMissile(): void {
    this._runState('sham_magic1');
  }

  override thinkMelee(): void {
    const chance = Math.random();

    if (chance > 0.6 || this.health === 600) {
      this._runState('sham_smash1');
    } else if (chance > 0.3) {
      this._runState('sham_swingr1');
    } else {
      this._runState('sham_swingl1');
    }
  }

  override thinkPain(attackerEntity: BaseEntity, damage: number): void {
    this.painSound();

    if (this.health <= 0) {
      return;
    }

    this._ai.foundTarget(attackerEntity, true);

    if (Math.random() * 400 > damage) {
      return;
    }

    if (this.pain_finished > this.game.time) {
      return;
    }

    this.pain_finished = this.game.time + 2.0;
    this._runState('sham_pain1');
  }

  override thinkDie(_attackerEntity: BaseEntity): void {
    void _attackerEntity;

    if (this.health < -60) {
      this._gib(true);
      return;
    }

    this.deathSound();
    this._runState('sham_death1');
  }

  shamClaw(side: number): void {
    if (!this.enemy) {
      return;
    }

    this._ai.charge(10);

    if (this.origin.distanceTo(this.enemy.origin) > 100) {
      return;
    }

    const damage = (Math.random() + Math.random() + Math.random()) * 20;
    this.damage(this.enemy, damage);
    this.smackSound();

    if (side !== 0) {
      const { forward, right } = this.angles.angleVectors();
      MeatSprayEntity.sprayMeat(this, this.origin.copy().add(forward.multiply(16.0)), right.multiply(side));
    }
  }

  castLightning(): void {
    if (!this.enemy) {
      return;
    }

    this.effects |= effect.EF_MUZZLEFLASH;
    this._ai.face();

    const origin = this.origin.copy().add(new Vector(0.0, 0.0, 40.0));
    const direction = this.enemy.origin.copy().add(new Vector(0.0, 0.0, 16.0)).subtract(origin);
    direction.normalize();

    const endPoint = this.origin.copy().add(direction.multiply(600.0));
    const trace = this.traceline(origin, endPoint, true);

    this._damageInflictor.lightningDamage(origin, trace.point, 10);
    this._damageInflictor.dispatchBeamEvent(tentType.TE_LIGHTNING1, trace.point, origin);
  }

  private _lightBolt(): void {
    this.effects |= effect.EF_MUZZLEFLASH;

    this.engine.SpawnEntity(LightGlobeDynamicEntity.classname, {
      origin: this.origin.copy(),
      angles: this.angles.copy(),
    });
  }

  smashAttack(): void {
    if (!this.enemy) {
      return;
    }

    if (this.origin.distanceTo(this.enemy.origin) > 100) {
      return;
    }

    if (!this.enemy.canReceiveDamage(this)) {
      return;
    }

    const damage = (Math.random() + Math.random() + Math.random()) * 40;
    this.damage(this.enemy, damage);
    this.smackSound();

    const { forward, right } = this.angles.angleVectors();
    const origin = this.origin.copy().add(forward.multiply(16.0));
    MeatSprayEntity.sprayMeat(this, origin, right.copy().multiply((Math.random() * 2.0 - 1.0) * 100.0));
    MeatSprayEntity.sprayMeat(this, origin, right.copy().multiply((Math.random() * 2.0 - 1.0) * 100.0));
  }

  override painSound(): void {
    this.startSound(channel.CHAN_VOICE, 'shambler/shurt2.wav');
  }

  override deathSound(): void {
    this.startSound(channel.CHAN_VOICE, 'shambler/sdeath.wav');
  }

  override idleSound(): void {
    if (Math.random() < 0.2) {
      this.startSound(channel.CHAN_VOICE, 'shambler/sidle.wav', 1.0, attn.ATTN_IDLE);
    }
  }

  override sightSound(): void {
    this.startSound(channel.CHAN_VOICE, 'shambler/ssight.wav');
  }

  smackSound(): void {
    this.startSound(channel.CHAN_VOICE, 'shambler/smack.wav');
  }

  override attackSound(): void {
    this.startSound(channel.CHAN_WEAPON, 'shambler/sattck1.wav');
  }

  protected override hasMeleeAttack(): boolean {
    return true;
  }

  protected override hasMissileAttack(): boolean {
    return true;
  }
}
