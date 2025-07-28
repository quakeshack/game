import { gameCapabilities } from '../../shared/Defs.mjs';
import { ServerGameAPI } from './GameAPI.mjs';
import { ClientGameAPI } from './client/ClientAPI.mjs';

const identification = {
  name: 'Quake',
  author: 'chrisnew',
  version: [1, 0, 0],
  capabilities: [
    gameCapabilities.CAP_LEGACY_UPDATESTAT,
    gameCapabilities.CAP_LEGACY_CLIENTDATA,
  ],
};

export {
  identification,
  ServerGameAPI,
  ClientGameAPI,
};
