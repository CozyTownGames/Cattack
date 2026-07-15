export const CARD_CLAIM_FLAIR_TIERS = [
  { threshold: 5, emoji: ':1:' },
  { threshold: 25, emoji: ':2:' },
  { threshold: 50, emoji: ':3:' },
  { threshold: 100, emoji: ':4:' },
  { threshold: 200, emoji: ':5:' },
  { threshold: 300, emoji: ':6:' },
  { threshold: 500, emoji: ':7:' },
  { threshold: 1000, emoji: ':8:' },
];

export type CardClaimFlairTier = typeof CARD_CLAIM_FLAIR_TIERS[number];

export function getCardClaimFlairTier(totalCardsClaimed: number): CardClaimFlairTier | null {
  let earnedTier: CardClaimFlairTier | null = null;
  for (const tier of CARD_CLAIM_FLAIR_TIERS) {
    if (totalCardsClaimed < tier.threshold) break;
    earnedTier = tier;
  }
  return earnedTier;
}
