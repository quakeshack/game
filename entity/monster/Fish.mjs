import Vector from '../../../../shared/Vector.mjs';

import { attn, channel, range, solid } from '../../Defs.mjs';
import { ATTACK_STATE, QuakeEntityAI } from '../../helper/AI.mjs';
import { SwimMonster } from './BaseMonster.mjs';

export default class FishMonsterEntity extends SwimMonster {
  static classname = 'monster_fish';
  static _health = 25;
  static _size = [new Vector(-16.0, -16.0, -24.0), new Vector(16.0, 16.0, 24.0)];

  static _modelDefault = 'progs/fish.mdl';

  static _modelQC = `
$cd id1/models/fish
$origin 0 0 24
$base base
$skin skin

$frame attack1 attack2 attack3 attack4 attack5 attack6
$frame attack7 attack8 attack9 attack10 attack11 attack12 attack13
$frame attack14 attack15 attack16 attack17 attack18

$frame death1 death2 death3 death4 death5 death6 death7
$frame death8 death9 death10 death11 death12 death13 death14 death15
$frame death16 death17 death18 death19 death20 death21

$frame swim1 swim2 swim3 swim4 swim5 swim6 swim7 swim8
$frame swim9 swim10 swim11 swim12 swim13 swim14 swim15 swim16 swim17
$frame swim18

$frame pain1 pain2 pain3 pain4 pain5 pain6 pain7 pain8
$frame pain9
`;

  get netname() {
    return 'a fish';
  }

  _newEntityAI() {
    return new QuakeEntityAI(this);
  }

  _precache() {
    super._precache();

    this.engine.PrecacheSound('fish/death.wav');
    this.engine.PrecacheSound('fish/bite.wav');
    this.engine.PrecacheSound('fish/idle.wav');
  }

  static _initStates() {
    this._states = {};

    // stand (uses swim frames) - unrolled
    this._defineState('f_stand1', 'swim1', 'f_stand2', function () { this._ai.stand(); });
    this._defineState('f_stand2', 'swim2', 'f_stand3', function () { this._ai.stand(); });
    this._defineState('f_stand3', 'swim3', 'f_stand4', function () { this._ai.stand(); });
    this._defineState('f_stand4', 'swim4', 'f_stand5', function () { this._ai.stand(); });
    this._defineState('f_stand5', 'swim5', 'f_stand6', function () { this._ai.stand(); });
    this._defineState('f_stand6', 'swim6', 'f_stand7', function () { this._ai.stand(); });
    this._defineState('f_stand7', 'swim7', 'f_stand8', function () { this._ai.stand(); });
    this._defineState('f_stand8', 'swim8', 'f_stand9', function () { this._ai.stand(); });
    this._defineState('f_stand9', 'swim9', 'f_stand10', function () { this._ai.stand(); });
    this._defineState('f_stand10', 'swim10', 'f_stand11', function () { this._ai.stand(); });
    this._defineState('f_stand11', 'swim11', 'f_stand12', function () { this._ai.stand(); });
    this._defineState('f_stand12', 'swim12', 'f_stand13', function () { this._ai.stand(); });
    this._defineState('f_stand13', 'swim13', 'f_stand14', function () { this._ai.stand(); });
    this._defineState('f_stand14', 'swim14', 'f_stand15', function () { this._ai.stand(); });
    this._defineState('f_stand15', 'swim15', 'f_stand16', function () { this._ai.stand(); });
    this._defineState('f_stand16', 'swim16', 'f_stand17', function () { this._ai.stand(); });
    this._defineState('f_stand17', 'swim17', 'f_stand18', function () { this._ai.stand(); });
    this._defineState('f_stand18', 'swim18', 'f_stand1', function () { this._ai.stand(); });

    // walk (swim frames, ai_walk(8)) - unrolled
    this._defineState('f_walk1', 'swim1', 'f_walk2', function () { this._ai.walk(8); });
    this._defineState('f_walk2', 'swim2', 'f_walk3', function () { this._ai.walk(8); });
    this._defineState('f_walk3', 'swim3', 'f_walk4', function () { this._ai.walk(8); });
    this._defineState('f_walk4', 'swim4', 'f_walk5', function () { this._ai.walk(8); });
    this._defineState('f_walk5', 'swim5', 'f_walk6', function () { this._ai.walk(8); });
    this._defineState('f_walk6', 'swim6', 'f_walk7', function () { this._ai.walk(8); });
    this._defineState('f_walk7', 'swim7', 'f_walk8', function () { this._ai.walk(8); });
    this._defineState('f_walk8', 'swim8', 'f_walk9', function () { this._ai.walk(8); });
    this._defineState('f_walk9', 'swim9', 'f_walk10', function () { this._ai.walk(8); });
    this._defineState('f_walk10', 'swim10', 'f_walk11', function () { this._ai.walk(8); });
    this._defineState('f_walk11', 'swim11', 'f_walk12', function () { this._ai.walk(8); });
    this._defineState('f_walk12', 'swim12', 'f_walk13', function () { this._ai.walk(8); });
    this._defineState('f_walk13', 'swim13', 'f_walk14', function () { this._ai.walk(8); });
    this._defineState('f_walk14', 'swim14', 'f_walk15', function () { this._ai.walk(8); });
    this._defineState('f_walk15', 'swim15', 'f_walk16', function () { this._ai.walk(8); });
    this._defineState('f_walk16', 'swim16', 'f_walk17', function () { this._ai.walk(8); });
    this._defineState('f_walk17', 'swim17', 'f_walk18', function () { this._ai.walk(8); });
    this._defineState('f_walk18', 'swim18', 'f_walk1', function () { this._ai.walk(8); });

      // run (use odd swim frames as in original qc)
    this._defineState('f_run1', 'swim1', 'f_run2', function () { this._ai.run(12); if (Math.random() < 0.5) { this.startSound(channel.CHAN_VOICE, 'fish/idle.wav', 1.0, attn.ATTN_NORM); } });
    this._defineState('f_run2', 'swim3', 'f_run3', function () { this._ai.run(12); });
    this._defineState('f_run3', 'swim5', 'f_run4', function () { this._ai.run(12); });
    this._defineState('f_run4', 'swim7', 'f_run5', function () { this._ai.run(12); });
    this._defineState('f_run5', 'swim9', 'f_run6', function () { this._ai.run(12); });
    this._defineState('f_run6', 'swim11', 'f_run7', function () { this._ai.run(12); });
    this._defineState('f_run7', 'swim13', 'f_run8', function () { this._ai.run(12); });
    this._defineState('f_run8', 'swim15', 'f_run9', function () { this._ai.run(12); });
    this._defineState('f_run9', 'swim17', 'f_run1', function () { this._ai.run(12); });

    // attack frames (some call fish melee)
    this._defineState('f_atta1', 'attack1', 'f_atta2', function () { this._ai.charge(10); });
    this._defineState('f_atta2', 'attack2', 'f_atta3', function () { this._ai.charge(10); });
    this._defineState('f_atta3', 'attack3', 'f_atta4', function () { this._fishMelee(); });
    this._defineState('f_atta4', 'attack4', 'f_atta5', function () { this._ai.charge(10); });
    this._defineState('f_atta5', 'attack5', 'f_atta6', function () { this._ai.charge(10); });
    this._defineState('f_atta6', 'attack6', 'f_atta7', function () { this._ai.charge(10); });
    this._defineState('f_atta7', 'attack7', 'f_atta8', function () { this._ai.charge(10); });
    this._defineState('f_atta8', 'attack8', 'f_atta9', function () { this._ai.charge(10); });
    this._defineState('f_atta9', 'attack9', 'f_atta10', function () { this._fishMelee(); });
    this._defineState('f_atta10', 'attack10', 'f_atta11', function () { this._ai.charge(10); });
    this._defineState('f_atta11', 'attack11', 'f_atta12', function () { this._ai.charge(10); });
    this._defineState('f_atta12', 'attack12', 'f_atta13', function () { this._ai.charge(10); });
    this._defineState('f_atta13', 'attack13', 'f_atta14', function () { this._ai.charge(10); });
    this._defineState('f_atta14', 'attack14', 'f_atta15', function () { this._ai.charge(10); });
    this._defineState('f_atta15', 'attack15', 'f_atta16', function () { this._fishMelee(); });
    this._defineState('f_atta16', 'attack16', 'f_atta17', function () { this._ai.charge(10); });
    this._defineState('f_atta17', 'attack17', 'f_atta18', function () { this._ai.charge(10); });
    this._defineState('f_atta18', 'attack18', 'f_run1', function () { this._ai.charge(10); });

    // death frames (explicit/unrolled)
    this._defineState('f_death1', 'death1', 'f_death2', function () { this.deathSound(); });
    this._defineState('f_death2', 'death2', 'f_death3', function () { });
    this._defineState('f_death3', 'death3', 'f_death4', function () { });
    this._defineState('f_death4', 'death4', 'f_death5', function () { });
    this._defineState('f_death5', 'death5', 'f_death6', function () { });
    this._defineState('f_death6', 'death6', 'f_death7', function () { });
    this._defineState('f_death7', 'death7', 'f_death8', function () { });
    this._defineState('f_death8', 'death8', 'f_death9', function () { });
    this._defineState('f_death9', 'death9', 'f_death10', function () { });
    this._defineState('f_death10', 'death10', 'f_death11', function () { });
    this._defineState('f_death11', 'death11', 'f_death12', function () { });
    this._defineState('f_death12', 'death12', 'f_death13', function () { });
    this._defineState('f_death13', 'death13', 'f_death14', function () { });
    this._defineState('f_death14', 'death14', 'f_death15', function () { });
    this._defineState('f_death15', 'death15', 'f_death16', function () { });
    this._defineState('f_death16', 'death16', 'f_death17', function () { });
    this._defineState('f_death17', 'death17', 'f_death18', function () { });
    this._defineState('f_death18', 'death18', 'f_death19', function () { });
    this._defineState('f_death19', 'death19', 'f_death20', function () { });
    this._defineState('f_death20', 'death20', 'f_death21', function () { });
    this._defineState('f_death21', 'death21', null, function () { this.solid = solid.SOLID_NOT; });

    // pain frames
    this._defineState('f_pain1', 'pain1', 'f_pain2', function () { });
    this._defineState('f_pain2', 'pain2', 'f_pain3', function () { this._ai.pain(6); });
    this._defineState('f_pain3', 'pain3', 'f_pain4', function () { this._ai.pain(6); });
    this._defineState('f_pain4', 'pain4', 'f_pain5', function () { this._ai.pain(6); });
    this._defineState('f_pain5', 'pain5', 'f_pain6', function () { this._ai.pain(6); });
    this._defineState('f_pain6', 'pain6', 'f_pain7', function () { this._ai.pain(6); });
    this._defineState('f_pain7', 'pain7', 'f_pain8', function () { this._ai.pain(6); });
    this._defineState('f_pain8', 'pain8', 'f_pain9', function () { this._ai.pain(6); });
    this._defineState('f_pain9', 'pain9', 'f_run1', function () { this._ai.pain(6); });
  }

  /** fish melee bite */
  _fishMelee() {
    if (!this.enemy) {
      return;
    }

    if (!this.enemy.canReceiveDamage(this)) {
      return;
    }

    if (this.enemy.origin.distanceTo(this.origin) > 60.0) {
      return;
    }

    this.attackSound();

    const ldmg = (Math.random() + Math.random()) * 3;
    this.damage(this.enemy, ldmg);
  }

  thinkStand() {
    this._runState('f_stand1');
  }

  thinkWalk() {
    this._runState('f_walk1');
  }

  thinkRun() {
    this._runState('f_run1');
  }

  thinkMelee() {
    this._runState('f_atta1');
  }

  // fish always play pain frames
  // eslint-disable-next-line no-unused-vars
  thinkPain(attackerEntity, damage) {
    this._ai.foundTarget(attackerEntity, true);
    // play pain sequence
    this.painSound();
    this._runState('f_pain1');
  }

  thinkDie(attackerEntity) {
    super.thinkDie(attackerEntity);
    this._sub.useTargets(attackerEntity);
    // this.setSize(Vector.origin, Vector.origin); // take up no space anymore
    this._runState('f_death1');
  }

  checkAttack() {
    if (this._ai.enemyRange === range.RANGE_MELEE) {
      return ATTACK_STATE.AS_MELEE;
    }
    return null;
  }

  attackSound() {
    this.startSound(channel.CHAN_VOICE, 'fish/bite.wav');
  }

  deathSound() {
    this.startSound(channel.CHAN_VOICE, 'fish/death.wav');
  }

  painSound() {
  }

  idleSound() {
    if (Math.random() >= 0.2) {
      return;
    }

    this.startSound(channel.CHAN_VOICE, 'fish/idle.wav', 1.0, attn.ATTN_IDLE);
  }

  hasMeleeAttack() {
    return true;
  }
};
