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
import type { BoardSkinId, CardSkinId } from './cosmetics';
