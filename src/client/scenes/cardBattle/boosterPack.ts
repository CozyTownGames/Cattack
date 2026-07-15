import * as Phaser from 'phaser';
import { Card, CardSuit, makeCard } from './cardRules';
import { COMPANION_CATS, CompanionCatId } from './companionCats';
import { reportPlayerProgress } from '../../playerProgress';
import { isSoundMuted } from '../../soundSettings';

export interface BoosterScene extends Phaser.Scene {
  playerDeck: Card[];
  ownedCats: string[];
  equippedCats: string[];
  savePlayerData(): void;
  fetchChallengerAndStart(): void;
  emitter: { emitParticleAt(x: number, y: number, count: number): void };
}

const CAT_FRAME_MAP: Record<string, { sheet: string; frame: number }> = {
  'c1': { sheet: 'cat_cards_tiles', frame: 4 },
  'c2': { sheet: 'cat_cards_tiles', frame: 0 },
  'c3': { sheet: 'cat_cards_tiles', frame: 2 },
  'c4': { sheet: 'cat_cards_tiles', frame: 1 },
  'c5': { sheet: 'cat_cards_tiles', frame: 3 },
  'c11': { sheet: 'cat_cards_tiles', frame: 10 },
};

function playBoosterChime(
  frequency: number,
  type: 'reveal' | 'open' | 'confirm'
) {
  try {
    if (isSoundMuted()) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ac = new AudioCtx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);

    if (type === 'reveal') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequency, ac.currentTime);
      gain.gain.setValueAtTime(0.08, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4);
      osc.start();
      osc.stop(ac.currentTime + 0.4);
    } else if (type === 'open') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ac.currentTime + 0.5);
      gain.gain.setValueAtTime(0.1, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.6);
      osc.start();
      osc.stop(ac.currentTime + 0.6);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ac.currentTime);
      osc.frequency.setValueAtTime(554.37, ac.currentTime + 0.1);
      osc.frequency.setValueAtTime(659.25, ac.currentTime + 0.2);
      osc.frequency.setValueAtTime(880, ac.currentTime + 0.3);
      gain.gain.setValueAtTime(0.08, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5);
      osc.start();
      osc.stop(ac.currentTime + 0.5);
    }
  } catch (_) {
    /* silently skip */
  }
}

export function showBoosterPackOpeningLegacy(scene: BoosterScene): void {
  const { width, height } = scene.scale;

  // Create overlay container
  const overlay = scene.add.container(width / 2, height / 2).setDepth(200);

  // Deep galaxy background
  const blocker = scene.add.graphics();
  blocker.fillStyle(0x05030a, 0.97);
  blocker.fillRect(-width / 2, -height / 2, width, height);
  overlay.add(blocker);

  const title = scene.add
    .text(0, -height * 0.38, '🎒 STARTER BOOSTER PACK', {
      fontFamily: '"Pixelify Sans", "VT323", monospace',
      fontSize: width < 500 ? '20px' : '28px',
      color: '#00ffee',
      fontStyle: 'bold',
    })
    .setOrigin(0.5)
    .setAlpha(0);
  overlay.add(title);

  // Glow behind the pack
  const glow = scene.add.graphics();
  glow.fillStyle(0x7c3aed, 0.2);
  glow.fillCircle(0, 0, 150);
  overlay.add(glow);

  // Setup the pack container
  const packGroup = scene.add.container(0, 0);
  const packSprite = scene.add.sprite(0, 0, 'starter_pack');
  const packScale = Phaser.Math.Clamp(width / 420, 1.2, 1.9);
  packSprite.setScale(packScale);
  packGroup.add(packSprite);

  const packWidth = packSprite.width * packScale;
  const packHeight = packSprite.height * packScale;

  const tapText = scene.add
    .text(0, 160, 'TAP PACK TO OPEN', {
      fontFamily: '"Pixelify Sans", "VT323", monospace',
      fontSize: '15px',
      color: '#00ffee',
      fontStyle: 'bold',
    })
    .setOrigin(0.5);
  scene.tweens.add({
    targets: tapText,
    alpha: 0.3,
    yoyo: true,
    repeat: -1,
    duration: 700,
  });
  packGroup.add(tapText);
  overlay.add(packGroup);

  // Gentle float
  scene.tweens.add({
    targets: packGroup,
    y: -12,
    yoyo: true,
    repeat: -1,
    duration: 1600,
    ease: 'Sine.easeInOut',
  });

  // Pick the 3 starter cats
  const suitCats = ['c2', 'c3', 'c4', 'c5'];
  const randomSuitCat = suitCats[
    Math.floor(Math.random() * suitCats.length)
  ] as CompanionCatId;
  const boosterCats: CompanionCatId[] = ['c1', 'c11', randomSuitCat];

  let packOpened = false;

  const openPack = () => {
    if (packOpened) return;
    packOpened = true;

    scene.tweens.killTweensOf(packGroup);

    // Balatro style pack rumbling / shaking before explosion
    scene.tweens.add({
      targets: packGroup,
      x: { from: -10, to: 10 },
      y: { from: -6, to: 6 },
      angle: { from: -5, to: 5 },
      duration: 50,
      repeat: 12,
      yoyo: true,
      onComplete: () => {
        // Big flash & explosion
        scene.emitter.emitParticleAt(width / 2, height / 2, 80);

        // Flash overlay effect
        const flashGraphic = scene.add.graphics();
        flashGraphic.fillStyle(0xffffff, 1.0);
        flashGraphic.fillRect(-width / 2, -height / 2, width, height);
        overlay.add(flashGraphic);
        scene.tweens.add({
          targets: flashGraphic,
          alpha: 0,
          duration: 350,
          onComplete: () => flashGraphic.destroy(),
        });

        scene.tweens.add({
          targets: packGroup,
          scale: 0,
          alpha: 0,
          duration: 200,
          onComplete: () => {
            packGroup.destroy();
            scene.tweens.add({ targets: title, alpha: 1, duration: 300 });
            startSequentialReveal(0);
          },
        });
      },
    });
  };

  packGroup.setSize(packWidth, packHeight);
  packGroup.setInteractive(
    new Phaser.Geom.Rectangle(
      -packWidth / 2,
      -packHeight / 2,
      packWidth,
      packHeight
    ),
    Phaser.Geom.Rectangle.Contains
  );
  packGroup.on('pointerdown', openPack);

  // Sequential Reveal Flow
  const startSequentialReveal = (index: number) => {
    if (index >= boosterCats.length) {
      showFinalSummary();
      return;
    }

    const catId = boosterCats[index]!;
    const catData = COMPANION_CATS[catId];

    // Create showcase container
    const showcase = scene.add.container(0, 20).setAlpha(0);
    overlay.add(showcase);

    // Subtle colored spotlight background matching card suit
    const spot = scene.add.graphics();
    spot.fillStyle(0x7c3aed, 0.15);
    spot.fillCircle(0, -60, 160);
    showcase.add(spot);

    // Large Card Face down container
    const cardContainer = scene.add.container(0, -60);
    const cardGraphics = scene.add.graphics();
    cardContainer.add(cardGraphics);
    showcase.add(cardContainer);

    let backSprite: Phaser.GameObjects.Sprite | null = null;
    if (scene.textures.exists('card_skins')) {
      backSprite = scene.add.sprite(0, 0, 'card_skins', 0);
      backSprite.setOrigin(0.5);
      cardContainer.add(backSprite);
    } else {
      // Fallback card back
      cardGraphics.fillStyle(0x110729);
      cardGraphics.fillRoundedRect(-29.5, -45.5, 59, 91, 6);
      cardGraphics.lineStyle(2, 0x8800ff, 1);
      cardGraphics.strokeRoundedRect(-29.5, -45.5, 59, 91, 6);
      const ufoText = scene.add
        .text(0, 0, '🛸', { fontSize: '20px' })
        .setOrigin(0.5);
      cardContainer.add(ufoText);
      cardContainer.setData('ufoText', ufoText);
    }

    // Card scale
    const bigScale = 2.1;
    cardContainer.setScale(bigScale);

    // Balatro card wobble/float tween
    scene.tweens.add({
      targets: cardContainer,
      y: -65,
      angle: { from: -2, to: 2 },
      yoyo: true,
      repeat: -1,
      duration: 1200,
      ease: 'Sine.easeInOut',
    });

    // Details box panel
    const infoPanel = scene.add.graphics();
    infoPanel.fillStyle(0x0e091d, 0.95);
    infoPanel.lineStyle(2, 0xffbb00, 0.8);
    infoPanel.fillRoundedRect(-140, 80, 280, 95, 8);
    infoPanel.strokeRoundedRect(-140, 80, 280, 95, 8);
    showcase.add(infoPanel);

    // Title / subtitle text
    const revealInstruction = scene.add
      .text(0, 100, 'TAP CARD TO REVEAL', {
        fontFamily: '"Pixelify Sans", "VT323", monospace',
        fontSize: '13px',
        color: '#00ffee',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    showcase.add(revealInstruction);

    const descText = scene.add
      .text(0, 130, 'Click on the card to unveil its identity.', {
        fontFamily: '"Pixelify Sans", "VT323", monospace',
        fontSize: '11px',
        color: '#888888',
        align: 'center',
        wordWrap: { width: 240 },
      })
      .setOrigin(0.5);
    showcase.add(descText);

    // Fade showcase in
    scene.tweens.add({
      targets: showcase,
      alpha: 1,
      duration: 400,
    });

    let revealed = false;
    cardContainer.setSize(59, 91);
    cardContainer.setInteractive(
      new Phaser.Geom.Rectangle(-29.5, -45.5, 59, 91),
      Phaser.Geom.Rectangle.Contains
    );

    const triggerReveal = () => {
      if (revealed) {
        // Already revealed, tap again moves to next card
        cardContainer.disableInteractive();
        scene.tweens.add({
          targets: showcase,
          alpha: 0,
          scale: 0.85,
          duration: 300,
          onComplete: () => {
            showcase.destroy();
            startSequentialReveal(index + 1);
          },
        });
        return;
      }
      revealed = true;

      // Flip card sound
      playBoosterChime(440 + index * 110, 'reveal');

      // Card Flip animation
      scene.tweens.add({
        targets: cardContainer,
        scaleX: 0,
        duration: 150,
        yoyo: true,
        hold: 40,
        onYoyo: () => {
          // Clear back graphics & UFO text / back sprite
          cardGraphics.clear();
          if (backSprite) {
            backSprite.destroy();
          }
          const ut = cardContainer.getData('ufoText');
          if (ut) {
            ut.destroy();
          }

          // Render front sprite
          const mapEntry = CAT_FRAME_MAP[catId] || {
            sheet: 'cat_cards_tiles',
            frame: 4,
          };
          const frontSprite = scene.add.sprite(
            0,
            0,
            mapEntry.sheet,
            mapEntry.frame
          );
          frontSprite.setOrigin(0.5);
          cardContainer.add(frontSprite);
        },
        onComplete: () => {
          scene.emitter.emitParticleAt(
            width / 2,
            height / 2 - 60 * bigScale,
            20
          );

          // Update details panel info
          revealInstruction.setText(catData.name.toUpperCase());
          revealInstruction.setColor('#ffbb00');
          revealInstruction.setFontSize('15px');

          descText.setText(catData.description);
          descText.setColor('#ffffff');

          // Draw tap to continue instruction below details panel
          const contText = scene.add
            .text(0, 195, 'TAP CARD TO CONTINUE', {
              fontFamily: '"Pixelify Sans", "VT323", monospace',
              fontSize: '11px',
              color: '#aaaaaa',
            })
            .setOrigin(0.5);
          showcase.add(contText);
          scene.tweens.add({
            targets: contText,
            alpha: 0.4,
            yoyo: true,
            repeat: -1,
            duration: 600,
          });
        },
      });
    };

    cardContainer.on('pointerdown', triggerReveal);
  };

  // Final confirmation screen showing all 3 side-by-side
  const showFinalSummary = () => {
    // Reveal confirm chime
    playBoosterChime(0, 'confirm');

    const summaryContainer = scene.add.container(0, 0).setAlpha(0);
    overlay.add(summaryContainer);

    const summaryTitle = scene.add
      .text(0, -130, 'YOUR COMPANION TEAM IS READY!', {
        fontFamily: '"Pixelify Sans", "VT323", monospace',
        fontSize: '16px',
        color: '#ffbb00',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    summaryContainer.add(summaryTitle);

    const cardScale = Phaser.Math.Clamp(
      Math.min(width / 640, height / 500),
      0.75,
      1.4
    );
    const spacingX = 90 * cardScale;

    boosterCats.forEach((catId, idx) => {
      const rx = (idx - 1) * spacingX;
      const ry = -10;

      const container = scene.add.container(rx, ry);
      container.setScale(cardScale);
      summaryContainer.add(container);

      // Render front sprite
      const mapEntry = CAT_FRAME_MAP[catId] || {
        sheet: 'cat_cards_tiles',
        frame: 4,
      };
      const frontSprite = scene.add.sprite(
        0,
        0,
        mapEntry.sheet,
        mapEntry.frame
      );
      frontSprite.setOrigin(0.5);
      container.add(frontSprite);

      // Label below
      const name = COMPANION_CATS[catId]?.name || 'Cat';
      const label = scene.add
        .text(0, 52, name.toUpperCase(), {
          fontFamily: '"Pixelify Sans", "VT323", monospace',
          fontSize: '9px',
          color: '#ffffff',
        })
        .setOrigin(0.5);
      container.add(label);

      // Slide in nicely
      container.y = 100;
      scene.tweens.add({
        targets: container,
        y: ry,
        duration: 400,
        delay: idx * 100,
        ease: 'Back.easeOut',
      });
    });

    // Confirm Button
    const okBtn = scene.add.container(0, height * 0.35);
    const okBg = scene.add.graphics();
    okBg.fillStyle(0x00cc44, 0.95);
    okBg.lineStyle(2, 0xffffff, 1);
    okBg.fillRoundedRect(-70, -20, 140, 40, 6);
    okBg.strokeRoundedRect(-70, -20, 140, 40, 6);
    okBtn.add(okBg);

    const okText = scene.add
      .text(0, 0, 'START GAME', {
        fontFamily: '"Pixelify Sans", "VT323", monospace',
        fontSize: '13px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    okBtn.add(okText);
    summaryContainer.add(okBtn);

    okBtn.setInteractive(
      new Phaser.Geom.Rectangle(-70, -20, 140, 40),
      Phaser.Geom.Rectangle.Contains
    );
    okBtn.on('pointerover', () => okBtn.setScale(1.06));
    okBtn.on('pointerout', () => okBtn.setScale(1.0));

    okBtn.on('pointerdown', () => {
      okBtn.disableInteractive();

      // Behind the scenes, set up a full 52-card starter deck
      const fullStarterDeck: Card[] = [];
      const suits = ['sakura', 'ghost', 'leaf', 'water'] as const;
      for (const suit of suits) {
        for (let rank = 2; rank <= 14; rank++) {
          fullStarterDeck.push(makeCard(suit, rank));
        }
      }
      scene.playerDeck = fullStarterDeck;

      // Assign the 3 starter cats
      const previousCats = new Set(scene.ownedCats);
      const newCatCount = new Set(
        boosterCats.filter((catId) => !previousCats.has(catId))
      ).size;
      scene.ownedCats = [...boosterCats];
      scene.equippedCats = [...boosterCats];

      localStorage.setItem(
        'player_owned_companion_cats',
        JSON.stringify(scene.ownedCats)
      );
      localStorage.setItem(
        'player_companion_cats',
        JSON.stringify(scene.equippedCats)
      );
      reportPlayerProgress({
        catsCollected: newCatCount,
        cardsClaimed: boosterCats.length,
        xp: newCatCount * 25,
      });

      scene.savePlayerData();

      scene.tweens.add({
        targets: overlay,
        alpha: 0,
        scale: 0.9,
        duration: 300,
        onComplete: () => {
          overlay.destroy();
          scene.fetchChallengerAndStart();
        },
      });
    });

    scene.tweens.add({
      targets: summaryContainer,
      alpha: 1,
      duration: 400,
    });
  };
}

export function showBoosterPackOpening(scene: BoosterScene): void {
  const { width, height } = scene.scale;
  const responsiveRoot = scene.add.container(width / 2, height / 2).setDepth(200);
  const overlay = scene.add.container(0, 0);
  const mobileTextObjects: Phaser.GameObjects.Text[] = [];
  let responsiveScale = 1;
  responsiveRoot.add(overlay);
  const resizeOpening = (size: { width: number; height: number }): void => {
    const designWidth = Math.min(width, 460);
    const designHeight = Math.min(height, 500);
    responsiveScale = Math.min(
      1,
      Math.max(0.45, (size.width - 16) / designWidth),
      Math.max(0.45, (size.height - 16) / designHeight)
    );
    responsiveRoot.setPosition(size.width / 2, size.height / 2).setScale(responsiveScale);
    const textScale = size.width <= 480
      ? Math.min(1.55, 1.12 / responsiveScale)
      : 1;
    mobileTextObjects.forEach((text) => text.setScale(textScale));
  };
  resizeOpening({ width: scene.scale.width, height: scene.scale.height });
  scene.scale.on('resize', resizeOpening);
  scene.events.once('shutdown', () => scene.scale.off('resize', resizeOpening));
  let packZone: Phaser.GameObjects.Zone;
  let claimText: Phaser.GameObjects.Text;
  let claimFlashEvent: Phaser.Time.TimerEvent;

  const revealStage = scene.add.container(0, 0).setAlpha(0);
  const nebula = scene.add.graphics();
  nebula.fillStyle(0x4c0519, 0.72);
  nebula.fillEllipse(-width * 0.35, 15, width * 0.9, height * 1.4);
  nebula.fillStyle(0x3b0764, 0.76);
  nebula.fillEllipse(width * 0.35, -10, width * 0.95, height * 1.35);
  nebula.fillStyle(0x12031f, 0.68);
  nebula.fillEllipse(0, height * 0.38, width * 1.2, height * 0.75);
  for (let i = 0; i < 42; i++) {
    const x = Phaser.Math.Between(
      -Math.floor(width / 2),
      Math.floor(width / 2)
    );
    const y = Phaser.Math.Between(
      -Math.floor(height / 2),
      Math.floor(height / 2)
    );
    nebula.fillStyle(
      i % 4 === 0 ? 0xffbbdd : 0xffffff,
      Phaser.Math.FloatBetween(0.25, 0.72)
    );
    nebula.fillCircle(x, y, Phaser.Math.Between(1, 3));
  }
  revealStage.add(nebula);
  overlay.add(revealStage);

  const title = scene.add
    .text(0, -height * 0.4, 'STARTER BOOSTER', {
      fontFamily: 'monospace',
      fontSize: width < 500 ? '20px' : '28px',
      color: '#00ffee',
      fontStyle: 'bold',
    })
    .setOrigin(0.5);
  const subtitle = scene.add
    .text(0, -height * 0.33, '      YOUR 3 CAT CARDS', {
      fontFamily: 'monospace',
      fontSize: width < 500 ? '11px' : '14px',
      color: '#ffbb00',
      letterSpacing: 2,
    })
    .setOrigin(0.5);
  overlay.add([title, subtitle]);

  claimText = scene.add
    .text(-subtitle.width / 2, -height * 0.33, 'CLAIM', {
      fontFamily: 'monospace',
      fontSize: width < 500 ? '11px' : '14px',
      color: '#ffbb00',
      fontStyle: 'bold',
    })
    .setOrigin(0, 0.5);
  overlay.add(claimText);

  let isYellow = true;
  claimFlashEvent = scene.time.addEvent({
    delay: 90,
    callback: () => {
      isYellow = !isYellow;
      claimText.setColor(isYellow ? '#ffbb00' : '#ff00aa');
    },
    loop: true,
  });

  const catCardHelp = scene.add
    .text(0, -height * 0.265, '', {
      fontFamily: 'monospace',
      fontSize: width < 500 ? '9px' : '11px',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: Math.min(470, width - 36) },
    })
    .setOrigin(0.5)
    .setAlpha(0);
  overlay.add(catCardHelp);

  const glow = scene.add.graphics();
  glow.fillStyle(0x7c3aed, 0.24);
  glow.fillCircle(0, 10, Math.min(175, width * 0.32));
  overlay.add(glow);

  const packGroup = scene.add.container(0, 0);
  const packSprite = scene.add.sprite(0, 0, 'starter_pack');
  const packScale = Phaser.Math.Clamp(width / 460, 1.15, 1.75);
  packSprite.setScale(packScale);
  packGroup.add(packSprite);
  const tapText = scene.add
    .text(0, -height * 0.33 + 28, 'TAP PACK TO OPEN', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#00ffee',
      fontStyle: 'bold',
    })
    .setOrigin(0.5);
  overlay.add(tapText);
  overlay.add(packGroup);
  scene.tweens.add({
    targets: tapText,
    alpha: 0.3,
    yoyo: true,
    repeat: -1,
    duration: 650,
  });
  scene.tweens.add({
    targets: packGroup,
    y: -10,
    angle: { from: -1.5, to: 1.5 },
    yoyo: true,
    repeat: -1,
    duration: 1300,
    ease: 'Sine.easeInOut',
  });

  const suitCats: CompanionCatId[] = ['c2', 'c3', 'c4', 'c5'];
  const randomSuitCat = Phaser.Utils.Array.GetRandom(suitCats);
  const boosterCats: CompanionCatId[] = ['c1', 'c11', randomSuitCat];
  const cardLayer = scene.add.container(0, 0);
  overlay.add(cardLayer);
  const instruction = scene.add
    .text(0, height * 0.31, '', {
      fontFamily: 'monospace',
      fontSize: width < 500 ? '12px' : '14px',
      color: '#ffffff',
      fontStyle: 'bold',
    })
    .setOrigin(0.5)
    .setAlpha(0);
  overlay.add(instruction);

  const infoPanel = scene.add.container(0, height * 0.24).setAlpha(0);
  const infoWidth = Math.min(420, width - 32);
  const infoBg = scene.add.graphics();
  infoBg.fillStyle(0x090d16, 0.94);
  infoBg.lineStyle(2, 0xffbb00, 0.9);
  infoBg.fillRoundedRect(-infoWidth / 2, -29, infoWidth, 58, 7);
  infoBg.strokeRoundedRect(-infoWidth / 2, -29, infoWidth, 58, 7);
  const infoName = scene.add
    .text(0, -10, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffbb00',
      fontStyle: 'bold',
    })
    .setOrigin(0.5);
  const infoDescription = scene.add
    .text(0, 11, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: infoWidth - 24 },
    })
    .setOrigin(0.5);
  infoPanel.add([infoBg, infoName, infoDescription]);
  overlay.add(infoPanel);
  mobileTextObjects.push(
    title,
    subtitle,
    claimText,
    tapText,
    catCardHelp,
    instruction,
    infoName,
    infoDescription
  );
  resizeOpening({ width: scene.scale.width, height: scene.scale.height });

  let revealedCount = 0;
  let packOpened = false;

  const burstStarFirework = (x: number, y: number, amount: number) => {
    for (let i = 0; i < amount; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.Between(
        75,
        Math.min(210, Math.floor(width * 0.3))
      );
      const star = scene.add.sprite(
        x,
        y,
        'starter_burst_stars',
        Phaser.Math.Between(0, 4)
      );
      const starScale = Phaser.Math.FloatBetween(0.65, 1.2);
      star
        .setScale(starScale)
        .setAngle(Phaser.Math.Between(-30, 30))
        .setAlpha(1);
      overlay.add(star);
      scene.tweens.add({
        targets: star,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        angle: star.angle + Phaser.Math.Between(-180, 180),
        scale: 0.1,
        alpha: 0,
        duration: Phaser.Math.Between(360, 560),
        delay: Phaser.Math.Between(0, 45),
        ease: 'Quad.easeOut',
        onComplete: () => star.destroy(),
      });
    }
  };

  const saveStarterCollection = () => {
    const fullStarterDeck: Card[] = [];
    const suits: CardSuit[] = ['sakura', 'ghost', 'leaf', 'water'];
    for (const suit of suits) {
      for (let rank = 2; rank <= 14; rank++)
        fullStarterDeck.push(makeCard(suit, rank));
    }
    scene.playerDeck = fullStarterDeck;
    const previousCats = new Set(scene.ownedCats);
    const newCatCount = new Set(
      boosterCats.filter((catId) => !previousCats.has(catId))
    ).size;
    scene.ownedCats = [...boosterCats];
    scene.equippedCats = [...boosterCats];
    localStorage.setItem(
      'player_owned_companion_cats',
      JSON.stringify(scene.ownedCats)
    );
    localStorage.setItem(
      'player_companion_cats',
      JSON.stringify(scene.equippedCats)
    );
    reportPlayerProgress({ catsCollected: newCatCount, cardsClaimed: boosterCats.length, xp: newCatCount * 25 });
    scene.savePlayerData();
  };

  const showStartButton = () => {
    playBoosterChime(0, 'confirm');
    title.setText('YOUR TEAM IS READY!').setColor('#ffbb00');
    subtitle.setText('ALL 3 CAT CARDS UNLOCKED').setColor('#ffffff');
    catCardHelp.setText(
      'Each cat adds a unique scoring bonus or special ability.'
    );
    scene.tweens.add({ targets: catCardHelp, alpha: 1, duration: 260 });
    scene.tweens.killTweensOf(instruction);
    instruction.setAlpha(0);
    const okBtn = scene.add
      .container(0, height * 0.4)
      .setAlpha(0)
      .setScale(0.8);
    const okBg = scene.add.graphics();
    okBg.fillStyle(0x00cc44, 0.95);
    okBg.lineStyle(2, 0xffffff, 1);
    okBg.fillRoundedRect(-82, -21, 164, 42, 6);
    okBg.strokeRoundedRect(-82, -21, 164, 42, 6);
    okBtn.add([
      okBg,
      scene.add
        .text(0, 0, 'CLAIM CARDS', {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    ]);
    overlay.add(okBtn);
    okBtn.setInteractive(
      new Phaser.Geom.Rectangle(-82, -21, 164, 42),
      Phaser.Geom.Rectangle.Contains
    );
    okBtn.on('pointerover', () => okBtn.setScale(1.06));
    okBtn.on('pointerout', () => okBtn.setScale(1));
    okBtn.once('pointerdown', () => {
      okBtn.disableInteractive();
      saveStarterCollection();
      scene.tweens.add({
        targets: overlay,
        alpha: 0,
        scale: 1.08,
        duration: 350,
        onComplete: () => {
          overlay.destroy();
          scene.fetchChallengerAndStart();
        },
      });
    });
    scene.tweens.add({
      targets: okBtn,
      alpha: 1,
      scale: 1,
      duration: 320,
      ease: 'Back.easeOut',
    });
  };

  const dealCards = () => {
    title.setText('OPEN YOUR COMPANIONS').setColor('#00ffee');
    subtitle.setText('TAP EACH CARD TO REVEAL').setColor('#ffbb00');
    const cardScale = Phaser.Math.Clamp(
      Math.min(width / 380, height / 390),
      1.25,
      2.05
    );
    const spacing = Math.min(width * 0.25, 138);
    boosterCats.forEach((catId, index) => {
      const x = (index - 1) * spacing;
      const restingY = -10;
      const card = scene.add
        .container(x, height * 0.46)
        .setScale(cardScale * 0.35)
        .setAlpha(0);
      const shadow = scene.add.rectangle(3, 4, 63, 95, 0x000000, 0.5);
      const back = scene.add.sprite(0, 0, 'card_skins', 0).setOrigin(0.5);
      card.add([shadow, back]);
      cardLayer.add(card);
      const cardZone = scene.add.zone(0, 0, 59, 91).setInteractive();
      card.add(cardZone);
      let revealed = false;
      let revealing = false;
      cardZone.on('pointerover', () => {
        if (!revealed)
          scene.tweens.add({ targets: card, y: restingY - 8, duration: 120 });
      });
      cardZone.on('pointerout', () => {
        if (!revealed)
          scene.tweens.add({ targets: card, y: restingY, duration: 120 });
      });
      cardZone.on('pointerdown', () => {
        const catData = COMPANION_CATS[catId];
        if (revealed) {
          infoName.setText(catData.name.toUpperCase());
          infoDescription.setText(catData.description);
          infoPanel.setAlpha(1).setScale(0.96);
          scene.tweens.add({
            targets: infoPanel,
            scale: 1,
            duration: 170,
            ease: 'Back.easeOut',
          });
          scene.tweens.add({
            targets: card,
            scale: cardScale * 1.06,
            yoyo: true,
            duration: 90,
          });
          return;
        }
        if (revealing) return;
        revealing = true;
        revealed = true;
        playBoosterChime(440 + index * 110, 'reveal');
        scene.tweens.add({
          targets: card,
          scaleX: 0,
          angle: index % 2 === 0 ? -3 : 3,
          duration: 115,
          yoyo: true,
          hold: 35,
          ease: 'Quad.easeIn',
          onYoyo: () => {
            back.destroy();
            const mapEntry = CAT_FRAME_MAP[catId] ?? {
              sheet: 'cat_cards_tiles',
              frame: 4,
            };
            card.add(
              scene.add
                .sprite(0, 0, mapEntry.sheet, mapEntry.frame)
                .setOrigin(0.5)
            );
          },
          onComplete: () => {
            card.setAngle(0);
            scene.emitter.emitParticleAt(
              width / 2 + x,
              height / 2 + restingY,
              26
            );
            infoName.setText(catData.name.toUpperCase());
            infoDescription.setText(catData.description);
            infoPanel.setAlpha(1).setScale(0.96);
            scene.tweens.add({
              targets: infoPanel,
              scale: 1,
              duration: 170,
              ease: 'Back.easeOut',
            });
            revealedCount++;
            revealing = false;
            instruction
              .setText(`${revealedCount} / ${boosterCats.length} REVEALED`)
              .setAlpha(0.75);
            if (revealedCount === boosterCats.length)
              scene.time.delayedCall(320, showStartButton);
          },
        });
      });
      scene.tweens.add({
        targets: card,
        y: restingY,
        alpha: 1,
        scale: cardScale,
        angle: { from: index === 0 ? -10 : index === 2 ? 10 : 0, to: 0 },
        duration: 420,
        delay: index * 110,
        ease: 'Back.easeOut',
        onComplete: () => {
          if (index === boosterCats.length - 1) {
            instruction.setText('TAP EACH CARD TO REVEAL').setAlpha(1);
            scene.tweens.add({
              targets: instruction,
              alpha: 0.45,
              yoyo: true,
              repeat: -1,
              duration: 700,
            });
          }
        },
      });
    });
  };

  const openPack = () => {
    if (packOpened) return;
    packOpened = true;
    if (packZone) packZone.disableInteractive();
    if (claimText) claimText.destroy();
    if (claimFlashEvent) claimFlashEvent.destroy();
    scene.tweens.killTweensOf(packGroup);
    scene.tweens.killTweensOf(tapText);
    tapText.setAlpha(0);
    burstStarFirework(0, -10, 30);
    scene.tweens.add({ targets: revealStage, alpha: 1, duration: 280 });
    scene.tweens.add({ targets: glow, alpha: 0, scale: 1.6, duration: 500 });
    scene.tweens.add({
      targets: packGroup,
      y: -24,
      scale: 1.12,
      duration: 210,
      ease: 'Back.easeOut',
      onComplete: () => {
        scene.tweens.add({
          targets: packGroup,
          x: { from: -7, to: 7 },
          y: { from: -28, to: -20 },
          angle: { from: -4, to: 4 },
          duration: 38,
          repeat: 3,
          yoyo: true,
          onComplete: () => {
            scene.tweens.killTweensOf(packGroup);
            packGroup.setPosition(0, -24).setAngle(0).setScale(1.12);
            const dissolveScale = packScale * 1.12;
            const ghostLeft = scene.add
              .sprite(0, -24, 'starter_pack')
              .setScale(dissolveScale)
              .setTint(0xff2266)
              .setAlpha(0.32);
            const ghostRight = scene.add
              .sprite(0, -24, 'starter_pack')
              .setScale(dissolveScale)
              .setTint(0x22ddff)
              .setAlpha(0.32);
            overlay.addAt(ghostLeft, overlay.getIndex(packGroup));
            overlay.addAt(ghostRight, overlay.getIndex(packGroup));
            scene.tweens.add({
              targets: ghostLeft,
              x: -16,
              angle: -7,
              scale: dissolveScale * 1.12,
              alpha: 0,
              duration: 420,
              ease: 'Quad.easeOut',
            });
            scene.tweens.add({
              targets: ghostRight,
              x: 16,
              angle: 7,
              scale: dissolveScale * 1.12,
              alpha: 0,
              duration: 420,
              ease: 'Quad.easeOut',
            });

            const dissolve = { visibleHeight: packSprite.height };
            scene.tweens.add({
              targets: dissolve,
              visibleHeight: 0,
              duration: 390,
              ease: 'Quad.easeIn',
              onUpdate: () => {
                packSprite.setCrop(
                  0,
                  0,
                  packSprite.width,
                  Math.max(1, dissolve.visibleHeight)
                );
                const edgeX =
                  width / 2 +
                  Phaser.Math.Between(
                    -Math.floor(packSprite.width * dissolveScale * 0.45),
                    Math.floor(packSprite.width * dissolveScale * 0.45)
                  );
                const edgeY =
                  height / 2 -
                  24 -
                  (packSprite.height * dissolveScale) / 2 +
                  dissolve.visibleHeight * dissolveScale;
                scene.emitter.emitParticleAt(edgeX, edgeY, 4);
                packGroup.x = Phaser.Math.Between(-2, 2);
              },
              onComplete: () => {
                packGroup.destroy();
                scene.emitter.emitParticleAt(width / 2, height / 2 - 24, 110);
                burstStarFirework(0, -24, 46);
                const flash = scene.add.circle(0, -24, 22, 0xffffff, 0.95);
                overlay.add(flash);
                scene.tweens.add({
                  targets: flash,
                  scale: Math.max(width, height) / 35,
                  alpha: 0,
                  duration: 260,
                  ease: 'Quad.easeOut',
                  onComplete: () => flash.destroy(),
                });
                scene.time.delayedCall(120, dealCards);
              },
            });
          },
        });
      },
    });
  };

  const packWidth = packSprite.width * packScale;
  const packHeight = packSprite.height * packScale;
  packZone = scene.add.zone(0, 0, packWidth, packHeight).setInteractive();
  packGroup.add(packZone);
  packZone.on('pointerdown', openPack);
}
