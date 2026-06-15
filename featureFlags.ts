export type FeatureFlag =
  'monsters-dangerous-liquids' |
  'correct-ballistic-grenades' |
  'draw-bullet-hole-decals' |
  'improved-gib-physics';

export const featureFlags: FeatureFlag[] = [
  // 'correct-ballistic-grenades', // enables zombie gib and ogre grenade trajectory fix
  'improved-gib-physics',
  // 'draw-bullet-hole-decals', // enables handling decal events upon bullet impacts
];
