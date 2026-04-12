import type { ServerEngineAPI } from '../../../../shared/GameInterfaces.ts';

import Vector from '../../../../shared/Vector.ts';

import { attn, channel, damage, moveType, solid } from '../../Defs.ts';
import { QuakeEntityAI } from '../../helper/AI.ts';
import { serializableObject, serializable } from '../../helper/MiscHelpers.ts';
import BaseEntity from '../BaseEntity.ts';
import { WalkMonster } from './BaseMonster.ts';

@serializableObject
export default class ZombieMonster extends WalkMonster {
  static classname = 'monster_zombie';

  static _health = 60;
  static _size: [Vector, Vector] = [new Vector(-16.0, -16.0, -24.0), new Vector(16.0, 16.0, 40.0)];

  static _modelDefault = 'progs/zombie.mdl';
  static _modelHead = 'progs/h_zombie.mdl';

  static _modelQC = `
$cd id1/models/zombie

$origin	0 0 24

$base base
$skin skin

$frame stand1 stand2 stand3 stand4 stand5 stand6 stand7 stand8
$frame stand9 stand10 stand11 stand12 stand13 stand14 stand15

$frame walk1 walk2 walk3 walk4 walk5 walk6 walk7 walk8 walk9 walk10 walk11
$frame walk12 walk13 walk14 walk15 walk16 walk17 walk18 walk19

$frame run1 run2 run3 run4 run5 run6 run7 run8 run9 run10 run11 run12
$frame run13 run14 run15 run16 run17 run18

$frame atta1 atta2 atta3 atta4 atta5 atta6 atta7 atta8 atta9 atta10 atta11
$frame atta12 atta13

$frame attb1 attb2 attb3 attb4 attb5 attb6 attb7 attb8 attb9 attb10 attb11
$frame attb12 attb13 attb14

$frame attc1 attc2 attc3 attc4 attc5 attc6 attc7 attc8 attc9 attc10 attc11
$frame attc12

$frame paina1 paina2 paina3 paina4 paina5 paina6 paina7 paina8 paina9 paina10
$frame paina11 paina12

$frame painb1 painb2 painb3 painb4 painb5 painb6 painb7 painb8 painb9 painb10
$frame painb11 painb12 painb13 painb14 painb15 painb16 painb17 painb18 painb19
$frame painb20 painb21 painb22 painb23 painb24 painb25 painb26 painb27 painb28

$frame painc1 painc2 painc3 painc4 painc5 painc6 painc7 painc8 painc9 painc10
$frame painc11 painc12 painc13 painc14 painc15 painc16 painc17 painc18

$frame paind1 paind2 paind3 paind4 paind5 paind6 paind7 paind8 paind9 paind10
$frame paind11 paind12 paind13

$frame paine1 paine2 paine3 paine4 paine5 paine6 paine7 paine8 paine9 paine10
$frame paine11 paine12 paine13 paine14 paine15 paine16 paine17 paine18 paine19
$frame paine20 paine21 paine22 paine23 paine24 paine25 paine26 paine27 paine28
$frame paine29 paine30

$frame cruc_1 cruc_2 cruc_3 cruc_4 cruc_5 cruc_6
`;

  static SPAWN_CRUCIFIED = 1;

  @serializable inpain = 0;

  get netname(): string {
    return 'a Zombie';
  }

  protected override _newEntityAI(): ReturnType<WalkMonster['_newEntityAI']> {
    return new QuakeEntityAI(this);
  }

  override _precache(): void {
    super._precache();
    this.engine.PrecacheSound('zombie/z_idle.wav');
    this.engine.PrecacheSound('zombie/z_idle1.wav');
    this.engine.PrecacheSound('zombie/z_shot1.wav');
    this.engine.PrecacheSound('zombie/z_gib.wav');
    this.engine.PrecacheSound('zombie/z_pain.wav');
    this.engine.PrecacheSound('zombie/z_pain1.wav');
    this.engine.PrecacheSound('zombie/z_fall.wav');
    this.engine.PrecacheSound('zombie/z_miss.wav');
    this.engine.PrecacheSound('zombie/z_hit.wav');
    this.engine.PrecacheSound('zombie/idle_w2.wav');
  }

  static override _initStates(): void {
    const self = this as typeof ZombieMonster;

    /**
     *
     */
    function maybeIdle(this: ZombieMonster): void {
      if (Math.random() < 0.2) {
        this.startSound(channel.CHAN_VOICE, 'zombie/z_idle.wav', 1.0, attn.ATTN_IDLE);
      }
    }

    /**
     *
     */
    function defineAttackSequence(statePrefix: string, framePrefix: string, frameCount: number, offset: Vector): void {
      const frames = self._createFrameNames(framePrefix, frameCount);
      self._defineSequence(statePrefix, frames,
        function (this: ZombieMonster, frameIndex: number): void {
          this._ai.face();
          if (frameIndex === frameCount - 1) {
            this._fireGrenade(offset);
          }
        },
        false);
      self._defineState(`${statePrefix}${frameCount}`, frames[frameCount - 1], 'zombie_run1', function (this: ZombieMonster): void {
        this._ai.face();
        this._fireGrenade(offset);
      });
    }

    /**
     *
     */
    function definePainSequence(
      statePrefix: string,
      framePrefix: string,
      frameCount: number,
      handler: (this: ZombieMonster, frameNumber: number) => void,
    ): void {
      const frames = self._createFrameNames(framePrefix, frameCount);
      self._defineSequence(statePrefix, frames,
        function (this: ZombieMonster, frameIndex: number): void {
          handler.call(this, frameIndex + 1);
        },
        false);
      self._defineState(`${statePrefix}${frameCount}`, frames[frameCount - 1], 'zombie_run1', function (this: ZombieMonster): void {
        handler.call(this, frameCount);
      });
    }

    self._defineSequence('zombie_stand', self._createFrameNames('stand', 15), function (this: ZombieMonster): void {
      this._ai.stand();
    });

    self._defineState('zombie_cruc1', 'cruc_1', 'zombie_cruc2', function (this: ZombieMonster): void {
      if (Math.random() >= 0.1) {
        return;
      }

      this.startSound(channel.CHAN_VOICE, 'zombie/idle_w2.wav', 1.0, attn.ATTN_STATIC);
    });

    for (let frameNumber = 2; frameNumber <= 6; frameNumber++) {
      const nextState = frameNumber === 6 ? 'zombie_cruc1' : `zombie_cruc${frameNumber + 1}`;
      self._defineState(`zombie_cruc${frameNumber}`, `cruc_${frameNumber}`, nextState, function (this: ZombieMonster): void {
        this.nextthink = this.game.time + 0.1 + Math.random() * 0.1;
      });
    }

    const walkSpeeds = [0, 2, 3, 2, 1, 0, 0, 0, 0, 0, 2, 2, 1, 0, 0, 0, 0, 0, 0];
    self._defineSequence('zombie_walk', self._createFrameNames('walk', walkSpeeds.length),
      function (this: ZombieMonster, frameIndex: number): void {
        this._ai.walk(walkSpeeds[frameIndex]);
        if (frameIndex >= 17) {
          maybeIdle.call(this);
        }
      });

    const runSpeeds = [1, 1, 0, 1, 2, 3, 4, 4, 2, 0, 0, 0, 2, 4, 6, 7, 3, 8];
    self._defineSequence('zombie_run', self._createFrameNames('run', runSpeeds.length),
      function (this: ZombieMonster, frameIndex: number): void {
        this._ai.run(runSpeeds[frameIndex]);
        if (frameIndex === 0) {
          this.inpain = 0;
        }

        if (frameIndex === runSpeeds.length - 1) {
          maybeIdle.call(this);
          if (Math.random() > 0.8) {
            this.startSound(channel.CHAN_VOICE, 'zombie/z_idle1.wav', 1.0, attn.ATTN_IDLE);
          }
        }
      });

    defineAttackSequence('zombie_atta', 'atta', 13, new Vector(-10, -22, 30));
    defineAttackSequence('zombie_attb', 'attb', 14, new Vector(-10, -24, 29));
    defineAttackSequence('zombie_attc', 'attc', 12, new Vector(-12, -19, 29));

    definePainSequence('zombie_paina', 'paina', 12, function (this: ZombieMonster, frameNumber: number): void {
      switch (frameNumber) {
        case 1:
          this.startSound(channel.CHAN_VOICE, 'zombie/z_pain.wav');
          break;
        case 2:
          this._ai.painforward(3);
          break;
        case 3:
          this._ai.painforward(1);
          break;
        case 4:
          this._ai.pain(1);
          break;
        case 5:
          this._ai.pain(3);
          break;
        case 6:
          this._ai.pain(1);
          break;
      }
    });

    definePainSequence('zombie_painb', 'painb', 28, function (this: ZombieMonster, frameNumber: number): void {
      switch (frameNumber) {
        case 1:
          this.startSound(channel.CHAN_VOICE, 'zombie/z_pain1.wav');
          break;
        case 2:
          this._ai.pain(2);
          break;
        case 3:
          this._ai.pain(8);
          break;
        case 4:
          this._ai.pain(6);
          break;
        case 5:
          this._ai.pain(2);
          break;
        case 9:
          this.startSound(channel.CHAN_BODY, 'zombie/z_fall.wav');
          break;
        case 25:
          this._ai.painforward(1);
          break;
      }
    });

    definePainSequence('zombie_painc', 'painc', 18, function (this: ZombieMonster, frameNumber: number): void {
      switch (frameNumber) {
        case 1:
          this.startSound(channel.CHAN_VOICE, 'zombie/z_pain1.wav');
          break;
        case 3:
          this._ai.pain(3);
          break;
        case 4:
          this._ai.pain(1);
          break;
        case 11:
        case 12:
          this._ai.painforward(1);
          break;
      }
    });

    definePainSequence('zombie_paind', 'paind', 13, function (this: ZombieMonster, frameNumber: number): void {
      if (frameNumber === 1) {
        this.startSound(channel.CHAN_VOICE, 'zombie/z_pain.wav');
      } else if (frameNumber === 9) {
        this._ai.pain(1);
      }
    });

    definePainSequence('zombie_paine', 'paine', 30, function (this: ZombieMonster, frameNumber: number): void {
      switch (frameNumber) {
        case 1:
          this.startSound(channel.CHAN_VOICE, 'zombie/z_pain.wav');
          this.health = ZombieMonster._health;
          break;
        case 2:
          this._ai.pain(8);
          break;
        case 3:
          this._ai.pain(5);
          break;
        case 4:
          this._ai.pain(3);
          break;
        case 5:
          this._ai.pain(1);
          break;
        case 6:
          this._ai.pain(2);
          break;
        case 7:
        case 8:
          this._ai.pain(1);
          break;
        case 9:
          this._ai.pain(2);
          break;
        case 10:
          this._fallDown();
          break;
        case 11:
          this.nextthink += 5;
          this.health = ZombieMonster._health;
          break;
        case 12:
          this._standUp();
          break;
        case 25:
          this._ai.painforward(5);
          break;
        case 26:
          this._ai.painforward(3);
          break;
        case 27:
          this._ai.painforward(1);
          break;
        case 28:
          this._ai.pain(1);
          break;
      }
    });
  }

  private _fallDown(): void {
    this.startSound(channel.CHAN_BODY, 'zombie/z_fall.wav');
    this.solid = solid.SOLID_NOT;
  }

  _standUp(): void {
    this.health = ZombieMonster._health;
    this.startSound(channel.CHAN_BODY, 'zombie/z_idle.wav', 1.0, attn.ATTN_IDLE);
    this.solid = solid.SOLID_SLIDEBOX;

    if (!this.walkMove(0, 0)) {
      this._runState('zombie_paine11');
    }
  }

  override thinkStand(): void {
    this._runState('zombie_stand1');
  }

  override thinkWalk(): void {
    this._runState('zombie_walk1');
  }

  override thinkRun(): void {
    this._runState('zombie_run1');
  }

  override thinkMissile(): void {
    const random = Math.random();

    if (random < 0.3) {
      this._runState('zombie_atta1');
    } else if (random < 0.6) {
      this._runState('zombie_attb1');
    } else {
      this._runState('zombie_attc1');
    }
  }

  protected override hasMeleeAttack(): boolean {
    return true;
  }

  protected override hasMissileAttack(): boolean {
    return true;
  }

  override _postSpawn(): void {
    if ((this.spawnflags & ZombieMonster.SPAWN_CRUCIFIED) !== 0) {
      this._damageHandler = null;
      this.movetype = moveType.MOVETYPE_NONE;
      this.takedamage = damage.DAMAGE_NO;
      this.solid = solid.SOLID_NOT;
      this._runState('zombie_cruc1');
      return;
    }

    super._postSpawn();
  }

  override thinkPain(attackerEntity: BaseEntity, damageAmount: number): void {
    this.health = (this.constructor as typeof ZombieMonster)._health;

    if (damageAmount < 9) {
      return;
    }

    if (this.inpain === 2) {
      return;
    }

    this._ai.foundTarget(attackerEntity, true);

    if (damageAmount >= 25) {
      this.inpain = 2;
      this._runState('zombie_paine1');
      return;
    }

    if (this.inpain === 1) {
      this.pain_finished = this.game.time + 3;
      return;
    }

    if (this.pain_finished > this.game.time) {
      this.inpain = 2;
      this._runState('zombie_paine1');
      return;
    }

    this.inpain = 1;
    this.pain_finished = this.game.time + 3;

    const random = Math.random();
    if (random < 0.25) {
      this._runState('zombie_paina1');
    } else if (random < 0.5) {
      this._runState('zombie_painb1');
    } else if (random < 0.75) {
      this._runState('zombie_painc1');
    } else {
      this._runState('zombie_paind1');
    }
  }

  override thinkDie(attackerEntity: BaseEntity): void {
    this._sub!.useTargets(attackerEntity);
    if (this.health < -35) {
      this._gib(true);
      return;
    }

    this.deathSound();
    this.solid = solid.SOLID_NOT;
    this._gib(false);
  }

  override deathSound(): void {
    this.startSound(channel.CHAN_VOICE, 'zombie/z_gib.wav');
  }

  override painSound(): void {
    this.startSound(channel.CHAN_VOICE, 'zombie/z_pain.wav');
  }

  private _fireGrenade(offset: Vector): void {
    this.startSound(channel.CHAN_WEAPON, 'zombie/z_shot1.wav');
    ZombieGibGrenade.Throw(this, offset);
  }

  override sightSound(): void {
    this.startSound(channel.CHAN_VOICE, 'zombie/z_hit.wav');
  }

  override idleSound(): void {
    if (Math.random() < 0.1) {
      return;
    }

    this.startSound(channel.CHAN_VOICE, 'zombie/z_idle.wav', 1.0, attn.ATTN_IDLE);
  }

  override think(): void {
    if ((this.spawnflags & ZombieMonster.SPAWN_CRUCIFIED) !== 0) {
      BaseEntity.prototype.think.call(this);
      return;
    }

    super.think();
  }
}

@serializableObject
export class ZombieGibGrenade extends BaseEntity {
  static classname = 'monster_zombie_giblet';

  @serializable private _alreadyMissed = false;

  static override _precache(engineAPI: ServerEngineAPI): void {
    engineAPI.PrecacheModel('progs/zom_gib.mdl');
  }

  override touch(other: BaseEntity, _pushVector: Vector): void {
    void _pushVector;

    if (this._alreadyMissed) {
      this.remove();
      return;
    }

    if (other.equals(this.owner)) {
      return;
    }

    if (other.takedamage) {
      this.damage(other, 10, this.owner);
      this.startSound(channel.CHAN_WEAPON, 'zombie/z_hit.wav');
      this.remove();
      return;
    }

    this.startSound(channel.CHAN_WEAPON, 'zombie/z_miss.wav');
    this.velocity.clear();
    this.avelocity.clear();
    this._alreadyMissed = true;
  }

  override spawn(): void {
    console.assert(this.owner instanceof ZombieMonster, 'owner required and must be ZombieMonster');

    const owner = this.owner as ZombieMonster;
    const enemy = owner.enemy;
    console.assert(enemy instanceof BaseEntity, 'owner.enemy required');

    this.movetype = moveType.MOVETYPE_BOUNCE;
    this.solid = solid.SOLID_BBOX;

    const { forward, up, right } = this.angles.angleVectors();
    const offset = this.velocity.copy();
    const origin = this.origin.copy()
      .add(forward.multiply(offset[0]))
      .add(right.multiply(offset[1]))
      .add(up.multiply(offset[2] - 24.0));

    this.velocity.set(owner.calculateTrajectoryVelocity(enemy!, origin));
    this.avelocity.setTo(3000.0, 1000.0, 2000.0);

    this._scheduleThink(this.game.time + 2.5, () => { this.remove(); });

    this.setModel('progs/zom_gib.mdl');
    this.setSize(Vector.origin, Vector.origin);
    this.setOrigin(origin);
  }

  static Throw(entity: ZombieMonster, offset: Vector): void {
    entity.engine.SpawnEntity<ZombieGibGrenade>(ZombieGibGrenade.classname, {
      origin: entity.origin.copy(),
      angles: entity.angles.copy(),
      velocity: offset.copy(),
      owner: entity,
    });
  }
}
