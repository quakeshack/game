import Vector from '../../../../shared/Vector.ts';

import { attn, channel, effect, solid } from '../../Defs.ts';
import { QuakeEntityAI } from '../../helper/AI.ts';
import { serializableObject, serializable } from '../../helper/MiscHelpers.ts';
import type BaseEntity from '../BaseEntity.ts';
import { DamageInflictor, Laser } from '../Weapons.ts';
import { WalkMonster } from './BaseMonster.ts';

/**
 * QUAKED monster_army (1 0 0) (-16 -16 -24) (16 16 40) Ambush
 */
@serializableObject
export class ArmySoldierMonster extends WalkMonster {
  static classname = 'monster_army';
  static _health = 30;
  static _size: [Vector, Vector] = [new Vector(-16, -16, -24), new Vector(16, 16, 40)];

  static _modelDefault = 'progs/soldier.mdl';
  static _modelHead = 'progs/h_guard.mdl';

  static _modelQC = `
$cd id1/models/soldier3
$origin 0 -6 24
$base base
$skin skin

$frame stand1 stand2 stand3 stand4 stand5 stand6 stand7 stand8

$frame death1 death2 death3 death4 death5 death6 death7 death8
$frame death9 death10

$frame deathc1 deathc2 deathc3 deathc4 deathc5 deathc6 deathc7 deathc8
$frame deathc9 deathc10 deathc11

$frame load1 load2 load3 load4 load5 load6 load7 load8 load9 load10 load11

$frame pain1 pain2 pain3 pain4 pain5 pain6

$frame painb1 painb2 painb3 painb4 painb5 painb6 painb7 painb8 painb9 painb10
$frame painb11 painb12 painb13 painb14

$frame painc1 painc2 painc3 painc4 painc5 painc6 painc7 painc8 painc9 painc10
$frame painc11 painc12 painc13

$frame run1 run2 run3 run4 run5 run6 run7 run8

$frame shoot1 shoot2 shoot3 shoot4 shoot5 shoot6 shoot7 shoot8 shoot9

$frame prowl_1 prowl_2 prowl_3 prowl_4 prowl_5 prowl_6 prowl_7 prowl_8
$frame prowl_9 prowl_10 prowl_11 prowl_12 prowl_13 prowl_14 prowl_15 prowl_16
$frame prowl_17 prowl_18 prowl_19 prowl_20 prowl_21 prowl_22 prowl_23 prowl_24
`;

  /** Preserved legacy save field from the original JS monster implementation. */
  @serializable protected _aiState: string | null = null;

  private readonly _damageInflictor = new DamageInflictor(this);

  get netname(): string {
    return 'a Grunt';
  }

  override _precache(): void {
    super._precache();

    this.engine.PrecacheSound('soldier/death1.wav');
    this.engine.PrecacheSound('soldier/idle.wav');
    this.engine.PrecacheSound('soldier/pain1.wav');
    this.engine.PrecacheSound('soldier/pain2.wav');
    this.engine.PrecacheSound('soldier/sattck1.wav');
    this.engine.PrecacheSound('soldier/sight1.wav');
  }

  protected override _newEntityAI(): ReturnType<WalkMonster['_newEntityAI']> {
    return new QuakeEntityAI(this);
  }

  static override _initStates(): void {
    this._defineSequence('army_stand', this._createFrameNames('stand', 8), function (this: ArmySoldierMonster): void {
      this._ai.stand();
    });

    const walkFrames = this._createFrameNames('prowl_', 24);
    const walkSpeeds = [1, 1, 1, 1, 2, 3, 4, 4, 2, 2, 2, 1, 0, 1, 1, 1, 3, 3, 3, 3, 2, 1, 1, 1];
    this._defineSequence('army_walk', walkFrames,
      function (this: ArmySoldierMonster, frameIndex: number): void {
        if (frameIndex === 0) {
          this.idleSound();
        }

        this._ai.walk(walkSpeeds[frameIndex]);
      });

    const runSpeeds = [11, 15, 10, 10, 8, 15, 10, 8];
    this._defineSequence('army_run', this._createFrameNames('run', runSpeeds.length),
      function (this: ArmySoldierMonster, frameIndex: number): void {
        if (frameIndex === 0) {
          this.idleSound();
        }

        this._ai.run(runSpeeds[frameIndex]);
      });

    this._defineSequence('army_atk', this._createFrameNames('shoot', 9),
      function (this: ArmySoldierMonster, frameIndex: number): void {
        this._ai.face();

        if (frameIndex === 3) {
          this._fire();
          this.effects |= effect.EF_MUZZLEFLASH;
          return;
        }

        if (frameIndex === 6) {
          this._refire('army_atk1');
        }
      },
      false);
    this._defineState('army_atk9', 'shoot9', 'army_run1', function (this: ArmySoldierMonster): void {
      this._ai.face();
    });

    this._defineSequence('army_pain', this._createFrameNames('pain', 6), null, false);
    this._defineState('army_pain6', 'pain6', 'army_run1', function (this: ArmySoldierMonster): void {
      this._ai.pain(1);
    });

    const painBForward = [0, 13, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const painBMove = [0, 0, 0, 0, 0, 0, 4, 0, 10, 0, 0, 2, 0, 0];
    this._defineSequence('army_painb', this._createFrameNames('painb', 14),
      function (this: ArmySoldierMonster, frameIndex: number): void {
        if (painBForward[frameIndex] > 0) {
          this._ai.painforward(painBForward[frameIndex]);
          return;
        }

        if (painBMove[frameIndex] > 0) {
          this._ai.pain(painBMove[frameIndex]);
        }
      },
      false);
    this._defineState('army_painb14', 'painb14', 'army_run1');

    const painCForward = [0, 0, 1, 1, 0, 0, 4, 3, 6, 8, 0, 0, 0];
    const painCMove = [0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
    this._defineSequence('army_painc', this._createFrameNames('painc', 13),
      function (this: ArmySoldierMonster, frameIndex: number): void {
        if (painCForward[frameIndex] > 0) {
          this._ai.painforward(painCForward[frameIndex]);
          return;
        }

        if (painCMove[frameIndex] > 0) {
          this._ai.pain(painCMove[frameIndex]);
        }
      },
      false);
    this._defineState('army_painc13', 'painc13', 'army_run1');

    this._defineSequence('army_die', this._createFrameNames('death', 10),
      function (this: ArmySoldierMonster, frameIndex: number): void {
        if (frameIndex === 2) {
          this.solid = solid.SOLID_NOT;
          this._dropBackpack();
        }
      },
      false);

    this._defineSequence('army_cdie', this._createFrameNames('deathc', 11),
      function (this: ArmySoldierMonster, frameIndex: number): void {
        switch (frameIndex) {
          case 1:
            this._ai.back(5);
            break;
          case 2:
            this.solid = solid.SOLID_NOT;
            this._dropBackpack();
            this._ai.back(4);
            break;
          case 3:
            this._ai.back(13);
            break;
          case 4:
            this._ai.back(3);
            break;
          case 5:
            this._ai.back(4);
            break;
        }
      },
      false);
  }

  override thinkStand(): void {
    this._runState('army_stand1');
  }

  override thinkWalk(): void {
    this._runState('army_walk1');
  }

  override thinkRun(): void {
    this._runState('army_run1');
  }

  override thinkMissile(): void {
    this._runState('army_atk1');
  }

  override thinkPain(attackerEntity: BaseEntity, _damage: number): void {
    if (this.pain_finished > this.game.time) {
      return;
    }

    this._ai.foundTarget(attackerEntity, true);

    const random = Math.random();
    if (random < 0.2) {
      this.pain_finished = this.game.time + 0.6;
      this._runState('army_pain1');
    } else if (random < 0.6) {
      this.pain_finished = this.game.time + 1.1;
      this._runState('army_painb1');
    } else {
      this.pain_finished = this.game.time + 1.1;
      this._runState('army_painc1');
    }

    this.painSound();
  }

  override thinkDie(attackerEntity: BaseEntity): void {
    this._sub!.useTargets(attackerEntity);
    if (this.health < -35) {
      this._gib(true);
      return;
    }

    this.deathSound();
    this.solid = solid.SOLID_NOT;
    if (Math.random() < 0.5) {
      this._runState('army_die1');
      return;
    }

    this._runState('army_cdie1');
  }

  private _fire(): void {
    this._ai.face();
    this.attackSound();

    const enemy = this.enemy;
    if (!enemy) {
      return;
    }

    const direction = enemy.origin.copy().subtract(enemy.velocity.copy().multiply(0.2)).subtract(this.origin);
    direction.normalize();
    this._damageInflictor.fireBullets(4, direction, new Vector(0.1, 0.1, 0));
  }

  override _dropBackpack(): void {
    super._dropBackpack({ ammo_shells: 5 });
  }

  override deathSound(): void {
    this.startSound(channel.CHAN_VOICE, 'soldier/death1.wav');
  }

  override painSound(): void {
    if (Math.random() < 0.2) {
      this.startSound(channel.CHAN_VOICE, 'soldier/pain1.wav');
      return;
    }

    this.startSound(channel.CHAN_VOICE, 'soldier/pain2.wav');
  }

  override sightSound(): void {
    this.startSound(channel.CHAN_VOICE, 'soldier/sight1.wav');
  }

  override idleSound(): void {
    if (Math.random() >= 0.2) {
      return;
    }

    this.startSound(channel.CHAN_VOICE, 'soldier/idle.wav', 1.0, attn.ATTN_IDLE);
  }

  override attackSound(): void {
    this.startSound(channel.CHAN_WEAPON, 'soldier/sattck1.wav');
  }

  protected override hasMissileAttack(): boolean {
    return true;
  }
}

/**
 * QUAKED monster_enforcer (1 0 0) (-16 -16 -24) (16 16 40) Ambush
 */
@serializableObject
export class ArmyEnforcerMonster extends WalkMonster {
  static classname = 'monster_enforcer';
  static _health = 80;
  static _size: [Vector, Vector] = [new Vector(-16, -16, -24), new Vector(16, 16, 40)];

  static _modelDefault = 'progs/enforcer.mdl';
  static _modelHead = 'progs/h_mega.mdl';

  static _modelQC = `
$cd id1/models/enforcer
$origin 0 -6 24
$base base
$skin skin

$frame stand1 stand2 stand3 stand4 stand5 stand6 stand7

$frame walk1 walk2 walk3 walk4 walk5 walk6 walk7 walk8 walk9 walk10
$frame walk11 walk12 walk13 walk14 walk15 walk16

$frame run1 run2 run3 run4 run5 run6 run7 run8

$frame attack1 attack2 attack3 attack4 attack5 attack6
$frame attack7 attack8 attack9 attack10

$frame death1 death2 death3 death4 death5 death6 death7 death8
$frame death9 death10 death11 death12 death13 death14

$frame fdeath1 fdeath2 fdeath3 fdeath4 fdeath5 fdeath6 fdeath7 fdeath8
$frame fdeath9 fdeath10 fdeath11

$frame paina1 paina2 paina3 paina4

$frame painb1 painb2 painb3 painb4 painb5

$frame painc1 painc2 painc3 painc4 painc5 painc6 painc7 painc8

$frame paind1 paind2 paind3 paind4 paind5 paind6 paind7 paind8
$frame paind9 paind10 paind11 paind12 paind13 paind14 paind15 paind16
$frame paind17 paind18 paind19
`;

  get netname(): string {
    return 'an Enforcer';
  }

  protected override _newEntityAI(): ReturnType<WalkMonster['_newEntityAI']> {
    return new QuakeEntityAI(this);
  }

  override _precache(): void {
    super._precache();

    this.engine.PrecacheModel('progs/laser.mdl');
    this.engine.PrecacheSound('enforcer/death1.wav');
    this.engine.PrecacheSound('enforcer/enfire.wav');
    this.engine.PrecacheSound('enforcer/enfstop.wav');
    this.engine.PrecacheSound('enforcer/idle1.wav');
    this.engine.PrecacheSound('enforcer/pain1.wav');
    this.engine.PrecacheSound('enforcer/pain2.wav');
    this.engine.PrecacheSound('enforcer/sight1.wav');
    this.engine.PrecacheSound('enforcer/sight2.wav');
    this.engine.PrecacheSound('enforcer/sight3.wav');
    this.engine.PrecacheSound('enforcer/sight4.wav');
  }

  static override _initStates(): void {
    this._defineSequence('enf_stand', this._createFrameNames('stand', 7), function (this: ArmyEnforcerMonster): void {
      this._ai.stand();
    });

    const walkSpeeds = [2, 4, 4, 3, 1, 2, 2, 1, 2, 4, 4, 1, 2, 3, 4, 2];
    this._defineSequence('enf_walk', this._createFrameNames('walk', walkSpeeds.length),
      function (this: ArmyEnforcerMonster, frameIndex: number): void {
        if (frameIndex === 0) {
          this.idleSound();
        }

        this._ai.walk(walkSpeeds[frameIndex]);
      });

    const runSpeeds = [18, 14, 7, 12, 14, 14, 7, 11];
    this._defineSequence('enf_run', this._createFrameNames('run', runSpeeds.length),
      function (this: ArmyEnforcerMonster, frameIndex: number): void {
        if (frameIndex === 0) {
          this.idleSound();
        }

        this._ai.run(runSpeeds[frameIndex]);
      });

    const attackFrames = ['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'attack6', 'attack7', 'attack8', 'attack5', 'attack6', 'attack7', 'attack8', 'attack9', 'attack10'];
    this._defineSequence('enf_atk', attackFrames,
      function (this: ArmyEnforcerMonster, frameIndex: number): void {
        if (frameIndex === 5 || frameIndex === 9) {
          this.fire();
          return;
        }

        this._ai.face();
        if (frameIndex === 13) {
          this._refire('enf_atk1');
        }
      },
      false);
    this._defineState('enf_atk14', 'attack10', 'enf_run1', function (this: ArmyEnforcerMonster): void {
      this._ai.face();
      this._refire('enf_atk1');
    });

    this._defineSequence('enf_paina', this._createFrameNames('paina', 4), null, false);
    this._defineState('enf_paina4', 'paina4', 'enf_run1');

    this._defineSequence('enf_painb', this._createFrameNames('painb', 5), null, false);
    this._defineState('enf_painb5', 'painb5', 'enf_run1');

    this._defineSequence('enf_painc', this._createFrameNames('painc', 8), null, false);
    this._defineState('enf_painc8', 'painc8', 'enf_run1');

    const painDForward = [0, 0, 0, 2, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0];
    const painDMove = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0];
    this._defineSequence('enf_paind', this._createFrameNames('paind', 19),
      function (this: ArmyEnforcerMonster, frameIndex: number): void {
        if (painDForward[frameIndex] > 0) {
          this._ai.painforward(painDForward[frameIndex]);
          return;
        }

        if (painDMove[frameIndex] > 0) {
          this._ai.pain(painDMove[frameIndex]);
        }
      },
      false);
    this._defineState('enf_paind19', 'paind19', 'enf_run1');

    this._defineSequence('enf_die', this._createFrameNames('death', 14),
      function (this: ArmyEnforcerMonster, frameIndex: number): void {
        switch (frameIndex) {
          case 2:
            this.solid = solid.SOLID_NOT;
            this._dropBackpack({ ammo_cells: 5 });
            break;
          case 3:
            this._ai.forward(14);
            break;
          case 4:
            this._ai.forward(2);
            break;
          case 8:
            this._ai.forward(3);
            break;
          case 9:
          case 10:
          case 11:
            this._ai.forward(5);
            break;
        }
      },
      false);
    this._defineState('enf_die14', 'death14', 'enf_die14');

    this._defineSequence('enf_fdie', this._createFrameNames('fdeath', 11),
      function (this: ArmyEnforcerMonster, frameIndex: number): void {
        if (frameIndex === 2) {
          this.solid = solid.SOLID_NOT;
          this._dropBackpack({ ammo_cells: 5 });
        }
      },
      false);
    this._defineState('enf_fdie11', 'fdeath11', 'enf_fdie11');
  }

  private fire(): void {
    this.effects |= effect.EF_MUZZLEFLASH;

    const { forward, right } = this.angles.angleVectors();
    const origin = this.origin.copy().add(forward.multiply(30)).add(right.multiply(8.5)).add(new Vector(0, 0, 16));

    const enemy = this.enemy;
    console.assert(enemy, 'enforcer fire requires enemy');
    if (!enemy) {
      return;
    }

    const movedir = enemy.origin.copy().subtract(this.origin);
    movedir.normalize();
    this.movedir.set(movedir);

    const laser = this.engine.SpawnEntity<Laser>(Laser.classname, { owner: this })?.entity ?? null;
    console.assert(laser instanceof Laser, 'failed to spawn enforcer laser');
    if (laser === null) {
      return;
    }

    laser.setOrigin(origin);
  }

  override thinkPain(attackerEntity: BaseEntity, _damage: number): void {
    if (this.pain_finished > this.game.time) {
      return;
    }

    this._ai.foundTarget(attackerEntity, true);
    const random = Math.random();

    this.pain_finished = this.game.time + 1.0;

    if (random < 0.2) {
      this._runState('enf_paina1');
    } else if (random < 0.4) {
      this._runState('enf_painb1');
    } else if (random < 0.7) {
      this._runState('enf_painc1');
    } else {
      this._runState('enf_paind1');
    }

    this.painSound();
  }

  override thinkDie(attackerEntity: BaseEntity): void {
    this._sub!.useTargets(attackerEntity);

    if (this.health < -35) {
      this._gib(true);
      return;
    }

    this.deathSound();

    if (Math.random() < 0.5) {
      this._runState('enf_die1');
      return;
    }

    this._runState('enf_fdie1');
  }

  override thinkStand(): void {
    this._runState('enf_stand1');
  }

  override thinkWalk(): void {
    this._runState('enf_walk1');
  }

  override thinkRun(): void {
    this._runState('enf_run1');
  }

  override thinkMissile(): void {
    this._runState('enf_atk1');
  }

  override idleSound(): void {
    if (Math.random() >= 0.2) {
      return;
    }

    this.startSound(channel.CHAN_VOICE, 'enforcer/idle1.wav');
  }

  override painSound(): void {
    if (Math.random() < 0.5) {
      this.startSound(channel.CHAN_VOICE, 'enforcer/pain1.wav');
      return;
    }

    this.startSound(channel.CHAN_VOICE, 'enforcer/pain2.wav');
  }

  override deathSound(): void {
    this.startSound(channel.CHAN_VOICE, 'enforcer/death1.wav');
  }

  override sightSound(): void {
    const random = Math.random();
    if (random < 0.25) {
      this.startSound(channel.CHAN_VOICE, 'enforcer/sight1.wav');
    } else if (random < 0.5) {
      this.startSound(channel.CHAN_VOICE, 'enforcer/sight2.wav');
    } else if (random < 0.75) {
      this.startSound(channel.CHAN_VOICE, 'enforcer/sight3.wav');
    } else {
      this.startSound(channel.CHAN_VOICE, 'enforcer/sight4.wav');
    }
  }

  protected override hasMissileAttack(): boolean {
    return true;
  }
}
