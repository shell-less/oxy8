/**
 * All balance numbers live here, so the game can be tuned without hunting through systems.
 * Units: distances in world pixels, time in real seconds, percentages 0-100.
 */
export const CONFIG = {
  view: { width: 320, height: 180 },
  world: { tilesX: 90, tilesY: 60, tileSize: 16 },

  day: {
    /** One in-game day (24h) lasts this many real seconds. */
    lengthSeconds: 300,
    /** In-game hour at which a fresh landing starts. */
    startHour: 7.2,
    /** Maximum darkness at night (0 = none, 1 = pitch black). */
    maxDarkness: 0.88,
  },

  player: {
    speed: 58,
    startOxygen: 100,
    startEnergy: 30,
    /** Invulnerability after taking a hit, in seconds. */
    invulnerableAfterHit: 1.6,
    knockback: 170,
    /** Radius (in tiles) revealed on the minimap. */
    revealRadius: 6,
    revealRadiusDark: 4,
  },

  oxygen: {
    /** Passive drain per second. 100% lasts a bit over 3 minutes. */
    drainPerSecond: 0.5,
    enemyHitDamage: 25,
  },

  energy: {
    /** The energy bar is full at this value. */
    max: 100,
    /** Energy per second while the helmet lamp is on in the dark (~146 s per night): about 12 per night. */
    lampPerSecond: 0.08,
    installCost: 20,
    cellAmount: 35,
    /** Every flight between planets, forward or back. */
    flightCost: 10,
  },

  interaction: {
    bunkerRange: 22,
    shipRange: 34,
    openPartsSeconds: 1.1,
    openSupplySeconds: 0.9,
    installSeconds: 1.6,
    starMapSeconds: 0.4,
  },

  enemies: {
    patrolSpeed: 13,
    chaseSpeed: 24,
    returnSpeed: 20,
    /** Distance at which a creeper notices the player. */
    aggroRange: 60,
    /** Aggro range at night with the lamp off. */
    aggroRangeDarkNoLamp: 34,
    giveUpDistance: 100,
    /** Creepers never wander further than this from their bunker. */
    leashDistance: 130,
    hitRadius: 11,
    /** After a hit the creeper retreats and ignores the player for this long. */
    cooldownAfterHit: 3,
    jumper: {
      /** Pause between two small hops, in seconds (plus up to restJitter). */
      restMin: 0.6,
      restJitter: 0.6,
      hopDistance: 16,
      hopSeconds: 0.35,
      hopHeight: 5,
      /** Warning before a pounce: the jumper crouches and marks its landing spot. */
      crouchSeconds: 0.55,
      pounceRange: 64,
      pounceSeconds: 0.6,
      pounceHeight: 14,
      /** Stunned after landing a pounce, in seconds. */
      recoverSeconds: 1.1,
      /** Landing this close to the player hurts. */
      hitRadius: 10,
    },
  },

  layout: {
    /** Parts bunkers equal the planet's partsNeeded; supply bunkers come on top. */
    supplyBunkers: 5,
    /** Supply bunkers that also get a creeper patrol (parts bunkers always have one). */
    guardedSupplyBunkers: 2,
    shipClearRadius: 80,
    bunkerSpacing: 130,
  },

  crafting: {
    scrapPerPlanet: 10,
    /** Walk this close to scrap to pick it up. */
    pickupRange: 10,
    bottle: { scrap: 3, carryMax: 1, oxygen: 40 },
    armour: {
      scrap: 6,
      /** Damage from creepers and meteors is multiplied by this once the suit is reinforced. */
      damageFactor: 0.6,
    },
    beacon: {
      scrap: 2,
      carryMax: 2,
      /** Seconds a placed beacon keeps working. */
      lifetime: 20,
      /** Creepers within this distance of a beacon go for the beacon instead of the player. */
      range: 120,
    },
  },

  tips: {
    /** Seconds after landing before the first tip. */
    firstDelay: 0.8,
    /** How long a tip stays on screen, in seconds. */
    showSeconds: 7,
    /** Quiet time between two tips, in seconds. */
    gapSeconds: 2,
    nearBunker: 110,
    nearCreeper: 90,
    nearScrap: 70,
    lowOxygen: 50,
  },

  hazards: {
    storm: {
      firstAfter: 35,
      duration: 14,
      pauseMin: 45,
      pauseMax: 70,
      warnBefore: 3,
      speedPenalty: 0.35,
      aggroPenalty: 0.45,
    },
    cold: {
      /** Oxygen drain multiplier at full darkness. Scales with darkness. */
      maxDrainMultiplier: 1.9,
    },
    meteor: {
      intervalMin: 2.2,
      intervalMax: 5.2,
      warningSeconds: 1.6,
      targetRadius: 70,
      hitRadius: 14,
      damage: 15,
    },
    toxic: {
      poolCount: 18,
      /** Extra oxygen drain per second while standing in a pool. */
      extraDrainPerSecond: 4,
    },
  },
} as const;
