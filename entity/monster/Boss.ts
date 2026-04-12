import Vector from '../../../../shared/Vector.ts';

import { channel, damage, effect, moveType, solid, tentType } from '../../Defs.ts';
import { EntityAI, NoopMonsterAI } from '../../helper/AI.ts';
import { serializableObject, serializable } from '../../helper/MiscHelpers.ts';
import BaseEntity from '../BaseEntity.ts';
import { FireballEntity } from '../Misc.ts';
import { state } from '../props/BasePropEntity.ts';
import { Missile } from '../Weapons.ts';
import BaseMonster from './BaseMonster.ts';

interface Combatant extends BaseEntity {
  health: number;
  velocity: Vector;
}

type ElectrodeState = (typeof state)[keyof typeof state];

interface ElectrodeDoor extends BaseEntity {
  state: ElectrodeState;
  nextthink: number;
  mins: Vector;
  maxs: Vector;
  absmin: Vector;
  _doorGoDown?: (activatorEntity: BaseEntity) => void;
}

export class BossLavaball extends Missile {
  static classname = 'monster_boss_lavaball';

  static override _precache(engineAPI: BaseEntity['engine']): void {
    engineAPI.PrecacheModel('progs/lavaball.mdl');
  }

  static clientEdictHandler = FireballEntity.clientEdictHandler;

  override spawn(): void {
    this.setModel('progs/lavaball.mdl');
    this.avelocity.setTo(200.0, 100.0, 300.0);
    this.setSize(Vector.origin, Vector.origin);
    this.velocity.set(this.movedir.copy().multiply(300.0));
    this.movetype = moveType.MOVETYPE_FLYMISSILE;
    this.solid = solid.SOLID_BBOX;
    this.effects |= effect.EF_FULLBRIGHT;

    this._scheduleThink(this.game.time + 6.0, () => {
      this.remove();
    });
  }
}

/**
 * QUAKED monster_boss (1 0 0) (-128 -128 -24) (128 128 256)
 */
@serializableObject
export class BossMonster extends BaseMonster {
  static classname = 'monster_boss';
  static _modelDefault = 'progs/boss.mdl';

  static _modelQC = `
$cd id1/models/boss1
$origin 0 0 -15
$base base
$skin skin
$scale 5

$frame rise1 rise2 rise3 rise4 rise5 rise6 rise7 rise8 rise9 rise10
$frame rise11 rise12 rise13 rise14 rise15 rise16 rise17

$frame walk1 walk2 walk3 walk4 walk5 walk6 walk7 walk8
$frame walk9 walk10 walk11 walk12 walk13 walk14 walk15
$frame walk16 walk17 walk18 walk19 walk20 walk21 walk22
$frame walk23 walk24 walk25 walk26 walk27 walk28 walk29 walk30 walk31

$frame death1 death2 death3 death4 death5 death6 death7 death8 death9

$frame attack1 attack2 attack3 attack4 attack5 attack6 attack7 attack8
$frame attack9 attack10 attack11 attack12 attack13 attack14 attack15
$frame attack16 attack17 attack18 attack19 attack20 attack21 attack22
$frame attack23

$frame shocka1 shocka2 shocka3 shocka4 shocka5 shocka6 shocka7 shocka8
$frame shocka9 shocka10

$frame shockb1 shockb2 shockb3 shockb4 shockb5 shockb6

$frame shockc1 shockc2 shockc3 shockc4 shockc5 shockc6 shockc7 shockc8
$frame shockc9 shockc10
  `;

  protected override _newEntityAI(): EntityAI<BossMonster> {
    return new NoopMonsterAI(this);
  }

  override think(): void {
    BaseEntity.prototype.think.call(this);
  }

  override _precache(): void {
    this.engine.PrecacheModel('progs/boss.mdl');
    this.engine.PrecacheModel('progs/lavaball.mdl');
    this.engine.PrecacheSound('weapons/rocket1i.wav');
    this.engine.PrecacheSound('boss1/out1.wav');
    this.engine.PrecacheSound('boss1/sight1.wav');
    this.engine.PrecacheSound('misc/power.wav');
    this.engine.PrecacheSound('boss1/throw.wav');
    this.engine.PrecacheSound('boss1/pain.wav');
    this.engine.PrecacheSound('boss1/death.wav');
  }

  _bossFace(): void {
    const enemy = this.enemy as Combatant | null;
    const enemyHealth = enemy?.health ?? 0;

    // Go for another player if multiplayer left the current enemy invalid.
    if (enemyHealth <= 0 || Math.random() < 0.02) {
      let nextEnemy = this.findNextEntityByFieldAndValue('classname', 'player', this.enemy);
      if (nextEnemy === null) {
        nextEnemy = this.findFirstEntityByFieldAndValue('classname', 'player');
      }
      if (nextEnemy !== null) {
        this.enemy = nextEnemy;
      }
    }

    if (this.enemy !== null) {
      const delta = this.enemy.origin.copy().subtract(this.origin);
      this.ideal_yaw = delta.toAngles()[1];
      this._changeYaw();
    }
  }

  _changeYaw(): void {
    const current = this.angles[1];
    const ideal = this.ideal_yaw;
    let move = ideal - current;

    if (move > 180) {
      move -= 360;
    }
    if (move < -180) {
      move += 360;
    }

    if (move > 0) {
      move = Math.min(move, this.yaw_speed);
    } else {
      move = Math.max(move, -this.yaw_speed);
    }

    this.angles[1] = current + move;
  }

  _bossMissile(offset: Vector): void {
    const enemy = this.enemy as Combatant | null;
    if (enemy === null) {
      return;
    }

    const offang = enemy.origin.copy().subtract(this.origin).toAngles();
    const { forward, right } = offang.angleVectors();
    const origin = this.origin.copy()
      .add(forward.copy().multiply(offset[0]))
      .add(right.copy().multiply(offset[1]))
      .add(new Vector(0, 0, offset[2]));

    let targetPosition = enemy.origin.copy();
    if (this.game.skill > 1) {
      // Lead the player on hard and nightmare skill.
      const time = enemy.origin.distanceTo(origin) / 300;
      const velocity = enemy.velocity.copy();
      velocity[2] = 0;
      targetPosition = enemy.origin.copy().add(velocity.multiply(time));
    }

    const direction = targetPosition.subtract(origin);
    direction.normalize();

    this.engine.SpawnEntity(BossLavaball.classname, {
      origin,
      movedir: direction,
      owner: this,
    });

    this.startSound(channel.CHAN_WEAPON, 'boss1/throw.wav');

    // Check for dead enemy and fall back to the idle loop.
    if (enemy.health <= 0) {
      this._runState('boss_idle1');
    }
  }

  override use(activatorEntity: BaseEntity): void {
    this.solid = solid.SOLID_SLIDEBOX;
    this.movetype = moveType.MOVETYPE_STEP;
    this.takedamage = damage.DAMAGE_NO;

    this.setModel('progs/boss.mdl');
    this.setSize(new Vector(-128, -128, -24), new Vector(128, 128, 256));

    this.health = this.game.skill === 0 ? 1 : 3;
    this.enemy = activatorEntity;

    this.engine.DispatchTempEntityEvent(tentType.TE_LAVASPLASH, this.origin);

    this.yaw_speed = 20;
    this._runState('boss_rise1');
  }

  takeLightningDamage(activatorEntity: BaseEntity): void {
    if (this.health <= 0) {
      return;
    }

    this.enemy = activatorEntity;
    this.startSound(channel.CHAN_VOICE, 'boss1/pain.wav');
    this.health -= 1;

    if (this.health >= 2) {
      this._runState('boss_shocka1');
    } else if (this.health === 1) {
      this._runState('boss_shockb1');
    } else {
      this._runState('boss_shockc1');
    }
  }

  override spawn(): void {
    if (this.game.deathmatch) {
      this.remove();
      return;
    }

    this.solid = solid.SOLID_MESH;

    this.engine.eventBus.publish('game.monster.spawned', this);
  }

  static override _initStates(): void {
    this._resetStates();

    this._defineSequence('boss_rise', this._createFrameNames('rise', 17),
      function (this: BossMonster, frameIndex: number): void {
        if (frameIndex === 0) {
          this.startSound(channel.CHAN_WEAPON, 'boss1/out1.wav');
        } else if (frameIndex === 1) {
          this.startSound(channel.CHAN_VOICE, 'boss1/sight1.wav');
        }
      },
      false);
    this._defineState('boss_rise17', 'rise17', 'boss_missile1');

    this._defineSequence('boss_idle', this._createFrameNames('walk', 31),
      function (this: BossMonster, frameIndex: number): void {
        if (frameIndex > 0) {
          this._bossFace();
        }
      });

    this._defineSequence('boss_missile', this._createFrameNames('attack', 23),
      function (this: BossMonster, frameIndex: number): void {
        if (frameIndex === 8) {
          this._bossMissile(new Vector(100, 100, 200));
          return;
        }

        if (frameIndex === 19) {
          this._bossMissile(new Vector(100, -100, 200));
          return;
        }

        this._bossFace();
      });

    this._defineSequence('boss_shocka', this._createFrameNames('shocka', 10), null, false);
    this._defineState('boss_shocka10', 'shocka10', 'boss_missile1');

    this._defineSequence('boss_shockb', ['shockb1', 'shockb2', 'shockb3', 'shockb4', 'shockb5', 'shockb6', 'shockb1', 'shockb2', 'shockb3', 'shockb4'], null, false);
    this._defineState('boss_shockb10', 'shockb4', 'boss_missile1');

    this._defineSequence('boss_shockc', this._createFrameNames('shockc', 10), null, false);
    this._defineState('boss_shockc10', 'shockc10', 'boss_death1');

    this._defineSequence('boss_death', ['death1', 'death2', 'death3', 'death4', 'death5', 'death6', 'death7', 'death8', 'death9', 'death9'],
      function (this: BossMonster, frameIndex: number): void {
        if (frameIndex === 0) {
          this.startSound(channel.CHAN_VOICE, 'boss1/death.wav');
          return;
        }

        if (frameIndex === 8) {
          this.startSound(channel.CHAN_BODY, 'boss1/out1.wav');
          this.engine.DispatchTempEntityEvent(tentType.TE_LAVASPLASH, this.origin);
        }
      },
      false);
    this._defineState('boss_death10', 'death9', 'boss_death10', function (this: BossMonster): void {
      this.engine.eventBus.publish('game.monster.killed', this, this.enemy);
      if (this.enemy !== null) {
        this._sub?.useTargets(this.enemy);
      }
      this.remove();
    });
  }
}

/**
 * QUAKED event_lightning (0 1 1) (-16 -16 -16) (16 16 16)
 * Just for boss level.
 */
@serializableObject
export class EventLightningEntity extends BaseEntity {
  static classname = 'event_lightning';

  @serializable lightning_end = 0;
  @serializable _electrode1: BaseEntity | null = null;
  @serializable _electrode2: BaseEntity | null = null;

  static _precache(engineAPI: BaseEntity['engine']): void {
    engineAPI.PrecacheSound('misc/power.wav');
  }

  _lightningFire(): void {
    if (this.game.time >= this.lightning_end) {
      const electrode1 = this._electrode1 as ElectrodeDoor | null;
      const electrode2 = this._electrode2 as ElectrodeDoor | null;
      electrode1?._doorGoDown?.(this);
      electrode2?._doorGoDown?.(this);
      return;
    }

    const electrode1 = this._electrode1 as ElectrodeDoor | null;
    const electrode2 = this._electrode2 as ElectrodeDoor | null;
    if (electrode1 === null || electrode2 === null) {
      return;
    }

    const point1 = electrode1.mins.copy().add(electrode1.maxs).multiply(0.5);
    point1[2] = electrode1.absmin[2] - 16;

    const point2 = electrode2.mins.copy().add(electrode2.maxs).multiply(0.5);
    point2[2] = electrode2.absmin[2] - 16;

    // Compensate for the bolt length so the beam terminates at the electrode.
    const direction = point2.copy().subtract(point1);
    direction.normalize();
    direction.multiply(100);
    point2.subtract(direction);

    this.engine.DispatchBeamEvent(tentType.TE_LIGHTNING3, this.edictId!, point1, point2);

    this._scheduleThink(this.game.time + 0.1, () => {
      this._lightningFire();
    });
  }

  override use(activatorEntity: BaseEntity): void {
    if (this.lightning_end >= this.game.time + 1) {
      return;
    }

    this._electrode1 = this.findFirstEntityByFieldAndValue('target', 'lightning');
    if (this._electrode1 !== null) {
      this._electrode2 = this.findNextEntityByFieldAndValue('target', 'lightning', this._electrode1);
    }

    if (this._electrode1 === null || this._electrode2 === null) {
      return;
    }

    const electrode1 = this._electrode1 as ElectrodeDoor;
    const electrode2 = this._electrode2 as ElectrodeDoor;
    const state1 = electrode1.state;
    const state2 = electrode2.state;

    if ((state1 !== state.STATE_TOP && state1 !== state.STATE_BOTTOM)
      || (state2 !== state.STATE_TOP && state2 !== state.STATE_BOTTOM)
      || state1 !== state2) {
      return;
    }

    // Do not let the electrodes go back up until the bolt is done.
    electrode1.nextthink = -1;
    electrode2.nextthink = -1;
    this.lightning_end = this.game.time + 1;

    this.startSound(channel.CHAN_VOICE, 'misc/power.wav');
    this._lightningFire();

    // Advance the boss pain state if the electrodes are down.
    const boss = this.findFirstEntityByFieldAndValue('classname', BossMonster.classname);
    if (boss instanceof BossMonster && state1 === state.STATE_TOP && boss.health > 0) {
      boss.takeLightningDamage(activatorEntity);
    }
  }

  override spawn(): void {
  }
}
