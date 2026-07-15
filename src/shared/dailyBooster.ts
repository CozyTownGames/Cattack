export type DailyBoosterReward =
  | { kind: 'cat'; catId: string }
  | { kind: 'holoCat'; catId: string }
  | { kind: 'holoDeck'; suit: 'sakura' | 'ghost' | 'leaf' | 'water'; rank: number }
  | { kind: 'sealedDeck'; suit: 'sakura' | 'ghost' | 'leaf' | 'water'; rank: number; seal: 'gold' | 'red' | 'purple' };

export type DailyBoosterResponse = {
  status: 'success';
  active: boolean;
  expired: boolean;
  claimed: boolean;
  choices: DailyBoosterReward[];
};
