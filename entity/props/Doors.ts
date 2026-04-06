import type { ServerEdict } from '../../../../shared/GameInterfaces.ts';
import type { ServerGameAPI } from '../../GameAPI.ts';
import type BaseEntity from '../BaseEntity.ts';

import Vector from '../../../../shared/Vector.ts';

import { attn, channel, colors, damage, items, moveType, solid, worldType } from '../../Defs.ts';
import { entity, serializable } from '../../helper/MiscHelpers.ts';
import { itemNames } from '../Items.mjs';
import { PlayerEntity } from '../Player.mjs';
import { TriggerFieldEntity } from '../Subs.ts';
import { DamageHandler } from '../Weapons.ts';
import BasePropEntity, { state } from './BasePropEntity.ts';

const DOOR_GO_DOWN_THINK = 'door-go-down';

type DoorSoundPair = readonly [string, string];
type SecretDoorSoundSet = readonly [string | null, string | null, string | null];

/**
 * Resolve the worldtype-specific lock sounds with the medieval set as fallback.
 * @returns Lock sound pair for the active world type.
 */
function getWorldLockSounds(lockSounds: Readonly<Record<number, DoorSoundPair>>, currentWorldType: number): DoorSoundPair {
  return lockSounds[currentWorldType] ?? lockSounds[worldType.MEDIEVAL];
}

/**
 * Door flags used in spawnflags.
 */
export enum DoorFlag {
  DOOR_START_OPEN = 1,
  DOOR_DONT_LINK = 4,
  DOOR_GOLD_KEY = 8,
  DOOR_SILVER_KEY = 16,
  DOOR_TOGGLE = 32,
}

export { DoorFlag as flag };

@entity
export abstract class BaseDoorEntity extends BasePropEntity {
  @serializable _linkedDoor: BaseDoorEntity | null = null;
  @serializable _triggerField: BaseEntity | null = null;
  @serializable noise4: string | null = null;
  @serializable health = 0;
  @serializable items = 0;
  @serializable max_health = 0;
  @serializable portal = -1;
  @serializable _doormarker = 'door';

  protected _startDoorVoice(soundName: string | null): void {
    console.assert(soundName !== null, 'Door sound must be initialized before playback');
    if (soundName === null) {
      return;
    }

    this.startSound(channel.CHAN_VOICE, soundName);
  }

  protected _spawnTriggerField(mins: Vector, maxs: Vector): BaseEntity | null {
    const edict = this.engine.SpawnEntity(TriggerFieldEntity.classname, {
      owner: this,
      mins,
      maxs,
    });

    return edict?.entity instanceof TriggerFieldEntity ? edict.entity : null;
  }

  /**
   * QuakeC: LinkDoors
   */
  protected _linkDoors(): void {
    // eslint-disable-next-line consistent-this
    const master = this;

    if (master._linkedDoor !== null) {
      return;
    }

    if (master.spawnflags & DoorFlag.DOOR_DONT_LINK) {
      master._linkedDoor = master;
      master.owner = master;
      return;
    }

    const cmins = master.mins.copy();
    const cmaxs = master.maxs.copy();
    let searchDoor: BaseDoorEntity | null = master;
    let currentDoor: BaseDoorEntity = master;

    while (true) {
      currentDoor.owner = master;

      if (currentDoor.health !== 0) {
        master.health = currentDoor.health;
      }

      if (currentDoor.targetname !== null) {
        master.targetname = currentDoor.targetname;
      }

      if (currentDoor.message !== '') {
        master.message = currentDoor.message;
      }

      const nextDoor: BaseEntity | null = searchDoor.findNextEntityByFieldAndValue('_doormarker', 'door');
      searchDoor = nextDoor instanceof BaseDoorEntity ? nextDoor : null;

      if (searchDoor === null) {
        currentDoor._linkedDoor = master;

        const owner = currentDoor.owner;
        if (!(owner instanceof DoorEntity)) {
          return;
        }

        // Shootable, fired, or key doors only need the owner/enemy links.
        // They do not spawn a touch trigger field.
        if (owner.health !== 0 || owner.targetname !== null || owner.items !== 0) {
          return;
        }

        owner._triggerField = currentDoor._spawnTriggerField(cmins, cmaxs);
        return;
      }

      if (currentDoor.isTouching(searchDoor)) {
        console.assert(searchDoor._linkedDoor === null, 'no cross connected doors');

        currentDoor._linkedDoor = searchDoor;
        currentDoor = searchDoor;

        for (let i = 0; i < 3; i++) {
          if (searchDoor.mins[i] < cmins[i]) {
            cmins[i] = searchDoor.mins[i];
          }

          if (searchDoor.maxs[i] > cmaxs[i]) {
            cmaxs[i] = searchDoor.maxs[i];
          }
        }
      }
    }
  }

  protected _doorFire(usedByEntity: BaseEntity): void {
    if (this.items !== 0 && this.noise4 !== null) {
      this.startSound(channel.CHAN_VOICE, this.noise4);
    }

    this.message = null;

    // This loop intentionally stays close to the original QuakeC door chain logic.
    if (this.spawnflags & DoorFlag.DOOR_TOGGLE) {
      if (this.state === state.STATE_UP || this.state === state.STATE_TOP) {
        // eslint-disable-next-line consistent-this
        let currentDoor: BaseDoorEntity | null = this;
        do {
          currentDoor._doorGoDown();
          currentDoor = currentDoor._linkedDoor;
        } while (currentDoor !== null && !currentDoor.equals(this) && !currentDoor.isWorld());
        return;
      }
    }

    // eslint-disable-next-line consistent-this
    let currentDoor: BaseDoorEntity | null = this;
    do {
      currentDoor._doorGoUp(usedByEntity);
      currentDoor = currentDoor._linkedDoor;
    } while (currentDoor !== null && !currentDoor.equals(this) && !currentDoor.isWorld());
  }

  protected _doorBlocked(blockedByEntity: BaseEntity): void {
    this.damage(blockedByEntity, this.dmg, null, blockedByEntity.centerPoint);

    // A negative wait means the door would never return if blocked, so just keep
    // crushing until the obstruction is gone.
    if (this.wait >= 0) {
      if (this.state === state.STATE_DOWN) {
        this._doorGoUp(blockedByEntity);
      } else {
        this._doorGoDown(blockedByEntity);
      }
    }
  }

  protected _doorGoDown(usedByEntity: BaseEntity = this): void {
    if (this.state === state.STATE_DOWN) {
      return;
    }

    const sub = this._sub;
    console.assert(sub !== null, 'BaseDoorEntity requires Sub helper');
    if (sub === null) {
      return;
    }

    this._startDoorVoice(this.noise2);
    this.state = state.STATE_DOWN;

    if (this.max_health > 0) {
      this.takedamage = damage.DAMAGE_YES;
      this.health = this.max_health;
    }

    sub.calcMove(this.pos1, this.speed, () => {
      this._doorHitBottom();
    });
    sub.useTargets(usedByEntity);
  }

  protected _doorHitBottom(): void {
    this._startDoorVoice(this.noise1);
    this.state = state.STATE_BOTTOM;

    const sub = this._sub;
    console.assert(sub !== null, 'BaseDoorEntity requires Sub helper');
    sub?.reset();

    if (this.portal >= 0) {
      this.engine.SetAreaPortalState(this.portal, false);
    }
  }

  protected _doorGoUp(usedByEntity: BaseEntity): void {
    if (this.state === state.STATE_UP) {
      return;
    }

    if (this.state === state.STATE_TOP) {
      // Reset the top wait time if the already-open door is triggered again.
      this._scheduleThink(this.ltime + this.wait, () => {
        this._doorGoDown(this);
      }, DOOR_GO_DOWN_THINK);
      return;
    }

    const sub = this._sub;
    console.assert(sub !== null, 'BaseDoorEntity requires Sub helper');
    if (sub === null) {
      return;
    }

    if (this.portal >= 0) {
      this.engine.SetAreaPortalState(this.portal, true);
    }

    this._startDoorVoice(this.noise2);
    this.state = state.STATE_UP;

    sub.calcMove(this.pos2, this.speed, () => {
      this._doorHitTop();
    });
    sub.useTargets(usedByEntity);
  }

  protected _doorHitTop(): void {
    this._startDoorVoice(this.noise1);
    this.state = state.STATE_TOP;

    if (this.spawnflags & DoorFlag.DOOR_TOGGLE) {
      return;
    }

    const sub = this._sub;
    console.assert(sub !== null, 'BaseDoorEntity requires Sub helper');
    sub?.reset();
    this._scheduleThink(this.ltime + this.wait, () => {
      this._doorGoDown(this);
    }, DOOR_GO_DOWN_THINK);
  }

  protected _doorKilled(attackerEntity: BaseEntity): void {
    const owner = this.owner;
    console.assert(owner instanceof BaseDoorEntity, 'BaseDoorEntity._doorKilled requires a door owner');
    if (!(owner instanceof BaseDoorEntity)) {
      return;
    }

    owner.health = owner.max_health;
    owner.takedamage = damage.DAMAGE_NO;
    owner.use(attackerEntity);
  }

  override use(usedByEntity: BaseEntity): void {
    if (!usedByEntity.isActor()) {
      return;
    }

    this.message = null;

    if (this.owner !== null) {
      this.owner.message = null;
    }

    if (this._linkedDoor !== null) {
      this._linkedDoor.message = null;
    }

    this._doorFire(usedByEntity);
  }
}

/**
 * QUAKED func_door (0 .5 .8) ? START_OPEN x DOOR_DONT_LINK GOLD_KEY SILVER_KEY TOGGLE
 * If two doors touch, they are assumed to be connected and operate as a unit.
 *
 * TOGGLE causes the door to wait in both the start and end states for a trigger event.
 *
 * START_OPEN causes the door to move to its destination when spawned, and operate in reverse.
 * It is used to temporarily or permanently close off an area when triggered.
 *
 * Key doors are always wait -1.
 *
 * "message" is printed when the door is touched if it is a trigger door and it hasn't been fired yet
 * "angle" determines the opening direction
 * "targetname" if set, no touch field will be spawned and a remote button or trigger field activates the door
 * "health" if set, the door must be shot open
 * "speed" movement speed (100 default)
 * "wait" wait before returning (3 default, -1 = never return)
 * "lip" lip remaining at end of move (8 default)
 * "dmg" damage to inflict when blocked (2 default)
 * "sounds"
 * 0) no sound
 * 1) stone
 * 2) base
 * 3) stone chain
 * 4) screechy metal
 */
@entity
export class DoorEntity extends BaseDoorEntity {
  static classname = 'func_door';

  protected static readonly _sounds = [
    ['misc/null.wav', 'misc/null.wav'],
    ['doors/drclos4.wav', 'doors/doormv1.wav'],
    ['doors/hydro2.wav', 'doors/hydro1.wav'],
    ['doors/stndr2.wav', 'doors/stndr1.wav'],
    ['doors/ddoor2.wav', 'doors/ddoor1.wav'],
  ] as const satisfies readonly DoorSoundPair[];

  protected static readonly _lockSounds = {
    [worldType.MEDIEVAL]: ['doors/medtry.wav', 'doors/meduse.wav'],
    [worldType.RUNES]: ['doors/runetry.wav', 'doors/runeuse.wav'],
    [worldType.BASE]: ['doors/basetry.wav', 'doors/baseuse.wav'],
  } as const satisfies Readonly<Record<number, DoorSoundPair>>;

  @serializable angle = new Vector();
  @serializable _doorKeyUsed = false;

  get netname(): string {
    return 'a door';
  }

  constructor(edict: ServerEdict | null, gameAPI: ServerGameAPI) {
    super(edict, gameAPI);
    this._damageHandler = new DamageHandler(this);
  }

  protected override _precache(): void {
    const ctor = this.constructor as typeof DoorEntity;
    const currentWorldspawn = this.game.worldspawn;
    console.assert(currentWorldspawn !== null, 'DoorEntity requires worldspawn during precache');
    if (currentWorldspawn === null) {
      return;
    }

    if (this.sounds <= 0 || this.sounds >= ctor._sounds.length) {
      this.sounds = 1;
    }

    const sounds = [
      ...getWorldLockSounds(ctor._lockSounds, currentWorldspawn.worldtype),
      ...ctor._sounds[this.sounds],
    ];

    for (const sfx of new Set(sounds)) {
      this.engine.PrecacheSound(sfx);
    }
  }

  override spawn(): void {
    const ctor = this.constructor as typeof DoorEntity;
    const currentWorldspawn = this.game.worldspawn;
    console.assert(currentWorldspawn !== null, 'DoorEntity requires worldspawn during spawn');
    if (currentWorldspawn === null) {
      return;
    }

    const lockSounds = getWorldLockSounds(ctor._lockSounds, currentWorldspawn.worldtype);
    [this.noise3, this.noise4] = lockSounds;

    const sounds = ctor._sounds[this.sounds];
    console.assert(sounds !== undefined, 'DoorEntity sounds must be defined');
    if (sounds === undefined) {
      return;
    }

    [this.noise1, this.noise2] = sounds;

    const sub = this._sub;
    console.assert(sub !== null, 'DoorEntity requires Sub helper');
    if (sub === null) {
      return;
    }

    sub.setMovedir();

    this.max_health = this.health;
    this.solid = solid.SOLID_BSP;
    this.movetype = moveType.MOVETYPE_PUSH;

    this.setOrigin(this.origin);
    this.setModel(this.model);

    if (this.spawnflags & DoorFlag.DOOR_SILVER_KEY) {
      this.items = items.IT_KEY1;
    } else if (this.spawnflags & DoorFlag.DOOR_GOLD_KEY) {
      this.items = items.IT_KEY2;
    }

    if (this.speed === 0) {
      this.speed = 100;
    }

    if (this.wait === 0) {
      this.wait = 3;
    }

    if (this.lip === null) {
      this.lip = 8;
    }

    if (this.dmg === 0) {
      this.dmg = 2;
    }

    this.pos1 = this.origin.copy();
    this.pos2 = this.pos1.copy().add(this.movedir.copy().multiply(Math.abs(this.movedir.dot(this.size)) - this.lip));

    // DOOR_START_OPEN lets a mapper light the closed position while spawning the
    // entity at the open position.
    if (this.spawnflags & DoorFlag.DOOR_START_OPEN) {
      this.setOrigin(this.pos2);
      this.pos2 = this.pos1.copy();
      this.pos1 = this.origin.copy();
    }

    this.state = state.STATE_BOTTOM;

    if (this.health > 0) {
      this.takedamage = damage.DAMAGE_YES;
    }

    if (this.items !== 0) {
      this.wait = -1.0;
    }

    if (this.portal < 0) {
      console.assert(this.model !== null, 'DoorEntity model must exist before portal lookup');
      if (this.model === null) {
        return;
      }
      this.portal = this.engine.GetModelPortal(this.model);
    }

    if (this.portal >= 0) {
      this.engine.SetAreaPortalState(this.portal, (this.spawnflags & DoorFlag.DOOR_START_OPEN) !== 0);
    }

    // LinkDoors must wait until all door entities have spawned so the combined
    // bounds can be computed correctly.
    this._scheduleThink(this.ltime + 0.1, () => {
      this._linkDoors();
    });
  }

  thinkDie(attackerEntity: BaseEntity): void {
    this._doorKilled(attackerEntity);
  }

  override blocked(blockedByEntity: BaseEntity): void {
    this._doorBlocked(blockedByEntity);
  }

  override touch(usedByEntity: BaseEntity): void {
    if (!(usedByEntity instanceof PlayerEntity)) {
      return;
    }

    if (this._doorKeyUsed) {
      return;
    }

    const owner = this.owner instanceof BaseDoorEntity ? this.owner : this;
    if (owner.attack_finished > this.game.time) {
      return;
    }

    // Only chatter once every two seconds.
    owner.attack_finished = this.game.time + 2.0;

    if (owner.message !== null) {
      usedByEntity.centerPrint(owner.message);
      usedByEntity.startSound(channel.CHAN_VOICE, 'misc/talk.wav', 1.0, attn.ATTN_NONE);
    }

    // Key door handling.
    if (this.items === 0) {
      return;
    }

    const playerItems = usedByEntity.items ?? 0;

    if ((this.items & playerItems) !== this.items) {
      const requiredKeys = Object.entries(itemNames)
        .filter(([item]) => (this.items & Number(item)) !== 0)
        .map(([, name]) => name);

      usedByEntity.centerPrint(`You need the ${requiredKeys.join(', ')}`);
      usedByEntity.startSound(channel.CHAN_VOICE, 'misc/talk.wav', 1.0, attn.ATTN_NONE);
      return;
    }

    // Remove the used key from the inventory.
    usedByEntity.items = playerItems & ~this.items;
    // Mark this door chain as already opened by its key.
    this._doorKeyUsed = true;

    if (this._linkedDoor instanceof DoorEntity) {
      this._linkedDoor._doorKeyUsed = true;
    }

    this.use(usedByEntity);
  }
}

/**
 * QUAKED func_door_secret (0 .5 .8) ? open_once 1st_left 1st_down no_shoot always_shoot
 * Basic secret door. Slides back, then to the side. Angle determines direction.
 * wait = number of seconds before coming back
 * 1st_left = first move is left of arrow
 * 1st_down = first move is down from arrow
 * always_shoot = even if targeted, keep shootable
 * t_width = override width to move back (or height if going down)
 * t_length = override length to move sideways
 * "dmg" damage to inflict when blocked (2 default)
 *
 * If a secret door has a targetname, it will only be opened by its button or trigger,
 * not by damage.
 * "sounds"
 * 1) medieval
 * 2) metal
 * 3) base
 */
@entity
export class SecretDoorEntity extends BaseDoorEntity {
  static classname = 'func_door_secret';

  static readonly SECRET_OPEN_ONCE = 1;
  static readonly SECRET_1ST_LEFT = 2;
  static readonly SECRET_1ST_DOWN = 4;
  static readonly SECRET_NO_SHOOT = 8;
  static readonly SECRET_YES_SHOOT = 16;

  protected static readonly _sounds = [
    [null, null, null],
    ['doors/latch2.wav', 'doors/winch2.wav', 'doors/drclos4.wav'],
    ['doors/airdoor2.wav', 'doors/airdoor1.wav', 'doors/airdoor2.wav'],
    ['doors/basesec2.wav', 'doors/basesec1.wav', 'doors/basesec2.wav'],
  ] as const satisfies readonly SecretDoorSoundSet[];

  @serializable mangle = new Vector();
  @serializable t_width = 0;
  @serializable t_length = 0;
  @serializable _dest0: Vector | null = null;
  @serializable _dest1: Vector | null = null;
  @serializable _dest2: Vector | null = null;
  @serializable bloodcolor = colors.DUST;

  get netname(): string {
    return 'a secret door';
  }

  constructor(edict: ServerEdict | null, gameAPI: ServerGameAPI) {
    super(edict, gameAPI);
    this._damageHandler = new DamageHandler(this);
  }

  protected override _precache(): void {
    const ctor = this.constructor as typeof SecretDoorEntity;
    const soundSet = ctor._sounds[this.sounds];
    if (soundSet === undefined) {
      return;
    }

    for (const sfx of soundSet) {
      if (sfx !== null) {
        this.engine.PrecacheSound(sfx);
      }
    }
  }

  override spawn(): void {
    const ctor = this.constructor as typeof SecretDoorEntity;
    if (this.sounds <= 0 || this.sounds >= ctor._sounds.length) {
      this.sounds = 3;
    }

    const sounds = ctor._sounds[this.sounds];
    console.assert(sounds !== undefined, 'SecretDoorEntity sounds must be defined');
    if (sounds === undefined) {
      return;
    }

    [this.noise1, this.noise2, this.noise3] = sounds;

    if (this.dmg === 0) {
      this.dmg = 2;
    }

    this.mangle.set(this.angles);
    this.angles.clear();
    this.solid = solid.SOLID_BSP;
    this.movetype = moveType.MOVETYPE_PUSH;

    this.setModel(this.model);
    this.setOrigin(this.origin);

    this.speed = 50.0;

    if (this.targetname === null || (this.spawnflags & SecretDoorEntity.SECRET_YES_SHOOT) !== 0) {
      this.health = 10000;
      this.takedamage = damage.DAMAGE_YES;
    }

    this.oldorigin.set(this.origin);

    if (this.wait === 0) {
      this.wait = 5.0;
    }

    if (this.portal < 0) {
      console.assert(this.model !== null, 'SecretDoorEntity model must exist before portal lookup');
      if (this.model === null) {
        return;
      }
      this.portal = this.engine.GetModelPortal(this.model);
    }

    this.engine.SetAreaPortalState(this.portal, false);
  }

  thinkDie(attackerEntity: BaseEntity): void {
    this.use(attackerEntity);
  }

  thinkPain(attackerEntity: BaseEntity, _damageAmount: number): void {
    this.use(attackerEntity);
  }

  override touch(touchedByEntity: BaseEntity): void {
    if (!(touchedByEntity instanceof PlayerEntity)) {
      return;
    }

    if (this.attack_finished > this.game.time) {
      return;
    }

    this.attack_finished = this.game.time + 2.0;

    if (this.message !== null) {
      touchedByEntity.centerPrint(this.message);
      touchedByEntity.startSound(channel.CHAN_BODY, 'misc/talk.wav');
    }
  }

  override blocked(blockedByEntity: BaseEntity): void {
    if (this.game.time < this.attack_finished) {
      return;
    }

    this.attack_finished = this.game.time + 0.5;
    this.damage(blockedByEntity, this.dmg, null, blockedByEntity.centerPoint);
  }

  override use(usedByEntity: BaseEntity): void {
    const sub = this._sub;
    console.assert(sub !== null, 'SecretDoorEntity requires Sub helper');
    if (sub === null) {
      return;
    }

    this.health = 10000;

    if (!this.origin.equals(this.oldorigin)) {
      return;
    }

    this.message = null;
    sub.useTargets(usedByEntity);

    if ((this.spawnflags & SecretDoorEntity.SECRET_NO_SHOOT) === 0) {
      this.takedamage = damage.DAMAGE_NO;
    }

    this.velocity.clear();
    this._startDoorVoice(this.noise1);

    const temp = 1 - (this.spawnflags & SecretDoorEntity.SECRET_1ST_LEFT);
    const { forward, up, right } = this.mangle.angleVectors();

    if (this.t_width === 0) {
      this.t_width = this.spawnflags & SecretDoorEntity.SECRET_1ST_DOWN
        ? Math.abs(up.dot(this.size))
        : Math.abs(right.dot(this.size));
    }

    if (this.t_length === 0) {
      this.t_length = Math.abs(forward.dot(this.size));
    }

    this._dest1 = this.spawnflags & SecretDoorEntity.SECRET_1ST_DOWN
      ? this.origin.copy().subtract(up.multiply(this.t_width))
      : this.origin.copy().add(right.multiply(this.t_width * temp));

    this._dest2 = this._dest1.copy().add(forward.multiply(this.t_length));

    sub.calcMove(this._dest1, this.speed, () => {
      this._stepMove(1);
    });
    this._startDoorVoice(this.noise2);

    if (this.portal >= 0) {
      this.engine.SetAreaPortalState(this.portal, true);
    }
  }

  protected _stepMove(step: number): void {
    const sub = this._sub;
    console.assert(sub !== null, 'SecretDoorEntity requires Sub helper');
    if (sub === null) {
      return;
    }

    switch (step) {
      case 1:
        this._startDoorVoice(this.noise3);
        this._scheduleThink(this.ltime + 1.0, () => {
          this._stepMove(2);
        });
        break;

      case 2:
        if (this._dest2 === null) {
          return;
        }
        this._startDoorVoice(this.noise2);
        sub.calcMove(this._dest2, this.speed, () => {
          this._stepMove(3);
        });
        break;

      case 3:
        this._startDoorVoice(this.noise3);
        if ((this.spawnflags & SecretDoorEntity.SECRET_OPEN_ONCE) === 0) {
          this._scheduleThink(this.ltime + this.wait, () => {
            this._stepMove(4);
          });
        }
        break;

      case 4:
        if (this._dest1 === null) {
          return;
        }
        this._startDoorVoice(this.noise2);
        sub.calcMove(this._dest1, this.speed, () => {
          this._stepMove(5);
        });
        break;

      case 5:
        this._startDoorVoice(this.noise3);
        this._scheduleThink(this.ltime + 1.0, () => {
          this._stepMove(6);
        });
        break;

      case 6:
        this._startDoorVoice(this.noise2);
        sub.calcMove(this.oldorigin, this.speed, () => {
          this._stepMove(7);
        });
        break;

      case 7:
        if (this.targetname === null || (this.spawnflags & SecretDoorEntity.SECRET_YES_SHOOT) !== 0) {
          this.health = 10000;
          this.takedamage = damage.DAMAGE_YES;
        }

        this._startDoorVoice(this.noise3);
        if (this.portal >= 0) {
          this.engine.SetAreaPortalState(this.portal, false);
        }
        break;
    }
  }
}
