import type { BoardSkinId, CardSkinId } from './cosmetics';

export type BattleCardSnapshot = {
  rank: number;
  suit: 'sakura' | 'ghost' | 'leaf' | 'water';
  holographic?: boolean;
  seals?: ('gold' | 'red' | 'purple')[];
};

export type BattleTurnSnapshot = {
  cards: BattleCardSnapshot[];
  cats: string[];
  holographicCats?: string[];
  score: number;
};

export type BattleChallengeSnapshot = {
  version: 1;
  defenderUsername: string;
  title?: string;
  seed?: string;
  boardSkin?: BoardSkinId;
  cardSkin?: CardSkinId;
  turns: BattleTurnSnapshot[];
  cumulativeScore: number;
};

export type BattleChallengeStats = {
  plays: number;
  defenderVictoryRate: number;
};

export type BattleChallengeResponse = {
  status: 'success';
  challenge: BattleChallengeSnapshot | null;
  stats: BattleChallengeStats | null;
  viewerHasWon: boolean;
  defenderSnoovatarUrl?: string;
  defenderGlobalRank?: number | null;
  defenderGlobalWins?: number;
  viewerUsername?: string;
  viewerSnoovatarUrl?: string;
};

export const BASE_PLAY_CARD_LIMIT = 5;
export const MAX_PLAY_CARDS_PER_TURN = 12;
export const MAX_EQUIPPED_CATS = 3;
export const INITIAL_BATTLE_DISCARDS = 5;

const PLAY_CARD_LIMIT_BONUSES: Readonly<Record<string, number>> = {
  c25: 1,
};

export const resolveBattleCatIds = <T extends string>(equipped: readonly T[]): T[] => (
  equipped.map((catId, index, catIds) => {
      if (catId === 'c39') return catIds[0] ?? catId;
      if (catId === 'c32') return catIds[index + 1] ?? catId;
      return catId;
  })
);

export const getPlayCardLimitForCats = (equipped: unknown): number => {
  const catIds = Array.isArray(equipped)
    ? equipped.filter((catId): catId is string => typeof catId === 'string')
    : [];
  const resolvedLimit = resolveBattleCatIds(catIds).reduce(
    (limit, catId) => limit + (PLAY_CARD_LIMIT_BONUSES[catId] ?? 0),
    BASE_PLAY_CARD_LIMIT
  );
  return Math.min(MAX_PLAY_CARDS_PER_TURN, Math.max(BASE_PLAY_CARD_LIMIT, resolvedLimit));
};
