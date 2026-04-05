import type { ServerEngineAPI } from '../../../../shared/GameInterfaces.ts';

import Vector from '../../../../shared/Vector.ts';

import { channel, solid, tentType } from '../../Defs.ts';
import { QuakeEntityAI } from '../../helper/AI.mjs';
import { entity } from '../../helper/MiscHelpers.ts';
import type BaseEntity from '../BaseEntity.ts';
import { BaseSpike } from '../Weapons.mjs';
import BaseMonster, { WalkMonster } from './BaseMonster.ts';

@entity
export class KnightMonster extends WalkMonster {
  static classname = 'monster_knight';

  static _health = 75;
  static _size: [Vector, Vector] = [new Vector(-16, -16, -24), new Vector(16, 16, 40)];

  static _modelDefault = 'progs/knight.mdl';
  static _modelHead = 'progs/h_knight.mdl';

  static _modelQC = `
$cd id1/models/knight
$origin 0 0 24
$base base
$skin badass3

$frame stand1 stand2 stand3 stand4 stand5 stand6 stand7 stand8 stand9

$frame runb1 runb2 runb3 runb4 runb5 runb6 runb7 runb8

//frame runc1 runc2 runc3 runc4 runc5 runc6

$frame runattack1 runattack2 runattack3 runattack4 runattack5
$frame runattack6 runattack7 runattack8 runattack9 runattack10
$frame runattack11

$frame pain1 pain2 pain3

$frame painb1 painb2 painb3 painb4 painb5 painb6 painb7 painb8 painb9
$frame painb10 painb11

//frame attack1 attack2 attack3 attack4 attack5 attack6 attack7
//frame attack8 attack9 attack10 attack11

$frame attackb1 attackb1 attackb2 attackb3 attackb4 attackb5
$frame attackb6 attackb7 attackb8 attackb9 attackb10

$frame walk1 walk2 walk3 walk4 walk5 walk6 walk7 walk8 walk9
$frame walk10 walk11 walk12 walk13 walk14

$frame kneel1 kneel2 kneel3 kneel4 kneel5

$frame standing2 standing3 standing4 standing5

$frame death1 death2 death3 death4 death5 death6 death7 death8
$frame death9 death10

$frame deathb1 deathb2 deathb3 deathb4 deathb5 deathb6 deathb7 deathb8
$frame deathb9 deathb10 deathb11
`;

  protected get _quakeAI(): QuakeEntityAI<BaseMonster> {
    return this._ai as QuakeEntityAI<BaseMonster>;
  }

  get netname(): string {
    return 'a Knight';
  }

  protected override _newEntityAI(): ReturnType<WalkMonster['_newEntityAI']> {
    return new QuakeEntityAI(this);
  }

  override _precache(): void {
    super._precache();
    this.engine.PrecacheSound('knight/kdeath.wav');
    this.engine.PrecacheSound('knight/khurt.wav');
    this.engine.PrecacheSound('knight/ksight.wav');
    this.engine.PrecacheSound('knight/sword1.wav');
    this.engine.PrecacheSound('knight/sword2.wav');
    this.engine.PrecacheSound('knight/idle.wav');
  }

  static override _initStates(): void {
    this._defineSequence('knight_stand', this._createFrameNames('stand', 9), function (this: KnightMonster): void {
      this._ai.stand();
    });

    const walkSpeeds = [3, 2, 3, 4, 3, 3, 3, 4, 3, 3, 2, 3, 4, 3];
    this._defineSequence('knight_walk', this._createFrameNames('walk', walkSpeeds.length),
      function (this: KnightMonster, frameIndex: number): void {
        if (frameIndex === 0) {
          this.idleSound();
        }

        this._ai.walk(walkSpeeds[frameIndex]);
      });

    const runSpeeds = [16, 20, 13, 7, 16, 20, 14, 6];
    this._defineSequence('knight_run', this._createFrameNames('runb', runSpeeds.length),
      function (this: KnightMonster, frameIndex: number): void {
        if (frameIndex === 0) {
          this.idleSound();
        }

        this._ai.run(runSpeeds[frameIndex]);
      });

    this._defineSequence('knight_runatk', this._createFrameNames('runattack', 11),
      function (this: KnightMonster, frameIndex: number): void {
        switch (frameIndex) {
          case 0:
            this.attackSound();
            this._ai.charge(20);
            return;
          case 1:
          case 2:
          case 3:
          case 9:
            this._quakeAI.chargeSide();
            return;
          case 4:
          case 5:
          case 6:
          case 7:
          case 8:
            this._quakeAI.meleeSide();
            return;
          case 10:
            this._ai.charge(10);
            return;
        }
      },
      false);
    this._defineState('knight_runatk11', 'runattack11', 'knight_run1', function (this: KnightMonster): void {
      this._ai.charge(10);
    });

    this._defineSequence('knight_atk', this._createFrameNames('attackb', 10),
      function (this: KnightMonster, frameIndex: number): void {
        switch (frameIndex) {
          case 0:
            this.attackSound();
            this._ai.charge(0);
            return;
          case 1:
            this._ai.charge(7);
            return;
          case 2:
            this._ai.charge(4);
            return;
          case 3:
            this._ai.charge(0);
            return;
          case 4:
            this._ai.charge(3);
            return;
          case 5:
            this._ai.charge(4);
            this._quakeAI.melee();
            return;
          case 6:
            this._ai.charge(1);
            this._quakeAI.melee();
            return;
          case 7:
            this._ai.charge(3);
            this._quakeAI.melee();
            return;
          case 8:
            this._ai.charge(1);
            return;
          case 9:
            this._ai.charge(5);
            return;
        }
      },
      false);
    this._defineState('knight_atk10', 'attackb10', 'knight_run1', function (this: KnightMonster): void {
      this._ai.charge(5);
    });

    this._defineSequence('knight_pain', this._createFrameNames('pain', 3),
      function (this: KnightMonster, frameIndex: number): void {
        if (frameIndex === 0) {
          this.painSound();
        }
      },
      false);
    this._defineState('knight_pain3', 'pain3', 'knight_run1');

    const painForward: Array<number | null> = [0, 3, null, null, 2, 4, 2, 5, 5, 0, null];
    this._defineSequence('knight_painb', this._createFrameNames('painb', 11),
      function (this: KnightMonster, frameIndex: number): void {
        const forwardDistance = painForward[frameIndex];
        if (forwardDistance !== null) {
          this._quakeAI.painforward(forwardDistance);
        }
      },
      false);
    this._defineState('knight_painb11', 'painb11', 'knight_run1');

    const bowFrames = ['kneel1', 'kneel2', 'kneel3', 'kneel4', 'kneel5', 'kneel4', 'kneel3', 'kneel2', 'kneel1', 'walk1'];
    const bowStates = ['knight_bow1', 'knight_bow2', 'knight_bow3', 'knight_bow4', 'knight_bow5', 'knight_bow6', 'knight_bow7', 'knight_bow8', 'knight_bow9', 'knight_bow10'];
    const bowNextStates = ['knight_bow2', 'knight_bow3', 'knight_bow4', 'knight_bow5', 'knight_bow5', 'knight_bow7', 'knight_bow8', 'knight_bow9', 'knight_bow10', 'knight_walk1'];
    for (let i = 0; i < bowStates.length; i++) {
      this._defineState(bowStates[i], bowFrames[i], bowNextStates[i], function (this: KnightMonster): void {
        this._quakeAI.turn();
      });
    }

    this._defineSequence('knight_die', this._createFrameNames('death', 10),
      function (this: KnightMonster, frameIndex: number): void {
        if (frameIndex === 2) {
          this.solid = solid.SOLID_NOT;
        }
      },
      false);

    this._defineSequence('knight_dieb', this._createFrameNames('deathb', 11),
      function (this: KnightMonster, frameIndex: number): void {
        if (frameIndex === 2) {
          this.solid = solid.SOLID_NOT;
        }
      },
      false);
  }

  override idleSound(): void {
    if (Math.random() < 0.2) {
      this.startSound(channel.CHAN_VOICE, 'knight/idle.wav');
    }
  }

  override attackSound(): void {
    if (Math.random() > 0.5) {
      this.startSound(channel.CHAN_WEAPON, 'knight/sword2.wav');
      return;
    }

    this.startSound(channel.CHAN_WEAPON, 'knight/sword1.wav');
  }

  override painSound(): void {
    this.startSound(channel.CHAN_VOICE, 'knight/khurt.wav');
  }

  override sightSound(): void {
    this.startSound(channel.CHAN_VOICE, 'knight/ksight.wav');
  }

  override thinkStand(): void {
    this._runState('knight_stand1');
  }

  override thinkWalk(): void {
    this._runState('knight_walk1');
  }

  override thinkRun(): void {
    this._runState('knight_run1');
  }

  override thinkMelee(): void {
    const enemy = this.enemy;
    if (enemy !== null) {
      const distance = enemy.origin.copy().add(enemy.view_ofs).subtract(this.origin.copy().add(this.view_ofs)).len();
      if (distance < 80) {
        this._runState('knight_atk1');
        return;
      }

      this._runState('knight_runatk1');
      return;
    }

    this._runState('knight_atk1');
  }

  override thinkPain(attackerEntity: BaseEntity, _damage: number): void {
    if (this.pain_finished > this.game.time) {
      return;
    }

    this._ai.foundTarget(attackerEntity, true);

    if (Math.random() < 0.85) {
      this._runState('knight_pain1');
      return;
    }

    this._runState('knight_painb1');
    this.pain_finished = this.game.time + 1;
    this.painSound();
  }

  override thinkDie(attackerEntity: BaseEntity): void {
    this._sub!.useTargets(attackerEntity);
    if (this.health < -40) {
      this.startSound(channel.CHAN_VOICE, 'player/udeath.wav');
      this._gib(true);
      return;
    }

    this.deathSound();
    this.solid = solid.SOLID_NOT;
    if (Math.random() < 0.5) {
      this._runState('knight_die1');
      return;
    }

    this._runState('knight_dieb1');
  }

  protected override hasMeleeAttack(): boolean {
    return true;
  }
}

@entity
export class KnightSpike extends BaseSpike {
  static classname = 'knightspike';

  static _damage = 9;
  static _tentType = tentType.TE_SPIKE;
  static _model = 'progs/k_spike.mdl';

  static override _precache(engineAPI: ServerEngineAPI): void {
    if (!engineAPI.registered) {
      return;
    }

    super._precache(engineAPI);
  }
}

@entity
export class HellKnightMonster extends KnightMonster {
  static classname = 'monster_hell_knight';

  static _health = 250;

  static _modelDefault = 'progs/hknight.mdl';
  static _modelHead = 'progs/h_hellkn.mdl';

  static _modelQC = `
$cd id1/models/knight2
$origin 0 0 24
$base base
$skin skin

$frame stand1 stand2 stand3 stand4 stand5 stand6 stand7 stand8 stand9

$frame walk1 walk2 walk3 walk4 walk5 walk6 walk7 walk8 walk9
$frame walk10 walk11 walk12 walk13 walk14 walk15 walk16 walk17
$frame walk18 walk19 walk20

$frame run1 run2 run3 run4 run5 run6 run7 run8

$frame pain1 pain2 pain3 pain4 pain5

$frame death1 death2 death3 death4 death5 death6 death7 death8
$frame death9 death10 death11 death12

$frame deathb1 deathb2 deathb3 deathb4 deathb5 deathb6 deathb7 deathb8
$frame deathb9

$frame char_a1 char_a2 char_a3 char_a4 char_a5 char_a6 char_a7 char_a8
$frame char_a9 char_a10 char_a11 char_a12 char_a13 char_a14 char_a15 char_a16

$frame magica1 magica2 magica3 magica4 magica5 magica6 magica7 magica8
$frame magica9 magica10 magica11 magica12 magica13 magica14

$frame magicb1 magicb2 magicb3 magicb4 magicb5 magicb6 magicb7 magicb8
$frame magicb9 magicb10 magicb11 magicb12 magicb13

$frame char_b1 char_b2 char_b3 char_b4 char_b5 char_b6

$frame slice1 slice2 slice3 slice4 slice5 slice6 slice7 slice8 slice9 slice10

$frame smash1 smash2 smash3 smash4 smash5 smash6 smash7 smash8 smash9 smash10
$frame smash11

$frame w_attack1 w_attack2 w_attack3 w_attack4 w_attack5 w_attack6 w_attack7
$frame w_attack8 w_attack9 w_attack10 w_attack11 w_attack12 w_attack13 w_attack14
$frame w_attack15 w_attack16 w_attack17 w_attack18 w_attack19 w_attack20
$frame w_attack21 w_attack22

$frame magicc1 magicc2 magicc3 magicc4 magicc5 magicc6 magicc7 magicc8
$frame magicc9 magicc10 magicc11
`;

  get netname(): string {
    return 'a Death Knight';
  }

  override _precache(): void {
    super._precache();

    this.engine.PrecacheModel('progs/k_spike.mdl');
    this.engine.PrecacheSound('hknight/attack1.wav');
    this.engine.PrecacheSound('hknight/death1.wav');
    this.engine.PrecacheSound('hknight/pain1.wav');
    this.engine.PrecacheSound('hknight/sight1.wav');
    this.engine.PrecacheSound('hknight/hit.wav');
    this.engine.PrecacheSound('hknight/slash1.wav');
    this.engine.PrecacheSound('hknight/idle.wav');
    this.engine.PrecacheSound('hknight/grunt.wav');
    this.engine.PrecacheSound('knight/sword1.wav');
    this.engine.PrecacheSound('knight/sword2.wav');
  }

  static override _initStates(): void {
    this._defineSequence('hknight_stand', this._createFrameNames('stand', 9), function (this: HellKnightMonster): void {
      this._ai.stand();
    });

    const walkSpeeds = [2, 5, 5, 4, 4, 2, 2, 3, 3, 4, 3, 4, 6, 2, 2, 4, 3, 3, 3, 2];
    this._defineSequence('hknight_walk', this._createFrameNames('walk', walkSpeeds.length),
      function (this: HellKnightMonster, frameIndex: number): void {
        if (frameIndex === 0) {
          this.idleSound();
        }

        this._ai.walk(walkSpeeds[frameIndex]);
      });

    const runSpeeds = [20, 25, 18, 16, 14, 25, 21, 13];
    this._defineSequence('hknight_run', this._createFrameNames('run', runSpeeds.length),
      function (this: HellKnightMonster, frameIndex: number): void {
        if (frameIndex === 0) {
          this.idleSound();
          this._ai.run(runSpeeds[frameIndex]);
          this._checkForCharge();
          return;
        }

        this._ai.run(runSpeeds[frameIndex]);
      });

    this._defineSequence('hknight_pain', this._createFrameNames('pain', 5),
      function (this: HellKnightMonster, frameIndex: number): void {
        if (frameIndex === 0) {
          this.painSound();
        }
      },
      false);
    this._defineState('hknight_pain5', 'pain5', 'hknight_run1');

    const dieForward: Array<number | null> = [10, 8, 7, null, null, null, null, 10, 11, null, null, null];
    this._defineSequence('hknight_die', this._createFrameNames('death', 12),
      function (this: HellKnightMonster, frameIndex: number): void {
        if (frameIndex === 2) {
          this.solid = solid.SOLID_NOT;
        }

        const forwardDistance = dieForward[frameIndex];
        if (forwardDistance !== null) {
          this._quakeAI.forward(forwardDistance);
        }
      },
      false);

    this._defineSequence('hknight_dieb', this._createFrameNames('deathb', 9),
      function (this: HellKnightMonster, frameIndex: number): void {
        if (frameIndex === 2) {
          this.solid = solid.SOLID_NOT;
        }
      },
      false);

    this._defineSequence('hknight_magica', this._createFrameNames('magica', 14),
      function (this: HellKnightMonster, frameIndex: number): void {
        if (frameIndex < 6 || frameIndex > 11) {
          this._ai.face();
          return;
        }

        this.attackShot(frameIndex - 8);
      },
      false);
    this._defineState('hknight_magica14', 'magica14', 'hknight_run1', function (this: HellKnightMonster): void {
      this._ai.face();
    });

    this._defineSequence('hknight_magicb', this._createFrameNames('magicb', 13),
      function (this: HellKnightMonster, frameIndex: number): void {
        if (frameIndex < 6 || frameIndex === 12) {
          this._ai.face();
          return;
        }

        this.attackShot(frameIndex - 8);
      },
      false);
    this._defineState('hknight_magicb13', 'magicb13', 'hknight_run1', function (this: HellKnightMonster): void {
      this._ai.face();
    });

    this._defineSequence('hknight_magicc', this._createFrameNames('magicc', 11),
      function (this: HellKnightMonster, frameIndex: number): void {
        if (frameIndex < 5) {
          this._ai.face();
          return;
        }

        this.attackShot(frameIndex - 7);
      },
      false);
    this._defineState('hknight_magicc11', 'magicc11', 'hknight_run1', function (this: HellKnightMonster): void {
      this.attackShot(3);
    });

    const chargeASpeeds = [20, 25, 18, 16, 14, 20, 21, 13, 20, 20, 18, 16, 14, 25, 21, 13];
    this._defineSequence('hknight_char_a', this._createFrameNames('char_a', chargeASpeeds.length),
      function (this: HellKnightMonster, frameIndex: number): void {
        this._ai.charge(chargeASpeeds[frameIndex]);
        if (frameIndex >= 5 && frameIndex <= 10) {
          this._quakeAI.melee();
        }
      },
      false);
    this._defineState('hknight_char_a16', 'char_a16', 'hknight_run1', function (this: HellKnightMonster): void {
      this._ai.charge(13);
    });

    const chargeBSpeeds = [23, 17, 12, 22, 18, 8];
    this._defineSequence('hknight_char_b', this._createFrameNames('char_b', chargeBSpeeds.length),
      function (this: HellKnightMonster, frameIndex: number): void {
        if (frameIndex === 0) {
          this._checkContinueCharge();
        }

        this._ai.charge(chargeBSpeeds[frameIndex]);
        this._quakeAI.melee();
      });

    const sliceCharge: Array<number | null> = [9, 6, 13, 4, 7, 15, 8, 2, null, 3];
    const sliceMelee = new Set([4, 5, 6, 7, 8]);
    this._defineSequence('hknight_slice', this._createFrameNames('slice', 10),
      function (this: HellKnightMonster, frameIndex: number): void {
        const chargeDistance = sliceCharge[frameIndex];
        if (chargeDistance !== null) {
          this._ai.charge(chargeDistance);
        }

        if (sliceMelee.has(frameIndex)) {
          this._quakeAI.melee();
        }
      },
      false);
    this._defineState('hknight_slice10', 'slice10', 'hknight_run1', function (this: HellKnightMonster): void {
      this._ai.charge(3);
    });

    const smashSpeeds = [1, 13, 9, 11, 10, 7, 12, 2, 3, 0, 0];
    const smashMelee = new Set([4, 5, 6, 7, 8]);
    this._defineSequence('hknight_smash', this._createFrameNames('smash', 11),
      function (this: HellKnightMonster, frameIndex: number): void {
        this._ai.charge(smashSpeeds[frameIndex]);
        if (smashMelee.has(frameIndex)) {
          this._quakeAI.melee();
        }
      },
      false);
    this._defineState('hknight_smash11', 'smash11', 'hknight_run1', function (this: HellKnightMonster): void {
      this._ai.charge(0);
    });

    const wAttackCharge: Array<number | null> = [2, 0, 0, null, null, null, 1, 4, 5, 3, 2, 2, 0, 0, 0, 1, 1, 3, 4, 6, 7, 3];
    const wAttackMelee = new Set([3, 4, 5, 9, 10, 11, 16, 17, 18]);
    this._defineSequence('hknight_watk', this._createFrameNames('w_attack', 22),
      function (this: HellKnightMonster, frameIndex: number): void {
        const chargeDistance = wAttackCharge[frameIndex];
        if (chargeDistance !== null) {
          this._ai.charge(chargeDistance);
        }

        if (wAttackMelee.has(frameIndex)) {
          this._quakeAI.melee();
        }
      },
      false);
    this._defineState('hknight_watk22', 'w_attack22', 'hknight_run1', function (this: HellKnightMonster): void {
      this._ai.charge(3);
    });
  }

  attackShot(offsetY: number): void {
    if (this.enemy) {
      const offsetAngles = this.enemy.origin.copy().subtract(this.origin).toAngles();
      offsetAngles[1] += offsetY * 6;

      const { forward } = offsetAngles.angleVectors();
      forward.normalize();
      forward[2] = -forward[2] + (Math.random() - 0.5) * 0.1;
      this.movedir.set(forward);
    }

    this.engine.SpawnEntity(KnightSpike.classname, {
      speed: 300,
      owner: this,
    });

    this.startSound(channel.CHAN_WEAPON, 'hknight/attack1.wav');
  }

  override thinkMelee(): void {
    const random = Math.random();
    this.startSound(channel.CHAN_WEAPON, 'hknight/slash1.wav');

    if (random < 0.33) {
      this._runState('hknight_slice1');
    } else if (random < 0.66) {
      this._runState('hknight_smash1');
    } else {
      this._runState('hknight_watk1');
    }
  }

  private _checkForCharge(): void {
    if (!this._quakeAI.enemyIsVisible) {
      return;
    }

    if (this.game.time < this.attack_finished) {
      return;
    }

    const enemy = this.enemy;
    if (!enemy) {
      return;
    }

    if (Math.abs(this.origin[2] - enemy.origin[2]) > 20) {
      return;
    }

    if (this.origin.distanceTo(enemy.origin) < 80) {
      return;
    }

    this.attackFinished(2.0);
    this._runState('hknight_char_a1');
  }

  private _checkContinueCharge(): void {
    if (this.game.time > this.attack_finished) {
      this.attackFinished(3.0);
      this._runState('hknight_run1');
      return;
    }

    if (Math.random() > 0.5) {
      this.startSound(channel.CHAN_WEAPON, 'knight/sword2.wav');
      return;
    }

    this.startSound(channel.CHAN_WEAPON, 'knight/sword1.wav');
  }

  override thinkPain(attackerEntity: BaseEntity, damage: number): void {
    if (this.pain_finished > this.game.time) {
      return;
    }

    this._ai.foundTarget(attackerEntity, true);
    this.painSound();

    if (this.game.time - this.pain_finished > 5) {
      this._runState('hknight_pain1');
      this.pain_finished = this.game.time + 1;
      return;
    }

    if (Math.random() * 30 > damage) {
      return;
    }

    this.pain_finished = this.game.time + 1;
    this._runState('hknight_pain1');
  }

  override thinkStand(): void {
    this._runState('hknight_stand1');
  }

  override thinkWalk(): void {
    this._runState('hknight_walk1');
  }

  override thinkRun(): void {
    this._runState('hknight_run1');
  }

  override thinkMissile(): void {
    this._runState('hknight_magicc1');
  }

  override thinkDie(attackerEntity: BaseEntity): void {
    this._sub!.useTargets(attackerEntity);
    if (this.health < -40) {
      this.startSound(channel.CHAN_VOICE, 'player/udeath.wav');
      this._gib(true);
      return;
    }

    this.deathSound();
    this.solid = solid.SOLID_NOT;
    if (Math.random() > 0.5) {
      this._runState('hknight_die1');
      return;
    }

    this._runState('hknight_dieb1');
  }

  override idleSound(): void {
    if (Math.random() < 0.2) {
      this.startSound(channel.CHAN_VOICE, 'hknight/idle.wav');
    }
  }

  override attackSound(): void {
    if (Math.random() > 0.5) {
      this.startSound(channel.CHAN_WEAPON, 'knight/sword2.wav');
      return;
    }

    this.startSound(channel.CHAN_WEAPON, 'knight/sword1.wav');
  }

  override painSound(): void {
    this.startSound(channel.CHAN_VOICE, 'hknight/pain1.wav');
  }

  override sightSound(): void {
    this.startSound(channel.CHAN_VOICE, 'hknight/sight1.wav');
  }

  override deathSound(): void {
    this.startSound(channel.CHAN_VOICE, 'hknight/death1.wav');
  }

  protected override hasMeleeAttack(): boolean {
    return true;
  }

  protected override hasMissileAttack(): boolean {
    return true;
  }
}
