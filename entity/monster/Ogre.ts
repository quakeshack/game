import Vector from '../../../../shared/Vector.ts';

import { attn, channel, solid } from '../../Defs.ts';
import { QuakeEntityAI } from '../../helper/AI.ts';
import { serializableObject } from '../../helper/MiscHelpers.ts';
import type BaseEntity from '../BaseEntity.ts';
import { GibEntity, PlayerEntity } from '../Player.ts';
import { Grenade } from '../Weapons.ts';
import BaseMonster, { WalkMonster } from './BaseMonster.ts';

@serializableObject
export default class OgreMonsterEntity extends WalkMonster {
  static classname = 'monster_ogre';

  static _health = 200;
  static _size: [Vector, Vector] = [new Vector(-32.0, -32.0, -24.0), new Vector(32.0, 32.0, 64.0)];

  static _modelDefault = 'progs/ogre.mdl';
  static _modelHead = 'progs/h_ogre.mdl';

  static _modelQC = `
$cd id1/models/ogre_c
$origin 0 0 24
$base base
$skin base

$frame	stand1 stand2 stand3 stand4 stand5 stand6 stand7 stand8 stand9

$frame walk1 walk2 walk3 walk4 walk5 walk6 walk7
$frame walk8 walk9 walk10 walk11 walk12 walk13 walk14 walk15 walk16

$frame run1 run2 run3 run4 run5 run6 run7 run8

$frame swing1 swing2 swing3 swing4 swing5 swing6 swing7
$frame swing8 swing9 swing10 swing11 swing12 swing13 swing14

$frame smash1 smash2 smash3 smash4 smash5 smash6 smash7
$frame smash8 smash9 smash10 smash11 smash12 smash13 smash14

$frame shoot1 shoot2 shoot3 shoot4 shoot5 shoot6

$frame pain1 pain2 pain3 pain4 pain5

$frame painb1 painb2 painb3

$frame painc1 painc2 painc3 painc4 painc5 painc6

$frame paind1 paind2 paind3 paind4 paind5 paind6 paind7 paind8 paind9 paind10
$frame paind11 paind12 paind13 paind14 paind15 paind16

$frame paine1 paine2 paine3 paine4 paine5 paine6 paine7 paine8 paine9 paine10
$frame paine11 paine12 paine13 paine14 paine15

$frame death1 death2 death3 death4 death5 death6
$frame death7 death8 death9 death10 death11 death12
$frame death13 death14

$frame bdeath1 bdeath2 bdeath3 bdeath4 bdeath5 bdeath6
$frame bdeath7 bdeath8 bdeath9 bdeath10

$frame pull1 pull2 pull3 pull4 pull5 pull6 pull7 pull8 pull9 pull10 pull11
`;

  get netname(): string {
    return 'an Ogre';
  }

  protected override _newEntityAI(): ReturnType<WalkMonster['_newEntityAI']> {
    return new QuakeEntityAI(this);
  }

  static override _initStates(): void {
    const standFrames = this._createFrameNames('stand', 9);
    this._defineSequence('ogre_stand', standFrames,
      function (this: OgreMonsterEntity, frameIndex: number): void {
        this._ai.stand();
        if (frameIndex === 4) {
          this.idleSound();
        }
      });

    const walkSpeeds = [3, 2, 2, 2, 2, 5, 3, 2, 3, 1, 2, 3, 3, 3, 3, 4];
    const walkFrames = this._createFrameNames('walk', walkSpeeds.length);
    this._defineSequence('ogre_walk', walkFrames,
      function (this: OgreMonsterEntity, frameIndex: number): void {
        this._ai.walk(walkSpeeds[frameIndex]);
        if (frameIndex === 2) {
          this.idleSound();
        }
        if (frameIndex === 5) {
          this.dragSound();
        }
      });

    const runSpeeds = [9, 12, 8, 22, 16, 4, 13, 24];
    const runFrames = this._createFrameNames('run', runSpeeds.length);
    this._defineSequence('ogre_run', runFrames,
      function (this: OgreMonsterEntity, frameIndex: number): void {
        this._ai.run(runSpeeds[frameIndex]);
        if (frameIndex === 0) {
          this.idleSound();
        }
      });

    const swingFrames = this._createFrameNames('swing', 14);
    const swingCharges = [11, 1, 4, 13, 9, null, null, null, null, null, null, 3, 8, 9];
    const swingChainsawSides = [null, null, null, null, 0, 200, 0, 0, 0, -200, 0, null, null, null];
    this._defineSequence('ogre_swing', swingFrames,
      function (this: OgreMonsterEntity, frameIndex: number): void {
        const charge = swingCharges[frameIndex];
        if (charge !== null) {
          this._ai.charge(charge);
        }

        if (frameIndex === 0) {
          this.attackSound();
        }

        const chainsawSide = swingChainsawSides[frameIndex];
        if (chainsawSide !== null) {
          this._fireChainsaw(chainsawSide);
          this.angles[1] += Math.random() * 25;
        }
      },
      false);
    this._defineState('ogre_swing14', 'swing14', 'ogre_run1', function (this: OgreMonsterEntity): void {
      this._ai.charge(9);
    });

    const smashFrames = this._createFrameNames('smash', 14);
    const smashCharges = [6, 0, 0, 1, 4, 4, 4, 10, 13, null, 2, 'default', 4, 12] as const;
    const smashChainsawSides = [null, null, null, null, null, 0, 0, 0, 0, 1, 0, null, null, null];
    this._defineSequence('ogre_smash', smashFrames,
      function (this: OgreMonsterEntity, frameIndex: number): void {
        const charge = smashCharges[frameIndex];
        if (charge === 'default') {
          this._ai.charge();
        } else if (charge !== null) {
          this._ai.charge(charge);
        }

        if (frameIndex === 0) {
          this.attackSound();
        }

        const chainsawSide = smashChainsawSides[frameIndex];
        if (chainsawSide !== null) {
          this._fireChainsaw(chainsawSide);
        }

        if (frameIndex === 10) {
          this.nextthink += Math.random() * 0.2;
        }
      },
      false);
    this._defineState('ogre_smash14', 'smash14', 'ogre_run1', function (this: OgreMonsterEntity): void {
      this._ai.charge(12);
    });

    const nailFrames = ['shoot1', 'shoot2', 'shoot2', 'shoot3', 'shoot4', 'shoot5', 'shoot6'];
    this._defineSequence('ogre_nail', nailFrames,
      function (this: OgreMonsterEntity, frameIndex: number): void {
        this._ai.face();
        if (frameIndex === 3) {
          this._fireGrenade();
        }
      },
      false);
    this._defineState('ogre_nail7', 'shoot6', 'ogre_run1', function (this: OgreMonsterEntity): void {
      this._ai.face();
    });

    const painFrames = this._createFrameNames('pain', 5);
    this._defineSequence('ogre_pain', painFrames, null, false);
    this._defineState('ogre_pain5', 'pain5', 'ogre_run1');

    const painBFrames = this._createFrameNames('painb', 3);
    this._defineSequence('ogre_pain1b', painBFrames, null, false);
    this._defineState('ogre_pain1b3', 'painb3', 'ogre_run1');

    const painCFrames = this._createFrameNames('painc', 6);
    this._defineSequence('ogre_pain1c', painCFrames, null, false);
    this._defineState('ogre_pain1c6', 'painc6', 'ogre_run1');

    const painDFrames = this._createFrameNames('paind', 16);
    const painDMoves = [0, 10, 9, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    this._defineSequence('ogre_pain1d', painDFrames,
      function (this: OgreMonsterEntity, frameIndex: number): void {
        const move = painDMoves[frameIndex];
        if (move > 0) {
          this._ai.pain(move);
        }
      },
      false);
    this._defineState('ogre_pain1d16', 'paind16', 'ogre_run1');

    const painEFrames = this._createFrameNames('paine', 15);
    const painEMoves = [0, 10, 9, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    this._defineSequence('ogre_pain1e', painEFrames,
      function (this: OgreMonsterEntity, frameIndex: number): void {
        const move = painEMoves[frameIndex];
        if (move > 0) {
          this._ai.pain(move);
        }
      },
      false);
    this._defineState('ogre_pain1e15', 'paine15', 'ogre_run1');

    const deathFrames = this._createFrameNames('death', 14);
    this._defineSequence('ogre_die', deathFrames,
      function (this: OgreMonsterEntity, frameIndex: number): void {
        if (frameIndex === 2) {
          this.solid = solid.SOLID_NOT;
          this._dropBackpack();
        }
      },
      false);

    const backDeathFrames = this._createFrameNames('bdeath', 10);
    const backDeathMoves = [0, 5, 0, 1, 3, 7, 25, 0, 0, 0];
    this._defineSequence('ogre_bdie', backDeathFrames,
      function (this: OgreMonsterEntity, frameIndex: number): void {
        if (frameIndex === 2) {
          this.solid = solid.SOLID_NOT;
          this._dropBackpack();
          return;
        }

        const move = backDeathMoves[frameIndex];
        if (move > 0) {
          this._ai.forward(move);
        }
      },
      false);
  }

  override _precache(): void {
    super._precache();
    this.engine.PrecacheSound('ogre/ogdrag.wav');
    this.engine.PrecacheSound('ogre/ogdth.wav');
    this.engine.PrecacheSound('ogre/ogidle.wav');
    this.engine.PrecacheSound('ogre/ogidle2.wav');
    this.engine.PrecacheSound('ogre/ogpain1.wav');
    this.engine.PrecacheSound('ogre/ogsawatk.wav');
    this.engine.PrecacheSound('ogre/ogwake.wav');
  }

  _fireGrenade(): void {
    if (!this.enemy) {
      return;
    }

    const velocity = this.calculateTrajectoryVelocity(this.enemy, null, 0.9);
    this.engine.SpawnEntity(Grenade.classname, { owner: this, velocity });
  }

  _fireChainsaw(side: number): void {
    const enemy = this.enemy;
    if (enemy === null) {
      return;
    }

    if (!enemy.canReceiveDamage(this)) {
      return;
    }

    this._ai.charge(10);

    if (this.origin.distanceTo(enemy.origin) > 100) {
      return;
    }

    const damage = (Math.random() + Math.random() + Math.random()) * 4;
    this.damage(enemy, damage);

    if (side !== 0) {
      if (!(enemy instanceof BaseMonster) && !(enemy instanceof PlayerEntity)) {
        return;
      }

      const { forward, right } = this.angles.angleVectors();
      const origin = this.origin.copy().add(forward.multiply(16));

      if (side === 1) {
        GibEntity.throwMeatGib(enemy, right.multiply(Math.random() * 100), origin);
      } else {
        GibEntity.throwMeatGib(enemy, right.multiply(side), origin);
      }
    }
  }

  _dropBackpack(): void {
    super._dropBackpack({ ammo_rockets: 2 });
  }

  override thinkPain(attackerEntity: BaseEntity, _damage: number): void {
    void _damage;

    if (this.pain_finished > this.game.time) {
      return;
    }

    this._ai.foundTarget(attackerEntity, true);
    this.painSound();

    const random = Math.random();
    this.pain_finished = this.game.time + 1.0;

    if (random < 0.25) {
      this._runState('ogre_pain1');
    } else if (random < 0.5) {
      this._runState('ogre_pain1b');
    } else if (random < 0.75) {
      this._runState('ogre_pain1c');
    } else if (random < 0.875) {
      this._runState('ogre_pain1d');
      this.pain_finished += 1.0;
    } else {
      this._runState('ogre_pain1e');
      this.pain_finished += 1.0;
    }
  }

  override thinkDie(attackerEntity: BaseEntity): void {
    this._sub!.useTargets(attackerEntity);

    if (this.health < -80) {
      this.startSound(channel.CHAN_VOICE, 'player/udeath.wav');
      this._gib(false);
      return;
    }

    this.startSound(channel.CHAN_VOICE, 'ogre/ogdth.wav');

    if (Math.random() < 0.5) {
      this._runState('ogre_die1');
    } else {
      this._runState('ogre_bdie1');
    }
  }

  override thinkMelee(): void {
    if (Math.random() > 0.5) {
      this._runState('ogre_smash1');
    } else {
      this._runState('ogre_swing1');
    }
  }

  override thinkMissile(): void {
    this._runState('ogre_nail1');
  }

  override thinkStand(): void {
    this._runState('ogre_stand1');
  }

  override thinkWalk(): void {
    this._runState('ogre_walk1');
  }

  override thinkRun(): void {
    this._runState('ogre_run1');
  }

  override moveTargetReached(markerEntity: Parameters<WalkMonster['moveTargetReached']>[0]): boolean {
    this.startSound(channel.CHAN_VOICE, 'ogre/ogdrag.wav', 1.0, attn.ATTN_IDLE);
    return super.moveTargetReached(markerEntity);
  }

  override attackSound(): void {
    this.startSound(channel.CHAN_WEAPON, 'ogre/ogsawatk.wav');
  }

  override idleSound(): void {
    if (Math.random() > 0.2) {
      return;
    }

    if (Math.random() < 0.5) {
      this.startSound(channel.CHAN_VOICE, 'ogre/ogidle.wav');
    } else {
      this.startSound(channel.CHAN_VOICE, 'ogre/ogidle2.wav');
    }
  }

  dragSound(): void {
    if (Math.random() > 0.1) {
      return;
    }

    this.startSound(channel.CHAN_VOICE, 'ogre/ogdrag.wav');
  }

  override painSound(): void {
    this.startSound(channel.CHAN_VOICE, 'ogre/ogpain1.wav');
  }

  protected override hasMeleeAttack(): boolean {
    return true;
  }

  protected override hasMissileAttack(): boolean {
    return true;
  }
}
