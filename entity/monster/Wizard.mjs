import Vector from '../../../../shared/Vector.mjs';
import { QuakeEntityAI, ATTACK_STATE } from '../../helper/AI.mjs';
import { BaseSpike } from '../Weapons.mjs';
import BaseMonster, { FlyMonster } from './BaseMonster.mjs';
import { attn, channel, effect, flags, range, solid, tentType } from '../../Defs.mjs';
import { PlayerEntity } from '../Player.mjs';

export const qc = `
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

/**
 * QUAKED monster_wizard (1 0 0) (-16 -16 -24) (16 16 40) Ambush
 *
 * If the player moves behind cover before the missile is launched, launch it
 * at the last visible spot with no velocity leading, in hopes that the player
 * will duck back out and catch it.
 */
export default class WizardMonsterEntity extends FlyMonster {
  static classname = 'monster_wizard';
  static _health = 25;
  static _size = [new Vector(-16.0, -16.0, -24.0), new Vector(16.0, 16.0, 40.0)];

  static _modelDefault = 'progs/wizard.mdl';

  get netname() {
    return 'a Scrag';
  }

  _newEntityAI() {
    return new QuakeEntityAI(this);
  }

  _declareFields() {
    super._declareFields();

    this._serializer.startFields();
    this.waitmin = 0;
    this._serializer.endFields();
  }

  _precache() {
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

  static _initStates() {
    this._states = {};

    // stand
    this._defineState('wiz_stand1', 'hover1', 'wiz_stand2', function () { this._ai.stand(); });
    this._defineState('wiz_stand2', 'hover2', 'wiz_stand3', function () { this._ai.stand(); });
    this._defineState('wiz_stand3', 'hover3', 'wiz_stand4', function () { this._ai.stand(); });
    this._defineState('wiz_stand4', 'hover4', 'wiz_stand5', function () { this._ai.stand(); });
    this._defineState('wiz_stand5', 'hover5', 'wiz_stand6', function () { this._ai.stand(); });
    this._defineState('wiz_stand6', 'hover6', 'wiz_stand7', function () { this._ai.stand(); });
    this._defineState('wiz_stand7', 'hover7', 'wiz_stand8', function () { this._ai.stand(); });
    this._defineState('wiz_stand8', 'hover8', 'wiz_stand1', function () { this._ai.stand(); });

    // walk
    this._defineState('wiz_walk1', 'hover1', 'wiz_walk2', function () { this._ai.walk(8); this.idleSound(); });
    this._defineState('wiz_walk2', 'hover2', 'wiz_walk3', function () { this._ai.walk(8); });
    this._defineState('wiz_walk3', 'hover3', 'wiz_walk4', function () { this._ai.walk(8); });
    this._defineState('wiz_walk4', 'hover4', 'wiz_walk5', function () { this._ai.walk(8); });
    this._defineState('wiz_walk5', 'hover5', 'wiz_walk6', function () { this._ai.walk(8); });
    this._defineState('wiz_walk6', 'hover6', 'wiz_walk7', function () { this._ai.walk(8); });
    this._defineState('wiz_walk7', 'hover7', 'wiz_walk8', function () { this._ai.walk(8); });
    this._defineState('wiz_walk8', 'hover8', 'wiz_walk1', function () { this._ai.walk(8); });

    // side
    this._defineState('wiz_side1', 'hover1', 'wiz_side2', function () { this._ai.run(8); this.idleSound(); });
    this._defineState('wiz_side2', 'hover2', 'wiz_side3', function () { this._ai.run(8); });
    this._defineState('wiz_side3', 'hover3', 'wiz_side4', function () { this._ai.run(8); });
    this._defineState('wiz_side4', 'hover4', 'wiz_side5', function () { this._ai.run(8); });
    this._defineState('wiz_side5', 'hover5', 'wiz_side6', function () { this._ai.run(8); });
    this._defineState('wiz_side6', 'hover6', 'wiz_side7', function () { this._ai.run(8); });
    this._defineState('wiz_side7', 'hover7', 'wiz_side8', function () { this._ai.run(8); });
    this._defineState('wiz_side8', 'hover8', 'wiz_side1', function () { this._ai.run(8); });

    // run
    this._defineState('wiz_run1', 'fly1', 'wiz_run2', function () { this._ai.run(16); this.idleSound(); });
    this._defineState('wiz_run2', 'fly2', 'wiz_run3', function () { this._ai.run(16); });
    this._defineState('wiz_run3', 'fly3', 'wiz_run4', function () { this._ai.run(16); });
    this._defineState('wiz_run4', 'fly4', 'wiz_run5', function () { this._ai.run(16); });
    this._defineState('wiz_run5', 'fly5', 'wiz_run6', function () { this._ai.run(16); });
    this._defineState('wiz_run6', 'fly6', 'wiz_run7', function () { this._ai.run(16); });
    this._defineState('wiz_run7', 'fly7', 'wiz_run8', function () { this._ai.run(16); });
    this._defineState('wiz_run8', 'fly8', 'wiz_run9', function () { this._ai.run(16); });
    this._defineState('wiz_run9', 'fly9', 'wiz_run10', function () { this._ai.run(16); });
    this._defineState('wiz_run10', 'fly10', 'wiz_run11', function () { this._ai.run(16); });
    this._defineState('wiz_run11', 'fly11', 'wiz_run12', function () { this._ai.run(16); });
    this._defineState('wiz_run12', 'fly12', 'wiz_run13', function () { this._ai.run(16); });
    this._defineState('wiz_run13', 'fly13', 'wiz_run14', function () { this._ai.run(16); });
    this._defineState('wiz_run14', 'fly14', 'wiz_run1', function () { this._ai.run(16); });

    // fast attack sequence (unrolled)
    this._defineState('wiz_fast1', 'magatt1', 'wiz_fast2', function () { this._ai.face(); this._startFast(); });
    this._defineState('wiz_fast2', 'magatt2', 'wiz_fast3', function () { this._ai.face(); });
    this._defineState('wiz_fast3', 'magatt3', 'wiz_fast4', function () { this._ai.face(); });
    this._defineState('wiz_fast4', 'magatt4', 'wiz_fast5', function () { this._ai.face(); });
    this._defineState('wiz_fast5', 'magatt5', 'wiz_fast6', function () { this._ai.face(); });
    this._defineState('wiz_fast6', 'magatt6', 'wiz_fast7', function () { this._ai.face(); });
    this._defineState('wiz_fast7', 'magatt5', 'wiz_fast8', function () { this._ai.face(); });
    this._defineState('wiz_fast8', 'magatt4', 'wiz_fast9', function () { this._ai.face(); });
    this._defineState('wiz_fast9', 'magatt3', 'wiz_fast10', function () { this._ai.face(); });
    this._defineState('wiz_fast10', 'magatt2', 'wiz_run1', function () { this._ai.face(); this._attackFinished(); });

    // pain
    this._defineState('wiz_pain1', 'pain1', 'wiz_pain2', function () { });
    this._defineState('wiz_pain2', 'pain2', 'wiz_pain3', function () { });
    this._defineState('wiz_pain3', 'pain3', 'wiz_pain4', function () { });
    this._defineState('wiz_pain4', 'pain4', 'wiz_run1', function () { });

    // death (unrolled, last state null)
    this._defineState('wiz_death1', 'death1', 'wiz_death2', function () {
      this.velocity[0] = -200 + 400 * Math.random();
      this.velocity[1] = -200 + 400 * Math.random();
      this.velocity[2] = 100 + 100 * Math.random();
      this.flags &= ~flags.FL_ONGROUND;
      this.startSound(channel.CHAN_VOICE, 'wizard/wdeath.wav');
    });
    this._defineState('wiz_death2', 'death2', 'wiz_death3', function () { });
    this._defineState('wiz_death3', 'death3', 'wiz_death4', function () { this.solid = solid.SOLID_NOT; });
    this._defineState('wiz_death4', 'death4', 'wiz_death5', function () { });
    this._defineState('wiz_death5', 'death5', 'wiz_death6', function () { });
    this._defineState('wiz_death6', 'death6', 'wiz_death7', function () { });
    this._defineState('wiz_death7', 'death7', 'wiz_death8', function () { });
    this._defineState('wiz_death8', 'death8', null, function () { });
  }

  /**
   * Fire a fast projectile at the current enemy from a specific origin.
   * @param {Vector} origin spawn origin
   */
  _fastFireAt(origin) { // QuakeC: wizard.qc/Wiz_FastFire
    if (!(this.enemy instanceof BaseMonster || this.enemy instanceof PlayerEntity) || this.enemy.health <= 0) {
      return;
    }

    this.effects |= effect.EF_MUZZLEFLASH;

    const movedir = this.enemy.origin.copy().add(this.enemy.view_ofs).subtract(origin);
    movedir.normalize();
    this.movedir.set(movedir);

    // spawn projectile with initial properties so model/size are handled by the class
    this.engine.SpawnEntity(WizardMissile.classname, {
      owner: this,
      speed: 600.0,
    });

    this.startSound(channel.CHAN_WEAPON, 'wizard/wattack.wav');
  }

  _startFast() { // QuakeC: wizard.qc/Wiz_StartFast
    this.startSound(channel.CHAN_WEAPON, 'wizard/wattack.wav');
    this.v_angle.set(this.angles);
    const { forward, right } = this.angles.angleVectors();

    const baseOrigin = this.origin.copy().add(new Vector(0.0, 0.0, 30.0));

    const origin1 = baseOrigin.copy().add(forward.copy().multiply(14)).add(right.copy().multiply(14));
    this._scheduleThink(this.game.time + 0.8, () => this._fastFireAt(origin1));

    const origin2 = baseOrigin.add(forward.copy().multiply(14)).add(right.copy().multiply(-14));
    this._scheduleThink(this.game.time + 0.3, () => this._fastFireAt(origin2));
  }

  thinkMissile() {
    this._runState('wiz_fast1');
  }

  thinkStand() {
    this._runState('wiz_stand1');
  }

  thinkWalk() {
    this._runState('wiz_walk1');
  }

  thinkRun() {
    this._runState('wiz_run1');
  }


  // eslint-disable-next-line no-unused-vars
  thinkPain(attackerEntity, damage) {
    this.startSound(channel.CHAN_VOICE, 'wizard/wpain.wav');
    this._ai.foundTarget(attackerEntity);
    this._runState('wiz_pain1');
  }

  thinkDie(attackerEntity) {
    super.thinkDie(attackerEntity);

    this._sub.useTargets(attackerEntity);

    if (this.health < -40) {
      this.startSound(channel.CHAN_VOICE, 'player/udeath.wav');
      this._gib(true);
      return;
    }

    this._runState('wiz_death1');
  }

  /**
   * @returns {ATTACK_STATE|null} attack decision
   */
  checkAttack() {
    // reuse BaseMonster checkAttack for visibility and ranges, but Wizard has special behavior

    if (this.game.time < this.attack_finished) {
      return null;
    }

    if (!this._ai.enemyIsVisible) {
      return null;
    }

    const enemyRange = this._ai.enemyRange;

    const ai = /** @type {QuakeEntityAI} */ (this._ai);

    if (enemyRange === range.RANGE_FAR) {
      if (ai._attackState !== ATTACK_STATE.AS_STRAIGHT) {
        ai._attackState = ATTACK_STATE.AS_STRAIGHT;
        this._runState('wiz_run1');
      }
      return null;
    }

    // check clear shot
    const trace = this.tracelineToEntity(this.enemy, false);
    if (trace.entity !== this.enemy) {
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
    } else {
      if (ai._attackState !== ATTACK_STATE.AS_SLIDING) {
        ai._attackState = ATTACK_STATE.AS_SLIDING;
        this._runState('wiz_side1');
      }
    }

    return null;
  }

  _attackFinished() {
    const ai = /** @type {QuakeEntityAI} */ (this._ai);
    if (ai.enemyRange >= range.RANGE_MID || !ai.enemyIsVisible) {
      ai._attackState = ATTACK_STATE.AS_STRAIGHT;
      this._runState('wiz_run1');
    } else {
      ai._attackState = ATTACK_STATE.AS_SLIDING;
      this._runState('wiz_side1');
    }
  }

  deathSound() {
    this.startSound(channel.CHAN_VOICE, 'wizard/wdeath.wav');
  }

  painSound() {
    this.startSound(channel.CHAN_VOICE, 'wizard/wpain.wav');
  }

  sightSound() {
    this.startSound(channel.CHAN_VOICE, 'wizard/wsight.wav');
  }

  attackSound() {
    this.startSound(channel.CHAN_VOICE, 'wizard/wattack.wav');
  }

  idleSound() {
    const r = Math.random() * 5;

    if (this.waitmin < this.game.time) {
      this.waitmin = this.game.time + 2;

      if (r > 4.5) {
        this.startSound(channel.CHAN_VOICE, 'wizard/widle1.wav', 1, attn.ATTN_IDLE);
      } else if (r < 1.5) {
        this.startSound(channel.CHAN_VOICE, 'wizard/widle2.wav', 1, attn.ATTN_IDLE);
      }
    }
  }

  hasMissileAttack() {
    return true;
  }
};

export class WizardMissile extends BaseSpike {
  static classname = 'monster_wizard_missile';
  static _damage = 9;
  static _tentType = tentType.TE_WIZSPIKE;
  static _model = 'progs/w_spike.mdl';
};
