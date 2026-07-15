import * as Phaser from 'phaser';
import type { CardBattleScene } from '../CardBattleScene';
import { Card, ensureCard, makeCard } from './cardRules';
import { COMPANION_CATS, CompanionCatId } from './companionCats';
import { getCatCardFrame } from './catCardFrames';
import { reportPlayerProgress } from '../../playerProgress';

// ─── Card Detail Overlay (long-press) ───────────────────────────────────────
export function showCardDetailOverlay(scene: CardBattleScene, card: Card): void {
  if (scene.cardDetailOverlay) scene.cardDetailOverlay.destroy();

  const { width, height } = scene.scale;
  const RANK_NAMES: Record<number, string> = { 11: 'Tabby', 12: 'Orange', 13: 'White', 14: 'Void' };
  const SUIT_COLORS: Record<string, { border: number; glow: string }> = {
    sakura: { border: 0xec4899, glow: '#ec4899' },
    ghost:  { border: 0xa855f7, glow: '#a855f7' },
    leaf:   { border: 0x22c55e, glow: '#22c55e' },
    water:  { border: 0x06b6d4, glow: '#06b6d4' },
  };
  const sc = SUIT_COLORS[card.suit] ?? SUIT_COLORS['sakura']!;
  const rankLabel = RANK_NAMES[card.rank] ?? card.rank.toString();
  const isBreed = card.rank >= 11;
  const cardName = isBreed
    ? `${rankLabel} of ${card.suit.charAt(0).toUpperCase() + card.suit.slice(1)}`
    : `${card.suit.charAt(0).toUpperCase() + card.suit.slice(1)} ${rankLabel}`;

  const overlay = scene.add.container(width / 2, height / 2).setDepth(500);
  scene.cardDetailOverlay = overlay;

  // Dim background
  const blocker = scene.add.graphics();
  blocker.fillStyle(0x000000, 0.7);
  blocker.fillRect(-width / 2, -height / 2, width, height);
  overlay.add(blocker);

  // Card panel
  const panel = scene.add.graphics();
  panel.fillStyle(0x0d121f, 0.97);
  panel.lineStyle(2, sc.border, 1);
  panel.fillRoundedRect(-110, -155, 220, 310, 12);
  panel.strokeRoundedRect(-110, -155, 220, 310, 12);
  overlay.add(panel);

  // Large card sprite
  const sprite = scene.createCardSprite(0, -60, card, false);
  sprite.setScale(1.5);
  overlay.add(sprite);

  // Card name
  overlay.add(scene.add.text(0, 70, cardName.toUpperCase(), {
    fontFamily: 'monospace',
    fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
  }).setOrigin(0.5));

  // Stats row
  overlay.add(scene.add.text(0, 92, `Suit: ${card.suit}   Rank: ${rankLabel}`, {
    fontFamily: 'monospace',
    fontSize: '10px', color: sc.glow,
  }).setOrigin(0.5));

  overlay.add(scene.add.text(0, 110, `Base Nips: ${card.base_nips}`, {
    fontFamily: 'monospace',
    fontSize: '10px', color: '#ffbb00',
  }).setOrigin(0.5));

  const effect = isBreed ? 'Breed card: scores full rank value.' : 'Contributes base face value to hand score.';
  overlay.add(scene.add.text(0, 130, effect, {
    fontFamily: 'monospace',
    fontSize: '9px', color: '#94a3b8', wordWrap: { width: 190 }, align: 'center',
  }).setOrigin(0.5));

  // Tap-to-close
  blocker.setInteractive(new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height), Phaser.Geom.Rectangle.Contains);
  blocker.on('pointerdown', () => { overlay.destroy(); scene.cardDetailOverlay = null; });

  scene.tweens.add({ targets: overlay, scaleX: 1, scaleY: 1, alpha: 1, from: 0, duration: 180, ease: 'Back.easeOut' });
}

export function showCatCardDetailOverlay(scene: CardBattleScene, catId: CompanionCatId): void {
  if (scene.cardDetailOverlay) scene.cardDetailOverlay.destroy();

  const { width, height } = scene.scale;
  const cat = COMPANION_CATS[catId];
  if (!cat) return;

  const overlay = scene.add.container(width / 2, height / 2).setDepth(500);
  scene.cardDetailOverlay = overlay;

  // Dim background
  const blocker = scene.add.graphics();
  blocker.fillStyle(0x000000, 0.7);
  blocker.fillRect(-width / 2, -height / 2, width, height);
  overlay.add(blocker);

  // Panel
  const panel = scene.add.graphics();
  panel.fillStyle(0x0d121f, 0.97);
  panel.lineStyle(2, 0xffbb00, 1);
  panel.fillRoundedRect(-110, -155, 220, 310, 12);
  panel.strokeRoundedRect(-110, -155, 220, 310, 12);
  overlay.add(panel);

  // Large cat sprite
  const catContainer = scene.add.container(0, -60);
  catContainer.setScale(1.8);
  overlay.add(catContainer);

  const mapEntry = getCatCardFrame(catId);
  const catSprite = scene.add.sprite(0, 0, mapEntry.sheet, mapEntry.frame);
  catSprite.setOrigin(0.5);
  catContainer.add(catSprite);

  if (scene.holographicCats.has(catId)) {
    const holo = scene.add.image(0, 0, 'holo_card_overlay').setAlpha(0.58);
    holo.setBlendMode(Phaser.BlendModes.ADD);
    catContainer.add(holo);
  }

  // Name
  overlay.add(scene.add.text(0, 60, cat.name.toUpperCase(), {
    fontFamily: 'monospace',
    fontSize: '15px', color: '#ffbb00', fontStyle: 'bold',
  }).setOrigin(0.5));

  // Description
  overlay.add(scene.add.text(0, 100, cat.description, {
    fontFamily: 'monospace',
    fontSize: '10px', color: '#ffffff', wordWrap: { width: 180 }, align: 'center',
  }).setOrigin(0.5));

  // Trigger type
  const triggerLabel = cat.trigger === 'onCardScored' ? 'Trigger: When Card Scores' : 'Trigger: Hand Evaluation';
  overlay.add(scene.add.text(0, 135, triggerLabel, {
    fontFamily: 'monospace',
    fontSize: '9px', color: '#94a3b8',
  }).setOrigin(0.5));

  // Tap-to-close
  blocker.setInteractive(new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height), Phaser.Geom.Rectangle.Contains);
  blocker.on('pointerdown', () => { overlay.destroy(); scene.cardDetailOverlay = null; });

  scene.tweens.add({ targets: overlay, scaleX: 1, scaleY: 1, alpha: 1, from: 0, duration: 180, ease: 'Back.easeOut' });
}

// ─── Cat Swap Overlay ────────────────────────────────────────────────────────
// Opened from the between-turn SWAP CATS button. Player can make one swap.
export function showCatSwapOverlay(scene: CardBattleScene): void {
  if (!scene.isCatSwapPhase) {
    scene.showFloatingText(scene.scale.width / 2, scene.scale.height / 2 - 60, 'Swap cats after a showdown!', '#ff8800');
    return;
  }
  if (scene.catSwapUsedThisHand) {
    scene.showFloatingText(scene.scale.width / 2, scene.scale.height / 2 - 60, 'Already swapped this hand!', '#ff3333');
    return;
  }
  if (scene.catSwapOverlay) scene.catSwapOverlay.destroy();

  const { width, height } = scene.scale;
  const overlay = scene.add.container(width / 2, height / 2).setDepth(400);
  scene.catSwapOverlay = overlay;

  const blocker = scene.add.graphics();
  blocker.fillStyle(0x000000, 0.75);
  blocker.fillRect(-width / 2, -height / 2, width, height);
  overlay.add(blocker);

  const panel = scene.add.graphics();
  panel.fillStyle(0x0c071e, 0.97);
  panel.lineStyle(3, 0x00ffee, 1);
  panel.fillRect(-width * 0.46, -height * 0.44, width * 0.92, height * 0.88);
  panel.strokeRect(-width * 0.46, -height * 0.44, width * 0.92, height * 0.88);
  overlay.add(panel);

  overlay.add(scene.add.text(0, -height * 0.38, 'SWAP A CAT CARD', {
    fontFamily: '"Jersey 10", "VT323", monospace', fontSize: '18px', color: '#ffff00',
    stroke: '#ff00ff', strokeThickness: 1,
  }).setOrigin(0.5));

  overlay.add(scene.add.text(0, -height * 0.32, 'SELECT EQUIPPED SLOT // SELECT REPLACEMENT', {
    fontFamily: 'monospace', fontSize: '9px', color: '#00ffee',
  }).setOrigin(0.5));

  let selectedSlotIdx = -1;

  // Draw equipped cats
  const catScale = scene.getCardScale() * 0.85;
  const catW = 59 * catScale;

  scene.equippedCats.forEach((catId, slotIdx) => {
    const cat = catId ? COMPANION_CATS[catId] : null;
    const rx = (-1 + slotIdx) * (catW + 12);
    const ry = -height * 0.17;

    const slot = scene.add.graphics();
    slot.lineStyle(2, 0x00ffee, 0.5);
    slot.strokeRoundedRect(-catW / 2, -45 * catScale, catW, 91 * catScale, 5);
    overlay.add(slot);

    const label = scene.add.text(rx, ry - 50 * catScale - 12, cat ? cat.name : 'Empty', {
      fontFamily: 'monospace', fontSize: '9px', color: '#00ffee',
    }).setOrigin(0.5);
    overlay.add(label);

    if (cat) {
      const frame = getCatCardFrame(catId);
      overlay.add(scene.add.sprite(rx, ry, frame.sheet, frame.frame).setScale(catScale));
      if (scene.holographicCats.has(catId)) {
        const holo = scene.add.image(rx, ry, 'holo_card_overlay').setScale(catScale).setAlpha(0.58);
        holo.setBlendMode(Phaser.BlendModes.ADD);
        overlay.add(holo);
      }
    }

    const hitZone = scene.add.graphics().setPosition(rx, ry);
    hitZone.fillStyle(0xffffff, 0.001);
    hitZone.fillRect(-catW / 2, -45 * catScale, catW, 91 * catScale);
    hitZone.setInteractive(new Phaser.Geom.Rectangle(-catW / 2, -45 * catScale, catW, 91 * catScale), Phaser.Geom.Rectangle.Contains);
    hitZone.on('pointerdown', () => {
      selectedSlotIdx = slotIdx;
      slot.clear();
      slot.lineStyle(3, 0xffbb00, 1.0);
      slot.strokeRoundedRect(-catW / 2, -45 * catScale, catW, 91 * catScale, 5);
    });
    overlay.add(hitZone);
    slot.setPosition(rx, ry);
  });

  // Draw owned cats (the inventory)
  const ownedY = height * 0.05;
  overlay.add(scene.add.text(0, ownedY - 20, 'AVAILABLE CAT CARDS', {
    fontFamily: 'monospace', fontSize: '9px', color: '#ff00ff',
  }).setOrigin(0.5));

  const availableCats = scene.ownedCats.filter((catId) => !scene.equippedCats.includes(catId));
  const perRow = Math.floor(width * 0.88 / (catW + 10));
  availableCats.forEach((catId, oi) => {
    const cat = COMPANION_CATS[catId];
    if (!cat) return;
    const col = oi % perRow;
    const row = Math.floor(oi / perRow);
    const ox = (-((Math.min(availableCats.length, perRow) - 1) / 2) + col) * (catW + 10);
    const oy = ownedY + row * (91 * catScale + 28);

    const isEquipped = scene.equippedCats.includes(catId);

    const bg = scene.add.graphics().setPosition(ox, oy);
    bg.lineStyle(1, isEquipped ? 0x555555 : 0xffbb00, isEquipped ? 0.4 : 0.7);
    bg.strokeRoundedRect(-catW / 2, -45 * catScale, catW, 91 * catScale, 5);
    overlay.add(bg);

    const frame = getCatCardFrame(catId);
    overlay.add(scene.add.sprite(ox, oy, frame.sheet, frame.frame).setScale(catScale));
    if (scene.holographicCats.has(catId)) {
      const holo = scene.add.image(ox, oy, 'holo_card_overlay').setScale(catScale).setAlpha(0.58);
      holo.setBlendMode(Phaser.BlendModes.ADD);
      overlay.add(holo);
    }

    const nm = scene.add.text(ox, oy + 55 * catScale, cat.name, {
      fontFamily: 'monospace', fontSize: '8px', color: isEquipped ? '#555555' : '#ffffff',
      wordWrap: { width: catW + 4 }, align: 'center',
    }).setOrigin(0.5);
    overlay.add(nm);

    if (!isEquipped) {
      const hz = scene.add.graphics().setPosition(ox, oy);
      hz.fillStyle(0xffffff, 0.001);
      hz.fillRect(-catW / 2, -45 * catScale, catW, 91 * catScale);
      hz.setInteractive(new Phaser.Geom.Rectangle(-catW / 2, -45 * catScale, catW, 91 * catScale), Phaser.Geom.Rectangle.Contains);
      hz.on('pointerdown', () => {
        if (selectedSlotIdx < 0) {
          scene.showFloatingText(width / 2, height / 2 - 30, 'Select a slot first!', '#ff8800');
          return;
        }
        // Perform swap
        scene.equippedCats[selectedSlotIdx] = catId;
        scene.catSwapUsedThisHand = true;
        localStorage.setItem('player_companion_cats', JSON.stringify(scene.equippedCats));
        scene.renderEquippedCompanionCats();
        scene.hideCatSwapButton();
        overlay.destroy();
        scene.catSwapOverlay = null;
        scene.showFloatingText(width / 2, height / 2 - 60, `Swapped in ${cat.name}!`, '#00ffee');
      });
      overlay.add(hz);
    }
  });

  // Close button
  const closeBtn = scene.add.container(0, height * 0.42);
  const closeBg = scene.add.graphics();
  closeBg.fillStyle(0x111827, 1);
  closeBg.lineStyle(2, 0xff0055, 1);
  closeBg.fillRect(-50, -16, 100, 32);
  closeBg.strokeRect(-50, -16, 100, 32);
  closeBtn.add(closeBg);
  closeBtn.add(scene.add.text(0, 0, 'CLOSE', { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff' }).setOrigin(0.5));
  closeBtn.setInteractive(new Phaser.Geom.Rectangle(-50, -16, 100, 32), Phaser.Geom.Rectangle.Contains);
  closeBtn.on('pointerdown', () => { overlay.destroy(); scene.catSwapOverlay = null; });
  overlay.add(closeBtn);
}

// ─── Companions Overlay ───────────────────────────────────────────────────────
export function showCompanionsOverlay(scene: CardBattleScene): void {
  if (scene.companionsOverlayContainer) {
    scene.companionsOverlayContainer.destroy();
  }

  const { width, height } = scene.scale;
  const overlay = scene.add.container(width / 2, height / 2);
  overlay.setDepth(1000); // Very high depth
  scene.companionsOverlayContainer = overlay;

  // Dark backdrop
  const backdrop = scene.add.graphics();
  backdrop.fillStyle(0x000000, 0.8);
  backdrop.fillRect(-width / 2, -height / 2, width, height);
  backdrop.setInteractive(
    new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
    Phaser.Geom.Rectangle.Contains
  );
  overlay.add(backdrop);

  // Modal background
  const bgWidth = Math.min(width * 0.95, 540);
  const bgHeight = Math.min(height * 0.9, 440);
  const modalBg = scene.add.graphics();
  modalBg.fillStyle(0x0d0c15, 0.98);
  modalBg.lineStyle(3, 0xffbb00, 1.0);
  modalBg.fillRoundedRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight, 12);
  modalBg.strokeRoundedRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight, 12);
  overlay.add(modalBg);

  // Title
  const title = scene.add.text(0, -bgHeight / 2 + 25, 'CAT CARDS COLLECTION', {
    fontFamily: 'monospace',
    fontSize: '18px',
    color: '#ffbb00',
    fontStyle: 'bold'
  }).setOrigin(0.5);
  overlay.add(title);

  // Close button (discards changes)
  const closeBtn = scene.add.container(bgWidth / 2 - 25, -bgHeight / 2 + 25);
  const closeBg = scene.add.graphics();
  closeBg.fillStyle(0xff3333, 0.8);
  closeBg.fillCircle(0, 0, 12);
  closeBtn.add(closeBg);
  const closeText = scene.add.text(0, 0, 'X', {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#ffffff',
    fontStyle: 'bold'
  }).setOrigin(0.5);
  closeBtn.add(closeText);
  closeBtn.setInteractive(new Phaser.Geom.Circle(0, 0, 12), Phaser.Geom.Circle.Contains);
  closeBtn.on('pointerover', () => closeBtn.setScale(1.1));
  closeBtn.on('pointerout', () => closeBtn.setScale(1.0));
  closeBtn.on('pointerdown', () => {
    overlay.destroy();
    scene.companionsOverlayContainer = null;
  });
  overlay.add(closeBtn);

  // Local temporary equipped list
  let tempEquippedCats = [...scene.equippedCats];
  let contentContainer: Phaser.GameObjects.Container | null = null;

  const drawContent = () => {
    if (contentContainer) {
      contentContainer.destroy();
    }
    contentContainer = scene.add.container(0, 0);
    overlay.add(contentContainer);

    // Subtitle (showing current coins and equipped count)
    const subtitle = scene.add.text(0, -bgHeight / 2 + 50, `Coins: 💰 ${scene.coins}   |   Equipped: ${tempEquippedCats.length}/3`, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#ffffff'
    }).setOrigin(0.5);
    contentContainer.add(subtitle);

    // Filter owned cats
    const ownedCatKeys = (Object.keys(COMPANION_CATS) as CompanionCatId[]).filter(id => scene.ownedCats.includes(id));

    if (ownedCatKeys.length === 0) {
      // Fallback message if collection is empty
      const fallbackText = scene.add.text(0, 0, 'No Cat Cards in your collection yet.\nExplore the hostile planet or win card battles\nto find and claim them permanently!', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#888899',
        align: 'center'
      }).setOrigin(0.5);
      contentContainer.add(fallbackText);
    } else {
      // Render grid of owned cats
      const startY = -bgHeight / 2 + 80;
      const colSpacing = Math.min(255, bgWidth / 2 - 5);
      const totalRows = Math.ceil(ownedCatKeys.length / 2);
      const maxGridHeight = bgHeight - 140; // reserve space for title/subtitle and bottom button
      const rowSpacing = Math.min(65, maxGridHeight / Math.max(1, totalRows));

      ownedCatKeys.forEach((catId, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);

        const x = (col - 0.5) * colSpacing;
        const y = startY + row * rowSpacing + rowSpacing / 2;

        const itemCard = scene.add.container(x, y);
        contentContainer!.add(itemCard);

        const cat = COMPANION_CATS[catId];
        const isEquipped = tempEquippedCats.includes(catId);

        // Card Background
        const cardBg = scene.add.graphics();
        cardBg.fillStyle(isEquipped ? 0x2e1a47 : 0x161525, 0.9);
        cardBg.lineStyle(1.5, isEquipped ? 0xffbb00 : 0x444455, 1.0);
        cardBg.fillRoundedRect(-120, -rowSpacing / 2 + 2, 240, rowSpacing - 4, 6);
        cardBg.strokeRoundedRect(-120, -rowSpacing / 2 + 2, 240, rowSpacing - 4, 6);
        itemCard.add(cardBg);

        // Cat Name
        const catName = scene.add.text(-110, -rowSpacing / 2 + 6, cat.name, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: isEquipped ? '#ffbb00' : '#ffffff',
          fontStyle: 'bold'
        });
        itemCard.add(catName);

        // Cat Description (wrap text)
        const catDesc = scene.add.text(-110, -rowSpacing / 2 + 20, cat.description, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#aaaaaa',
          wordWrap: { width: 140 }
        });
        itemCard.add(catDesc);

        // Button container on the right side of card
        const btnX = 75;
        const btnY = 0;
        const btnContainer = scene.add.container(btnX, btnY);
        itemCard.add(btnContainer);

        const btnBg = scene.add.graphics();
        btnContainer.add(btnBg);

        const btnText = scene.add.text(0, 0, '', {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#ffffff',
          fontStyle: 'bold'
        }).setOrigin(0.5);
        btnContainer.add(btnText);

        // Action logic
        let btnAction = () => {};

        if (isEquipped) {
          btnBg.fillStyle(0xcc3333, 1.0);
          btnBg.fillRoundedRect(-35, -10, 70, 20, 4);
          btnText.setText('UNEQUIP');

          btnAction = () => {
            tempEquippedCats = tempEquippedCats.filter((id) => id !== catId);
            drawContent();
          };
        } else {
          const canEquip = tempEquippedCats.length < 3;
          btnBg.fillStyle(canEquip ? 0xffbb00 : 0x555555, 1.0);
          btnBg.fillRoundedRect(-35, -10, 70, 20, 4);
          btnText.setColor(canEquip ? '#000000' : '#ffffff');
          btnText.setText('EQUIP');

          if (canEquip) {
            btnAction = () => {
              tempEquippedCats.push(catId);
              drawContent();
            };
          }
        }

        if (btnAction) {
          btnContainer.setInteractive(new Phaser.Geom.Rectangle(-35, -10, 70, 20), Phaser.Geom.Rectangle.Contains);
          btnContainer.on('pointerover', () => btnContainer.setScale(1.05));
          btnContainer.on('pointerout', () => btnContainer.setScale(1.0));
          btnContainer.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            pointer.event.stopPropagation();
            btnAction();
          });
        }
      });
    }

    // Add a Confirm button at the bottom
    const confirmBtn = scene.add.container(0, bgHeight / 2 - 35);
    const confirmBg = scene.add.graphics();
    confirmBg.fillStyle(0x00cc44, 1.0);
    confirmBg.lineStyle(2, 0xffffff, 1.0);
    confirmBg.fillRoundedRect(-60, -18, 120, 36, 6);
    confirmBg.strokeRoundedRect(-60, -18, 120, 36, 6);
    confirmBtn.add(confirmBg);

    const confirmText = scene.add.text(0, 0, 'CONFIRM', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    confirmBtn.add(confirmText);
    contentContainer.add(confirmBtn);

    confirmBtn.setInteractive(new Phaser.Geom.Rectangle(-60, -18, 120, 36), Phaser.Geom.Rectangle.Contains);
    confirmBtn.on('pointerover', () => confirmBtn.setScale(1.05));
    confirmBtn.on('pointerout', () => confirmBtn.setScale(1.0));
    confirmBtn.on('pointerdown', () => {
      scene.equippedCats = [...tempEquippedCats];
      scene.savePlayerData();
      overlay.destroy();
      scene.companionsOverlayContainer = null;
      scene.renderEquippedCompanionCats();
      scene.drawPlaySlots();
      scene.calculateCurrentHandPreview();
    });
  };

  drawContent();
}

// ─── Prize Selection Overlay ──────────────────────────────────────────────────
export function showPrizeSelection(scene: CardBattleScene): void {
  // Clear the center board result banner
  if (scene.resultBanner) {
    scene.resultBanner.destroy();
  }

  // Hide the game board now that the placement phase is over
  if (scene.gameboardSprite) {
    scene.gameboardSprite.setVisible(false);
  }

  const { width, height } = scene.scale;

  // Dynamic overlay size based on screen width
  const bgWidth = Math.min(width * 0.92, 460);
  const bgHeight = 350;

  // Create a new overlay for prize selection
  const prizeContainer = scene.add
    .container(width / 2, height / 2)
    .setScale(0);
  prizeContainer.setDepth(400);

  const prizeBg = scene.add.graphics();
  prizeBg.fillStyle(0x0c071d, 0.95);
  prizeBg.lineStyle(3, 0xffbb00, 1.0);
  prizeBg.fillRoundedRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight, 12);
  prizeBg.strokeRoundedRect(
    -bgWidth / 2,
    -bgHeight / 2,
    bgWidth,
    bgHeight,
    12
  );
  prizeContainer.add(prizeBg);

  const titleText = scene.add
    .text(0, -bgHeight / 2 + 35, '🎁 CHOOSE YOUR PRIZE CARD!', {
      fontFamily: 'monospace',
      fontSize: width < 500 ? '16px' : '22px',
      color: '#ffbb00',
    })
    .setOrigin(0.5);
  prizeContainer.add(titleText);

  // Pick 3 random cards from the defeated bot's hand
  const prizeCards: Card[] = [];
  if (
    scene.challenger &&
    scene.challenger.cards &&
    scene.challenger.cards.length > 0
  ) {
    const challengerCards = [...scene.challenger.cards];
    Phaser.Utils.Array.Shuffle(challengerCards);
    prizeCards.push(...challengerCards.slice(0, 3));
  } else {
    // Fallback just in case
    prizeCards.push(makeCard('water', 5));
    prizeCards.push(makeCard('sakura', 7));
    prizeCards.push(makeCard('ghost', 11));
  }

  const cardSprites: Phaser.GameObjects.Container[] = [];
  const cardScale = scene.getCardScale();
  const spacing = 120 * cardScale;

  // Load deck counts from local storage
  const deckCountMap = new Map<string, number>();
  try {
    const deckStr = localStorage.getItem('player_card_deck') || '[]';
    const deck = JSON.parse(deckStr) as Record<string, unknown>[];
    deck.forEach((c) => {
      const hydrated = ensureCard(c as Partial<Card> & { number?: number; family?: string; rank?: number; suit?: string });
      const key = `${hydrated.suit}-${hydrated.rank}`;
      deckCountMap.set(key, (deckCountMap.get(key) || 0) + 1);
    });
  } catch (e) {
    console.error('Failed to parse player_card_deck for prize selection', e);
  }

  let selectedPrizeIdx: number | null = null;

  prizeCards.forEach((c, idx) => {
    const rx = (idx - 1) * spacing;
    const ry = -10;

    const cardSprite = scene.createCardSprite(rx, ry, c, false);
    cardSprite.setScale(cardScale);
    prizeContainer.add(cardSprite);
    cardSprites.push(cardSprite);

    // Inventory count badge
    const count = deckCountMap.get(`${c.suit}-${c.rank}`) || 0;
    const badgeContainer = scene.add.container(rx + 22 * cardScale, ry - 36 * cardScale);
    const badgeBg = scene.add.graphics();
    badgeBg.fillStyle(0xec4899, 1.0); 
    badgeBg.fillRoundedRect(-12, -8, 24, 16, 6);
    badgeContainer.add(badgeBg);

    const badgeText = scene.add.text(0, 0, `x${count}`, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    badgeContainer.add(badgeText);
    prizeContainer.add(badgeContainer);

    cardSprite.setInteractive(
      new Phaser.Geom.Rectangle(-29.5, -45.5, 59, 91),
      Phaser.Geom.Rectangle.Contains
    );

    cardSprite.on('pointerover', () => {
      if (selectedPrizeIdx === idx) return;
      scene.tweens.add({
        targets: cardSprite,
        scale: cardScale * 1.08,
        y: ry - 8,
        duration: 150,
      });
    });

    cardSprite.on('pointerout', () => {
      if (selectedPrizeIdx === idx) return;
      scene.tweens.add({
        targets: cardSprite,
        scale: cardScale,
        y: ry,
        duration: 150,
      });
    });

    cardSprite.on('pointerdown', () => {
      selectedPrizeIdx = idx;
      enableClaimButton();

      // Highlight selection visually by popping/scaling up, resetting others
      cardSprites.forEach((s, sIdx) => {
        if (sIdx === idx) {
          scene.tweens.add({
            targets: s,
            scale: cardScale * 1.12,
            y: ry - 10,
            duration: 150,
          });
        } else {
          scene.tweens.add({
            targets: s,
            scale: cardScale,
            y: ry,
            duration: 150,
          });
        }
      });
    });
  });

  // Add Claim Button
  const claimBtn = scene.add.container(0, bgHeight / 2 - 45);
  const claimBg = scene.add.graphics();
  // Default disabled style
  claimBg.fillStyle(0x555555, 0.5);
  claimBg.lineStyle(2, 0x888888, 1);
  claimBg.fillRoundedRect(-60, -20, 120, 40, 6);
  claimBg.strokeRoundedRect(-60, -20, 120, 40, 6);
  claimBtn.add(claimBg);

  const claimText = scene.add
    .text(0, 0, 'CLAIM', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#888888',
    })
    .setOrigin(0.5);
  claimBtn.add(claimText);
  prizeContainer.add(claimBtn);

  const enableClaimButton = () => {
    claimBg.clear();
    claimBg.fillStyle(0x00cc44, 1.0);
    claimBg.lineStyle(2, 0xffffff, 1.0);
    claimBg.fillRoundedRect(-60, -20, 120, 40, 6);
    claimBg.strokeRoundedRect(-60, -20, 120, 40, 6);
    claimText.setColor('#ffffff');

    claimBtn.setInteractive(
      new Phaser.Geom.Rectangle(-60, -20, 120, 40),
      Phaser.Geom.Rectangle.Contains
    );

    claimBtn.on('pointerover', () => claimBtn.setScale(1.06));
    claimBtn.on('pointerout', () => claimBtn.setScale(1.0));
  };

  claimBtn.on('pointerdown', () => {
    if (selectedPrizeIdx === null) return;

    // Disable input
    cardSprites.forEach((s) => s.disableInteractive());
    claimBtn.disableInteractive();

    const chosenCard = prizeCards[selectedPrizeIdx];
    const chosenSprite = cardSprites[selectedPrizeIdx];
    if (!chosenCard || !chosenSprite) return;

    // Add to deck and save
    scene.playerDeck.push(chosenCard);

    // Award a new random Cat Card on victory if any are unowned
    const allCatIds: CompanionCatId[] = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12', 'c13', 'c14', 'c15', 'c16', 'c17', 'c18', 'c19', 'c20', 'c21', 'c22', 'c23', 'c24', 'c25', 'c26', 'c27', 'c28', 'c29', 'c30', 'c31', 'c32', 'c33', 'c34', 'c35', 'c36', 'c37', 'c38', 'c39'];
    const unowned = allCatIds.filter(id => !scene.ownedCats.includes(id));
    if (unowned.length > 0) {
      const newCatId = Phaser.Math.RND.pick(unowned);
      scene.ownedCats.push(newCatId);
      reportPlayerProgress({ catsCollected: 1, xp: 25 });
      scene.showFloatingText(width / 2, height / 2 - 120, `UNLOCKED COMPANION: ${COMPANION_CATS[newCatId].name}!`, '#ffbb00');
    }

    scene.savePlayerData();

    // Particle explosion
    scene.emitter.emitParticleAt(
      chosenSprite.x + width / 2,
      chosenSprite.y + height / 2,
      30
    );

    // Bounce selected card, fade others
    cardSprites.forEach((s, sIdx) => {
      if (sIdx === selectedPrizeIdx) {
        scene.tweens.add({
          targets: s,
          scale: cardScale * 1.3,
          angle: 360,
          duration: 600,
          ease: 'Back.easeOut',
          onComplete: () => {
            // Fade out container and show leaderboard
            scene.tweens.add({
              targets: prizeContainer,
              alpha: 0,
              scale: 0.9,
              duration: 250,
              onComplete: () => {
                prizeContainer.destroy();
                scene.showCardLeaderboard();
              },
            });
          },
        });
      } else {
        scene.tweens.add({
          targets: s,
          alpha: 0,
          scale: 0.7,
          duration: 350,
        });
      }
    });
  });

  scene.tweens.add({
    targets: prizeContainer,
    scale: 1.0,
    duration: 500,
    ease: 'Back.easeOut',
  });
}

export type OpponentPrize =
  | { kind: 'standard'; card: Card }
  | { kind: 'cat'; catId: CompanionCatId };

export function showOpponentPrizeSelection(
  scene: CardBattleScene,
  onClaim: (prize: OpponentPrize) => void
): void {
  scene.resultBanner?.setVisible(false);
  const { width, height } = scene.scale;
  const pool: OpponentPrize[] = [
    ...scene.botHand.map((card) => ({ kind: 'standard' as const, card })),
    ...scene.botEquippedCats.map((catId) => ({ kind: 'cat' as const, catId })),
  ];
  const choices = Phaser.Utils.Array.Shuffle(pool).slice(0, 3);
  const overlay = scene.add.container(0, 0).setDepth(500);
  const shade = scene.add.rectangle(width / 2, height / 2, width, height, 0x02040d, 0.78);
  overlay.add(shade);
  const pileSprites: Phaser.GameObjects.Container[] = [];

  pool.forEach((prize, index) => {
    const x = width / 2 + (index - (pool.length - 1) / 2) * 54;
    const y = height * 0.23;
    const holder = scene.add.container(x, y);
    if (prize.kind === 'standard') {
      holder.add(scene.createCardSprite(0, 0, prize.card, false));
    } else {
      const frame = getCatCardFrame(prize.catId);
      holder.add(scene.add.sprite(0, 0, frame.sheet, frame.frame));
    }
    holder.setScale(0.72);
    overlay.add(holder);
    pileSprites.push(holder);
  });

  const reveal = (): void => {
    pileSprites.forEach((sprite) => sprite.destroy());
    const panel = scene.add.container(width / 2, height / 2).setScale(0);
    const panelWidth = Math.min(460, width - 20);
    panel.add(scene.add.rectangle(-6, -6, panelWidth, 330, 0x080c18, 0)
      .setStrokeStyle(4, 0xffbb00));
    panel.add(scene.add.rectangle(6, 6, panelWidth, 330, 0x080c18, 0)
      .setStrokeStyle(4, 0xff00ff));
    panel.add(scene.add.rectangle(0, 0, panelWidth, 330, 0x080c18, 0.99)
      .setStrokeStyle(4, 0x00ffee));
    panel.add(scene.add.text(0, -132, 'PICK ONE OF THEIR CARDS! ~MEOW', {
      fontFamily: 'monospace', fontSize: width < 500 ? '15px' : '20px', color: '#ffbb00',
    }).setOrigin(0.5));
    overlay.add(panel);

    let selected = -1;
    const sprites: Phaser.GameObjects.Container[] = [];
    const scale = Math.min(scene.getCardScale(), 1.05);
    const spacing = Math.min(125 * scale, (width - 80) / 3);
    choices.forEach((prize, index) => {
      const x = (index - 1) * spacing;
      const card = scene.add.container(x, -15).setScale(0);
      if (prize.kind === 'standard') {
        card.add(scene.createCardSprite(0, 0, prize.card, false));
      } else {
        const frame = getCatCardFrame(prize.catId);
        card.add(scene.add.sprite(0, 0, frame.sheet, frame.frame));
        card.add(scene.add.text(0, 61, COMPANION_CATS[prize.catId].name.toUpperCase(), {
          fontFamily: 'monospace', fontSize: '9px', color: '#ffff00', align: 'center',
          wordWrap: { width: 90 },
        }).setOrigin(0.5));
      }
      card.setSize(59, 110).setInteractive({ useHandCursor: true });
      card.on('pointerdown', () => {
        selected = index;
        sprites.forEach((sprite, spriteIndex) => scene.tweens.add({
          targets: sprite,
          scale: spriteIndex === selected ? scale * 1.12 : scale,
          y: spriteIndex === selected ? -27 : -15,
          duration: 140,
        }));
        claimButton.setAlpha(1).setInteractive({ useHandCursor: true });
      });
      panel.add(card);
      sprites.push(card);
      scene.tweens.add({ targets: card, scale, duration: 360, delay: 120 + index * 130, ease: 'Back.easeOut' });
    });

    panel.add(scene.add.rectangle(4, 129, 130, 40, 0xffbb00));
    const claimButton = scene.add.rectangle(0, 125, 130, 40, 0xd90053)
      .setStrokeStyle(2, 0x00ffee).setAlpha(0.45);
    panel.add([claimButton, scene.add.text(0, 125, 'CLAIM', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff',
    }).setOrigin(0.5)]);
    claimButton.once('pointerdown', () => {
      const prize = choices[selected];
      if (!prize) return;
      claimButton.disableInteractive();
      onClaim(prize);
      scene.tweens.add({ targets: overlay, alpha: 0, duration: 250, onComplete: () => overlay.destroy(true) });
    });
    scene.tweens.add({ targets: panel, scale: 1, duration: 350, ease: 'Back.easeOut' });
  };

  scene.tweens.add({
    targets: pileSprites,
    x: width / 2,
    y: height / 2,
    angle: 360,
    duration: 650,
    delay: scene.tweens.stagger(45),
    ease: 'Cubic.easeIn',
    onComplete: reveal,
  });
}
