import { Card } from './cardRules';

export type CompanionCatId =
  | 'c1' | 'c2' | 'c3' | 'c4' | 'c5'
  | 'c6' | 'c7' | 'c8' | 'c9' | 'c10'
  | 'c11' | 'c12' | 'c13' | 'c14' | 'c15'
  | 'c16' | 'c17' | 'c18' | 'c19'
  | 'c20' | 'c21' | 'c22' | 'c23'
  | 'c24' | 'c25' | 'c26' | 'c27'
  | 'c28' | 'c29' | 'c30' | 'c31'
  | 'c32' | 'c33' | 'c34' | 'c35'
  | 'c36' | 'c37' | 'c38' | 'c39';

export type CompanionCat = {
  id: CompanionCatId;
  name: string;
  description: string;
  trigger: 'onCardScored' | 'onHandEvaluated';
  price: number;
};

export const COMPANION_CATS: Record<CompanionCatId, CompanionCat> = {
  c1: { id: 'c1', name: 'Cat', description: '+4 Mult', trigger: 'onHandEvaluated', price: 4 },
  c2: { id: 'c2', name: 'Ghost Cat', description: 'Played cards with Ghost suit give +3 Mult when scored.', trigger: 'onCardScored', price: 4 },
  c3: { id: 'c3', name: 'Sakura Cat', description: 'Played cards with Sakura suit give +3 Mult when scored.', trigger: 'onCardScored', price: 4 },
  c4: { id: 'c4', name: 'Leaf Cat', description: 'Played cards with Leaf suit give +3 Mult when scored.', trigger: 'onCardScored', price: 4 },
  c5: { id: 'c5', name: 'Water Cat', description: 'Played cards with Water suit give +3 Mult when scored.', trigger: 'onCardScored', price: 4 },
  c6: { id: 'c6', name: 'Friend Cat', description: '+8 Mult if played hand contains a Pair.', trigger: 'onHandEvaluated', price: 5 },
  c7: { id: 'c7', name: 'Couples Cat', description: '+10 Mult if played hand contains a Two Pair.', trigger: 'onHandEvaluated', price: 5 },
  c8: { id: 'c8', name: 'Thrice Cat', description: '+12 Mult if played hand contains a Three of a Kind.', trigger: 'onHandEvaluated', price: 5 },
  c9: { id: 'c9', name: 'Group Cat', description: '+12 Mult if played hand contains a Straight.', trigger: 'onHandEvaluated', price: 5 },
  c10: { id: 'c10', name: 'Crowd Cat', description: '+10 Mult if played hand contains a Flush.', trigger: 'onHandEvaluated', price: 5 },
  c11: { id: 'c11', name: 'Snack Cat', description: '+50 Nips if played hand contains a Pair.', trigger: 'onHandEvaluated', price: 5 },
  c12: { id: 'c12', name: 'Treat Cat', description: '+80 Nips if played hand contains a Two Pair.', trigger: 'onHandEvaluated', price: 5 },
  c13: { id: 'c13', name: 'Meal Cat', description: '+100 Nips if played hand contains a Three of a Kind.', trigger: 'onHandEvaluated', price: 5 },
  c14: { id: 'c14', name: 'Hungry Cat', description: '+100 Nips if played hand contains a Straight.', trigger: 'onHandEvaluated', price: 5 },
  c15: { id: 'c15', name: 'Craving Cat', description: '+80 Nips if played hand contains a Flush.', trigger: 'onHandEvaluated', price: 5 },
  c16: { id: 'c16', name: 'Great Wave', description: 'x1.5 Mult if played hand contains a 3-of-a-Kind or better with a Water card.', trigger: 'onHandEvaluated', price: 6 },
  c17: { id: 'c17', name: 'Shrine Cat', description: 'x1.5 Mult if played hand contains a 3-of-a-Kind or better with a Sakura card.', trigger: 'onHandEvaluated', price: 6 },
  c18: { id: 'c18', name: 'Will-o-Wisp', description: 'x1.5 Mult if played hand contains a 3-of-a-Kind or better with a Ghost card.', trigger: 'onHandEvaluated', price: 6 },
  c19: { id: 'c19', name: 'Meowstool', description: 'x1.5 Mult if played hand contains a 3-of-a-Kind or better with a Leaf card.', trigger: 'onHandEvaluated', price: 6 },
  c20: { id: 'c20', name: 'Kitsune', description: 'Retrigger all scored Breed cards (Tabby/Orange/White/Void) one additional time.', trigger: 'onCardScored', price: 6 },
  c21: { id: 'c21', name: 'Garbage Cat', description: 'Retrigger all scored low-value cards (Ranks 2, 3, 4, or 5) one additional time.', trigger: 'onCardScored', price: 6 },
  c22: { id: 'c22', name: 'Dojo Cat', description: 'Retrigger the first scored card in your played hand.', trigger: 'onCardScored', price: 6 },
  c23: { id: 'c23', name: 'Catrigami', description: 'Retrigger all cards played on your final Hand of the match.', trigger: 'onCardScored', price: 6 },
  c24: { id: 'c24', name: 'Xmas Cat', description: 'Grants +15 Mult, but has a 1-in-6 chance to be permanently destroyed at the end of the match.', trigger: 'onHandEvaluated', price: 6 },
  c25: { id: 'c25', name: 'Caruma Cat', description: 'Grants +1 hand size, allowing up to 6 cards to be played.', trigger: 'onHandEvaluated', price: 6 },
  c26: { id: 'c26', name: 'Lucky Cat', description: 'Earn +3 Nips every time a card is triggered.', trigger: 'onCardScored', price: 6 },
  c27: { id: 'c27', name: 'Zen Nap Cat', description: 'Gives x2.0 Mult if played hand contains exactly 2 cards or fewer.', trigger: 'onHandEvaluated', price: 6 },
  c28: { id: 'c28', name: 'Cat Tower', description: 'Straights and Flushes can be made with only 4 cards instead of 5.', trigger: 'onHandEvaluated', price: 6 },
  c29: { id: 'c29', name: 'Even Cat', description: 'Even-numbered cards (2, 4, 6, 8) give +4 Mult when scored.', trigger: 'onCardScored', price: 6 },
  c30: { id: 'c30', name: 'Odd Cat', description: 'Odd-numbered cards (3, 5, 7, 9) give +30 Nips when scored.', trigger: 'onCardScored', price: 6 },
  c31: { id: 'c31', name: 'Eclipse Cat', description: 'Allows Straights to be built with gaps of 1 rank.', trigger: 'onHandEvaluated', price: 6 },
  c32: { id: 'c32', name: 'Mirror Cat', description: 'Copies the capability of the Cat Card to its right.', trigger: 'onHandEvaluated', price: 6 },
  c33: { id: 'c33', name: 'Schrodigers Cat', description: 'When you play a hand, 1-in-4 chance to get x4 Mult.', trigger: 'onHandEvaluated', price: 6 },
  c34: { id: 'c34', name: 'Pure Bred', description: 'Adds the value of your lowest-ranked held card to Mult.', trigger: 'onHandEvaluated', price: 6 },
  c35: { id: 'c35', name: 'Catoflauge', description: 'Gives x2.0 Mult, but loses x0.1 Mult every time you use a Discard.', trigger: 'onHandEvaluated', price: 6 },
  c36: { id: 'c36', name: 'Cat with Earring', description: 'Gives x3.0 Mult if the played hand is a Straight.', trigger: 'onHandEvaluated', price: 6 },
  c37: { id: 'c37', name: 'Vengeance Cat', description: 'Grants x3.0 Mult on the final hand play of the match.', trigger: 'onHandEvaluated', price: 6 },
  c38: { id: 'c38', name: 'Glitch Cat', description: 'Adds a random amount of Mult (0-20) to every hand.', trigger: 'onHandEvaluated', price: 6 },
  c39: { id: 'c39', name: 'Echo Cat', description: 'Copies the capability of your leftmost equipped Cat Card.', trigger: 'onHandEvaluated', price: 6 },
};

/**
 * Runs the cat card triggers against a played hand and its cards.
 */
export function applyCompanionCats(
  equipped: CompanionCatId[],
  selectedCards: Card[],
  initialScore: { base: number; mult: number; score: number; combo: string },
  context?: {
    isFinalHand?: boolean;
    unplayedHand?: Card[];
    discardsRemaining?: number;
    holographicCats?: string[];
    random?: () => number;
  }
) {
  let nips = initialScore.base;
  let mult = initialScore.mult;
  const random = context?.random ?? Math.random;

  const resolvedEquipped = equipped.map((catId, index) => {
    let resolved = catId;
    if (resolved === 'c39') {
      resolved = equipped[0] || 'c39';
    }
    if (resolved === 'c32') {
      resolved = equipped[index + 1] || 'c32';
    }
    return resolved;
  });

  // 1. Process onCardScored triggers (and retriggers!)
  for (let i = 0; i < selectedCards.length; i++) {
    const card = selectedCards[i];
    if (!card) continue;
    
    // Evaluate how many retriggers this card gets
    let retriggers = 0;
    for (const catId of resolvedEquipped) {
      if (catId === 'c20' && card.rank >= 11) retriggers++;
      if (catId === 'c21' && card.rank >= 2 && card.rank <= 5) retriggers++;
      if (catId === 'c22' && i === 0) retriggers++;
      if (catId === 'c23' && context?.isFinalHand) retriggers++;
    }

    // Process the card (1 + retriggers) times
    const totalTriggers = 1 + retriggers;
    for (let t = 0; t < totalTriggers; t++) {
      // If t > 0, it's a retrigger, so we add its base score
      if (t > 0) {
        nips += card.base_nips * card.base_mult;
      }

      if (card.holographic) mult += 5;

      // Apply onCardScored cat effects
      for (const catId of resolvedEquipped) {
        const cat = COMPANION_CATS[catId];
        if (!cat || cat.trigger !== 'onCardScored') continue;

        if (cat.id === 'c2' && card.suit === 'ghost') mult += 3;
        else if (cat.id === 'c3' && card.suit === 'sakura') mult += 3;
        else if (cat.id === 'c4' && card.suit === 'leaf') mult += 3;
        else if (cat.id === 'c5' && card.suit === 'water') mult += 3;
        else if (cat.id === 'c26') nips += 3;
        else if (cat.id === 'c29' && card.rank % 2 === 0 && card.rank <= 14) mult += 4;
        else if (cat.id === 'c30' && card.rank % 2 !== 0 && card.rank <= 13) nips += 30;
      }
    }
  }

  // 2. Process onHandEvaluated triggers
  const combo = initialScore.combo;
  const hasPair = ['Pair', 'Two Pair', 'Full House', 'Four of a Kind', 'Five of a Kind'].includes(combo);
  const hasTwoPair = ['Two Pair'].includes(combo);
  const hasThreeOfAKind = ['Three of a Kind', 'Full House', 'Four of a Kind', 'Five of a Kind', 'Straight Flush', 'Royal Flush'].includes(combo);
  const hasStraight = ['Straight', 'Straight Flush', 'Royal Flush'].includes(combo);
  const hasFlush = ['Flush', 'Straight Flush', 'Royal Flush'].includes(combo);

  for (const catId of resolvedEquipped) {
    const cat = COMPANION_CATS[catId];
    if (!cat || cat.trigger !== 'onHandEvaluated') continue;

    if (cat.id === 'c1') {
      mult += 4;
    } else if (cat.id === 'c6' && hasPair) {
      mult += 8;
    } else if (cat.id === 'c7' && hasTwoPair) {
      mult += 10;
    } else if (cat.id === 'c8' && hasThreeOfAKind) {
      mult += 12;
    } else if (cat.id === 'c9' && hasStraight) {
      mult += 12;
    } else if (cat.id === 'c10' && hasFlush) {
      mult += 10;
    } else if (cat.id === 'c11' && hasPair) {
      nips += 50;
    } else if (cat.id === 'c12' && hasTwoPair) {
      nips += 80;
    } else if (cat.id === 'c13' && hasThreeOfAKind) {
      nips += 100;
    } else if (cat.id === 'c14' && hasStraight) {
      nips += 100;
    } else if (cat.id === 'c15' && hasFlush) {
      nips += 80;
    } else if (cat.id === 'c16' && hasThreeOfAKind && selectedCards.some(c => c.suit === 'water')) {
      mult *= 1.5;
    } else if (cat.id === 'c17' && hasThreeOfAKind && selectedCards.some(c => c.suit === 'sakura')) {
      mult *= 1.5;
    } else if (cat.id === 'c18' && hasThreeOfAKind && selectedCards.some(c => c.suit === 'ghost')) {
      mult *= 1.5;
    } else if (cat.id === 'c19' && hasThreeOfAKind && selectedCards.some(c => c.suit === 'leaf')) {
      mult *= 1.5;
    } else if (cat.id === 'c24') {
      mult += 15;
    } else if (cat.id === 'c27' && selectedCards.length <= 2) {
      mult *= 2.0;
    } else if (cat.id === 'c33' && random() < 0.25) {
      mult *= 4.0;
    } else if (cat.id === 'c34' && context?.unplayedHand && context.unplayedHand.length > 0) {
      const minRank = Math.min(...context.unplayedHand.map(c => c.rank));
      mult += minRank;
    } else if (cat.id === 'c35') {
      const discardsUsed = 4 - (context?.discardsRemaining ?? 4);
      const catoflaugeMult = Math.max(1.0, 2.0 - (discardsUsed * 0.1));
      mult *= catoflaugeMult;
    } else if (cat.id === 'c36' && hasStraight) {
      mult *= 3.0;
    } else if (cat.id === 'c37' && context?.isFinalHand) {
      mult *= 3.0;
    } else if (cat.id === 'c38') {
      mult += Math.floor(random() * 21);
    }
  }

  for (const catId of equipped) {
    if (context?.holographicCats?.includes(catId)) mult += 5;
  }

  // Final computed score
  const finalScore = Math.floor(nips * mult);

  return {
    base: nips,
    mult: mult,
    score: finalScore,
    combo: initialScore.combo,
  };
}
