export type ExpeditionMapId = 'arcade' | 'medical' | 'sewer' | 'grocery' | 'planet';

export type ExpeditionCard = {
  rank: number;
  suit: 'sakura' | 'ghost' | 'leaf' | 'water';
  holographic?: boolean;
  seals?: ('gold' | 'red' | 'purple')[];
};

export type ExpeditionOpponent = {
  id: string;
  name: string;
  cards: ExpeditionCard[];
  cats: string[];
};

export type ExpeditionHaul = {
  invaderKills: number;
  xp: number;
  gold: number;
  cards: ExpeditionCard[];
  cats: string[];
  food: number;
};

export type WildBattleResult = {
  opponentId: string;
  won: boolean;
  reward: { kind: 'standard'; card: ExpeditionCard } | { kind: 'cat'; catId: string } | null;
};
