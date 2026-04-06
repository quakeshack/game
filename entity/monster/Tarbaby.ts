import Vector from '../../../../shared/Vector.ts';

import { channel, damage, flags, moveType, tentType } from '../../Defs.ts';
import { QuakeEntityAI } from '../../helper/AI.ts';
import { entity, serializable } from '../../helper/MiscHelpers.ts';
import type BaseEntity from '../BaseEntity.ts';
import { DamageInflictor } from '../Weapons.ts';
import { WalkMonster } from './BaseMonster.ts';

type TarbabyTouchState = 'normal' | 'jumping';

@entity
export default class TarbabyMonsterEntity extends WalkMonster {
  static classname = 'monster_tarbaby';
  static _modelDefault = 'progs/tarbaby.mdl';
  static _health = 80;
  static _size: [Vector, Vector] = [new Vector(-16.0, -16.0, -24.0), new Vector(16.0, 16.0, 40.0)];

  static _modelQC = `
$cd id1/models/tarbaby
$origin 0 0 24
$base base

$skin skin

$frame walk1 walk2 walk3 walk4  walk5 walk6 walk7 walk8 walk9 walk10
$frame walk11 walk12 walk13 walk14 walk15 walk16 walk17 walk18 walk19
$frame walk20 walk21 walk22 walk23 walk24 walk25

$frame run1 run2 run3 run4 run5 run6  run7 run8 run9 run10 run11 run12 run13
$frame run14 run15 run16 run17 run18 run19 run20 run21 run22 run23
$frame run24 run25

$frame jump1 jump2 jump3 jump4 jump5 jump6

$frame fly1 fly2 fly3 fly4

$frame exp
`;

  @serializable private _touchState: TarbabyTouchState = 'normal';

  private _damageInflictor!: DamageInflictor;

  protected override _declareFields(): void {
    super._declareFields();
    this._damageInflictor = new DamageInflictor(this);
  }

  protected override _newEntityAI(): ReturnType<WalkMonster['_newEntityAI']> {
    return new QuakeEntityAI(this);
  }

  override _precache(): void {
    super._precache();

    for (const soundName of [
      'blob/death1.wav',
      'blob/hit1.wav',
      'blob/land1.wav',
      'blob/sight1.wav',
    ]) {
      this.engine.PrecacheSound(soundName);
    }
  }

  static override _initStates(): void {
    this._defineState('tbaby_stand1', 'walk1', 'tbaby_stand1', function (this: TarbabyMonsterEntity): void {
      this._ai.stand();
    });
    this._defineState('tbaby_hang1', 'walk1', 'tbaby_hang1', function (this: TarbabyMonsterEntity): void {
      this._ai.stand();
    });

    this._defineSequence('tbaby_walk', this._createFrameNames('walk', 25),
      function (this: TarbabyMonsterEntity, frameIndex: number): void {
        if (frameIndex < 10) {
          this._ai.turn();
          return;
        }

        this._ai.walk(2);
      });

    this._defineSequence('tbaby_run', this._createFrameNames('run', 25),
      function (this: TarbabyMonsterEntity, frameIndex: number): void {
        if (frameIndex < 10) {
          this._ai.face();
          return;
        }

        this._ai.run(2);
      });

    this._defineSequence('tbaby_jump', this._createFrameNames('jump', 5),
      function (this: TarbabyMonsterEntity, frameIndex: number): void {
        if (frameIndex < 4) {
          this._ai.face();
          return;
        }

        this._performJump();
      },
      false);
    this._defineState('tbaby_jump6', 'jump6', 'tbaby_fly1', function (): void {
    });

    this._defineState('tbaby_fly1', 'fly1', 'tbaby_fly2', function (): void {
    });
    this._defineState('tbaby_fly2', 'fly2', 'tbaby_fly3', function (): void {
    });
    this._defineState('tbaby_fly3', 'fly3', 'tbaby_fly4', function (): void {
    });
    this._defineState('tbaby_fly4', 'fly4', 'tbaby_fly1', function (this: TarbabyMonsterEntity): void {
      this._flyCounter();
    });

    this._defineState('tbaby_die1', 'exp', 'tbaby_die2', function (this: TarbabyMonsterEntity): void {
      this.takedamage = damage.DAMAGE_NO;
    });
    this._defineState('tbaby_die2', 'exp', null, function (this: TarbabyMonsterEntity): void {
      this._dieInAnExplosion();
    });
  }

  override thinkStand(): void {
    this._runState('tbaby_stand1');
  }

  override thinkWalk(): void {
    this._runState('tbaby_walk1');
  }

  override thinkRun(): void {
    this._runState('tbaby_run1');
  }

  override thinkMissile(): void {
    this._runState('tbaby_jump1');
  }

  override thinkMelee(): void {
    this._runState('tbaby_jump1');
  }

  override thinkDie(_attackerEntity: BaseEntity): void {
    void _attackerEntity;
    this._runState('tbaby_die1');
  }

  override touch(touchedByEntity: BaseEntity, pushVector: Vector): void {
    if (this._touchState === 'jumping') {
      this._jumpTouch(touchedByEntity);
      return;
    }

    super.touch(touchedByEntity, pushVector);
  }

  private _dieInAnExplosion(): void {
    this._damageInflictor.blastDamage(120, this);
    this.startSound(channel.CHAN_VOICE, 'blob/death1.wav');

    if (!this.velocity.isOrigin()) {
      const offset = this.velocity.copy();
      offset.normalize();
      offset.multiply(8.0);
      this.origin.subtract(offset);
    }

    this.engine.DispatchTempEntityEvent(tentType.TE_TAREXPLOSION, this.origin.copy());
    this.remove();
  }

  private _performJump(): void {
    this.movetype = moveType.MOVETYPE_BOUNCE;
    this._touchState = 'jumping';

    const { forward } = this.angles.angleVectors();
    this.origin[2] += 1;
    this.velocity = forward.multiply(600.0).add(new Vector(0.0, 0.0, 200.0 + Math.random() * 150.0));

    if (this.flags & flags.FL_ONGROUND) {
      this.flags &= ~flags.FL_ONGROUND;
    }

    this.cnt = 0;
  }

  private _jumpTouch(touchedByEntity: BaseEntity): void {
    if (touchedByEntity.takedamage && touchedByEntity.classname !== this.classname) {
      if (this.velocity.len() > 400) {
        const jumpDamage = 10 + 10 * Math.random();
        this.damage(touchedByEntity, jumpDamage);
        this.startSound(channel.CHAN_WEAPON, 'blob/hit1.wav');
      }
    } else {
      this.startSound(channel.CHAN_WEAPON, 'blob/land1.wav');
    }

    if (!this.isOnTheFloor()) {
      if (this.flags & flags.FL_ONGROUND) {
        this._touchState = 'normal';
        this.movetype = moveType.MOVETYPE_STEP;
        this._runState('tbaby_run1');
      }
      return;
    }

    this._touchState = 'normal';
    this._runState('tbaby_jump1');
  }

  private _flyCounter(): void {
    this.cnt += 1;
    if (this.cnt === 4) {
      this._runState('tbaby_jump5');
    }
  }

  protected override hasMissileAttack(): boolean {
    return true;
  }

  protected override hasMeleeAttack(): boolean {
    return true;
  }
}
