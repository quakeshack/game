import Vector from '../../../../shared/Vector.ts';

import { channel, effect, moveType, solid } from '../../Defs.ts';
import { QuakeEntityAI } from '../../helper/AI.ts';
import { entity } from '../../helper/MiscHelpers.ts';
import type BaseEntity from '../BaseEntity.ts';
import { BaseProjectile } from '../Weapons.ts';
import { WalkMonster } from './BaseMonster.ts';

export class ShalrathMissileEntity extends BaseProjectile {
  static classname = 'monster_shalrath_missile';

  protected override _handleImpact(touchedByEntity: BaseEntity): void {
    if (this.owner !== null && touchedByEntity.equals(this.owner)) {
      return;
    }

    // Zombies get special treatment because they are more resistant to damage.
    if (touchedByEntity.classname === 'monster_zombie') {
      this.damage(touchedByEntity, 110, this.owner, this.origin);
    }

    this._damageInflictor.blastDamage(40, this.owner);

    this.velocity.normalize();
    this.origin.subtract(this.velocity.multiply(8.0));

    this._becomeExplosion();
  }

  home(): void {
    console.assert(this.owner instanceof ShalrathMonsterEntity, 'Shalrath missile owner must be a shalrath');

    const owner = this.owner!;

    const enemy = owner.enemy;
    if (enemy === null || enemy.health < 1) {
      this.remove();
      return;
    }

    const dir = enemy.origin.copy().add(new Vector(0.0, 0.0, 10.0)).subtract(this.origin);
    dir.normalize();
    dir.multiply(this.game.skill === 3 ? 350 : 250);
    this.velocity.set(dir);

    this._scheduleThink(this.game.time + 0.2, () => {
      this.home();
    });
  }

  override spawn(): void {
    console.assert(this.owner !== null, 'Needs an owner');

    const owner = this.owner!;

    super.spawn();

    this.movetype = moveType.MOVETYPE_FLYMISSILE;

    const origin = owner.origin.copy().add(new Vector(0.0, 0.0, 10.0));
    this.origin.set(origin);
    this.setOrigin(origin);
    this.velocity.multiply(400.0);
    this.avelocity.setTo(300.0, 300.0, 300.0);

    this.setModel('progs/v_spike.mdl');
    this.setSize(Vector.origin, Vector.origin);

    console.assert(owner instanceof ShalrathMonsterEntity, 'Shalrath missile owner must be a shalrath');

    if (!(owner instanceof ShalrathMonsterEntity) || owner.enemy === null) {
      return;
    }

    const dist = this.origin.distanceTo(owner.enemy.origin);
    this._scheduleThink(this.game.time + Math.max(0.1, dist * 0.002), () => {
      this.home();
    });
  }
}

/**
 * QUAKED monster_shalrath (1 0 0) (-32 -32 -24) (32 32 48) Ambush
 */
@entity
export default class ShalrathMonsterEntity extends WalkMonster {
  static classname = 'monster_shalrath';
  static _health = 400;
  static _size: [Vector, Vector] = [new Vector(-32.0, -32.0, -24.0), new Vector(32.0, 32.0, 64.0)];
  static _modelDefault = 'progs/shalrath.mdl';
  static _modelHead = 'progs/h_shal.mdl';

  static _modelQC = `
$cd id1/models/shalrath
$origin 0 0 24
$base base
$skin skin
$scale 0.7

$frame attack1 attack2 attack3 attack4 attack5 attack6 attack7 attack8
$frame attack9 attack10 attack11

$frame pain1 pain2 pain3 pain4 pain5

$frame death1 death2 death3 death4 death5 death6 death7

$frame walk1 walk2 walk3 walk4 walk5 walk6 walk7 walk8 walk9 walk10
$frame walk11 walk12
`;

  get netname(): string {
    return 'a Vore';
  }

  protected override _newEntityAI(): ReturnType<WalkMonster['_newEntityAI']> {
    return new QuakeEntityAI(this);
  }

  static override _initStates(): void {
    // Stand.
    this._defineState('shal_stand', 'walk1', 'shal_stand', function (this: ShalrathMonsterEntity): void {
      this._ai.stand();
    });

    // Walk.
    const walkSpeeds = [6, 4, 0, 0, 0, 0, 5, 6, 5, 0, 4, 5];
    const walkFrames = ['walk2', 'walk3', 'walk4', 'walk5', 'walk6', 'walk7', 'walk8', 'walk9', 'walk10', 'walk11', 'walk12', 'walk1'];
    this._defineSequence('shal_walk', walkFrames,
      function (this: ShalrathMonsterEntity, frameIndex: number): void {
        if (frameIndex === 0) {
          this.idleSound();
        }

        this._ai.walk(walkSpeeds[frameIndex]);
      });

    // Run.
    this._defineSequence('shal_run', walkFrames,
      function (this: ShalrathMonsterEntity, frameIndex: number): void {
        if (frameIndex === 0) {
          this.idleSound();
        }

        this._ai.run(walkSpeeds[frameIndex]);
      });

    // Attack.
    this._defineSequence('shal_attack', this._createFrameNames('attack', 11),
      function (this: ShalrathMonsterEntity, frameIndex: number): void {
        if (frameIndex === 0) {
          this.attackSound();
          this._ai.face();
          return;
        }

        if (frameIndex === 8) {
          this.launchMissile();
          return;
        }

        if (frameIndex < 10) {
          this._ai.face();
        }
      },
      false);
    this._defineState('shal_attack11', 'attack11', 'shal_run1');

    // Pain.
    this._defineSequence('shal_pain', this._createFrameNames('pain', 5), null, false);
    this._defineState('shal_pain5', 'pain5', 'shal_run1');

    // Death.
    this._defineSequence('shal_death', this._createFrameNames('death', 7), null, false);
  }

  override _precache(): void {
    super._precache();

    this.engine.PrecacheModel('progs/v_spike.mdl');

    this.engine.PrecacheSound('shalrath/attack.wav');
    this.engine.PrecacheSound('shalrath/attack2.wav');
    this.engine.PrecacheSound('shalrath/death.wav');
    this.engine.PrecacheSound('shalrath/idle.wav');
    this.engine.PrecacheSound('shalrath/pain.wav');
    this.engine.PrecacheSound('shalrath/sight.wav');
  }

  override thinkDie(_attackerEntity: BaseEntity): void {
    void _attackerEntity;

    if (this.health < -90) {
      this._gib(true);
      return;
    }

    this.deathSound();
    this._runState('shal_death1');
    this.solid = solid.SOLID_NOT;
  }

  override thinkPain(attackerEntity: BaseEntity, _damage: number): void {
    void _damage;

    if (this.pain_finished > this.game.time) {
      return;
    }

    this._ai.foundTarget(attackerEntity, true);

    this.painSound();
    this._runState('shal_pain1');
    this.pain_finished = this.game.time + 3.0;
  }

  override thinkStand(): void {
    this._runState('shal_stand');
  }

  override thinkWalk(): void {
    this._runState('shal_walk1');
  }

  override thinkRun(): void {
    this._runState('shal_run1');
  }

  override thinkMissile(): void {
    this._runState('shal_attack1');
  }

  launchMissile(): void {
    const enemy = this.enemy;
    if (enemy === null) {
      return;
    }

    const movedir = enemy.origin.copy().subtract(this.origin);
    movedir.normalize();
    this.movedir.set(movedir);

    this.effects |= effect.EF_MUZZLEFLASH;
    this.startSound(channel.CHAN_WEAPON, 'shalrath/attack2.wav');

    this.engine.SpawnEntity(ShalrathMissileEntity.classname, {
      owner: this,
    });
  }

  override idleSound(): void {
    if (Math.random() < 0.2) {
      this.startSound(channel.CHAN_VOICE, 'shalrath/idle.wav');
    }
  }

  override attackSound(): void {
    this.startSound(channel.CHAN_VOICE, 'shalrath/attack.wav');
  }

  override painSound(): void {
    this.startSound(channel.CHAN_VOICE, 'shalrath/pain.wav');
  }

  override deathSound(): void {
    this.startSound(channel.CHAN_VOICE, 'shalrath/death.wav');
  }

  protected override hasMissileAttack(): boolean {
    return true;
  }
}
