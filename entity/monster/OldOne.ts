import Vector from '../../../../shared/Vector.ts';

import { channel, damage, moveType, solid, tentType } from '../../Defs.ts';
import { EntityAI, NoopMonsterAI } from '../../helper/AI.ts';
import { entity } from '../../helper/MiscHelpers.ts';
import BaseEntity from '../BaseEntity.ts';
import { IntermissionCameraEntity, MiscNullEntity } from '../Misc.ts';
import { GibEntity, PlayerEntity } from '../Player.mjs';
import BaseMonster from './BaseMonster.ts';

/**
 * QUAKED monster_oldone (1 0 0) (-16 -16 -24) (16 16 32)
 */
@entity
export class OldOneMonster extends BaseMonster {
  static classname = 'monster_oldone';
  static _modelDefault = 'progs/oldone.mdl';

  static _modelQC = `
$cd id1/models/old_one
$origin 0 0 24
$base base
$skin skin
$scale 1

$frame old1 old2 old3 old4 old5 old6 old7 old8 old9
$frame old10 old11 old12 old13 old14 old15 old16 old17 old18 old19
$frame old20 old21 old22 old23 old24 old25 old26 old27 old28 old29
$frame old30 old31 old32 old33 old34 old35 old36 old37 old38 old39
$frame old40 old41 old42 old43 old44 old45 old46

$frame shake1 shake2 shake3 shake4 shake5 shake6 shake7 shake8
$frame shake9 shake10 shake11 shake12 shake12 shake13 shake14
$frame shake15 shake16 shake17 shake18 shake19 shake20
`;

  static readonly _thrashLightLevels = ['m', 'k', 'k', 'i', 'g', 'e', 'c', 'a', 'c', 'e', 'g', 'i', 'k', 'm', 'm', 'g', 'c', 'b', 'a', 'a'];

  protected override _newEntityAI(): EntityAI<OldOneMonster> {
    return new NoopMonsterAI(this);
  }

  override think(): void {
    BaseEntity.prototype.think.call(this);
  }

  override _precache(): void {
    this.engine.PrecacheModel('progs/oldone.mdl');
    this.engine.PrecacheModel('progs/player.mdl');
    this.engine.PrecacheSound('boss2/death.wav');
    this.engine.PrecacheSound('boss2/idle.wav');
    this.engine.PrecacheSound('boss2/sight.wav');
    this.engine.PrecacheSound('boss2/pop2.wav');
    this.engine.PrecacheSound('misc/r_tele1.wav');
  }

  static _makeLightCallback(level: string): (this: OldOneMonster) => void {
    return function (this: OldOneMonster): void {
      this.engine.Lightstyle(0, level);
    };
  }

  _thrash15Callback(): void {
    this.engine.Lightstyle(0, OldOneMonster._thrashLightLevels[14]);
    this.cnt += 1;
    if (this.cnt !== 3) {
      this._runState('old_thrash1');
    }
  }

  _thrash20Callback(): void {
    this._finale4();
  }

  static override _initStates(): void {
    this._resetStates();

    this._defineSequence('old_idle', this._createFrameNames('old', 46));

    this._defineSequence('old_thrash', this._createFrameNames('shake', 20),
      function (this: OldOneMonster, frameIndex: number): void {
        if (frameIndex === 14) {
          this._thrash15Callback();
          return;
        }

        if (frameIndex === 19) {
          this._thrash20Callback();
          return;
        }

        this.engine.Lightstyle(0, OldOneMonster._thrashLightLevels[frameIndex]);
      },
      false);
    this._defineState('old_thrash20', 'shake20', 'old_thrash20', function (this: OldOneMonster): void {
      this._thrash20Callback();
    });
  }

  override thinkPain(): void {
    this.health = 40000;
  }

  override thinkDie(_attackerEntity: BaseEntity): void {
    this._finale1();
  }

  _finale1(): void {
    this.game.intermission_exittime = this.game.time + 10000000;
    this.game.intermission_running = 1;

    // Find the intermission spot.
    const camera = this.findFirstEntityByFieldAndValue('classname', 'info_intermission');
    console.assert(camera instanceof IntermissionCameraEntity, 'no info_intermission');
    const position = camera instanceof IntermissionCameraEntity ? camera : null;

    const train = this.findFirstEntityByFieldAndValue('classname', 'misc_teleporttrain');
    train?.remove();

    let player = this.findFirstEntityByFieldAndValue('classname', 'player');
    while (player instanceof PlayerEntity) {
      player.view_ofs.clear();
      if (position !== null) {
        const mangle = position.mangle;
        player.angles.set(mangle || position.angles);
        player.v_angle.set(mangle || position.angles);
      }
      player.fixangle = true;
      player.takedamage = damage.DAMAGE_NO;
      player.solid = solid.SOLID_NOT;
      player.movetype = moveType.MOVETYPE_NONE;
      player.weapon = 0;
      player.unsetModel();
      if (position !== null) {
        player.setOrigin(position.origin);
      }
      player = this.findNextEntityByFieldAndValue('classname', 'player', player);
    }

    // Wait for one second before the next finale step.
    this._scheduleThink(this.game.time + 1, () => {
      this._finale2();
    });
  }

  _finale2(): void {
    const origin = this.origin.copy();
    origin[1] -= 100;

    // Start a teleport splash inside Shub.
    this.engine.DispatchTempEntityEvent(tentType.TE_TELEPORT, origin);
    this.startSound(channel.CHAN_VOICE, 'misc/r_tele1.wav');

    this._scheduleThink(this.game.time + 2, () => {
      this._finale3();
    });
  }

  _finale3(): void {
    // Start Shub thrashing wildly.
    this.startSound(channel.CHAN_VOICE, 'boss2/death.wav');
    this.engine.Lightstyle(0, 'abcdefghijklmlkjihgfedcb');
    this.cnt = 0;
    this._runState('old_thrash1');
  }

  _finale4(): void {
    this.startSound(channel.CHAN_VOICE, 'boss2/pop2.wav');

    const oldOrigin = this.origin.copy();

    // Throw tons of meat chunks.
    for (let z = 16; z <= 144; z += 96) {
      for (let x = -64; x <= 64; x += 32) {
        for (let y = -64; y <= 64; y += 32) {
          this.origin[0] = oldOrigin[0] + x;
          this.origin[1] = oldOrigin[1] + y;
          this.origin[2] = oldOrigin[2] + z;

          const random = Math.random();
          let model = 'progs/gib3.mdl';
          if (random < 0.3) {
            model = 'progs/gib1.mdl';
          } else if (random < 0.6) {
            model = 'progs/gib2.mdl';
          }

          this.engine.SpawnEntity(GibEntity.classname, {
            origin: this.origin.copy(),
            velocity: new Vector(
              (Math.random() - 0.5) * 600,
              (Math.random() - 0.5) * 600,
              Math.random() * 400 + 200,
            ),
            model,
          });
        }
      }
    }

    const finaleText = 'Congratulations and well done! You have\n'
      + 'beaten the hideous Shub-Niggurath, and\n'
      + 'her hundreds of ugly changelings and\n'
      + 'monsters. You have proven that your\n'
      + 'skill and your cunning are greater than\n'
      + 'all the powers of Quake. You are the\n'
      + 'master now. Id Software salutes you.';

    let player = this.findFirstEntityByFieldAndValue('classname', 'player');
    while (player instanceof PlayerEntity) {
      player.centerPrint(finaleText);
      player = this.findNextEntityByFieldAndValue('classname', 'player', player);
    }

    // Put a player model down as a finale stand-in.
    const standInOrigin = oldOrigin.copy().subtract(new Vector(32, 264, 0));
    const standInEntity = this.engine.SpawnEntity<MiscNullEntity>(MiscNullEntity.classname, {
      origin: standInOrigin,
      angles: new Vector(0, 290, 0),
    })!.entity;

    if (standInEntity instanceof MiscNullEntity) {
      standInEntity.setModel('progs/player.mdl');
      standInEntity.frame = 1;
    }

  // Switch CD track.
    this.engine.PlayTrack(3);
    this.engine.Lightstyle(0, 'm');
    this.remove();
  }

  override spawn(): void {
    if (this.game.deathmatch) {
      this.remove();
      return;
    }

    this.solid = solid.SOLID_SLIDEBOX;
    this.movetype = moveType.MOVETYPE_STEP;

    this.setModel('progs/oldone.mdl');
    this.setSize(new Vector(-160, -128, -24), new Vector(160, 128, 256));

    // The finale kills Shub via telefrag rather than normal combat damage.
    this.health = 40000;
    this.takedamage = damage.DAMAGE_YES;
    this._runState('old_idle1');

    this.engine.eventBus.publish('game.monster.spawned', this);
  }
}

export default OldOneMonster;
