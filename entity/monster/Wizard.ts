import Vector from '../../../../shared/Vector.ts';

import { attn, channel, effect, flags, range, solid, tentType } from '../../Defs.ts';
import { ATTACK_STATE, QuakeEntityAI } from '../../helper/AI.ts';
import { entity, serializable } from '../../helper/MiscHelpers.ts';
import type BaseEntity from '../BaseEntity.ts';
import { BaseSpike } from '../Weapons.ts';
import { FlyMonster } from './BaseMonster.ts';
import { PlayerEntity } from '../Player.mjs';

export class WizardMissile extends BaseSpike {
  static classname = 'monster_wizard_missile';
  static _damage = 9;
  static _tentType = tentType.TE_WIZSPIKE;
  static _model = 'progs/w_spike.mdl';
}

/**
 * QUAKED monster_wizard (1 0 0) (-16 -16 -24) (16 16 40) Ambush
 */
@entity
export default class WizardMonsterEntity extends FlyMonster {
  static classname = 'monster_wizard';
  static _health = 80;
  static _size: [Vector, Vector] = [new Vector(-16.0, -16.0, -24.0), new Vector(16.0, 16.0, 40.0)];

  static _modelDefault = 'progs/wizard.mdl';
  static _modelHead = 'progs/h_wizard.mdl';

  static _modelQC =
  `
$cd id1/models/a_wizard
$origin 0 0 24
$base wizbase
$skin wizbase

$frame hover1 hover2 hover3 hover4 hover5 hover6 hover7 hover8
$frame hover9 hover10 hover11 hover12 hover13 hover14 hover15

$frame fly1 fly2 fly3 fly4 fly5 fly6 fly7 fly8 fly9 fly10
$frame fly11 fly12 fly13 fly14

$frame magatt1 magatt2 magatt3 magatt4 magatt5 magatt6 magatt7
$frame magatt8 magatt9 magatt10 magatt11 magatt12 magatt13

$frame pain1 pain2 pain3 pain4

$frame death1 death2 death3 death4 death5 death6 death7 death8
`;

  @serializable waitmin = 0;

  get netname(): string {
    return 'a Scrag';
  }

  protected override _newEntityAI(): ReturnType<FlyMonster['_newEntityAI']> {
    return new QuakeEntityAI(this);
  }

  override _precache(): void {
    super._precache();

    this.engine.PrecacheModel('progs/w_spike.mdl');

    this.engine.PrecacheSound('wizard/hit.wav');
    this.engine.PrecacheSound('wizard/wattack.wav');
    this.engine.PrecacheSound('wizard/wdeath.wav');
    this.engine.PrecacheSound('wizard/widle1.wav');
    this.engine.PrecacheSound('wizard/widle2.wav');
    this.engine.PrecacheSound('wizard/wpain.wav');
    this.engine.PrecacheSound('wizard/wsight.wav');
  }

  static override _initStates(): void {
    const hoverFrames = this._createFrameNames('hover', 8);
    this._defineSequence('wiz_stand', hoverFrames, function (this: WizardMonsterEntity): void {
      this._ai.stand();
    });

    this._defineSequence('wiz_walk', hoverFrames,
      function (this: WizardMonsterEntity, frameIndex: number): void {
        this._ai.walk(8);
        if (frameIndex === 0) {
          this.idleSound();
        }
      });

    this._defineSequence('wiz_side', hoverFrames,
      function (this: WizardMonsterEntity, frameIndex: number): void {
        this._ai.run(8);
        if (frameIndex === 0) {
          this.idleSound();
        }
      });

    this._defineSequence('wiz_run', this._createFrameNames('fly', 14),
      function (this: WizardMonsterEntity, frameIndex: number): void {
        this._ai.run(16);
        if (frameIndex === 0) {
          this.idleSound();
        }
      });

    const fastFrames = ['magatt1', 'magatt2', 'magatt3', 'magatt4', 'magatt5', 'magatt6', 'magatt5', 'magatt4', 'magatt3', 'magatt2'];
    this._defineSequence('wiz_fast', fastFrames,
      function (this: WizardMonsterEntity, frameIndex: number): void {
        this._ai.face();
        if (frameIndex === 0) {
          this._startFast();
        }

        if (frameIndex === fastFrames.length - 1) {
          this._attackFinished();
        }
      },
      false);
    this._defineState('wiz_fast10', 'magatt2', 'wiz_run1', function (this: WizardMonsterEntity): void {
      this._ai.face();
      this._attackFinished();
    });

    this._defineSequence('wiz_pain', this._createFrameNames('pain', 4), null, false);
    this._defineState('wiz_pain4', 'pain4', 'wiz_run1');

    this._defineSequence('wiz_death', this._createFrameNames('death', 8),
      function (this: WizardMonsterEntity, frameIndex: number): void {
        if (frameIndex === 0) {
          this.velocity[0] = -200 + 400 * Math.random();
          this.velocity[1] = -200 + 400 * Math.random();
          this.velocity[2] = 100 + 100 * Math.random();
          this.flags &= ~flags.FL_ONGROUND;
          this.startSound(channel.CHAN_VOICE, 'wizard/wdeath.wav');
        }

        if (frameIndex === 2) {
          this.solid = solid.SOLID_NOT;
        }
      },
      false);
  }

  _fastFireAt(origin: Vector): void {
    const enemy = this.enemy;
    if (enemy === null) {
      return;
    }

    const target = enemy as BaseEntity & { health: number; view_ofs: Vector };
    if (enemy instanceof PlayerEntity && enemy.health <= 0) {
      return;
    }

    if (!(enemy instanceof PlayerEntity) && target.health <= 0) {
      return;
    }

    this.effects |= effect.EF_MUZZLEFLASH;

    // The fast attack fires from cached spawn points rather than re-leading the shot.
    const movedir = target.origin.copy().add(target.view_ofs).subtract(origin);
    movedir.normalize();
    this.movedir.set(movedir);

    this.engine.SpawnEntity(WizardMissile.classname, {
      owner: this,
      speed: 600.0,
    });

    this.startSound(channel.CHAN_WEAPON, 'wizard/wattack.wav');
  }

  private _startFast(): void {
    this.startSound(channel.CHAN_WEAPON, 'wizard/wattack.wav');
    this.v_angle.set(this.angles);
    const { forward, right } = this.angles.angleVectors();

    // Preserve the two delayed fast-attack helper shots from QuakeC.
    const baseOrigin = this.origin.copy().add(new Vector(0.0, 0.0, 30.0));
    const origin1 = baseOrigin.copy().add(forward.copy().multiply(14)).add(right.copy().multiply(14));
    this._scheduleThink(this.game.time + 0.8, () => { this._fastFireAt(origin1); });

    const origin2 = baseOrigin.add(forward.copy().multiply(14)).add(right.copy().multiply(-14));
    this._scheduleThink(this.game.time + 0.3, () => { this._fastFireAt(origin2); });
  }

  override thinkMissile(): void {
    this._runState('wiz_fast1');
  }

  override thinkStand(): void {
    this._runState('wiz_stand1');
  }

  override thinkWalk(): void {
    this._runState('wiz_walk1');
  }

  override thinkRun(): void {
    this._runState('wiz_run1');
  }

  override thinkPain(attackerEntity: BaseEntity, damageAmount: number): void {
    this.startSound(channel.CHAN_VOICE, 'wizard/wpain.wav');
    this._ai.foundTarget(attackerEntity, true);
    if (Math.random() * 70 > damageAmount) {
      // Did not flinch.
      return;
    }

    this._runState('wiz_pain1');
  }

  override thinkDie(attackerEntity: BaseEntity): void {
    super.thinkDie(attackerEntity);

    this._sub!.useTargets(attackerEntity);

    if (this.health < -40) {
      this.startSound(channel.CHAN_VOICE, 'player/udeath.wav');
      this._gib(true);
      return;
    }

    this._runState('wiz_death1');
  }

  override checkAttack(): number | null {
    const enemy = this.enemy;
    if (enemy === null) {
      return null;
    }

    if (this.game.time < this.attack_finished) {
      return null;
    }

    if (!this._ai.enemyIsVisible) {
      return null;
    }

    const enemyRange = this._ai.enemyRange;
    const ai = this._ai as QuakeEntityAI<WizardMonsterEntity>;

    if (enemyRange === range.RANGE_FAR) {
      if (ai._attackState !== ATTACK_STATE.AS_STRAIGHT) {
        ai._attackState = ATTACK_STATE.AS_STRAIGHT;
        this._runState('wiz_run1');
      }
      return null;
    }

    const trace = this.tracelineToEntity(enemy, false);
    if (trace.entity !== enemy) {
      if (ai._attackState !== ATTACK_STATE.AS_STRAIGHT) {
        ai._attackState = ATTACK_STATE.AS_STRAIGHT;
        this._runState('wiz_run1');
      }
      return null;
    }

    let chance = 0;
    switch (enemyRange) {
      case range.RANGE_MELEE:
        chance = 0.9;
        break;
      case range.RANGE_NEAR:
        chance = 0.6;
        break;
      case range.RANGE_MID:
        chance = 0.2;
        break;
    }

    if (Math.random() < chance) {
      ai._attackState = ATTACK_STATE.AS_MISSILE;
      return ATTACK_STATE.AS_MISSILE;
    }

    if (enemyRange === range.RANGE_MID) {
      if (ai._attackState !== ATTACK_STATE.AS_STRAIGHT) {
        ai._attackState = ATTACK_STATE.AS_STRAIGHT;
        this._runState('wiz_run1');
      }
    } else if (ai._attackState !== ATTACK_STATE.AS_SLIDING) {
      ai._attackState = ATTACK_STATE.AS_SLIDING;
      this._runState('wiz_side1');
    }

    return null;
  }

  _attackFinished(): void {
    const ai = this._ai as QuakeEntityAI<WizardMonsterEntity>;

    this.attackFinished(2);

    if (ai.enemyRange >= range.RANGE_MID || !ai.enemyIsVisible) {
      ai._attackState = ATTACK_STATE.AS_STRAIGHT;
      this._runState('wiz_run1');
      return;
    }

    ai._attackState = ATTACK_STATE.AS_SLIDING;
    this._runState('wiz_side1');
  }

  override deathSound(): void {
    this.startSound(channel.CHAN_VOICE, 'wizard/wdeath.wav');
  }

  override painSound(): void {
    this.startSound(channel.CHAN_VOICE, 'wizard/wpain.wav');
  }

  override sightSound(): void {
    this.startSound(channel.CHAN_VOICE, 'wizard/wsight.wav');
  }

  override attackSound(): void {
    this.startSound(channel.CHAN_VOICE, 'wizard/wattack.wav');
  }

  override idleSound(): void {
    const random = Math.random() * 5;

    if (this.waitmin < this.game.time) {
      this.waitmin = this.game.time + 2;

      if (random > 4.5) {
        this.startSound(channel.CHAN_VOICE, 'wizard/widle1.wav', 1, attn.ATTN_IDLE);
      } else if (random < 1.5) {
        this.startSound(channel.CHAN_VOICE, 'wizard/widle2.wav', 1, attn.ATTN_IDLE);
      }
    }
  }

  protected override hasMissileAttack(): boolean {
    return true;
  }
}
