import { gameCapabilities } from '../../shared/Defs.mjs';
import { ServerGameAPI } from './GameAPI.mjs';
import { ClientGameAPI } from './client/ClientAPI.mjs';

/** @type {import('source/engine/server/GameLoader').GameModuleIdentification} */
const identification = {
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
};

/** @type {import('source/engine/server/GameLoader').GameModuleInterface} */
export {
  identification,
  ServerGameAPI,
  ClientGameAPI,
};
