import type { GameModuleIdentification, GameModuleInterface } from '../../shared/GameInterfaces.ts';

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

// Compile-time check only: fails the typecheck when this module drifts from the engine's contract.
({ identification, ServerGameAPI, ClientGameAPI }) satisfies GameModuleInterface;
