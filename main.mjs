import { gameCapabilities } from '../../shared/Defs.mjs';
import { ServerGameAPI } from './GameAPI.mjs';
import { ClientGameAPI } from './client/ClientAPI.mjs';

const identification = {
  name: 'Quake',
  author: 'chrisnew',
  version: [1, 0, 0],
  capabilities: [
    gameCapabilities.CAP_HUD_INCLUDES_SBAR,
    gameCapabilities.CAP_HUD_INCLUDES_CROSSHAIR,
    gameCapabilities.CAP_VIEWMODEL_MANAGED,
    gameCapabilities.CAP_CLIENTDATA_DYNAMIC,
    gameCapabilities.CAP_SPAWNPARMS_DYNAMIC,
    gameCapabilities.CAP_CHAT_MANAGED,
    gameCapabilities.CAP_ENTITY_EXTENDED,
  ],
};

export {
  identification,
  ServerGameAPI,
  ClientGameAPI,
};
