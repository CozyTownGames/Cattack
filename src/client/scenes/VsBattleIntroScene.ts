import * as Phaser from 'phaser';
import { gameStore } from '../../shared/gameStore';
import { CARD_SKINS, getBoardSkin, getCardSkin } from '../../shared/cosmetics';
import { emitSceneChanged } from '../eventBus';
import { createCardSprite } from './cardBattle/cardGraphics';
import { makeCard } from './cardBattle/cardRules';

const DEFENDER_AVATAR_KEY = 'vs_intro_defender_avatar';
const VIEWER_AVATAR_KEY = 'vs_intro_viewer_avatar';

const fallbackFrame = (seed: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 8;
};

type CompetitorDisplay = {
  avatar: Phaser.GameObjects.Container;
  name: Phaser.GameObjects.Text;
};

export class VsBattleIntroScene extends Phaser.Scene {
  private starFar!: Phaser.GameObjects.TileSprite;
  private starMid!: Phaser.GameObjects.TileSprite;

  constructor() {
    super('VsBattleIntroScene');
  }

  preload(): void {
    this.load.image('vs_intro_space', 'space/space_tile.png');
    this.load.image('vs_intro_logo', 'assets/cattack-logo.png');
    this.load.spritesheet('vs_intro_stars', 'space/stars_tileset.png', { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('vs_intro_flying_cards', 'cards/falling-cards.png', { frameWidth: 59, frameHeight: 91 });
    this.load.spritesheet('vs_intro_card_tiles', 'cards/deck-cards.png', { frameWidth: 59, frameHeight: 91 });
    this.load.spritesheet('card_tiles', 'cards/deck-cards.png', { frameWidth: 59, frameHeight: 91 });
    this.load.spritesheet('card_skins', 'cards/card-skins.png', { frameWidth: 59, frameHeight: 91 });
    CARD_SKINS.forEach((skin) => {
      if (skin.textureKey !== 'card_skins') this.load.image(skin.textureKey, skin.image);
    });
    const boardSkin = getBoardSkin(gameStore.pendingVsBattleIntro?.challenge?.boardSkin ?? 'classic');
    this.load.image(boardSkin.textureKey, boardSkin.image);
    this.load.spritesheet('vs_intro_npcs', 'players/NPCs.png', {
      frameWidth: 24,
      frameHeight: 24,
    });

    const intro = gameStore.pendingVsBattleIntro;
    if (intro?.defenderSnoovatarUrl) {
      this.load.image(DEFENDER_AVATAR_KEY, intro.defenderSnoovatarUrl);
    }
    if (intro?.viewerSnoovatarUrl) {
      this.load.image(VIEWER_AVATAR_KEY, intro.viewerSnoovatarUrl);
    }
  }

  create(): void {
    const intro = gameStore.pendingVsBattleIntro;
    if (!intro?.challenge || intro.viewerHasWon) {
      this.scene.start('CardBattleScene');
      return;
    }

    emitSceneChanged({ scene: 'VsBattleIntro' });
    const { width, height } = this.scale;
    const seed = intro.challenge.seed ?? intro.challenge.defenderUsername;

    this.createSpaceBackground();
    this.createCardsFlyingFromBoard();
    this.createOpponentBoardPreview();

    const split = this.add.graphics().setDepth(-8);
    split.fillStyle(0xff0055, 0.13);
    split.fillRect(0, 0, width / 2, height);
    split.fillStyle(0x00ffee, 0.11);
    split.fillRect(width / 2, 0, width / 2, height);
    split.lineStyle(3, 0xffbb00, 0.85);
    split.lineBetween(width / 2, 0, width / 2, height);

    this.add.rectangle(0, 0, width, 44, 0x000000, 0.98)
      .setOrigin(0)
      .setDepth(14);

    const logo = this.add.image(width - 18, 52, 'vs_intro_logo').setOrigin(1, 0).setDepth(70);
    logo.setScale(Math.min(0.42, (width * 0.24) / logo.width));

    const headingX = Math.max(18, width * 0.035);
    this.add
      .text(headingX + 4, 65, 'PLAYER BATTLE', {
        fontFamily: 'monospace',
        fontSize: `${Phaser.Math.Clamp(width * 0.04, 20, 30)}px`,
        color: '#ffff00',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setDepth(18);

    this.add
      .text(headingX + 2, 68, 'PLAYER BATTLE', {
        fontFamily: 'monospace',
        fontSize: `${Phaser.Math.Clamp(width * 0.04, 20, 30)}px`,
        color: '#ff00ff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setDepth(19);

    this.add
      .text(headingX, 65, 'PLAYER BATTLE', {
        fontFamily: 'monospace',
        fontSize: `${Phaser.Math.Clamp(width * 0.04, 20, 30)}px`,
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0, 0.5)
      .setDepth(20);

    this.createDifficultyLabel();

    const portraitY = height * 0.43;
    const defender = this.createCompetitor(
      width * 0.24,
      portraitY,
      intro.challenge.defenderUsername,
      DEFENDER_AVATAR_KEY,
      `${seed}:defender`,
      0xff0055
    );
    const viewer = this.createCompetitor(
      width * 0.76,
      portraitY,
      intro.viewerUsername ?? 'YOU',
      VIEWER_AVATAR_KEY,
      `${seed}:viewer`,
      0x00ffee
    );

    this.add
      .text(width / 2, portraitY - 8, 'VS', {
        fontFamily: 'monospace',
        fontSize: `${Phaser.Math.Clamp(width * 0.09, 46, 72)}px`,
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#ffbb00',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setAngle(-4)
      .setDepth(30);

    this.createBattleButton(defender, viewer);
    this.createScanlines();
  }

  private createDifficultyLabel(): void {
    const stats = gameStore.pendingVsBattleIntro?.stats;
    const plays = stats?.plays ?? 0;
    const victoryRate = Phaser.Math.Clamp(Math.round(stats?.defenderVictoryRate ?? 0), 0, 100);
    let label = 'UNRANKED DIFFICULTY';
    let color = '#94a3b8';
    if (plays > 0 && victoryRate >= 95) {
      label = 'IMPOSSIBLE DIFFICULTY';
      color = '#ff00ff';
    } else if (plays > 0 && victoryRate >= 70) {
      label = 'HARD DIFFICULTY';
      color = '#ff3333';
    } else if (plays > 0 && victoryRate >= 40) {
      label = 'MEDIUM DIFFICULTY';
      color = '#ffbb00';
    } else if (plays > 0) {
      label = 'EASY DIFFICULTY';
      color = '#39ff14';
    }

    const headingX = Math.max(18, this.scale.width * 0.035);
    const labelStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace', fontSize: '13px', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
    };
    this.add.text(headingX + 3, 96, label, { ...labelStyle, color: '#ffff00' })
      .setOrigin(0, 0.5).setDepth(18);
    this.add.text(headingX + 1, 98, label, { ...labelStyle, color: '#ff00ff' })
      .setOrigin(0, 0.5).setDepth(19);
    const difficulty = this.add
      .text(headingX, 96, label, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0, 0.5)
      .setDepth(20);

    const statFontSize = `${Phaser.Math.Clamp(this.scale.width * 0.034, 16, 22)}px`;
    this.add.text(headingX, 22, `${plays.toLocaleString()} PLAYS`, {
      fontFamily: 'monospace',
      fontSize: statFontSize,
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#ff00ff',
      strokeThickness: 2,
    }).setOrigin(0, 0.5).setDepth(20);
    this.add.text(this.scale.width - headingX - 34, 22, `${victoryRate}% VICTORY`, {
      fontFamily: 'monospace',
      fontSize: statFontSize,
      color: '#00ffee',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(1, 0.5).setDepth(20);

    if (plays > 0 && victoryRate >= 95) {
      this.time.addEvent({
        delay: 140,
        loop: true,
        callback: () => {
          difficulty.setColor(difficulty.style.color === '#ff00ff' ? '#ffff00' : '#ff00ff');
        },
      });
    }
  }

  private createSpaceBackground(): void {
    const { width, height } = this.scale;
    this.starFar = this.add.tileSprite(0, 0, width, height, 'vs_intro_space').setOrigin(0).setDepth(-12).setTint(0x505878);
    this.starMid = this.add.tileSprite(0, 0, width, height, 'vs_intro_space').setOrigin(0).setDepth(-11).setAlpha(0.42).setBlendMode(Phaser.BlendModes.ADD);
    const starTexture = this.textures.get('vs_intro_stars');
    const maxFrame = Math.max(0, starTexture.frameTotal - 2);
    for (let index = 0; index < 34; index++) {
      const star = this.add.sprite(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        'vs_intro_stars',
        Phaser.Math.Between(0, maxFrame)
      ).setDepth(-9).setAlpha(Phaser.Math.FloatBetween(0.35, 0.9));
      this.tweens.add({ targets: star, alpha: 0.15, duration: Phaser.Math.Between(450, 1100), yoyo: true, repeat: -1 });
    }
  }

  private createOpponentBoardPreview(): void {
    const challenge = gameStore.pendingVsBattleIntro?.challenge;
    if (!challenge) return;
    const { width, height } = this.scale;
    const boardSkin = getBoardSkin(challenge.boardSkin ?? 'classic');
    const board = this.add.image(width / 2, height * 0.58, boardSkin.textureKey).setDepth(-7);
    const boardScale = Math.min((width * 0.9) / board.width, (height * 0.64) / board.height);
    board.setScale(boardScale);

    const turn = challenge.turns[0];
    if (!turn) return;
    const cardSkin = getCardSkin(challenge.cardSkin ?? 'classic');
    const previewCards = turn.cards.slice(0, 5);
    const spacing = Math.min(54, width * 0.105);
    previewCards.forEach((card, index) => {
      const sprite = createCardSprite(
        this,
        width / 2 + (index - (previewCards.length - 1) / 2) * spacing,
        height * 0.63,
        makeCard(card.suit, card.rank, card.holographic === true, card.seals ?? []),
        false,
        cardSkin.textureKey,
        cardSkin.frame
      );
      sprite.setScale(Math.min(0.62, width / 680)).setAlpha(0.88).setDepth(-5);
    });
  }

  private createCardsFlyingFromBoard(): void {
    const { width, height } = this.scale;
    const texture = this.textures.get('vs_intro_flying_cards');
    const frames = texture.getFrameNames().filter((frame) => frame !== '__BASE');
    if (frames.length === 0) return;
    const originX = width / 2;
    const originY = height * 0.58;

    const launch = (card: Phaser.GameObjects.Sprite, initial: boolean): void => {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Math.max(width, height) * Phaser.Math.FloatBetween(0.75, 1.05);
      card.setPosition(
        originX + Math.cos(angle) * Phaser.Math.Between(0, initial ? 150 : 28),
        originY + Math.sin(angle) * Phaser.Math.Between(0, initial ? 100 : 18)
      );
      card.setFrame(frames[Phaser.Math.Between(0, frames.length - 1)] ?? '0');
      card.setAngle(Phaser.Math.Between(-35, 35));
      card.setAlpha(0.52);
      this.tweens.add({
        targets: card,
        x: originX + Math.cos(angle) * distance,
        y: originY + Math.sin(angle) * distance,
        angle: card.angle + Phaser.Math.Between(-100, 100),
        alpha: 0.08,
        duration: Phaser.Math.Between(2600, 4400),
        delay: initial ? Phaser.Math.Between(0, 2200) : Phaser.Math.Between(100, 500),
        ease: 'Sine.easeIn',
        onComplete: () => launch(card, false),
      });
    };

    for (let index = 0; index < 12; index++) {
      const card = this.add.sprite(originX, originY, 'vs_intro_flying_cards', frames[index % frames.length])
        .setScale(Phaser.Math.FloatBetween(0.46, 0.68))
        .setDepth(-8);
      launch(card, true);
    }
  }

  private createScanlines(): void {
    const scanlines = this.add.graphics().setDepth(90).setAlpha(0.1);
    scanlines.lineStyle(1, 0x000000, 1);
    for (let y = 0; y < this.scale.height; y += 4) {
      scanlines.lineBetween(0, y, this.scale.width, y);
    }
  }

  private createCompetitor(
    x: number,
    y: number,
    username: string,
    avatarKey: string,
    fallbackSeed: string,
    color: number
  ): CompetitorDisplay {
    const avatar = this.add.container(x, y).setDepth(15);
    const glow = this.add.graphics();
    glow.fillStyle(0x050812, 0.92);
    glow.lineStyle(4, color, 1);
    glow.fillRect(-60, -65, 120, 120);
    glow.strokeRect(-60, -65, 120, 120);
    avatar.add(glow);

    if (this.textures.exists(avatarKey)) {
      const image = this.add.image(0, -5, avatarKey);
      const maxDimension = Math.max(image.width, image.height);
      if (maxDimension > 0) image.setScale(106 / maxDimension);
      avatar.add(image);
    } else {
      const npc = this.add
        .sprite(0, -5, 'vs_intro_npcs', fallbackFrame(fallbackSeed))
        .setScale(4);
      avatar.add(npc);
    }

    const name = this.add
      .text(x, y + 76, username, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: color === 0xff0055 ? '#ff5c93' : '#00ffee',
        fontStyle: 'bold',
        align: 'center',
        fixedWidth: Math.min(180, this.scale.width * 0.38),
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(20);

    return { avatar, name };
  }

  private createBattleButton(defender: CompetitorDisplay, viewer: CompetitorDisplay): void {
    const { width, height } = this.scale;
    const buttonWidth = Math.min(340, width * 0.52);
    const button = this.add.container(width / 2, height - 112).setDepth(40);
    const background = this.add.graphics();
    const buttonColors = [0x00ffee, 0xff00ff, 0xffff00];
    let buttonColorIndex = 0;
    const drawButton = (): void => {
      background.clear();
      background.fillStyle(0x080516, 0.97);
      background.lineStyle(4, buttonColors[buttonColorIndex] ?? 0x00ffee, 1);
      background.fillRect(-buttonWidth / 2, -28, buttonWidth, 56);
      background.strokeRect(-buttonWidth / 2, -28, buttonWidth, 56);
    };
    drawButton();
    const label = this.add
      .text(0, 0, 'BATTLE!', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#ffff00',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    button.add([background, label]);
    this.time.addEvent({
      delay: 180,
      loop: true,
      callback: () => {
        buttonColorIndex = (buttonColorIndex + 1) % buttonColors.length;
        drawButton();
      },
    });
    this.tweens.add({
      targets: label,
      scale: 1.08,
      duration: 360,
      yoyo: true,
      repeat: -1,
      ease: 'Stepped',
    });
    button.setInteractive(
      new Phaser.Geom.Rectangle(-buttonWidth / 2, -28, buttonWidth, 56),
      Phaser.Geom.Rectangle.Contains
    );
    button.on('pointerover', () => button.setScale(1.05));
    button.on('pointerout', () => button.setScale(1));
    button.once('pointerdown', () => {
      button.disableInteractive();
      label.setText('FIGHT!');
      defender.name.setVisible(false);
      viewer.name.setVisible(false);
      this.tweens.add({
        targets: defender.avatar,
        x: width / 2 - 42,
        angle: 8,
        scale: 1.12,
        duration: 420,
        ease: 'Power3',
      });
      this.tweens.add({
        targets: viewer.avatar,
        x: width / 2 + 42,
        angle: -8,
        scale: 1.12,
        duration: 420,
        ease: 'Power3',
      });
      this.time.delayedCall(420, () => this.cameras.main.flash(80, 255, 255, 255));
      this.time.delayedCall(500, () => {
        this.scene.start('CardBattleScene');
      });
    });
  }

  override update(_time: number, delta: number): void {
    this.starFar.tilePositionX += 0.012 * delta;
    this.starMid.tilePositionX += 0.028 * delta;
  }
}
