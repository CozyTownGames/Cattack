import type { ExpeditionHaul, ExpeditionMapId, WildBattleResult } from './expedition';
import type { BattleChallengeResponse } from './cardBattle';

/**
 * gameStore.ts — Global in-memory registry shared across all Phaser scenes.
 *
 * Deliberately NOT using Phaser.Registry so this can also be imported by the
 * React overlay without creating a circular dependency on the Phaser game
 * instance.  This module is a singleton; importing it anywhere gives the same
 * object reference.
 */

export type Buddy = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  weaponId: string | null;
  portrait: string; // emoji or image key
  trait?: 'Strong' | 'Medic' | 'Mechanic' | 'Cook';
  morale: number;
};

export type GameStore = {
  /** Items collected (deposited) in Scene 1 (Scramble). */
  itemsCollected: number;
  /** Current items being carried in inventory (max 3). */
  carryingCount: number;
  /** Final score (completion time in seconds). */
  finalScore: number;
  /** The daily seed string shared by all scenes. */
  dailySeed: string;
  
  // ── Journey State ──
  fuel: number;
  food: number;
  weaponsCount: number;
  health: number;
  day: number;
  buddies: (Buddy | null)[];
  daysSinceLastCamp: number;
  scavengesSinceLastCamp: number;
  scrambleLoot: { food: number, fuel: number, health: number, weapons: number, buddies: number };
  // ── Boss State ──
  bossHp: number | null;
  bossMaxHp: number | null;
  expeditionMap: ExpeditionMapId | null;
  expeditionHaul: ExpeditionHaul;
  pendingWildBattle: WildBattleResult | null;
  pendingVsBattleIntro: BattleChallengeResponse | null;
  startFreshCardBattle: boolean;
};

export const gameStore: GameStore = {
  itemsCollected: 0,
  carryingCount: 0,
  finalScore: 0,
  dailySeed: '',
  fuel: 5,
  food: 5,
  weaponsCount: 0,
  health: 100,
  day: 1,
  buddies: [
    null,
    null,
    null,
    null
  ],
  daysSinceLastCamp: 0,
  scavengesSinceLastCamp: 0,
  scrambleLoot: { food: 0, fuel: 0, health: 0, weapons: 0, buddies: 0 },
  bossHp: null,
  bossMaxHp: null,
  expeditionMap: null,
  expeditionHaul: { invaderKills: 0, xp: 0, gold: 0, cards: [], cats: [], food: 0 },
  pendingWildBattle: null,
  pendingVsBattleIntro: null,
  startFreshCardBattle: false,
};

/** Reset all mutable state (call at game-start or restart). */
export function resetStore(dailySeed: string): void {
  gameStore.itemsCollected = 0;
  gameStore.carryingCount = 0;
  gameStore.finalScore = 0;
  gameStore.dailySeed = dailySeed;
  gameStore.fuel = 5;
  gameStore.food = 5;
  gameStore.weaponsCount = 0;
  gameStore.health = 100;
  gameStore.day = 1;
  gameStore.buddies = [
    null,
    null,
    null,
    null
  ];
  gameStore.daysSinceLastCamp = 0;
  gameStore.scavengesSinceLastCamp = 0;
  gameStore.scrambleLoot = { food: 0, fuel: 0, health: 0, weapons: 0, buddies: 0 };
  gameStore.bossHp = null;
  gameStore.bossMaxHp = null;
  gameStore.expeditionMap = null;
  gameStore.expeditionHaul = { invaderKills: 0, xp: 0, gold: 0, cards: [], cats: [], food: 0 };
  gameStore.pendingWildBattle = null;
  gameStore.pendingVsBattleIntro = null;
  gameStore.startFreshCardBattle = false;
}

/** Determine planet image key ('planet-2' to 'planet-9') based on seed. */
export function getPlanetKey(): string {
  const seedStr = gameStore.dailySeed || '';
  if (!seedStr) {
    return 'planet-2';
  }
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % 8; // 8 planets: 2 to 9
  return `planet-${idx + 2}`;
}
