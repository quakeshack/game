import type { GameModuleIdentification } from '../../engine/server/GameLoader.ts';

import { gameCapabilities } from '../../shared/Defs.ts';
import { ServerGameAPI } from './GameAPI.ts';
import { ClientGameAPI } from './client/ClientAPI.mjs';

export const identification = {
  name: 'Quake',
  author: 'chrisnew',
  version: [1, 0, 0],
  capabilities: [
    gameCapabilities.CAP_HUD_INCLUDES_SBAR,
    // gameCapabilities.CAP_HUD_INCLUDES_CROSSHAIR, -- TODO: implement that on client game code
    gameCapabilities.CAP_VIEWMODEL_MANAGED,
    gameCapabilities.CAP_CLIENTDATA_DYNAMIC,
    gameCapabilities.CAP_SPAWNPARMS_DYNAMIC,
    gameCapabilities.CAP_CHAT_MANAGED,
    gameCapabilities.CAP_ENTITY_EXTENDED,
    gameCapabilities.CAP_ENTITY_BBOX_ADJUSTMENTS_DURING_LINK,
  ],
} satisfies GameModuleIdentification;

export {
  ClientGameAPI,
  ServerGameAPI,
};
