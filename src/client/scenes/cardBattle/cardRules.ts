export type CardSuit = 'sakura' | 'ghost' | 'leaf' | 'water';

// Backwards-compatible alias so external code using CardFamily still compiles
export type CardFamily = CardSuit;
export type CardSeal = 'gold' | 'red' | 'purple';

export type Card = {
  id: string;
  suit: CardSuit;
  rank: number; // 2 through 14
  name: string;
  base_nips: number;
  base_mult: number;
  // Legacy compat — mirrors rank for consumers that still read .number / .family
  number: number;
  family: CardSuit;
  holographic: boolean;
  seals: CardSeal[];
};

export type Challenger = {
  username: string;
  score: number;
  cards: Card[];
};

// ── Rank-to-Name mapping ────────────────────────────────────────────
export const RANK_NAME_MAP: Record<number, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'Tabby',
  12: 'Orange',
  13: 'White',
  14: 'Void',
};

export const TOTAL_RANKS = 13; // 2-14 inclusive
export const TOTAL_SUITS = 4;
export const TOTAL_CARDS = TOTAL_RANKS * TOTAL_SUITS; // 52

// ── Card Factory ────────────────────────────────────────────────────
export function makeCard(suit: CardSuit, rank: number, holographic = false, seals: CardSeal[] = []): Card {
  const rankLabel = RANK_NAME_MAP[rank] || rank.toString();
  const suitLabel = suit.charAt(0).toUpperCase() + suit.slice(1);

  let displayName: string;
  if (rank >= 11) {
    displayName = `${rankLabel} Cat of ${suitLabel}`;
  } else {
    displayName = `${suitLabel} ${rankLabel}`;
  }

  return {
    id: `${suit}_${rank}_${rankLabel.toLowerCase()}`,
    suit,
    rank,
    name: displayName,
    base_nips: rank + (seals.includes('purple') ? 20 : 0),
    base_mult: 1,
    // Legacy compat
    number: rank,
    family: suit,
    holographic,
    seals: [...new Set(seals)],
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Quick card construction from legacy { number, family } shape */
export function cardFromLegacy(legacy: { number: number; family: string }): Card {
  return makeCard(legacy.family as CardSuit, legacy.number);
}

/** Ensure a value is a fully-typed Card (guards against raw objects from localStorage/API) */
export function ensureCard(raw: Partial<Card> & { number?: number; family?: string; rank?: number; suit?: string }): Card {
  const rank = raw.rank ?? raw.number ?? 2;
  const suit = (raw.suit ?? raw.family ?? 'sakura') as CardSuit;
  const seals = Array.isArray(raw.seals)
    ? raw.seals.filter((seal): seal is CardSeal => seal === 'gold' || seal === 'red' || seal === 'purple')
    : [];
  return makeCard(suit, rank, raw.holographic === true, seals);
}

export function getCardHealths(cards: Card[]): number[] {
  return cards.map((c) => (c ? c.base_nips : 0));
}

export function isBreed(rank: number): boolean {
  return rank >= 11 && rank <= 14;
}

export function getBreedName(rank: number): string {
  return RANK_NAME_MAP[rank] || rank.toString();
}

// ── Score Calculation ───────────────────────────────────────────────
export function runScoreCalculation(selected: Card[], equippedCats: string[] = []) {
  // Resolve Blueprint (c39) and Brainstorm (c32) equivalents
  const resolvedEquipped = equippedCats.map((catId, index) => {
    let resolved = catId;
    if (resolved === 'c39') resolved = equippedCats[0] || 'c39';
    if (resolved === 'c32') resolved = equippedCats[index + 1] || 'c32';
    return resolved;
  });

  // Normalise input — handle raw objects from localStorage/server
  const cards = selected.map(ensureCard);
  const sorted = [...cards].sort((a, b) => a.rank - b.rank);

  const rankCounts: Record<number, number> = {};
  const suitCounts: Record<string, number> = {};
  for (const c of sorted) {
    rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
    suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
  }

  let mult = 1.0;
  let comboName = 'High Card';
  mult += cards.reduce((total, card) => total + (card.seals.includes('red') ? 4 : 0), 0);

  const counts = Object.values(rankCounts);
  const maxCount = counts.length > 0 ? Math.max(...counts) : 0;

  const flushThreshold = resolvedEquipped.includes('c28') ? 4 : 5;
  const isFlush = Object.values(suitCounts).some((c) => c >= flushThreshold);

  // ── Straight detection ──────────────────────────────────────────
  const straightThreshold = resolvedEquipped.includes('c28') ? 4 : 5;
  const canSkip = resolvedEquipped.includes('c31');

  const getSubsets = (array: Card[], size: number): Card[][] => {
    if (size === 1) return array.map((value) => [value]);
    const result: Card[][] = [];
    for (let index = 0; index <= array.length - size; index++) {
      const head = array[index];
      if (!head) continue;
      const tailSubsets = getSubsets(array.slice(index + 1), size - 1);
      tailSubsets.forEach((tail) => result.push([head, ...tail]));
    }
    return result;
  };

  const checkStraightSubsets = (candidateCards: Card[]): boolean => {
    if (candidateCards.length < straightThreshold) return false;
    return getSubsets([...candidateCards].sort((a, b) => a.rank - b.rank), straightThreshold).some((subset) => (
      subset.every((card, index) => {
        const next = subset[index + 1];
        if (!next) return true;
        const difference = next.rank - card.rank;
        return canSkip ? difference >= 1 && difference <= 2 : difference === 1;
      })
    ));
  };

  const containsStraight = (candidateCards: Card[]): boolean => {
    if (checkStraightSubsets(candidateCards)) return true;
    if (!candidateCards.some((card) => card.rank === 14)) return false;
    const aceLowCards = candidateCards.map((card) => (
      card.rank === 14 ? { ...card, rank: 1, base_nips: 1 } : card
    ));
    return checkStraightSubsets(aceLowCards);
  };

  const isStraight = containsStraight(sorted);
  const cardsBySuit = new Map<CardSuit, Card[]>();
  cards.forEach((card) => cardsBySuit.set(card.suit, [...(cardsBySuit.get(card.suit) ?? []), card]));
  const isStraightFlush = [...cardsBySuit.values()].some((suitedCards) => (
    suitedCards.length >= straightThreshold && containsStraight(suitedCards)
  ));

  // ── Combo priority ────────────────────────────────────────────
  // Straight Flush > Five of a Kind > Four of a Kind > Full House > Flush > Straight > Three > Two Pair > Pair > High Card
  const hasFullHouse = counts.some((count, index) => (
    count >= 3 && counts.some((otherCount, otherIndex) => otherIndex !== index && otherCount >= 2)
  ));

  if (isStraightFlush) {
    mult += 12.0;
    comboName = 'Straight Flush';
  } else if (maxCount === 5) {
    mult += 10.0;
    comboName = 'Five of a Kind';
  } else if (maxCount === 4) {
    mult += 8.0;
    comboName = 'Four of a Kind';
  } else if (hasFullHouse) {
    mult += 5.5;
    comboName = 'Full House';
  } else if (isFlush) {
    mult += 5.0;
    comboName = 'Flush';
  } else if (isStraight) {
    mult += 4.0;
    comboName = 'Straight';
  } else if (maxCount === 3) {
    mult += 3.0;
    comboName = 'Three of a Kind';
  } else if (counts.filter((c) => c === 2).length === 2) {
    mult += 2.0;
    comboName = 'Two Pair';
  } else if (maxCount === 2) {
    mult += 1.2;
    comboName = 'Pair';
  }

  // ── Base nips calculation ─────────────────────────────────────
  // Breed cards (11-14) are premium — they contribute their full base_nips.
  // All cards are treated uniformly: each contributes base_nips.
  // Group by rank for the multiples multiplier.

  const groupedByRank = new Map<number, Card[]>();
  for (const c of cards) {
    if (!groupedByRank.has(c.rank)) {
      groupedByRank.set(c.rank, []);
    }
    groupedByRank.get(c.rank)!.push(c);
  }

  let trueBase = 0;
  for (const [_rank, cardsInGroup] of groupedByRank.entries()) {
    const count = cardsInGroup.length;
    const groupSum = cardsInGroup.reduce((sum, card) => {
      return sum + card.base_nips * card.base_mult;
    }, 0);

    // Multiples bonus: multiply the sum by count if count > 1
    trueBase += groupSum * (count > 1 ? count : 1);
  }

  const finalScore = Math.floor(trueBase * mult);

  return {
    base: trueBase,
    mult,
    score: finalScore,
    combo: comboName,
  };
}
