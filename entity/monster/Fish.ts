import Vector from '../../../../shared/Vector.ts';

import { attn, channel, range, solid } from '../../Defs.ts';
import { ATTACK_STATE, QuakeEntityAI } from '../../helper/AI.mjs';
import { entity } from '../../helper/MiscHelpers.ts';
import BaseEntity from '../BaseEntity.ts';
import { SwimMonster } from './BaseMonster.ts';

/**
 * QUAKED monster_fish (1 0 0) (-16 -16 -24) (16 16 24)
 *
 * Rotfish — an underwater melee-only monster.
 */
@entity
export default class FishMonsterEntity extends SwimMonster {
  static classname = 'monster_fish';
  static _health = 25;
  static _size: [Vector, Vector] = [new Vector(-16, -16, -24), new Vector(16, 16, 24)];

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

  get netname(): string {
    return 'a fish';
  }

  protected override _newEntityAI(): QuakeEntityAI<FishMonsterEntity> {
    return new QuakeEntityAI(this);
  }

  override _precache(): void {
    super._precache();
    this.engine.PrecacheSound('fish/death.wav');
    this.engine.PrecacheSound('fish/bite.wav');
    this.engine.PrecacheSound('fish/idle.wav');
  }

  static override _initStates(): void {
    this._states = {};

    const swimFrames = Array.from({ length: 18 }, (_, i) => `swim${i + 1}`);
    const oddSwimFrames = swimFrames.filter((_, i) => i % 2 === 0);

    // stand — full 18-frame swim loop
    this._defineSequence('f_stand', swimFrames, function (this: FishMonsterEntity) { this._ai.stand(); });

    // walk — full swim loop, walking at speed 8
    this._defineSequence('f_walk', swimFrames, function (this: FishMonsterEntity) { this._ai.walk(8); });

    // run — odd swim frames only (swim1, swim3, …, swim17), speed 12
    this._defineSequence('f_run', oddSwimFrames,
      function (this: FishMonsterEntity, frameIndex: number) {
        this._ai.run(12);

        if (frameIndex === 0 && Math.random() < 0.5) {
          this.startSound(channel.CHAN_VOICE, 'fish/idle.wav');
        }
      });

    // attack — 18 frames with melee bites on frames 3, 9, 15
    const attackFrames = Array.from({ length: 18 }, (_, i) => `attack${i + 1}`);
    const meleeFrameIndices = new Set([2, 8, 14]); // 0-based: attack3, attack9, attack15

    this._defineSequence('f_atta', attackFrames,
      function (this: FishMonsterEntity, frameIndex: number) {
        if (meleeFrameIndices.has(frameIndex)) {
          this._fishMelee();
        } else {
          this._ai.charge(10);
        }
      });

    // attack chain ends at f_run1 instead of looping
    this._defineState('f_atta18', 'attack18', 'f_run1', function (this: FishMonsterEntity) { this._ai.charge(10); });

    // death — 21 frames, first frame plays death sound, last goes non-solid
    const deathFrames = Array.from({ length: 21 }, (_, i) => `death${i + 1}`);

    this._defineSequence('f_death', deathFrames,
      function (this: FishMonsterEntity, frameIndex: number) {
        if (frameIndex === 0) {
          this.deathSound();
        }
      },
      false);

    this._defineState('f_death21', 'death21', null, function (this: FishMonsterEntity) { this.solid = solid.SOLID_NOT; });

    // pain — 9 frames, frames 2–9 call ai_pain(6)
    const painFrames = Array.from({ length: 9 }, (_, i) => `pain${i + 1}`);

    this._defineSequence('f_pain', painFrames,
      function (this: FishMonsterEntity, frameIndex: number) {
        if (frameIndex > 0) {
          this._ai.pain(6);
        }
      });

    // pain chain ends at f_run1 instead of looping
    this._defineState('f_pain9', 'pain9', 'f_run1', function (this: FishMonsterEntity) { this._ai.pain(6); });
  }

  /** Fish melee bite attack. */
  private _fishMelee(): void {
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

  override thinkStand(): void {
    this._runState('f_stand1');
  }

  override thinkWalk(): void {
    this._runState('f_walk1');
  }

  override thinkRun(): void {
    this._runState('f_run1');
  }

  override thinkMelee(): void {
    this._runState('f_atta1');
  }

  override thinkPain(attackerEntity: BaseEntity, _damage: number): void {
    this._ai.foundTarget(attackerEntity, true);
    this.painSound();
    this._runState('f_pain1');
  }

  override thinkDie(attackerEntity: BaseEntity): void {
    super.thinkDie(attackerEntity);
    this._sub!.useTargets(attackerEntity);
    this._runState('f_death1');
  }

  override checkAttack(): number | null {
    if (this._ai.enemyRange === range.RANGE_MELEE) {
      return ATTACK_STATE.AS_MELEE;
    }
    return null;
  }

  override attackSound(): void {
    this.startSound(channel.CHAN_VOICE, 'fish/bite.wav');
  }

  override deathSound(): void {
    this.startSound(channel.CHAN_VOICE, 'fish/death.wav');
  }

  override painSound(): void {
  }

  override idleSound(): void {
    if (Math.random() >= 0.2) {
      return;
    }

    this.startSound(channel.CHAN_VOICE, 'fish/idle.wav', 1.0, attn.ATTN_IDLE);
  }

  protected override hasMeleeAttack(): boolean {
    return true;
  }
}
