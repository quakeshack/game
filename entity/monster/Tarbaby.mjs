import Vector from '../../../../shared/Vector.mjs';

import { channel, damage, flags, moveType } from '../../Defs.mjs';
import { QuakeEntityAI } from '../../helper/AI.mjs';
import { DamageInflictor } from '../Weapons.mjs';
import { WalkMonster } from './BaseMonster.mjs';

export const qc = `
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

export default class TarbabyMonsterEntity extends WalkMonster {
  static classname = 'monster_tarbaby';

  static _modelDefault = 'progs/tarbaby.mdl';
  static _health = 80;
  static _size = [new Vector(-16.0, -16.0, -24.0), new Vector(16.0, 16.0, 40.0)];

  _precache() {
    super._precache();
    this.engine.PrecacheSound('blob/death1.wav');
    this.engine.PrecacheSound('blob/hit1.wav');
    this.engine.PrecacheSound('blob/land1.wav');
    this.engine.PrecacheSound('blob/sight1.wav');
  }

  _declareFields() {
    super._declareFields();

    this._damageInflictor = new DamageInflictor(this);

    this._serializer.startFields();
    this.cnt = 0; // Counter for fly states
    /** @type {'normal' | 'jumping'} */
    this._touchState = 'normal'; // 'normal' or 'jumping'
    this._serializer.endFields();
  }

  _newEntityAI() {
    return new QuakeEntityAI(this);
  }

  static _initStates() {
    this._states = {};

    this._defineState('tbaby_stand1', 'walk1', 'tbaby_stand1', function () { this._ai.stand(); });
    this._defineState('tbaby_hang1', 'walk1', 'tbaby_hang1', function () { this._ai.stand(); });

    this._defineState('tbaby_walk1', 'walk1', 'tbaby_walk2', function () { this._ai.turn(); });
    this._defineState('tbaby_walk2', 'walk2', 'tbaby_walk3', function () { this._ai.turn(); });
    this._defineState('tbaby_walk3', 'walk3', 'tbaby_walk4', function () { this._ai.turn(); });
    this._defineState('tbaby_walk4', 'walk4', 'tbaby_walk5', function () { this._ai.turn(); });
    this._defineState('tbaby_walk5', 'walk5', 'tbaby_walk6', function () { this._ai.turn(); });
    this._defineState('tbaby_walk6', 'walk6', 'tbaby_walk7', function () { this._ai.turn(); });
    this._defineState('tbaby_walk7', 'walk7', 'tbaby_walk8', function () { this._ai.turn(); });
    this._defineState('tbaby_walk8', 'walk8', 'tbaby_walk9', function () { this._ai.turn(); });
    this._defineState('tbaby_walk9', 'walk9', 'tbaby_walk10', function () { this._ai.turn(); });
    this._defineState('tbaby_walk10', 'walk10', 'tbaby_walk11', function () { this._ai.turn(); });
    this._defineState('tbaby_walk11', 'walk11', 'tbaby_walk12', function () { this._ai.walk(2); });
    this._defineState('tbaby_walk12', 'walk12', 'tbaby_walk13', function () { this._ai.walk(2); });
    this._defineState('tbaby_walk13', 'walk13', 'tbaby_walk14', function () { this._ai.walk(2); });
    this._defineState('tbaby_walk14', 'walk14', 'tbaby_walk15', function () { this._ai.walk(2); });
    this._defineState('tbaby_walk15', 'walk15', 'tbaby_walk16', function () { this._ai.walk(2); });
    this._defineState('tbaby_walk16', 'walk16', 'tbaby_walk17', function () { this._ai.walk(2); });
    this._defineState('tbaby_walk17', 'walk17', 'tbaby_walk18', function () { this._ai.walk(2); });
    this._defineState('tbaby_walk18', 'walk18', 'tbaby_walk19', function () { this._ai.walk(2); });
    this._defineState('tbaby_walk19', 'walk19', 'tbaby_walk20', function () { this._ai.walk(2); });
    this._defineState('tbaby_walk20', 'walk20', 'tbaby_walk21', function () { this._ai.walk(2); });
    this._defineState('tbaby_walk21', 'walk21', 'tbaby_walk22', function () { this._ai.walk(2); });
    this._defineState('tbaby_walk22', 'walk22', 'tbaby_walk23', function () { this._ai.walk(2); });
    this._defineState('tbaby_walk23', 'walk23', 'tbaby_walk24', function () { this._ai.walk(2); });
    this._defineState('tbaby_walk24', 'walk24', 'tbaby_walk25', function () { this._ai.walk(2); });
    this._defineState('tbaby_walk25', 'walk25', 'tbaby_walk1', function () { this._ai.walk(2); });

    this._defineState('tbaby_run1', 'run1', 'tbaby_run2', function () { this._ai.face(); });
    this._defineState('tbaby_run2', 'run2', 'tbaby_run3', function () { this._ai.face(); });
    this._defineState('tbaby_run3', 'run3', 'tbaby_run4', function () { this._ai.face(); });
    this._defineState('tbaby_run4', 'run4', 'tbaby_run5', function () { this._ai.face(); });
    this._defineState('tbaby_run5', 'run5', 'tbaby_run6', function () { this._ai.face(); });
    this._defineState('tbaby_run6', 'run6', 'tbaby_run7', function () { this._ai.face(); });
    this._defineState('tbaby_run7', 'run7', 'tbaby_run8', function () { this._ai.face(); });
    this._defineState('tbaby_run8', 'run8', 'tbaby_run9', function () { this._ai.face(); });
    this._defineState('tbaby_run9', 'run9', 'tbaby_run10', function () { this._ai.face(); });
    this._defineState('tbaby_run10', 'run10', 'tbaby_run11', function () { this._ai.face(); });
    this._defineState('tbaby_run11', 'run11', 'tbaby_run12', function () { this._ai.run(2); });
    this._defineState('tbaby_run12', 'run12', 'tbaby_run13', function () { this._ai.run(2); });
    this._defineState('tbaby_run13', 'run13', 'tbaby_run14', function () { this._ai.run(2); });
    this._defineState('tbaby_run14', 'run14', 'tbaby_run15', function () { this._ai.run(2); });
    this._defineState('tbaby_run15', 'run15', 'tbaby_run16', function () { this._ai.run(2); });
    this._defineState('tbaby_run16', 'run16', 'tbaby_run17', function () { this._ai.run(2); });
    this._defineState('tbaby_run17', 'run17', 'tbaby_run18', function () { this._ai.run(2); });
    this._defineState('tbaby_run18', 'run18', 'tbaby_run19', function () { this._ai.run(2); });
    this._defineState('tbaby_run19', 'run19', 'tbaby_run20', function () { this._ai.run(2); });
    this._defineState('tbaby_run20', 'run20', 'tbaby_run21', function () { this._ai.run(2); });
    this._defineState('tbaby_run21', 'run21', 'tbaby_run22', function () { this._ai.run(2); });
    this._defineState('tbaby_run22', 'run22', 'tbaby_run23', function () { this._ai.run(2); });
    this._defineState('tbaby_run23', 'run23', 'tbaby_run24', function () { this._ai.run(2); });
    this._defineState('tbaby_run24', 'run24', 'tbaby_run25', function () { this._ai.run(2); });
    this._defineState('tbaby_run25', 'run25', 'tbaby_run1', function () { this._ai.run(2); });

    // Jump states
    this._defineState('tbaby_jump1', 'jump1', 'tbaby_jump2', function () { this._ai.face(); });
    this._defineState('tbaby_jump2', 'jump2', 'tbaby_jump3', function () { this._ai.face(); });
    this._defineState('tbaby_jump3', 'jump3', 'tbaby_jump4', function () { this._ai.face(); });
    this._defineState('tbaby_jump4', 'jump4', 'tbaby_jump5', function () { this._ai.face(); });
    this._defineState('tbaby_jump5', 'jump5', 'tbaby_jump6', function () { this._performJump(); });
    this._defineState('tbaby_jump6', 'jump6', 'tbaby_fly1', function () {});

    // Fly states
    this._defineState('tbaby_fly1', 'fly1', 'tbaby_fly2', function () {});
    this._defineState('tbaby_fly2', 'fly2', 'tbaby_fly3', function () {});
    this._defineState('tbaby_fly3', 'fly3', 'tbaby_fly4', function () {});
    this._defineState('tbaby_fly4', 'fly4', 'tbaby_fly1', function () { this._flyCounter(); });

    this._defineState('tbaby_die1', 'exp', 'tbaby_die2', function () { this.takedamage = damage.DAMAGE_NO; });
    this._defineState('tbaby_die2', 'exp', null, function () { this._dieInAnExplosion(); });
  }

  _dieInAnExplosion() {
    this.startSound(channel.CHAN_VOICE, 'blob/death1.wav');

    this._damageInflictor.blastDamage(120, this, this.origin);

    const vel = this.velocity.copy();
    vel.normalize();
    this.origin.subtract(vel.multiply(8.0));
  }

  _performJump() {
    // Set up jump physics
    this.movetype = moveType.MOVETYPE_BOUNCE;
    this._touchState = 'jumping';

    // Calculate jump velocity
    const { forward } = this.angles.angleVectors();
    this.origin[2] += 1;

    this.velocity = forward.multiply(600);
    this.velocity[2] = 200 + Math.random() * 150;

    // Remove onground flag
    if (this.flags & flags.FL_ONGROUND) {
      this.flags = this.flags & ~flags.FL_ONGROUND;
    }

    this.cnt = 0;
  }

  _jumpTouch(other) {
    if (other.takedamage && other.classname !== this.classname) {
      if (this.velocity.len() > 400) {
        const ldmg = 10 + 10 * Math.random();
        this.damage(other, ldmg);
        this.startSound(channel.CHAN_WEAPON, 'blob/hit1.wav');
      }
    }
    else {
      this.startSound(channel.CHAN_WEAPON, 'blob/land1.wav');
    }

    if (!this.isOnTheFloor()) {
      if (this.flags & flags.FL_ONGROUND) {
        // Jump randomly to not get hung up
        this._touchState = 'normal';
        this.movetype = moveType.MOVETYPE_STEP;
        this._runState('tbaby_run1');
      }
      return; // not on ground yet
    }

    this._touchState = 'normal';
    this._runState('tbaby_jump1');
  }

  _flyCounter() {
    this.cnt = this.cnt + 1;
    if (this.cnt >= 4) {
      this._runState('tbaby_jump5');
    }
  }

  // Override the base touch method to handle different touch states
  touch(other) {
    if (this._touchState === 'jumping') {
      this._jumpTouch(other);
    }
    else {
      super.touch(other);
    }
  }

  thinkStand() {
    this._runState('tbaby_stand1');
  }

  thinkWalk() {
    this._runState('tbaby_walk1');
  }

  thinkRun() {
    this._runState('tbaby_run1');
  }

  thinkMissile() {
    this._runState('tbaby_jump1');
  }

  thinkMelee() {
    this._runState('tbaby_jump1');
  }

  thinkDie() {
    this._runState('tbaby_die1');
  }

  hasMissileAttack() {
    return true;
  }

  hasMeleeAttack() {
    return true;
  }
};
