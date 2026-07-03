export type FeatureFlag =
  'monsters-dangerous-liquids' |
  'correct-ballistic-grenades' |
  'correct-touch-grenades' |
  'draw-bullet-hole-decals' |
  'improved-gib-physics';

export const featureFlags: FeatureFlag[] = [
  // 'correct-ballistic-grenades', // enables zombie gib and ogre grenade trajectory fix
  // 'correct-touch-grenades', // enables zombie gib and ogre grenade touch fix (disappear on an impact with CONTENT_SKY)
  'improved-gib-physics',
  // 'draw-bullet-hole-decals', // enables handling decal events upon bullet impacts
];
