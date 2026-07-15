import * as Phaser from 'phaser';
import { CardBattleScene } from '../CardBattleScene';
import { Card } from './cardRules';
import { COMPANION_CATS } from './companionCats';
import { drawCardGraphics } from './cardGraphics';
import { isSoundMuted } from '../../soundSettings';
import { changePlayerGold } from '../../playerProgress';

// Queue entry types for sequential scoring visualization
type QueueEntry =
  | { kind: 'comboBase'; nips: number }
  | { kind: 'cardScore'; cardIdx: number; nips: number; mult: number }
  | { kind: 'holoCard'; cardIdx: number }
  | { kind: 'seal'; cardIdx: number; seal: 'gold' | 'red' }
  | { kind: 'cardCat'; cardIdx: number; catIdx: number; nips: number; mult: number; label: string }
  | { kind: 'retrigger'; cardIdx: number; catIdx: number; nips: number; label: string }
  | { kind: 'handCat'; catIdx: number; nips: number; mult: number; label: string }
  | { kind: 'holoCat'; catIdx: number };

const CAT_FLOAT_LABELS: Record<string, string> = {
  c1: '+4 Mult', c2: '+3 Mult', c3: '+3 Mult', c4: '+3 Mult', c5: '+3 Mult',
  c6: '+8 Mult', c7: '+10 Mult', c8: '+12 Mult', c9: '+12 Mult', c10: '+10 Mult',
  c11: '+50 Nips', c12: '+80 Nips', c13: '+100 Nips', c14: '+100 Nips', c15: '+80 Nips',
  c16: 'x1.5 Mult!', c17: 'x1.5 Mult!', c18: 'x1.5 Mult!', c19: 'x1.5 Mult!',
  c20: 'Retrigger!', c21: 'Retrigger!', c22: 'Retrigger!', c23: 'Retrigger!',
  c24: '+15 Mult', c25: '+1 Hand Size', c26: '+3 Nips', c27: 'x2.0 Mult!',
  c28: 'Short Combo', c29: '+4 Mult', c30: '+30 Nips', c31: 'Skip Straight',
  c32: 'Copy Right', c33: 'x4 Mult!', c34: 'Added Rank', c35: 'x2.0 Mult!',
  c36: 'x3.0 Mult!', c37: 'x3.0 Mult!', c38: 'Glitch Mult', c39: 'Copy First',
};

// ── Audio helpers ───────────────────────────────────────────────
const SCORE_MEOW_KEYS = [
  'score_meow_1',
  'score_meow_2',
  'score_meow_3',
  'score_meow_4',
  'score_meow_5',
];

const playChime = (type: 'card' | 'cat' | 'mult', semitoneOffset: number): void => {
  try {
    if (isSoundMuted()) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AudioCtx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);

    const baseHz = type === 'mult' ? 880 : type === 'cat' ? 660 : 440;
    const hz = baseHz * Math.pow(1.0595, semitoneOffset);

    osc.type = type === 'mult' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(hz, ac.currentTime);
    gain.gain.setValueAtTime(0.09, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.22);
    osc.start();
    osc.stop(ac.currentTime + 0.22);
  } catch (_) { /* silently skip on permission errors */ }
};

const playRandomCatMeow = (scene: CardBattleScene): void => {
  try {
    if (isSoundMuted()) return;
    const key = Phaser.Utils.Array.GetRandom(SCORE_MEOW_KEYS);
    scene.sound.play(key, { volume: 0.6 });
  } catch (_) { /* silently skip on permission errors */ }
};

export function runSequentialScoringSequence(scene: CardBattleScene): void {
  const playerSelected = scene.selectedCards.filter((c) => c !== null) as Card[];
  const playSprites = scene.cardSpritesInPlay.filter(s => s !== null) as Phaser.GameObjects.Container[];

  if (scene.scoreBoardContainer) scene.scoreBoardContainer.setVisible(true);

  let semitoneOffset = 0;
  let stepCount = 0;
  const getDelay = () => Math.max(60, 280 * Math.pow(0.88, stepCount));

  // Live scoring state
  const scoreResult = scene.runScoreCalculation(playerSelected);
  const scoreRandom = scene.createPlayerScoreRandom(playerSelected) ?? Math.random;
  let liveNips = 0;
  let liveMult = 1.0;
  const comboName = scoreResult.combo;

  // Flash the combo label immediately
  scene.comboLabelText.setText(comboName.toUpperCase());
  scene.tweens.add({
    targets: scene.comboLabelText,
    scaleX: 1.3, scaleY: 1.3,
    duration: 120, yoyo: true, ease: 'Back.easeOut'
  });

  // Helper to refresh the live scoreboard
  const refreshBoard = () => {
    const preview = Math.floor(liveNips * liveMult);
    scene.scoreText.setText(
      `${liveNips} Nips  ×  ${liveMult.toFixed(1)} Mult  =  ${preview.toLocaleString()}`
    );
    // Pulse the score text
    scene.tweens.add({
      targets: scene.scoreText,
      scaleX: 1.15, scaleY: 1.15,
      duration: 80, yoyo: true, ease: 'Quad.easeOut'
    });
  };

  // Helper: pulse a cat sprite with a white flash overlay
  const pulseCatSprite = (catSprite: Phaser.GameObjects.Container) => {
    const baseScale = catSprite.scale;
    scene.tweens.add({
      targets: catSprite,
      scale: baseScale * 1.18,
      duration: 90,
      yoyo: true,
      ease: 'Back.easeOut',
    });
    // White flash: add a temporary tinted sprite child
    const flash = scene.add.graphics();
    flash.fillStyle(0xffffff, 0.6);
    flash.fillRoundedRect(-29, -45, 58, 90, 5);
    catSprite.add(flash);
    scene.time.delayedCall(110, () => flash.destroy());
  };

  const queue: QueueEntry[] = [];

  // Helper: resolve c32/c39 aliases
  const resolvedEquipped = scene.equippedCats.map((id, idx) => {
    if (id === 'c39') return scene.equippedCats[0] || id;
    if (id === 'c32') return scene.equippedCats[idx + 1] || id;
    return id;
  });

  const isFinalHand = scene.handsRemaining === 0;

  // 1. Base nips from combo (the hand type's chip base)
  const baseComboNips = scoreResult.base > 0 ? scoreResult.base : playerSelected.reduce((s, c) => s + c.base_nips, 0);
  queue.push({ kind: 'comboBase', nips: baseComboNips });

  // 2. Per-card scoring + per-card cat triggers
  playerSelected.forEach((card, ci) => {
    queue.push({ kind: 'cardScore', cardIdx: ci, nips: card.base_nips, mult: card.base_mult });
    if (card.seals.includes('gold')) queue.push({ kind: 'seal', cardIdx: ci, seal: 'gold' });
    if (card.seals.includes('red')) queue.push({ kind: 'seal', cardIdx: ci, seal: 'red' });
    if (card.holographic) queue.push({ kind: 'holoCard', cardIdx: ci });

    // Retrigger cats
    resolvedEquipped.forEach((catId, catIdx) => {
      const isRetrigger = (catId === 'c20' && card.rank >= 11)
        || (catId === 'c21' && card.rank >= 2 && card.rank <= 5)
        || (catId === 'c22' && ci === 0)
        || (catId === 'c23' && isFinalHand);
      if (isRetrigger) {
        queue.push({ kind: 'retrigger', cardIdx: ci, catIdx, nips: card.base_nips, label: 'Retrigger!' });
        if (card.holographic) queue.push({ kind: 'holoCard', cardIdx: ci });
      }
    });

    // Per-card suit/rank cat triggers (onCardScored)
    resolvedEquipped.forEach((catId, catIdx) => {
      const origId = scene.equippedCats[catIdx];
      if (!origId) return;
      const cat = COMPANION_CATS[origId];
      if (!cat || cat.trigger !== 'onCardScored') return;
      // Skip retrigger cats
      if (['c20','c21','c22','c23'].includes(catId)) return;

      let nips = 0, mult = 0, label = '';
      if (catId === 'c2' && card.suit === 'ghost') { mult = 3; label = '+3 Mult'; }
      else if (catId === 'c3' && card.suit === 'sakura') { mult = 3; label = '+3 Mult'; }
      else if (catId === 'c4' && card.suit === 'leaf') { mult = 3; label = '+3 Mult'; }
      else if (catId === 'c5' && card.suit === 'water') { mult = 3; label = '+3 Mult'; }
      else if (catId === 'c26') { nips = 3; label = '+3 Nips'; }
      else if (catId === 'c29' && card.rank % 2 === 0 && card.rank <= 14) { mult = 4; label = '+4 Mult'; }
      else if (catId === 'c30' && card.rank % 2 !== 0 && card.rank <= 13) { nips = 30; label = '+30 Nips'; }

      if (label) queue.push({ kind: 'cardCat', cardIdx: ci, catIdx, nips, mult, label });
    });
  });

  // 3. Hand-evaluated cats (onHandEvaluated)
  const hasThreeOfAKind = ['Three of a Kind','Full House','Four of a Kind','Five of a Kind','Straight Flush','Royal Flush'].includes(comboName);
  const hasStraight = ['Straight','Straight Flush','Royal Flush'].includes(comboName);
  const hasFlush = ['Flush','Straight Flush','Royal Flush'].includes(comboName);

  resolvedEquipped.forEach((catId, catIdx) => {
    const origId = scene.equippedCats[catIdx];
    if (!origId) return;
    const cat = COMPANION_CATS[origId];
    if (!cat || cat.trigger !== 'onHandEvaluated') return;

    let nips = 0, mult = 0, label = CAT_FLOAT_LABELS[catId] || 'CAT POWER!';
    if (catId === 'c1') { mult = 4; }
    else if (catId === 'c6' && ['Pair','Two Pair','Full House','Four of a Kind','Five of a Kind'].includes(comboName)) { mult = 8; }
    else if (catId === 'c7' && comboName === 'Two Pair') { mult = 10; }
    else if (catId === 'c8' && hasThreeOfAKind) { mult = 12; }
    else if (catId === 'c9' && hasStraight) { mult = 12; }
    else if (catId === 'c10' && hasFlush) { mult = 10; }
    else if (catId === 'c11' && ['Pair','Two Pair','Full House','Four of a Kind','Five of a Kind'].includes(comboName)) { nips = 50; }
    else if (catId === 'c12' && comboName === 'Two Pair') { nips = 80; }
    else if (catId === 'c13' && hasThreeOfAKind) { nips = 100; }
    else if (catId === 'c14' && hasStraight) { nips = 100; }
    else if (catId === 'c15' && hasFlush) { nips = 80; }
    else if (catId === 'c16' && hasThreeOfAKind && playerSelected.some(c => c.suit === 'water')) { mult = 1.5; label = 'x1.5 Mult!'; }
    else if (catId === 'c17' && hasThreeOfAKind && playerSelected.some(c => c.suit === 'sakura')) { mult = 1.5; label = 'x1.5 Mult!'; }
    else if (catId === 'c18' && hasThreeOfAKind && playerSelected.some(c => c.suit === 'ghost')) { mult = 1.5; label = 'x1.5 Mult!'; }
    else if (catId === 'c19' && hasThreeOfAKind && playerSelected.some(c => c.suit === 'leaf')) { mult = 1.5; label = 'x1.5 Mult!'; }
    else if (catId === 'c24') { mult = 15; }
    else if (catId === 'c27' && playerSelected.length <= 2) { mult = 2.0; label = 'x2.0 Mult!'; }
    else if (catId === 'c33') {
      if (scoreRandom() < 0.25) { mult = 4.0; label = 'x4 Mult!'; } else { return; }
    }
    else if (catId === 'c34') {
      const minRank = Math.min(...scene.playerHand.map(c => c.rank));
      mult = minRank; label = `+${minRank} Mult`;
    }
    else if (catId === 'c35') {
      const used = 4 - (scene.discardsRemaining ?? 4);
      const m = Math.max(1.0, 2.0 - used * 0.1);
      mult = m; label = `x${m.toFixed(1)} Mult`;
    }
    else if (catId === 'c36' && hasStraight) { mult = 3.0; }
    else if (catId === 'c37' && isFinalHand) { mult = 3.0; }
    else if (catId === 'c38') { mult = Math.floor(scoreRandom() * 21); label = `+${mult} Glitch!`; }
    else return;

    if (nips !== 0 || mult !== 0) {
      queue.push({ kind: 'handCat', catIdx, nips, mult, label });
    }
  });

  scene.equippedCats.forEach((catId, catIdx) => {
    if (scene.holographicCats.has(catId)) queue.push({ kind: 'holoCat', catIdx });
  });

  let queueIdx = 0;

  const processNext = () => {
    if (queueIdx >= queue.length) {
      concludeHandScoring();
      return;
    }

    const entry = queue[queueIdx++];
    const delay = getDelay();
    stepCount++;

    if (!entry) { scene.time.delayedCall(delay, processNext); return; }

    if (entry.kind === 'comboBase') {
      liveNips += entry.nips;
      refreshBoard();
      scene.showFloatingText(scene.scale.width / 2, scene.scale.height * 0.67 - 55, `${comboName}!`, '#00ffee');
      playChime('card', semitoneOffset++);
      scene.time.delayedCall(delay, processNext);

    } else if (entry.kind === 'cardScore') {
      const sprite = playSprites[entry.cardIdx];
      if (!sprite) { scene.time.delayedCall(delay, processNext); return; }

      liveNips += entry.nips;
      if (entry.mult > 1) liveMult *= entry.mult;

      const origY = sprite.y;
      const origScale = sprite.scale;
      scene.tweens.add({
        targets: sprite,
        y: origY - 22,
        scale: origScale * 1.08,
        duration: 110,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
      scene.emitter.emitParticleAt(sprite.x, sprite.y, 6);
      playChime('card', semitoneOffset++);
      scene.showFloatingText(sprite.x, sprite.y - 35, `+${entry.nips} Nips`, '#ffbb00');
      refreshBoard();
      scene.time.delayedCall(delay, processNext);

    } else if (entry.kind === 'retrigger') {
      const sprite = playSprites[entry.cardIdx];
      const catSprite = scene.companionCatSprites[entry.catIdx];

      if (sprite) {
        const origY = sprite.y;
        const origScale = sprite.scale;
        scene.tweens.add({
          targets: sprite,
          y: origY - 18,
          scale: origScale * 1.06,
          duration: 90,
          yoyo: true,
          ease: 'Quad.easeOut',
        });
        liveNips += entry.nips;
        scene.showFloatingText(sprite.x, sprite.y - 35, `+${entry.nips} Nips`, '#ffdd44');
        refreshBoard();
      }
      if (catSprite) pulseCatSprite(catSprite);
      playChime('cat', semitoneOffset++);
      playRandomCatMeow(scene);
      scene.showFloatingText(
        catSprite ? catSprite.x : scene.scale.width / 2,
        catSprite ? catSprite.y - 45 : scene.scale.height * 0.5,
        entry.label, '#ff88ff'
      );
      scene.time.delayedCall(delay, processNext);

    } else if (entry.kind === 'seal') {
      const sprite = playSprites[entry.cardIdx];
      if (entry.seal === 'gold') {
        scene.coins = changePlayerGold(10).gold;
        if (sprite) scene.showFloatingText(sprite.x, sprite.y - 35, '+10 GOLD · GOLD SEAL', '#ffcc00');
      } else {
        liveMult += 4;
        refreshBoard();
        if (sprite) scene.showFloatingText(sprite.x, sprite.y - 35, '+4 MULT · RED SEAL', '#ff3366');
      }
      if (sprite) scene.emitter.emitParticleAt(sprite.x, sprite.y, 10);
      playChime('mult', semitoneOffset++);
      scene.time.delayedCall(delay, processNext);

    } else if (entry.kind === 'holoCard') {
      const sprite = playSprites[entry.cardIdx];
      liveMult += 5;
      refreshBoard();
      if (sprite) {
        scene.emitter.emitParticleAt(sprite.x, sprite.y, 12);
        scene.showFloatingText(sprite.x, sprite.y - 35, '+5 MULT · HOLO', '#7df9ff');
      }
      playChime('mult', semitoneOffset++);
      scene.time.delayedCall(delay, processNext);

    } else if (entry.kind === 'cardCat') {
      const sprite = playSprites[entry.cardIdx];
      const catSprite = scene.companionCatSprites[entry.catIdx];

      if (entry.nips) liveNips += entry.nips;
      if (entry.mult) liveMult += entry.mult;
      refreshBoard();

      if (sprite) scene.emitter.emitParticleAt(sprite.x, sprite.y, 4);
      if (catSprite) pulseCatSprite(catSprite);
      playChime('cat', semitoneOffset++);
      playRandomCatMeow(scene);

      const floatX = catSprite ? catSprite.x : (sprite ? sprite.x : scene.scale.width / 2);
      const floatY = catSprite ? catSprite.y - 45 : scene.scale.height * 0.5;
      const col = entry.mult ? '#ff88ff' : '#ffbb00';
      scene.showFloatingText(floatX, floatY, entry.label, col);
      scene.time.delayedCall(delay, processNext);

    } else if (entry.kind === 'handCat') {
      const catSprite = scene.companionCatSprites[entry.catIdx];

      if (entry.nips) { liveNips += entry.nips; }
      if (entry.mult) {
        if (entry.mult >= 1.5 && entry.mult <= 4.0 && Math.round(entry.mult) !== entry.mult) {
          liveMult *= entry.mult;
        } else {
          liveMult += entry.mult;
        }
      }
      refreshBoard();

      if (catSprite) {
        pulseCatSprite(catSprite);
        scene.emitter.emitParticleAt(catSprite.x, catSprite.y, 10);
      }
      playChime('mult', semitoneOffset++);
      playRandomCatMeow(scene);

      const col = entry.nips && !entry.mult ? '#ffbb00' : '#ff00ff';
      const fx = catSprite ? catSprite.x : scene.scale.width / 2;
      const fy = catSprite ? catSprite.y - 50 : scene.scale.height * 0.5;
      scene.showFloatingText(fx, fy, entry.label, col);
      scene.time.delayedCall(delay, processNext);
    } else if (entry.kind === 'holoCat') {
      const catSprite = scene.companionCatSprites[entry.catIdx];
      liveMult += 5;
      refreshBoard();
      if (catSprite) pulseCatSprite(catSprite);
      const fx = catSprite ? catSprite.x : scene.scale.width / 2;
      const fy = catSprite ? catSprite.y - 50 : scene.scale.height * 0.5;
      scene.showFloatingText(fx, fy, '+5 MULT · HOLO', '#7df9ff');
      playChime('mult', semitoneOffset++);
      playRandomCatMeow(scene);
      scene.time.delayedCall(delay, processNext);
    }
  };

  const concludeHandScoring = () => {
    // The resolved score is the source of truth. The animation is only a
    // presentation of that result and must not recalculate match state.
    const finalScore = scoreResult.score;
    scene.recordPlayerTurn(playerSelected, finalScore, scoreResult.mult);
    scene.playerCumulativeScore += finalScore;
    scene.totalScore = scene.playerCumulativeScore;

    scene.scoreText.setText(
      `${liveNips} Nips  ×  ${liveMult.toFixed(1)} Mult  =  ${finalScore.toLocaleString()}`
    );

    scene.tweens.add({
      targets: scene.scoreBoardContainer,
      scaleX: 1.12, scaleY: 1.12,
      duration: 100, yoyo: true, ease: 'Back.easeOut'
    });

    scene.showFloatingText(
      scene.scale.width / 2,
      scene.scale.height * 0.67 - 50,
      `+${finalScore.toLocaleString()}!`,
      '#00ffee'
    );

    semitoneOffset = 0;
    scene.updateUI();

    scene.time.delayedCall(1200, () => {
      const opScale = scene.getCardScale();
      let flippedCount = 0;
      scene.opponentCardSprites.forEach((sprite, idx) => {
        scene.time.delayedCall(idx * 150, () => {
          scene.flipCard(sprite, opScale, () => {
            flippedCount++;
            if (flippedCount === scene.opponentCardSprites.length) {
              scene.time.delayedCall(300, () => {
                runBotSequentialScoringSequence(scene);
              });
            }
          });
        });
      });
    });
  };

  scene.time.delayedCall(200, processNext);
}

export function runBotSequentialScoringSequence(scene: CardBattleScene): void {
  const botHandCards = scene.botHand;
  const botSprites = scene.opponentCardSprites;

  let semitoneOffset = 0;
  let stepCount = 0;
  const getDelay = () => Math.max(60, 280 * Math.pow(0.88, stepCount));

  const botScoreResult = scene.evaluate_bot_hand();
  let liveNips = 0;
  let liveMult = 1.0;
  const comboName = botScoreResult.combo;

  scene.comboLabelText.setText(`VS: ${comboName.toUpperCase()}`);
  scene.comboLabelText.setColor('#ff0055');
  scene.scoreText.setColor('#ff0055');
  scene.tweens.add({
    targets: scene.comboLabelText,
    scaleX: 1.3, scaleY: 1.3,
    duration: 120, yoyo: true, ease: 'Back.easeOut'
  });

  const refreshBoard = () => {
    const preview = Math.floor(liveNips * liveMult);
    scene.scoreText.setText(
      `Score: ${liveNips} Nips × ${liveMult.toFixed(1)} Mult = ${preview.toLocaleString()}`
    );
    scene.tweens.add({
      targets: scene.scoreText,
      scaleX: 1.15, scaleY: 1.15,
      duration: 80, yoyo: true, ease: 'Quad.easeOut'
    });
  };

  const pulseCatSprite = (catSprite: Phaser.GameObjects.Container) => {
    const baseScale = catSprite.scale;
    scene.tweens.add({
      targets: catSprite,
      scale: baseScale * 1.18,
      duration: 90,
      yoyo: true,
      ease: 'Back.easeOut',
    });
    const flash = scene.add.graphics();
    flash.fillStyle(0xffffff, 0.6);
    flash.fillRoundedRect(-29, -45, 58, 90, 5);
    catSprite.add(flash);
    scene.time.delayedCall(110, () => flash.destroy());
  };

  const queue: QueueEntry[] = [];

  const resolvedEquipped = scene.botEquippedCats.map((id, idx) => {
    if (id === 'c39') return scene.botEquippedCats[0] || id;
    if (id === 'c32') return scene.botEquippedCats[idx + 1] || id;
    return id;
  });

  const isFinalHand = scene.handsRemaining === 0;

  const baseComboNips = botScoreResult.base > 0 ? botScoreResult.base : botHandCards.reduce((s, c) => s + c.base_nips, 0);
  queue.push({ kind: 'comboBase', nips: baseComboNips });

  botHandCards.forEach((card, ci) => {
    queue.push({ kind: 'cardScore', cardIdx: ci, nips: card.base_nips, mult: card.base_mult });
    if (card.holographic) queue.push({ kind: 'holoCard', cardIdx: ci });

    resolvedEquipped.forEach((catId, catIdx) => {
      const isRetrigger = (catId === 'c20' && card.rank >= 11)
        || (catId === 'c21' && card.rank >= 2 && card.rank <= 5)
        || (catId === 'c22' && ci === 0)
        || (catId === 'c23' && isFinalHand);
      if (isRetrigger) {
        queue.push({ kind: 'retrigger', cardIdx: ci, catIdx, nips: card.base_nips, label: 'Retrigger!' });
        if (card.holographic) queue.push({ kind: 'holoCard', cardIdx: ci });
      }
    });

    resolvedEquipped.forEach((catId, catIdx) => {
      const origId = scene.botEquippedCats[catIdx];
      if (!origId) return;
      const cat = COMPANION_CATS[origId];
      if (!cat || cat.trigger !== 'onCardScored') return;
      if (['c20','c21','c22','c23'].includes(catId)) return;

      let nips = 0, mult = 0, label = '';
      if (catId === 'c2' && card.suit === 'ghost') { mult = 3; label = '+3 Mult'; }
      else if (catId === 'c3' && card.suit === 'sakura') { mult = 3; label = '+3 Mult'; }
      else if (catId === 'c4' && card.suit === 'leaf') { mult = 3; label = '+3 Mult'; }
      else if (catId === 'c5' && card.suit === 'water') { mult = 3; label = '+3 Mult'; }
      else if (catId === 'c26') { nips = 3; label = '+3 Nips'; }
      else if (catId === 'c29' && card.rank % 2 === 0 && card.rank <= 14) { mult = 4; label = '+4 Mult'; }
      else if (catId === 'c30' && card.rank % 2 !== 0 && card.rank <= 13) { nips = 30; label = '+30 Nips'; }

      if (label) queue.push({ kind: 'cardCat', cardIdx: ci, catIdx, nips, mult, label });
    });
  });

  const hasThreeOfAKind = ['Three of a Kind','Full House','Four of a Kind','Five of a Kind','Straight Flush','Royal Flush'].includes(comboName);
  const hasStraight = ['Straight','Straight Flush','Royal Flush'].includes(comboName);
  const hasFlush = ['Flush','Straight Flush','Royal Flush'].includes(comboName);

  resolvedEquipped.forEach((catId, catIdx) => {
    const origId = scene.botEquippedCats[catIdx];
    if (!origId) return;
    const cat = COMPANION_CATS[origId];
    if (!cat || cat.trigger !== 'onHandEvaluated') return;

    let nips = 0, mult = 0, label = CAT_FLOAT_LABELS[catId] || 'CAT POWER!';
    if (catId === 'c1') { mult = 4; }
    else if (catId === 'c6' && ['Pair','Two Pair','Full House','Four of a Kind','Five of a Kind'].includes(comboName)) { mult = 8; }
    else if (catId === 'c7' && comboName === 'Two Pair') { mult = 10; }
    else if (catId === 'c8' && hasThreeOfAKind) { mult = 12; }
    else if (catId === 'c9' && hasStraight) { mult = 12; }
    else if (catId === 'c10' && hasFlush) { mult = 10; }
    else if (catId === 'c11' && ['Pair','Two Pair','Full House','Four of a Kind','Five of a Kind'].includes(comboName)) { nips = 50; }
    else if (catId === 'c12' && comboName === 'Two Pair') { nips = 80; }
    else if (catId === 'c13' && hasThreeOfAKind) { nips = 100; }
    else if (catId === 'c14' && hasStraight) { nips = 100; }
    else if (catId === 'c15' && hasFlush) { nips = 80; }
    else if (catId === 'c16' && hasThreeOfAKind && botHandCards.some(c => c.suit === 'water')) { mult = 1.5; label = 'x1.5 Mult!'; }
    else if (catId === 'c17' && hasThreeOfAKind && botHandCards.some(c => c.suit === 'sakura')) { mult = 1.5; label = 'x1.5 Mult!'; }
    else if (catId === 'c18' && hasThreeOfAKind && botHandCards.some(c => c.suit === 'ghost')) { mult = 1.5; label = 'x1.5 Mult!'; }
    else if (catId === 'c19' && hasThreeOfAKind && botHandCards.some(c => c.suit === 'leaf')) { mult = 1.5; label = 'x1.5 Mult!'; }
    else if (catId === 'c24') { mult = 15; }
    else if (catId === 'c27' && botHandCards.length <= 2) { mult = 2.0; label = 'x2.0 Mult!'; }
    else if (catId === 'c33') {
      if (Math.random() < 0.25) { mult = 4.0; label = 'x4 Mult!'; } else { return; }
    }
    else if (catId === 'c34') {
      const minRank = Math.min(...botHandCards.map(c => c.rank));
      mult = minRank; label = `+${minRank} Mult`;
    }
    else if (catId === 'c35') {
      mult = 2.0; label = 'x2.0 Mult';
    }
    else if (catId === 'c36' && hasStraight) { mult = 3.0; }
    else if (catId === 'c37' && isFinalHand) { mult = 3.0; }
    else if (catId === 'c38') { mult = Math.floor(Math.random() * 21); label = `+${mult} Glitch!`; }
    else return;

    if (nips !== 0 || mult !== 0) {
      queue.push({ kind: 'handCat', catIdx, nips, mult, label });
    }
  });

  scene.botEquippedCats.forEach((catId, catIdx) => {
    if (scene.botHolographicCats.has(catId)) queue.push({ kind: 'holoCat', catIdx });
  });

  let queueIdx = 0;

  const processNext = () => {
    if (queueIdx >= queue.length) {
      concludeBotScoring();
      return;
    }

    const entry = queue[queueIdx++];
    const delay = getDelay();
    stepCount++;

    if (!entry) { scene.time.delayedCall(delay, processNext); return; }

    if (entry.kind === 'comboBase') {
      liveNips += entry.nips;
      refreshBoard();
      scene.showFloatingText(scene.scale.width / 2, scene.scale.height * 0.26 + 55, `${comboName}!`, '#ff0055');
      playChime('card', semitoneOffset++);
      scene.time.delayedCall(delay, processNext);

    } else if (entry.kind === 'cardScore') {
      const sprite = botSprites[entry.cardIdx];
      if (!sprite) { scene.time.delayedCall(delay, processNext); return; }

      liveNips += entry.nips;
      if (entry.mult > 1) liveMult *= entry.mult;

      const origY = sprite.y;
      const origScale = sprite.scale;
      scene.tweens.add({
        targets: sprite,
        y: origY + 22,
        scale: origScale * 1.08,
        duration: 110,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
      scene.emitter.emitParticleAt(sprite.x, sprite.y, 6);
      playChime('card', semitoneOffset++);
      scene.showFloatingText(sprite.x, sprite.y + 35, `+${entry.nips} Nips`, '#ff0055');
      refreshBoard();
      scene.time.delayedCall(delay, processNext);

    } else if (entry.kind === 'retrigger') {
      const sprite = botSprites[entry.cardIdx];
      const catSprite = scene.botCompanionCatSprites[entry.catIdx];

      if (sprite) {
        const origY = sprite.y;
        const origScale = sprite.scale;
        scene.tweens.add({
          targets: sprite,
          y: origY + 18,
          scale: origScale * 1.06,
          duration: 90,
          yoyo: true,
          ease: 'Quad.easeOut',
        });
        liveNips += entry.nips;
        scene.showFloatingText(sprite.x, sprite.y + 35, `+${entry.nips} Nips`, '#ffdd44');
        refreshBoard();
      }
      if (catSprite) pulseCatSprite(catSprite);
      playChime('cat', semitoneOffset++);
      playRandomCatMeow(scene);
      scene.showFloatingText(
        catSprite ? catSprite.x : scene.scale.width / 2,
        catSprite ? catSprite.y - 45 : scene.scale.height * 0.26,
        entry.label, '#ff88ff'
      );
      scene.time.delayedCall(delay, processNext);

    } else if (entry.kind === 'holoCard') {
      const sprite = botSprites[entry.cardIdx];
      liveMult += 5;
      refreshBoard();
      if (sprite) {
        scene.emitter.emitParticleAt(sprite.x, sprite.y, 12);
        scene.showFloatingText(sprite.x, sprite.y - 35, '+5 MULT · HOLO', '#7df9ff');
      }
      playChime('mult', semitoneOffset++);
      scene.time.delayedCall(delay, processNext);

    } else if (entry.kind === 'cardCat') {
      const sprite = botSprites[entry.cardIdx];
      const catSprite = scene.botCompanionCatSprites[entry.catIdx];

      if (entry.nips) liveNips += entry.nips;
      if (entry.mult) liveMult += entry.mult;
      refreshBoard();

      if (sprite) scene.emitter.emitParticleAt(sprite.x, sprite.y, 4);
      if (catSprite) pulseCatSprite(catSprite);
      playChime('cat', semitoneOffset++);
      playRandomCatMeow(scene);

      const floatX = catSprite ? catSprite.x : (sprite ? sprite.x : scene.scale.width / 2);
      const floatY = catSprite ? catSprite.y - 45 : scene.scale.height * 0.26;
      const col = entry.mult ? '#ff88ff' : '#ffbb00';
      scene.showFloatingText(floatX, floatY, entry.label, col);
      scene.time.delayedCall(delay, processNext);

    } else if (entry.kind === 'handCat') {
      const catSprite = scene.botCompanionCatSprites[entry.catIdx];

      if (entry.nips) { liveNips += entry.nips; }
      if (entry.mult) {
        if (entry.mult >= 1.5 && entry.mult <= 4.0 && Math.round(entry.mult) !== entry.mult) {
          liveMult *= entry.mult;
        } else {
          liveMult += entry.mult;
        }
      }
      refreshBoard();

      if (catSprite) {
        pulseCatSprite(catSprite);
        scene.emitter.emitParticleAt(catSprite.x, catSprite.y, 10);
      }
      playChime('mult', semitoneOffset++);
      playRandomCatMeow(scene);

      const col = entry.nips && !entry.mult ? '#ffbb00' : '#ff00ff';
      const fx = catSprite ? catSprite.x : scene.scale.width / 2;
      const fy = catSprite ? catSprite.y - 50 : scene.scale.height * 0.26;
      scene.showFloatingText(fx, fy, entry.label, col);
      scene.time.delayedCall(delay, processNext);
    } else if (entry.kind === 'holoCat') {
      const catSprite = scene.botCompanionCatSprites[entry.catIdx];
      liveMult += 5;
      refreshBoard();
      if (catSprite) pulseCatSprite(catSprite);
      const fx = catSprite ? catSprite.x : scene.scale.width / 2;
      const fy = catSprite ? catSprite.y - 50 : scene.scale.height * 0.5;
      scene.showFloatingText(fx, fy, '+5 MULT · HOLO', '#7df9ff');
      playChime('mult', semitoneOffset++);
      playRandomCatMeow(scene);
      scene.time.delayedCall(delay, processNext);
    }
  };

  const concludeBotScoring = () => {
    // Keep the opponent's displayed sequence and its actual bank deposit tied
    // to the single result resolved at the start of this turn.
    const botTotalScore = botScoreResult.score;

    scene.tweens.add({
      targets: scene.scoreBoardContainer,
      scaleX: 1.12, scaleY: 1.12,
      duration: 100, yoyo: true, ease: 'Back.easeOut'
    });

    scene.showFloatingText(
      scene.scale.width / 2,
      scene.scale.height * 0.67 - 50,
      `Final: ${botTotalScore.toLocaleString()}!`,
      '#ff0055'
    );

    scene.time.delayedCall(1200, () => {
      scene.comboLabelText.setColor('#00ffee');
      scene.scoreText.setColor('#ffbb00');

      scene.opponentCumulativeScore += botTotalScore;
      scene.totalScore = scene.playerCumulativeScore;
      scene.updateUI();

      if (scene.handsRemaining <= 0) {
        scene.concludeBattle(scene.playerCumulativeScore > scene.opponentCumulativeScore);
      } else {
        const playerPlaySprites = scene.cardSpritesInPlay.filter(s => s !== null) as Phaser.GameObjects.Container[];
        playerPlaySprites.forEach((sprite) => {
          scene.tweens.add({
            targets: sprite,
            scale: 0, alpha: 0,
            duration: 300,
            onComplete: () => sprite.destroy()
          });
        });

        const playedIds = scene.selectedCards.filter(c => c !== null).map(c => c!.id);
        scene.playerHand = scene.playerHand.filter(hc => !playedIds.includes(hc.id));

        const maxHandSize = 8 + (scene.getPlayerPlayCardLimit() - 5);
        const needed = maxHandSize - scene.playerHand.length;
        if (needed > 0) scene.playerHand.push(...scene.drawCards(needed));

        scene.cardSpritesInHand.forEach(s => { if (s && s.active) s.destroy(); });
        scene.cardSpritesInHand = [];
        scene.selectedCards = scene.createEmptyPlayerPlaySlots();
        scene.cardSpritesInPlay = scene.createEmptyPlayerPlaySprites();

        const opScale = scene.getCardScale();
        scene.opponentCardSprites.forEach((sprite) => {
          scene.tweens.add({
            targets: sprite,
            scaleX: 0,
            duration: 150,
            onComplete: () => {
              sprite.setData('faceDown', true);
              drawCardGraphics(scene, sprite, true);
              scene.tweens.add({
                targets: sprite,
                scaleX: opScale,
                duration: 150
              });
            }
          });
        });

        scene.time.delayedCall(350, () => {
          scene.renderPlayerHand();
          scene.calculateCurrentHandPreview();
          scene.currentTurn++;
          scene.prepareNextOpponentHand();
          scene.isBattleStarted = false;
          scene.beginCatSwapPhase();
          scene.updateUI();
          scene.updateBattleButtonState();
        });
      }
    });
  };

  processNext();
}
