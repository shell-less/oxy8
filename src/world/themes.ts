export type HazardKind = 'storm' | 'cold' | 'meteor' | 'toxic';

type RGB = readonly [number, number, number];

/** Everything that makes one kind of planet look and behave differently. */
export interface Theme {
  id: string;
  /** Dutch colour word shown in the HUD. */
  colourName: string;
  hazard: HazardKind;
  hazardName: string;
  hazardDescription: string;
  /** Ground noise scale: larger means smoother, wider patches. */
  noiseScale: number;
  /** Five ground shades from dark to light. */
  ground: readonly [RGB, RGB, RGB, RGB, RGB];
  crater: readonly [string, string, string];
  craterCount: number;
  rock: readonly [string, string, string];
  rockCount: number;
  pebbles: readonly [string, string];
  crystal: readonly [string, string, string];
  crystalGlow: string;
  crystalCount: number;
  /** Extra height for crystal spikes (ice spires are taller). */
  crystalHeight: number;
  dust: string;
  dustRgb: string;
  footprint: string;
  /** Sunrise and sunset tint. */
  tint: string;
  minimap: string;
  /** Creeper palette: body, body alert, rim, highlight, belly, legs. */
  creeper: readonly [string, string, string, string, string, string];
}

export const THEMES: Record<'red' | 'blue' | 'purple' | 'green', Theme> = {
  red: {
    id: 'red',
    colourName: 'rood',
    hazard: 'storm',
    hazardName: 'Zandstormen',
    hazardDescription: 'Stormen beperken je zicht en snelheid, maar ook dat van de kruipers.',
    noiseScale: 96,
    ground: [[56, 26, 34], [72, 34, 38], [90, 44, 42], [108, 56, 48], [128, 70, 56]],
    crater: ['#8a4c3c', '#3e1d22', '#321619'],
    craterCount: 40,
    rock: ['#6e5550', '#8d7069', '#ad8c83'],
    rockCount: 110,
    pebbles: ['#8d6a5e', '#2e1418'],
    crystal: ['#2aa894', '#5ef2d6', '#bfffee'],
    crystalGlow: '80,255,220',
    crystalCount: 50,
    crystalHeight: 0,
    dust: '#b0705a',
    dustRgb: '150,82,60',
    footprint: '#9a5c4a',
    tint: '255,110,60',
    minimap: '#4a2630',
    creeper: ['#2b1640', '#3d1a52', '#48266a', '#6d3d98', '#1e0f2e', '#160a1e'],
  },
  blue: {
    id: 'blue',
    colourName: 'blauw',
    hazard: 'cold',
    hazardName: 'IJzige nachten',
    hazardDescription: 'In het donker verbruik je bijna dubbel zoveel zuurstof.',
    noiseScale: 150,
    ground: [[20, 36, 64], [28, 50, 86], [38, 66, 106], [54, 90, 132], [84, 124, 166]],
    crater: ['#6a96c0', '#16294a', '#10203a'],
    craterCount: 25,
    rock: ['#5f7288', '#7f96ae', '#aac0d6'],
    rockCount: 55,
    pebbles: ['#a8c8e8', '#0c1a2e'],
    crystal: ['#4aa8e0', '#bfeaff', '#ffffff'],
    crystalGlow: '150,220,255',
    crystalCount: 95,
    crystalHeight: 4,
    dust: '#a8d0f0',
    dustRgb: '168,208,240',
    footprint: '#8fb8dc',
    tint: '120,170,255',
    minimap: '#27415f',
    creeper: ['#3a1420', '#521a2c', '#6a2638', '#983d55', '#2e0f18', '#1e0a10'],
  },
  purple: {
    id: 'purple',
    colourName: 'paars',
    hazard: 'meteor',
    hazardName: 'Meteorenregen',
    hazardDescription: 'Een rode ring op de grond markeert waar een meteoriet inslaat.',
    noiseScale: 64,
    ground: [[32, 18, 50], [44, 26, 68], [58, 34, 86], [74, 46, 106], [96, 64, 130]],
    crater: ['#8e62b6', '#22123a', '#1a0d2c'],
    craterCount: 75,
    rock: ['#5a5070', '#786c90', '#9e92b6'],
    rockCount: 80,
    pebbles: ['#b494d4', '#120820'],
    crystal: ['#c0409e', '#ff9ae8', '#ffe4f8'],
    crystalGlow: '255,120,220',
    crystalCount: 40,
    crystalHeight: 1,
    dust: '#b890dc',
    dustRgb: '184,144,220',
    footprint: '#8a6cae',
    tint: '200,110,255',
    minimap: '#3e2a5a',
    creeper: ['#16402a', '#1d5636', '#266a44', '#3d9866', '#0f2e1c', '#0a1e12'],
  },
  green: {
    id: 'green',
    colourName: 'groen',
    hazard: 'toxic',
    hazardName: 'Gifpoelen',
    hazardDescription: 'Groene poelen belasten je filters en kosten veel zuurstof.',
    noiseScale: 80,
    ground: [[22, 40, 28], [30, 54, 34], [42, 70, 40], [58, 88, 50], [82, 112, 64]],
    crater: ['#7aa060', '#14261a', '#0e1d12'],
    craterCount: 20,
    rock: ['#66664f', '#86866c', '#acac8e'],
    rockCount: 145,
    pebbles: ['#a4c486', '#0a160c'],
    crystal: ['#b09a18', '#fff27a', '#fffbd6'],
    crystalGlow: '255,230,90',
    crystalCount: 60,
    crystalHeight: 0,
    dust: '#b4d488',
    dustRgb: '180,212,136',
    footprint: '#7a9a5a',
    tint: '180,255,120',
    minimap: '#2c4a2a',
    creeper: ['#40301a', '#56401e', '#6a5026', '#98763d', '#2e220f', '#1e160a'],
  },
};
