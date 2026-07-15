import assert from 'node:assert/strict';
import test from 'node:test';
import { makeCard, runScoreCalculation } from '../src/client/scenes/cardBattle/cardRules.ts';
import { getPlayCardLimitForCats } from '../src/shared/cardBattle.ts';

const card = (suit, rank) => makeCard(suit, rank);

test('recognizes an ordinary five-card straight flush', () => {
  const hand = [2, 3, 4, 5, 6].map((rank) => card('sakura', rank));
  assert.equal(runScoreCalculation(hand).combo, 'Straight Flush');
});

test('does not combine different six-card subsets into a straight flush', () => {
  const hand = [
    card('sakura', 2),
    card('sakura', 3),
    card('sakura', 4),
    card('sakura', 5),
    card('sakura', 9),
    card('ghost', 6),
  ];
  assert.equal(runScoreCalculation(hand).combo, 'Flush');
});

test('uses one of two triples as the pair in a six-card full house', () => {
  const hand = [
    card('sakura', 3),
    card('ghost', 3),
    card('leaf', 3),
    card('sakura', 7),
    card('ghost', 7),
    card('leaf', 7),
  ];
  assert.equal(runScoreCalculation(hand).combo, 'Full House');
});

test('supports an ace-low straight', () => {
  const hand = [
    card('sakura', 14),
    card('ghost', 2),
    card('leaf', 3),
    card('water', 4),
    card('sakura', 5),
  ];
  assert.equal(runScoreCalculation(hand).combo, 'Straight');
});

test('Cat Tower recognizes four-card straights', () => {
  const hand = [2, 3, 4, 5].map((rank) => card('water', rank));
  assert.equal(runScoreCalculation(hand, ['c28']).combo, 'Straight Flush');
});

test('play-card bonuses stack and remain within the shared safety ceiling', () => {
  assert.equal(getPlayCardLimitForCats(['c25']), 6);
  assert.equal(getPlayCardLimitForCats(['c32', 'c25']), 7);
  assert.equal(getPlayCardLimitForCats(Array.from({ length: 20 }, () => 'c25')), 12);
});
