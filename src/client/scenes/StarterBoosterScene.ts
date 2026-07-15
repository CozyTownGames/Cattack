import * as Phaser from 'phaser';
import type { Card } from './cardBattle/cardRules';
import { showBoosterPackOpening } from './cardBattle/boosterPack';
import { emitStarterPackOpened } from '../eventBus';

export class StarterBoosterScene extends Phaser.Scene {
  public playerDeck: Card[] = [];
  public ownedCats: string[] = [];
  public equippedCats: string[] = [];
  public emitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super('StarterBoosterScene');
  }

  preload(): void {
    this.load.image('starter_pack', 'cards/starter-pack.png');
    this.load.spritesheet('cat_cards_tiles', 'cards/standard-cat-cards.png', {
      frameWidth: 59,
      frameHeight: 91,
    });
    this.load.spritesheet('card_skins', 'cards/card-skins.png', {
      frameWidth: 59,
      frameHeight: 91,
    });
    this.load.spritesheet('starter_burst_stars', 'space/stars_tileset.png', {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.image('starter_logo', 'assets/cattack-logo.png');
    this.load.image('booster_bg', 'cards/booster-bg.png');
    this.load.spritesheet('falling_cards', 'cards/falling-cards.png', {
      frameWidth: 59,
      frameHeight: 91,
    });
    this.load.image('card_pile', 'cards/card-pile.png');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#05030a');

    const { width, height } = this.scale;

    this.add.tileSprite(0, 0, width, height, 'booster_bg')
      .setOrigin(0)
      .setDepth(-10)
      .setTint(0x555555);

    const texture = this.textures.get('falling_cards');
    const frames = texture.getFrameNames().filter((frame) => frame !== '__BASE');
    const getRandomX = (): number => Math.random() < 0.5
      ? Phaser.Math.Between(0, Math.floor(width * 0.4))
      : Phaser.Math.Between(Math.ceil(width * 0.6), width);
    const startFalling = (card: Phaser.GameObjects.Sprite, initial: boolean): void => {
      const startY = initial ? card.y : -100;
      const speed = Phaser.Math.Between(40, 80);
      this.tweens.add({
        targets: card,
        y: height + 100,
        angle: card.angle + Phaser.Math.Between(-20, 20),
        duration: ((height + 150 - startY) / speed) * 1000,
        ease: 'Linear',
        onComplete: () => {
          card.setPosition(getRandomX(), -100);
          card.setFrame(frames[Phaser.Math.Between(0, frames.length - 1)] ?? '0');
          card.setAngle(Phaser.Math.Between(-25, 25));
          startFalling(card, false);
        },
      });
    };
    for (let index = 0; index < 14; index++) {
      const card = this.add.sprite(
        getRandomX(),
        Phaser.Math.Between(-150, height),
        'falling_cards',
        frames[Phaser.Math.Between(0, frames.length - 1)] ?? '0'
      ).setDepth(-8).setAlpha(0.75).setScale(Phaser.Math.FloatBetween(0.65, 0.95)).setAngle(Phaser.Math.Between(-25, 25));
      startFalling(card, true);
    }

    this.add.image(width / 2, height, 'card_pile')
      .setOrigin(0.5, 1)
      .setScale(0.8)
      .setDepth(-7);

    const logo = this.add.image(16, 14, 'starter_logo').setOrigin(0, 0).setDepth(260);
    logo.setScale(Math.min(0.42, (width * 0.24) / logo.width));

    if (!this.textures.exists('starter_sparkle')) {
      const sparkle = this.textures.createCanvas('starter_sparkle', 8, 8);
      if (sparkle) {
        sparkle.context.fillStyle = '#ffffff';
        sparkle.context.fillRect(0, 0, 8, 8);
        sparkle.refresh();
      }
    }
    this.emitter = this.add
      .particles(0, 0, 'starter_sparkle', {
        lifespan: { min: 600, max: 1200 },
        scale: { start: 3.2, end: 0 },
        alpha: { start: 1.0, end: 0 },
        speed: { min: 150, max: 450 },
        blendMode: 'ADD',
        emitting: false,
      })
      .setDepth(250);
    showBoosterPackOpening(this);
  }

  public savePlayerData(): void {
    localStorage.setItem('player_card_deck', JSON.stringify(this.playerDeck));
    localStorage.setItem(
      'player_owned_companion_cats',
      JSON.stringify(this.ownedCats)
    );
    localStorage.setItem(
      'player_companion_cats',
      JSON.stringify(this.equippedCats)
    );
    localStorage.setItem('player_starter_pack_opened', '1');
  }

  public fetchChallengerAndStart(): void {
    void fetch('/api/daily-booster/starter-complete', {
      method: 'POST',
      keepalive: true,
    }).catch((error) => console.error('Failed to mark daily booster as replaced by starter pack', error));
    emitStarterPackOpened();
  }

}
