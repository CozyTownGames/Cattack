import * as Phaser from 'phaser';
import { Card, RANK_NAME_MAP, isBreed } from './cardRules';

// Suit border/fill colours used for procedural fallback cards
const SUIT_COLORS: Record<string, { border: number; fill: number; accent: number }> = {
  sakura: { border: 0xec4899, fill: 0x9b2c6a, accent: 0xf472b6 },
  ghost:  { border: 0xa855f7, fill: 0x6b21a8, accent: 0xc084fc },
  leaf: { border: 0x22c55e, fill: 0x166534, accent: 0x4ade80 },
  water:  { border: 0x06b6d4, fill: 0x155e75, accent: 0x22d3ee },
};

// How many columns the current tileset actually has.
// The artist will rebuild the sheet — until then ranks beyond this get a fallback.
const TILESET_COLS = 13;

export function createCardSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  card: Card,
  faceDown: boolean,
  cardSkinTexture = 'card_skins',
  cardSkinFrame?: number
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);

  // Store card data in container (use rank/suit but keep legacy keys for safety)
  container.setData('number', card.rank);
  container.setData('family', card.suit);
  container.setData('rank', card.rank);
  container.setData('suit', card.suit);
  container.setData('holographic', card.holographic);
  container.setData('seals', card.seals);
  container.setData('faceDown', faceDown);
  container.setData('cardSkinTexture', cardSkinTexture);
  container.setData('cardSkinFrame', cardSkinFrame);

  // Draw card graphics
  const graphics = scene.add.graphics();
  container.add(graphics);
  container.setData('graphics', graphics);

  drawCardGraphics(scene, container, faceDown);

  return container;
}

export function drawCardGraphics(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  faceDown: boolean
): void {
  const graphics = container.getData('graphics') as Phaser.GameObjects.Graphics;
  const rank = (container.getData('rank') ?? container.getData('number')) as number;
  const suit = (container.getData('suit') ?? container.getData('family')) as string;

  graphics.clear();

  // Clear any text/image objects inside the container (except the graphics object)
  container.list.forEach((obj) => {
    if (obj !== graphics) {
      obj.destroy();
    }
  });

  if (faceDown) {
    const texture = container.getData('cardSkinTexture');
    if (typeof texture === 'string' && scene.textures.exists(texture)) {
      const frame = container.getData('cardSkinFrame');
      const sprite = typeof frame === 'number'
        ? scene.add.sprite(0, 0, texture, frame)
        : scene.add.sprite(0, 0, texture);
      sprite.setOrigin(0.5);
      container.add(sprite);
    } else {
      // Fallback graphics
      graphics.fillStyle(0x110729);
      graphics.fillRoundedRect(-29.5, -45.5, 59, 91, 6);
      graphics.lineStyle(2, 0x8800ff, 1);
      graphics.strokeRoundedRect(-29.5, -45.5, 59, 91, 6);
      const logoText = scene.add.text(0, 0, '🛸', { fontSize: '20px' }).setOrigin(0.5);
      container.add(logoText);
    }
  } else {
    // Determine if the tileset has a frame for this card
    const rowMap: Record<string, number> = {
      water: 0,
      leaf: 1,
      sakura: 2,
      ghost: 3,
    };
    const row = rowMap[suit] !== undefined ? rowMap[suit] : 0;
    const col = rank - 2; // rank 2 → col 0, rank 14 → col 12

    const hasSpriteFrame = col >= 0 && col < TILESET_COLS;

    if (hasSpriteFrame) {
      // Use existing spritesheet frame
      const frameIndex = row * TILESET_COLS + col;
      const sprite = scene.add.sprite(0, 0, 'card_tiles', frameIndex);
      sprite.setOrigin(0.5);
      container.add(sprite);
    } else {
      // Procedural solid-colour fallback for ranks without art yet
      drawFallbackCard(scene, container, graphics, rank, suit);
    }


    const seals = container.getData('seals');
    if (Array.isArray(seals)) {
      const sealTextures: Record<string, string> = {
        gold: 'gold_seal_overlay', red: 'mult_seal_overlay', purple: 'nips_seal_overlay',
      };
      seals.forEach((seal) => {
        const texture = typeof seal === 'string' ? sealTextures[seal] : undefined;
        if (texture && scene.textures.exists(texture)) container.add(scene.add.image(0, 0, texture));
      });
    }

    if (container.getData('holographic') === true && scene.textures.exists('holo_card_overlay')) {
      const holo = scene.add.image(0, 0, 'holo_card_overlay').setAlpha(0.58);
      holo.setBlendMode(Phaser.BlendModes.ADD);
      holo.setName('holographicOverlay');
      container.add(holo);
    }

    // Hidden/Empty damageText initially. Will show the health/clash value during battles.
    const damageText = scene.add.text(0, 0, '', {
      fontFamily: '"Jersey 10", "VT323", monospace',
      fontSize: '24px',
      color: '#ff3333',
      stroke: '#000000',
      strokeThickness: 4,
      fontStyle: 'bold',
    }).setOrigin(0.5);
    damageText.setName('damageText');
    container.add(damageText);
  }
}

/** Draws a solid-colour card with the rank label when no tileset frame exists. */
function drawFallbackCard(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  graphics: Phaser.GameObjects.Graphics,
  rank: number,
  suit: string
): void {
  const colors = SUIT_COLORS[suit] ?? SUIT_COLORS['sakura']!;

  // Card body
  graphics.fillStyle(colors.fill);
  graphics.fillRoundedRect(-29.5, -45.5, 59, 91, 6);

  // Suit-coloured border
  graphics.lineStyle(2, colors.border, 1);
  graphics.strokeRoundedRect(-29.5, -45.5, 59, 91, 6);

  // Inner subtle accent rectangle
  graphics.lineStyle(1, colors.accent, 0.3);
  graphics.strokeRect(-24, -39, 48, 78);

  // Rank number — top-left
  const rankLabel = RANK_NAME_MAP[rank] || rank.toString();
  const numText = scene.add
    .text(-22, -38, rank.toString(), {
      fontFamily: '"Jersey 10", "VT323", monospace',
      fontSize: '14px',
      color: '#ffffff',
      fontStyle: 'bold',
    })
    .setOrigin(0, 0);
  container.add(numText);

  // Breed/rank name — centered
  const breedLabel = isBreed(rank) ? rankLabel : rank.toString();
  const centerText = scene.add
    .text(0, 0, breedLabel, {
      fontFamily: '"Jersey 10", "VT323", monospace',
      fontSize: isBreed(rank) ? '13px' : '22px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    })
    .setOrigin(0.5);
  container.add(centerText);

  // Suit label — bottom
  const suitText = scene.add
    .text(0, 30, suit.toUpperCase(), {
      fontFamily: '"Jersey 10", "VT323", monospace',
      fontSize: '8px',
      color: '#ffffff',
    })
    .setOrigin(0.5)
    .setAlpha(0.6);
  container.add(suitText);
}

export function revealCardSprite(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container
): void {
  container.setData('faceDown', false);
  drawCardGraphics(scene, container, false);
  container.scaleX = 1.0;
}
