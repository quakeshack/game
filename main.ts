import type { GameModuleIdentification } from '../../engine/common/GameModule.ts';

import { gameCapabilities } from '../../shared/Defs.ts';
import { ServerGameAPI } from './GameAPI.ts';
import { ClientGameAPI } from './client/ClientAPI.ts';

export const identification = {
  name: 'Quake',
  author: 'chrisnew',
  version: [1, 0, 0],
  capabilities: [
    gameCapabilities.CAP_HUD_INCLUDES_CROSSHAIR,
    gameCapabilities.CAP_ENTITY_BBOX_ADJUSTMENTS_DURING_LINK,
  ],
} satisfies GameModuleIdentification;

export {
  ClientGameAPI,
  ServerGameAPI,
};
