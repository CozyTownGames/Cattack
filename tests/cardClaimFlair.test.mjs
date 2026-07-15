import assert from 'node:assert/strict';
import test from 'node:test';

import { getCardClaimFlairTier } from '../src/shared/cardClaimFlair.ts';

test('card claim flair is absent before the first threshold', () => {
  assert.equal(getCardClaimFlairTier(4), null);
});

test('card claim flair maps every threshold to its emoji', () => {
  const thresholds = [5, 25, 50, 100, 200, 300, 500, 1000];
  thresholds.forEach((threshold, index) => {
    assert.equal(getCardClaimFlairTier(threshold)?.emoji, `:${index + 1}:`);
  });
});

test('card claim flair keeps the highest earned tier between thresholds', () => {
  assert.equal(getCardClaimFlairTier(24)?.emoji, ':1:');
  assert.equal(getCardClaimFlairTier(999)?.emoji, ':7:');
  assert.equal(getCardClaimFlairTier(5000)?.emoji, ':8:');
});
