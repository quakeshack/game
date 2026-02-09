import Vector from '../../../../shared/Vector.mjs';

import { channel, damage, moveType, solid, tentType } from '../../Defs.mjs';
import BaseEntity from '../BaseEntity.mjs';
import BaseMonster from './BaseMonster.mjs';
import BasePropEntity, { state } from '../props/BasePropEntity.mjs';
import { Sub } from '../Subs.mjs';
import { Missile } from '../Weapons.mjs';
import { PlayerEntity } from '../Player.mjs';

/**
 * Lava ball projectile fired by Chthon.
 * Acts like a rocket (missile touch) but uses lavaball model.
 */
export class BossLavaball extends Missile {
  static classname = 'monster_boss_lavaball';

  static _precache(engineAPI) {
    engineAPI.PrecacheModel('progs/lavaball.mdl');
  }

  spawn() {
    this.setModel('progs/lavaball.mdl');
    this.avelocity.setTo(200.0, 100.0, 300.0);
    this.setSize(Vector.origin, Vector.origin);
    this.velocity.set(this.movedir.copy().multiply(300.0));
    this.movetype = moveType.MOVETYPE_FLYMISSILE;
    this.solid = solid.SOLID_BBOX;

    this._scheduleThink(this.game.time + 6.0, () => this.remove());
  }
}

/**
 * QUAKED monster_boss (1 0 0) (-128 -128 -24) (128 128 256)
 * The lava boss (Chthon) from E1M8.
 * Activated via use() trigger. Takes damage only from event_lightning electrodes.
 */
export class BossMonster extends BaseMonster {
  static classname = 'monster_boss';

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

  // Boss doesn't use the standard AI system, skip AI think
  _newEntityAI() {
    return null;
  }

  // Override think to skip AI but still process scheduled thinks
  think() {
    // Skip BaseMonster.think() which calls _ai.think()
    // Call BaseEntity.think() directly for scheduled thinks
    BaseEntity.prototype.think.call(this);
  }

  _declareFields() {
    super._declareFields();

    // Boss fields are already in BaseMonster: health, enemy, yaw_speed
    // Just initialize the Sub helper
    this._sub = new Sub(this);
  }

  _precache() {
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

  /** Selects a player target, possibly switching in multiplayer. */
  _bossFace() {
    // go for another player if multi player
    const enemyHealth = this.enemy ? /** @type {PlayerEntity} */(this.enemy).health : 0;

    if (!this.enemy || enemyHealth <= 0 || Math.random() < 0.02) {
      let newEnemy = this.findNextEntityByFieldAndValue('classname', 'player', this.enemy);
      if (!newEnemy) {
        newEnemy = this.findFirstEntityByFieldAndValue('classname', 'player');
      }
      if (newEnemy) {
        this.enemy = newEnemy;
      }
    }

    // face the enemy
    if (this.enemy) {
      const delta = this.enemy.origin.copy().subtract(this.origin);
      this.ideal_yaw = delta.toAngles()[1];
      this._changeYaw();
    }
  }

  /** Rotates towards ideal_yaw at yaw_speed. */
  _changeYaw() {
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
      if (move > this.yaw_speed) {
        move = this.yaw_speed;
      }
    } else {
      if (move < -this.yaw_speed) {
        move = -this.yaw_speed;
      }
    }

    this.angles[1] = current + move;
  }

  /**
   * Fires a lava ball at the current enemy.
   * @param {Vector} offset offset from origin for projectile spawn
   */
  _bossMissile(offset) {
    if (!this.enemy) {
      return;
    }

    const offang = this.enemy.origin.copy().subtract(this.origin).toAngles();
    const { forward, right } = offang.angleVectors();

    const org = this.origin.copy()
      .add(forward.copy().multiply(offset[0]))
      .add(right.copy().multiply(offset[1]))
      .add(new Vector(0, 0, offset[2]));

    // lead the player on hard mode
    let targetPos;
    if (this.game.skill > 1) {
      const t = this.enemy.origin.distanceTo(org) / 300;
      const velocity = this.enemy.velocity.copy();
      velocity[2] = 0;
      targetPos = this.enemy.origin.copy().add(velocity.multiply(t));
    } else {
      targetPos = this.enemy.origin.copy();
    }

    const dir = targetPos.subtract(org);
    dir.normalize();

    this.engine.SpawnEntity(BossLavaball.classname, {
      origin: org,
      movedir: dir,
      owner: this,
    });

    this.startSound(channel.CHAN_WEAPON, 'boss1/throw.wav');

    // check for dead enemy
    const enemy = /** @type {PlayerEntity} */(this.enemy);
    const enemyHealth = enemy.health;
    if (enemyHealth <= 0) {
      this._runState('boss_idle1');
    }
  }

  /**
   * Called when boss is triggered to awaken.
   * @param {BaseEntity} activatorEntity entity that triggered the boss
   */
  use(activatorEntity) {
    this.solid = solid.SOLID_SLIDEBOX;
    this.movetype = moveType.MOVETYPE_STEP;
    this.takedamage = damage.DAMAGE_NO;

    this.setModel('progs/boss.mdl');
    this.setSize(new Vector(-128, -128, -24), new Vector(128, 128, 256));

    // health based on skill: easy = 1 hit, normal+ = 3 hits
    if (this.game.skill === 0) {
      this.health = 1;
    } else {
      this.health = 3;
    }

    this.enemy = activatorEntity;

    // lava splash effect
    this.engine.DispatchTempEntityEvent(tentType.TE_LAVASPLASH, this.origin);

    this.yaw_speed = 20;
    this._runState('boss_rise1');
  }

  /**
   * Called by event_lightning when electrodes are activated with boss at top.
   * @param {BaseEntity} activatorEntity entity that triggered the lightning
   */
  takeLightningDamage(activatorEntity) {
    if (this.health <= 0) {
      return;
    }

    this.enemy = activatorEntity;
    this.startSound(channel.CHAN_VOICE, 'boss1/pain.wav');
    this.health--;

    if (this.health >= 2) {
      this._runState('boss_shocka1');
    } else if (this.health === 1) {
      this._runState('boss_shockb1');
    } else {
      this._runState('boss_shockc1');
    }
  }

  spawn() {
    if (this.game.deathmatch) {
      this.remove();
      return;
    }

    this.engine.eventBus.publish('game.monster.spawned', this);

    // Boss starts inactive until triggered
  }

  static _initStates() {
    this._states = {};

    // Rise animation (17 frames)
    this._defineState('boss_rise1', 'rise1', 'boss_rise2', function () {
      this.startSound(channel.CHAN_WEAPON, 'boss1/out1.wav');
    });
    this._defineState('boss_rise2', 'rise2', 'boss_rise3', function () {
      this.startSound(channel.CHAN_VOICE, 'boss1/sight1.wav');
    });
    for (let i = 3; i <= 16; i++) {
      this._defineState(`boss_rise${i}`, `rise${i}`, `boss_rise${i + 1}`, function () {});
    }
    this._defineState('boss_rise17', 'rise17', 'boss_missile1', function () {});

    // Idle/walk animation (31 frames)
    this._defineState('boss_idle1', 'walk1', 'boss_idle2', function () {});
    for (let i = 2; i <= 30; i++) {
      this._defineState(`boss_idle${i}`, `walk${i}`, `boss_idle${i + 1}`, function () { this._bossFace(); });
    }
    this._defineState('boss_idle31', 'walk31', 'boss_idle1', function () { this._bossFace(); });

    // Attack/missile animation (23 frames)
    for (let i = 1; i <= 8; i++) {
      this._defineState(`boss_missile${i}`, `attack${i}`, `boss_missile${i + 1}`, function () { this._bossFace(); });
    }
    this._defineState('boss_missile9', 'attack9', 'boss_missile10', function () {
      this._bossMissile(new Vector(100, 100, 200));
    });
    for (let i = 10; i <= 19; i++) {
      this._defineState(`boss_missile${i}`, `attack${i}`, `boss_missile${i + 1}`, function () { this._bossFace(); });
    }
    this._defineState('boss_missile20', 'attack20', 'boss_missile21', function () {
      this._bossMissile(new Vector(100, -100, 200));
    });
    for (let i = 21; i <= 22; i++) {
      this._defineState(`boss_missile${i}`, `attack${i}`, `boss_missile${i + 1}`, function () { this._bossFace(); });
    }
    this._defineState('boss_missile23', 'attack23', 'boss_missile1', function () { this._bossFace(); });

    // Shock A animation (10 frames) - 2+ health remaining
    for (let i = 1; i <= 9; i++) {
      this._defineState(`boss_shocka${i}`, `shocka${i}`, `boss_shocka${i + 1}`, function () {});
    }
    this._defineState('boss_shocka10', 'shocka10', 'boss_missile1', function () {});

    // Shock B animation (10 frames, loops back) - 1 health remaining
    for (let i = 1; i <= 5; i++) {
      this._defineState(`boss_shockb${i}`, `shockb${i}`, `boss_shockb${i + 1}`, function () {});
    }
    this._defineState('boss_shockb6', 'shockb6', 'boss_shockb7', function () {});
    this._defineState('boss_shockb7', 'shockb1', 'boss_shockb8', function () {});
    this._defineState('boss_shockb8', 'shockb2', 'boss_shockb9', function () {});
    this._defineState('boss_shockb9', 'shockb3', 'boss_shockb10', function () {});
    this._defineState('boss_shockb10', 'shockb4', 'boss_missile1', function () {});

    // Shock C animation (10 frames) - death sequence start
    for (let i = 1; i <= 9; i++) {
      this._defineState(`boss_shockc${i}`, `shockc${i}`, `boss_shockc${i + 1}`, function () {});
    }
    this._defineState('boss_shockc10', 'shockc10', 'boss_death1', function () {});

    // Death animation (10 frames)
    this._defineState('boss_death1', 'death1', 'boss_death2', function () {
      this.startSound(channel.CHAN_VOICE, 'boss1/death.wav');
    });
    for (let i = 2; i <= 8; i++) {
      this._defineState(`boss_death${i}`, `death${i}`, `boss_death${i + 1}`, function () {});
    }
    this._defineState('boss_death9', 'death9', 'boss_death10', function () {
      this.startSound(channel.CHAN_BODY, 'boss1/out1.wav');
      this.engine.DispatchTempEntityEvent(tentType.TE_LAVASPLASH, this.origin);
    });
    this._defineState('boss_death10', 'death9', 'boss_death10', function () {
      this.engine.eventBus.publish('game.monster.killed', this, this.enemy);
      this._sub.useTargets(this.enemy);
      this.remove();
    });
  }
}

/**
 * QUAKED event_lightning (0 1 1) (-16 -16 -16) (16 16 16)
 * Controls the lightning electrodes in the Chthon boss fight (E1M8).
 * Finds two doors with target "lightning" and fires lightning between them.
 * When both electrodes are in the same state (both up or both down), lightning fires.
 * Damages the boss if electrodes are at STATE_TOP.
 */
export class EventLightningEntity extends BaseEntity {
  static classname = 'event_lightning';

  _declareFields() {
    this._serializer.startFields();

    /** @type {number} time when lightning effect ends */
    this.lightning_end = 0;
    /** @type {?BaseEntity} first electrode door */
    this._electrode1 = null;
    /** @type {?BaseEntity} second electrode door */
    this._electrode2 = null;

    this._serializer.endFields();
  }

  static _precache(engineAPI) {
    engineAPI.PrecacheSound('misc/power.wav');
  }

  /**
   * Fires the lightning bolt effect between electrodes.
   */
  _lightningFire() {
    if (this.game.time >= this.lightning_end) {
      // done here, put the terminals back up
      const door1 = /** @type {{_doorGoDown?: (e: BaseEntity) => void}} */(this._electrode1);
      const door2 = /** @type {{_doorGoDown?: (e: BaseEntity) => void}} */(this._electrode2);
      if (door1 && typeof door1._doorGoDown === 'function') {
        door1._doorGoDown(this);
      }
      if (door2 && typeof door2._doorGoDown === 'function') {
        door2._doorGoDown(this);
      }
      return;
    }

    // calculate lightning bolt positions
    const p1 = this._electrode1.mins.copy().add(this._electrode1.maxs).multiply(0.5);
    p1[2] = this._electrode1.absmin[2] - 16;

    const p2 = this._electrode2.mins.copy().add(this._electrode2.maxs).multiply(0.5);
    p2[2] = this._electrode2.absmin[2] - 16;

    // compensate for length of bolt
    const dir = p2.copy().subtract(p1);
    dir.normalize();
    dir.multiply(100);
    p2.subtract(dir);

    // dispatch lightning effect
    this.engine.DispatchBeamEvent(tentType.TE_LIGHTNING3, this.edictId, p1, p2);

    // schedule next frame
    this._scheduleThink(this.game.time + 0.1, () => this._lightningFire());
  }

  /**
   * Triggered by buttons to fire the electrodes.
   * @param {BaseEntity} activatorEntity entity that triggered this
   */
  use(activatorEntity) {
    if (this.lightning_end >= this.game.time + 1) {
      return; // already firing
    }

    // find the two electrode doors
    this._electrode1 = this.findFirstEntityByFieldAndValue('target', 'lightning');
    if (this._electrode1) {
      this._electrode2 = this.findNextEntityByFieldAndValue('target', 'lightning', this._electrode1);
    }

    if (!this._electrode1 || !this._electrode2) {
      console.warn('event_lightning: missing lightning targets');
      return;
    }

    // check if electrodes are aligned (both at same state)
    const elec1 = /** @type {BasePropEntity} */(this._electrode1);
    const elec2 = /** @type {BasePropEntity} */(this._electrode2);
    const state1 = elec1.state;
    const state2 = elec2.state;

    if ((state1 !== state.STATE_TOP && state1 !== state.STATE_BOTTOM) ||
        (state2 !== state.STATE_TOP && state2 !== state.STATE_BOTTOM) ||
        state1 !== state2) {
      // not aligned
      return;
    }

    // don't let the electrodes go back up until the bolt is done
    this._electrode1.nextthink = -1;
    this._electrode2.nextthink = -1;
    this.lightning_end = this.game.time + 1;

    this.startSound(channel.CHAN_VOICE, 'misc/power.wav');
    this._lightningFire();

    // advance the boss pain if electrodes are down (at top position)
    const boss = /** @type {BossMonster} */(this.findFirstEntityByFieldAndValue('classname', 'monster_boss'));

    if (!(boss instanceof BossMonster)) {
      return;
    }

    if (state1 === state.STATE_TOP && boss.health > 0) {
      boss.takeLightningDamage(activatorEntity);
    }
  }

  spawn() {
    // nothing to do on spawn, just wait for use()
  }
}
