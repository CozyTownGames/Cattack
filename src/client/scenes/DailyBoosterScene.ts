import * as Phaser from 'phaser';

import type {
  DailyBoosterResponse,
  DailyBoosterReward,
} from '../../shared/dailyBooster';
import { emitDailyBoosterFinished } from '../eventBus';
import { reportPlayerProgress } from '../playerProgress';
import { createCardSprite } from './cardBattle/cardGraphics';
import { makeCard } from './cardBattle/cardRules';
import {
  COMPANION_CATS,
  type CompanionCatId,
} from './cardBattle/companionCats';
import { getCatCardFrame } from './cardBattle/catCardFrames';
import { showExpandCardOverlay } from './cardBattle/cardOverlays';

const isCompanionCatId = (value: string): value is CompanionCatId =>
  /^c(?:[1-9]|[1-3][0-9])$/.test(value);

const AVATAR_FILES = [
  '3.png',
  '_0000__0005_IMG_9396.png',
  '_0002__0003_IMG_9398.png',
  '_0003__0002_IMG_9399.png',
  'pormo_0001_IMG_9072.png',
  'pormo_0002_IMG_9071.png',
  'pormo_0003_IMG_9070.png',
  'pormo_0007_IMG_9066.png',
  'pormo_0008_IMG_9065.png',
  'pormo_0009_IMG_9064.png',
  'pormo_0010_IMG_9063.png',
  'pormo_0011_IMG_9062.png',
  'pormo_0012_IMG_9061.png',
  'pormo_0013_IMG_9060.png',
  'pormo_0014_IMG_9059.png',
  'pormo_0015_IMG_9058.png',
  'pormo_0016_IMG_9057.png',
  'pormo_0017_IMG_9056.png',
  'pormo_0018_IMG_9055.png',
  'pormo_0019_IMG_9054.png',
  'pormo_0020_IMG_9053.png',
  'pormo_0022_IMG_9051.png',
  'pormo_0023_IMG_9050.png',
  'pormo_0024_IMG_9049.png',
  'pormo_0025_IMG_9048.png',
  'pormo_0027_IMG_9046.png',
  'pormo_0028_IMG_9045.png',
  'pormo_0031_IMG_9042.png',
  'pormo_0032_IMG_9041.png',
  'pormo_0036_IMG_9037.png',
  'pormo_0038_IMG_9035.png',
  'pormo_0042_IMG_9030.png',
  'pormo_0045_IMG_9027.png',
  'pormo_0046_IMG_9026.png',
  'pormo_0047_IMG_9025.png',
];

const MOCK_CLAIMS = [
  { username: 'u/CedarWolf', frame: 0 },
  { username: 'u/x_Echo_Glitch', frame: 1 },
  { username: 'u/leoAlpaca92', frame: 2 },
  { username: 'u/Langst', frame: 3 },
  { username: 'u/Pennsy13', frame: 0 },
  { username: 'u/john_doe_4257', frame: 1 },
  { username: 'u/trashlogic', frame: 2 },
  { username: 'u/StickySituation8', frame: 3 },
  { username: 'u/Back_Day8476', frame: 0 },
  { username: 'u/OrbitalCorgi', frame: 1 },
  { username: 'u/d-space-walker', frame: 2 },
  { username: 'u/TechUser99', frame: 3 },
  { username: 'u/MeadowReader', frame: 0 },
  { username: 'u/HoloGrid_x', frame: 1 },
  { username: 'u/DealFlowPro', frame: 2 },
  { username: 'u/QuietCrazed', frame: 3 },
  { username: 'u/cardStock-88', frame: 0 },
  { username: 'u/SnooDetective', frame: 1 },
  { username: 'u/CosmicShift', frame: 2 },
  { username: 'u/Nomad_Space', frame: 3 },
  { username: 'u/PerfectDraw', frame: 0 },
  { username: 'u/LaserFocus44', frame: 1 },
  { username: 'u/DraftPad', frame: 2 },
  { username: 'u/WhiskeyWar_', frame: 3 },
  { username: 'u/LogicCurious', frame: 0 },
  { username: 'u/No-Logic9874', frame: 1 },
  { username: 'u/Hammer-22', frame: 2 },
  { username: 'u/MountainMist99', frame: 3 },
  { username: 'u/33trueday_', frame: 0 },
  { username: 'u/FuryRoad86', frame: 1 },
];

export class DailyBoosterScene extends Phaser.Scene {
  private choices: DailyBoosterReward[] = [];
  private selected = -1;
  private claimsCount = 1246431;
  private claimsTextObj: Phaser.GameObjects.Text | null = null;
  private scrollContainers: Phaser.GameObjects.Container[] = [];
  private currentUsername = '';
  private currentSnoovatarUrl = '';
  private isDoubleClaim = false;
  private secondPackActive = false;

  constructor() {
    super('DailyBoosterScene');
  }

  preload(): void {
    this.load.image('daily_pack', 'cards/basic-pack.png');
    this.load.image('daily_bg', 'cards/booster-bg.png');
    this.load.image('daily_pile', 'cards/card-pile.png');
    this.load.image('daily_logo', 'assets/cattack-logo.png');
    this.load.spritesheet('daily_falling', 'cards/falling-cards.png', {
      frameWidth: 59,
      frameHeight: 91,
    });
    this.load.spritesheet('card_tiles', 'cards/deck-cards.png', {
      frameWidth: 59,
      frameHeight: 91,
    });
    this.load.spritesheet('cat_cards_tiles', 'cards/standard-cat-cards.png', {
      frameWidth: 59,
      frameHeight: 91,
    });
    this.load.spritesheet('wild_cat_cards_tiles', 'cards/wild-cat-cards.png', {
      frameWidth: 59,
      frameHeight: 91,
    });
    this.load.spritesheet(
      'daily_holo_frames',
      'cards/holo-cards-spritesheet.png',
      { frameWidth: 55, frameHeight: 87 }
    );
    this.load.image('gold_seal_overlay', 'cards/gold-seal.png');
    this.load.image('mult_seal_overlay', 'cards/mult-seal.png');
    this.load.image('nips_seal_overlay', 'cards/nips-seal.png');
    this.load.spritesheet('vs_npc_portraits', 'players/NPCs.png', {
      frameWidth: 24,
      frameHeight: 24,
    });

  }

  create(): void {
    const { width, height } = this.scale;
    this.add
      .tileSprite(0, 0, width, height, 'daily_bg')
      .setOrigin(0)
      .setTint(0x555555)
      .setDepth(-10);
    this.add
      .image(width / 2, height, 'daily_pile')
      .setOrigin(0.5, 1)
      .setScale(0.75)
      .setDepth(-8);
    const logo = this.add.image(16, 14, 'daily_logo').setOrigin(0).setDepth(20);
    logo.setScale(Math.min(0.42, (width * 0.24) / logo.width));
    if (!this.anims.exists('daily_holo_shimmer')) {
      this.anims.create({
        key: 'daily_holo_shimmer',
        frames: this.anims.generateFrameNumbers('daily_holo_frames', {
          start: 0,
          end: 18,
        }),
        frameRate: 10,
        repeat: -1,
      });
    }
    this.createFallingCards();

    // Background load custom avatars so it doesn't block scene startup
    AVATAR_FILES.forEach((file, index) => {
      if (!this.textures.exists(`custom_avatar_${index}`)) {
        this.load.image(`custom_avatar_${index}`, `assets/Avatars/${file}`);
      }
    });
    this.load.start();

    // Base claims setup
    this.claimsCount = 0;

    // Big claims counter
    const isMobile = width < 550;
    const counterX = isMobile ? width - 80 : width - 130;
    const counterY = isMobile ? 40 : 80;

    this.add
      .text(counterX, counterY - 18, 'TOTAL CLAIMED', {
        fontFamily: 'monospace',
        fontSize: isMobile ? '8px' : '10px',
        color: '#00ffee',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.claimsTextObj = this.add
      .text(counterX, counterY, this.claimsCount.toLocaleString(), {
        fontFamily: 'monospace',
        fontSize: isMobile ? '16px' : '24px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(counterX, counterY + 16, 'claims', {
        fontFamily: 'monospace',
        fontSize: isMobile ? '8px' : '10px',
        color: '#a0aec0',
      })
      .setOrigin(0.5);

    // Create the scrolling queue on the left side
    this.createScrollingQueue();

    void fetch('/api/daily-booster')
      .then((response) => response.json())
      .then((data: DailyBoosterResponse) => {
        if (data.expiresAt) {
          const postCreatedAt = data.expiresAt - 24 * 60 * 60 * 1000;
          const postAgeMs = Math.max(0, Date.now() - postCreatedAt);
          this.claimsCount = Math.floor(postAgeMs / 30000);
        } else {
          this.claimsCount = 15;
        }
        if (this.claimsTextObj) {
          this.claimsTextObj.setText(this.claimsCount.toLocaleString());
        }

        if (data.expired) {
          this.showFinished('So sad - You missed your pack.', 'OK fine!');
          return;
        }
        if (!data.active) {
          emitDailyBoosterFinished();
          return;
        }
        if (data.claimed) {
          this.showFinished("TODAY'S PACK IS ALREADY CLAIMED!");
          return;
        }

        if (data.joined) {
          localStorage.setItem('cattack_joined_subreddit', 'true');
        }
        if (data.username) {
          this.currentUsername = data.username;
        }
        if (data.snoovatarUrl && data.username) {
          this.currentSnoovatarUrl = data.snoovatarUrl;
          const key = `snoovatar_${data.username}`;
          this.load.image(key, data.snoovatarUrl);
          this.load.once('complete', () => {
            // loaded
          });
          this.load.start();
        }

        this.choices = data.choices;
        this.showPack();
      })
      .catch(() => this.showFinished('PACK SIGNAL LOST!'));
  }

  override update(_time: number, delta: number): void {
    const { height } = this.scale;

    // Scroll containers
    this.scrollContainers.forEach((container) => {
      const speed = container.getData('speed') as number;
      container.y -= speed * (delta / 1000);

      // Warp back to bottom when passing the top threshold (y = 80)
      if (container.y < 80) {
        container.y = height + 30;
        container.setData('speed', Phaser.Math.FloatBetween(70, 110));

        const data = this.getRandomClaimData();
        const avatar = container.list[0] as Phaser.GameObjects.Sprite;
        if (avatar) {
          this.updateAvatarTexture(avatar, data);
        }
        const text = container.list[1] as Phaser.GameObjects.Text;
        if (text) {
          text.setText(`${data.username} +1`);
        }
      }
    });

    // Increment claims counter
    if (Math.random() < 0.01) {
      this.claimsCount += 1;
      if (this.claimsTextObj) {
        this.claimsTextObj.setText(this.claimsCount.toLocaleString());
      }
    }
  }

  private createFallingCards(): void {
    const { width, height } = this.scale;
    const frames = this.textures
      .get('daily_falling')
      .getFrameNames()
      .filter((frame) => frame !== '__BASE');
    for (let index = 0; index < 12; index++) {
      const card = this.add
        .sprite(
          Phaser.Math.Between(0, width),
          Phaser.Math.Between(-100, height),
          'daily_falling',
          frames[index % frames.length] ?? '0'
        )
        .setDepth(-9)
        .setAlpha(0.58)
        .setScale(Phaser.Math.FloatBetween(0.55, 0.85));
      this.tweens.add({
        targets: card,
        y: height + 110,
        angle: Phaser.Math.Between(-80, 80),
        duration: Phaser.Math.Between(5000, 9000),
        repeat: -1,
        delay: index * 180,
      });
    }
  }

  private addNeonPanel(
    container: Phaser.GameObjects.Container,
    width: number,
    height: number
  ): void {
    container.add(
      this.add
        .rectangle(-6, -6, width, height, 0x080b1c, 0)
        .setStrokeStyle(4, 0xffbb00)
    );
    container.add(
      this.add
        .rectangle(6, 6, width, height, 0x080b1c, 0)
        .setStrokeStyle(4, 0xff00ff)
    );
    container.add(
      this.add
        .rectangle(0, 0, width, height, 0x080b1c, 0.98)
        .setStrokeStyle(4, 0x00ffee)
    );
  }

  private showPack(): void {
    const { width, height } = this.scale;
    const panel = this.add.container(width / 2, height / 2).setDepth(10);
    panel.add(
      this.add
        .text(0, -190, 'DAILY FREE BOOSTER!', {
          fontFamily: 'monospace',
          fontSize: '24px',
          color: '#ffff00',
          fontStyle: 'bold',
          stroke: '#ff00ff',
          strokeThickness: 2,
        })
        .setOrigin(0.5)
    );
    panel.add(
      this.add
        .text(0, -155, 'TAP PACK TO OPEN // PICK ONE CARD', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#00ffee',
        })
        .setOrigin(0.5)
    );
    const pack = this.add
      .image(0, 5, 'daily_pack')
      .setScale(1.2)
      .setInteractive({ useHandCursor: true });
    panel.add(pack);
    this.tweens.add({
      targets: pack,
      y: -3,
      duration: 650,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    pack.once('pointerdown', () => {
      this.tweens.killTweensOf(pack);
      panel.destroy(true);
      this.showChoices();
    });

    this.createFollowOrCommentButton(panel);
  }

  private showChoices(): void {
    const { width, height } = this.scale;
    const panel = this.add.container(width / 2, height / 2).setDepth(10);
    const panelWidth = Math.min(width - 32, 450);
    const panelHeight = Math.min(height - 32, 360);
    const compact = panelWidth < 360;
    const cardScale = compact ? 0.98 : 1.2;
    const cardLabelSize = compact ? '11px' : '14px';
    this.addNeonPanel(panel, panelWidth, panelHeight);
    panel.add(
      this.add
        .text(0, -panelHeight / 2 + 38, 'PICK ONE! ~MEOW', {
          fontFamily: 'monospace',
          fontSize: compact ? '22px' : '28px',
          color: '#ffffff',
          fontStyle: 'bold',
          stroke: '#ff00ff',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
    );
    panel.add(
      this.add
        .text(0, -panelHeight / 2 + 76, 'CHOOSE ONE CARD', {
          fontFamily: 'monospace',
          fontSize: compact ? '13px' : '16px',
          color: '#00ffee',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
    );
    const spacing = (panelWidth - 80) / 3;
    const cards: Phaser.GameObjects.Container[] = [];
    this.choices.forEach((reward, index) => {
      const holder = this.add
        .container((index - 1) * spacing, -12)
        .setScale(cardScale)
        .setSize(70, 128)
        .setInteractive({ useHandCursor: true });
      if (reward.kind === 'cat' || reward.kind === 'holoCat') {
        const catId = isCompanionCatId(reward.catId) ? reward.catId : 'c1';
        const frame = getCatCardFrame(catId);
        holder.add(this.add.sprite(0, 0, frame.sheet, frame.frame));
        if (reward.kind === 'holoCat') {
          holder.add(
            this.add
              .sprite(0, 0, 'daily_holo_frames', 0)
              .setAlpha(0.72)
              .setBlendMode(Phaser.BlendModes.ADD)
              .play('daily_holo_shimmer')
          );
        }
        const catName = COMPANION_CATS[catId]?.name ?? 'CAT CARD';
        holder.add(
          this.add
            .text(
              0,
              62,
              reward.kind === 'holoCat' ? `HOLO ${catName}` : catName,
              {
                fontFamily: 'monospace',
                fontSize: cardLabelSize,
                color: '#ffff00',
                fontStyle: 'bold',
                align: 'center',
                stroke: '#000000',
                strokeThickness: 3,
                wordWrap: { width: 100 },
              }
            )
            .setOrigin(0.5)
        );
      } else {
        const isHolographic = reward.kind === 'holoDeck';
        const card = makeCard(
          reward.suit,
          reward.rank,
          false,
          reward.kind === 'sealedDeck' ? [reward.seal] : []
        );
        const cardSprite = createCardSprite(this, 0, 0, card, false);
        if (isHolographic) {
          cardSprite.add(
            this.add
              .sprite(0, 0, 'daily_holo_frames', 0)
              .setAlpha(0.72)
              .setBlendMode(Phaser.BlendModes.ADD)
              .play('daily_holo_shimmer')
          );
        }
        holder.add(cardSprite);

        let labelPrefix = '';
        if (isHolographic) {
          labelPrefix = 'HOLO ';
        } else if (reward.kind === 'sealedDeck') {
          labelPrefix = `${reward.seal.toUpperCase()} SEAL `;
        }

        holder.add(
          this.add
            .text(0, 62, `${labelPrefix}${card.name.toUpperCase()}`, {
              fontFamily: 'monospace',
              fontSize: cardLabelSize,
              color: '#ffffff',
              fontStyle: 'bold',
              align: 'center',
              stroke: '#000000',
              strokeThickness: 3,
              wordWrap: { width: 100 },
            })
            .setOrigin(0.5)
        );
      }
      holder.on('pointerdown', () => {
        this.selected = index;
        cards.forEach((card, cardIndex) =>
          card
            .setScale(cardIndex === index ? cardScale + 0.14 : cardScale)
            .setY(cardIndex === index ? -24 : -12)
        );
        claimParts.forEach((part) => part.setAlpha(1));
        claim.setFillStyle(0x4b0b78).setInteractive({ useHandCursor: true });

        showExpandCardOverlay(this, {
          choices: this.choices,
          currentIndex: index,
          onChange: (newIndex) => {
            this.selected = newIndex;
            cards.forEach((card, cardIndex) =>
              card
                .setScale(cardIndex === newIndex ? cardScale + 0.14 : cardScale)
                .setY(cardIndex === newIndex ? -24 : -12)
            );
            claimParts.forEach((part) => part.setAlpha(1));
            claim
              .setFillStyle(0x4b0b78)
              .setInteractive({ useHandCursor: true });
          },
          onClaim: (claimedIndex) => {
            this.selected = claimedIndex;
            this.claimReward(panel);
          },
        });
      });
      panel.add(holder);
      cards.push(holder);
    });
    const claimY = panelHeight / 2 - 42;
    const claimGold = this.add
      .rectangle(-4, claimY - 4, 184, 48, 0x000000, 0)
      .setStrokeStyle(3, 0xffbb00)
      .setAlpha(0.35);
    const claimMagenta = this.add
      .rectangle(4, claimY + 4, 184, 48, 0x000000, 0)
      .setStrokeStyle(3, 0xff00ff)
      .setAlpha(0.35);
    const claim = this.add
      .rectangle(0, claimY, 184, 48, 0x17052b)
      .setStrokeStyle(3, 0x00ffee)
      .setAlpha(0.35);
    const claimText = this.add
      .text(0, claimY, 'CLAIM CARD', {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setAlpha(0.35);
    const claimParts = [claimGold, claimMagenta, claim, claimText];
    panel.add(claimParts);
    claim.once('pointerdown', () => void this.claimReward(panel));
  }

  private async claimReward(
    panel: Phaser.GameObjects.Container
  ): Promise<void> {
    if (this.selected < 0) return;

    if (this.isDoubleClaim && !this.secondPackActive) {
      const response = await fetch('/api/daily-booster/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: this.selected }),
      });
      if (response.status === 410) {
        panel.destroy(true);
        this.showFinished('So sad - You missed your pack.', 'OK fine!');
        return;
      }
      if (!response.ok) return;
      const reward = this.choices[this.selected];
      if (!reward) return;
      this.storeReward(reward);
      panel.destroy(true);

      // Transition to second pack!
      this.selected = -1;
      this.secondPackActive = true;
      this.choices = this.createLocalBoosterChoices();
      this.showPack();
      return;
    }

    if (this.secondPackActive) {
      const reward = this.choices[this.selected];
      if (reward) {
        this.storeReward(reward);
      }
      panel.destroy(true);
      this.showFinished('DOUBLE CARD CLAIMED! COME BACK TOMORROW!');
      return;
    }

    const response = await fetch('/api/daily-booster/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index: this.selected }),
    });
    if (response.status === 410) {
      panel.destroy(true);
      this.showFinished('So sad - You missed your pack.', 'OK fine!');
      return;
    }
    if (!response.ok) return;
    const reward = this.choices[this.selected];
    if (!reward) return;
    this.storeReward(reward);
    panel.destroy(true);
    this.showFinished('CARD CLAIMED! COME BACK TOMORROW!');
  }

  private createLocalBoosterChoices(): DailyBoosterReward[] {
    const suits = ['sakura', 'ghost', 'leaf', 'water'] as const;
    const seals = ['gold', 'red', 'purple'] as const;
    return Array.from({ length: 3 }, () => {
      const roll = Math.random();
      const catId = `c${Math.floor(Math.random() * 39) + 1}`;
      if (roll < 0.35) return { kind: 'cat', catId };
      const suit = suits[Math.floor(Math.random() * suits.length)] ?? 'sakura';
      const rank = Math.floor(Math.random() * 13) + 2;
      if (roll < 0.6) return { kind: 'holoDeck', suit, rank };
      if (roll < 0.9)
        return {
          kind: 'sealedDeck',
          suit,
          rank,
          seal: seals[Math.floor(Math.random() * seals.length)] ?? 'gold',
        };
      return { kind: 'holoCat', catId };
    });
  }

  private showFloatingText(
    x: number,
    y: number,
    text: string,
    color: string,
    duration = 2000
  ): void {
    const textObj = this.add
      .text(x, y, text, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(30);

    this.tweens.add({
      targets: textObj,
      y: y - 50,
      alpha: 0,
      duration,
      onComplete: () => textObj.destroy(),
    });
  }

  private createScrollingQueue(): void {
    const { width, height } = this.scale;
    const isMobile = width < 550;
    const xPos = isMobile ? 16 : 40;
    const totalRows = 8;
    const startY = 80;
    const endY = height - 15;
    const activeHeight = endY - startY;
    const rowSpacing = activeHeight / totalRows;

    for (let index = 0; index < totalRows; index++) {
      const container = this.add.container(
        xPos,
        startY + index * rowSpacing + rowSpacing / 2
      );
      container.setDepth(5);

      const data = this.getRandomClaimData();

      // Avatar
      const avatar = this.add.sprite(0, 0, 'vs_npc_portraits', data.frame);
      this.updateAvatarTexture(avatar, data);
      container.add(avatar);

      // Username text
      const nameText = this.add
        .text(18, 0, `${data.username} +1`, {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ffffff',
        })
        .setOrigin(0, 0.5);
      container.add(nameText);

      container.setData('speed', Phaser.Math.FloatBetween(70, 110));
      this.scrollContainers.push(container);
    }
  }

  private updateAvatarTexture(
    avatar: Phaser.GameObjects.Sprite,
    data: { isSnoovatar: boolean; isCustomAvatar: boolean; key: string; frame: number }
  ): void {
    if ((data.isSnoovatar || data.isCustomAvatar) && this.textures.exists(data.key)) {
      avatar.setTexture(data.key);
      avatar.setScale(1);
      const maxDim = Math.max(avatar.width, avatar.height);
      if (maxDim > 0) {
        avatar.setScale(20 / maxDim);
      }
    } else {
      avatar.setTexture('vs_npc_portraits', data.frame);
      avatar.setScale(0.95);
    }
  }

  private getRandomClaimData(): {
    username: string;
    isSnoovatar: boolean;
    isCustomAvatar: boolean;
    key: string;
    frame: number;
  } {
    if (this.currentUsername && Math.random() < 0.12) {
      return {
        username: `u/${this.currentUsername}`,
        isSnoovatar: Boolean(
          this.currentSnoovatarUrl &&
          this.textures.exists(`snoovatar_${this.currentUsername}`)
        ),
        isCustomAvatar: false,
        key: `snoovatar_${this.currentUsername}`,
        frame: 0,
      };
    }
    const mock = MOCK_CLAIMS[Phaser.Math.Between(0, MOCK_CLAIMS.length - 1)]!;

    // 70% chance to use custom avatar
    if (Math.random() < 0.70) {
      const avatarIndex = Phaser.Math.Between(0, AVATAR_FILES.length - 1);
      return {
        username: mock.username,
        isSnoovatar: false,
        isCustomAvatar: true,
        key: `custom_avatar_${avatarIndex}`,
        frame: 0,
      };
    }

    // 30% chance fallback to NPC image
    return {
      username: mock.username,
      isSnoovatar: false,
      isCustomAvatar: false,
      key: 'vs_npc_portraits',
      frame: mock.frame,
    };
  }

  private createFollowOrCommentButton(
    panel: Phaser.GameObjects.Container
  ): void {
    const { width, height } = this.scale;
    const isMobile = width < 550;
    const btnY = 180;

    const btnContainer = this.add.container(0, btnY);
    panel.add(btnContainer);

    const bgWidth = isMobile ? 320 : 380;
    const bgHeight = 44;

    const shadow = this.add.graphics();
    shadow.fillStyle(0xff00ff, 1);
    shadow.fillRoundedRect(
      -bgWidth / 2 + 3,
      -bgHeight / 2 + 3,
      bgWidth,
      bgHeight,
      6
    );
    btnContainer.add(shadow);

    const bg = this.add.graphics();
    bg.fillStyle(0x0f172a, 1);
    bg.lineStyle(2, 0x00ffee, 1);
    bg.fillRoundedRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight, 6);
    bg.strokeRoundedRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight, 6);
    btnContainer.add(bg);

    const btnText = this.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: isMobile ? '10px' : '12px',
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5);
    btnContainer.add(btnText);

    btnContainer.setInteractive(
      new Phaser.Geom.Rectangle(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight),
      Phaser.Geom.Rectangle.Contains
    );

    let flashTimer: Phaser.Time.TimerEvent | null = null;

    const updateButtonState = () => {
      const isCurrentlyJoined =
        localStorage.getItem('cattack_joined_subreddit') === 'true';
      if (!isCurrentlyJoined) {
        btnText.setText('JOIN r/CATTACK TO CLAIM [DOUBLE] BOOSTER PACKS');
        btnText.setColor('#ffffff');
        if (flashTimer) {
          flashTimer.remove();
          flashTimer = null;
        }
      } else {
        if (this.isDoubleClaim) {
          btnText.setText('DOUBLE BOOSTER ACTIVE! [2 PACKS]');
          btnText.setColor('#39ff14');
          if (flashTimer) {
            flashTimer.remove();
            flashTimer = null;
          }
        } else {
          btnText.setText('Comment to claim an EXTRA pack!');
          let toggle = false;
          if (!flashTimer) {
            flashTimer = this.time.addEvent({
              delay: 350,
              loop: true,
              callback: () => {
                toggle = !toggle;
                btnText.setColor(toggle ? '#ff00ff' : '#ffff00');
              },
            });
          }
        }
      }
    };

    updateButtonState();

    btnContainer.on('pointerdown', async () => {
      const isCurrentlyJoined =
        localStorage.getItem('cattack_joined_subreddit') === 'true';
      if (!isCurrentlyJoined) {
        btnContainer.disableInteractive();
        try {
          await fetch('/api/subscribe', { method: 'POST' });
        } catch (err) {
          console.error(err);
        }
        localStorage.setItem('cattack_joined_subreddit', 'true');
        this.isDoubleClaim = true;
        this.showFloatingText(
          width / 2,
          height / 2 - 120,
          'Double pack unlocked!',
          '#00ff00'
        );
        updateButtonState();
        btnContainer.setInteractive();
      } else {
        if (this.isDoubleClaim) {
          this.showFloatingText(
            width / 2,
            height / 2 - 120,
            'Double pack already active!',
            '#39ff14'
          );
          return;
        }

        this.showCustomCommentPopup(
          async (commentText) => {
            btnContainer.disableInteractive();
            try {
              const response = await fetch('/api/post-comment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: commentText }),
              });

              if (response.ok) {
                this.isDoubleClaim = true;
                this.showFloatingText(
                  width / 2,
                  height / 2 - 120,
                  'Extra pack unlocked!',
                  '#00ff00'
                );
                updateButtonState();
              } else {
                this.showFloatingText(
                  width / 2,
                  height / 2 - 120,
                  'Failed to post comment',
                  '#ff0000'
                );
                btnContainer.setInteractive();
              }
            } catch (err) {
              console.error(err);
              btnContainer.setInteractive();
            }
          },
          () => {
            // Cancelled
          }
        );
      }
    });

    btnContainer.on('destroy', () => {
      if (flashTimer) {
        flashTimer.remove();
      }
    });
  }

  private storeReward(reward: DailyBoosterReward): void {
    if (reward.kind === 'cat' || reward.kind === 'holoCat') {
      const raw: unknown = JSON.parse(
        localStorage.getItem('player_owned_companion_cats') ?? '[]'
      );
      const cats = Array.isArray(raw)
        ? raw.filter((value) => typeof value === 'string')
        : [];
      cats.push(reward.catId);
      localStorage.setItem('player_owned_companion_cats', JSON.stringify(cats));
      if (reward.kind === 'holoCat') {
        const holoRaw: unknown = JSON.parse(
          localStorage.getItem('player_holographic_companion_cats') ?? '[]'
        );
        const holos = new Set(
          Array.isArray(holoRaw)
            ? holoRaw.filter((value) => typeof value === 'string')
            : []
        );
        holos.add(reward.catId);
        localStorage.setItem(
          'player_holographic_companion_cats',
          JSON.stringify([...holos])
        );
      }
      reportPlayerProgress({ catsCollected: 1, cardsClaimed: 1, xp: 25 });
      return;
    }
    const raw: unknown = JSON.parse(
      localStorage.getItem('player_card_deck') ?? '[]'
    );
    const deck = Array.isArray(raw) ? raw : [];
    deck.push(
      makeCard(
        reward.suit,
        reward.rank,
        reward.kind === 'holoDeck',
        reward.kind === 'sealedDeck' ? [reward.seal] : []
      )
    );
    localStorage.setItem('player_card_deck', JSON.stringify(deck));
    reportPlayerProgress({ cardsClaimed: 1 });
  }

  private showFinished(message: string, buttonLabel = 'MAIN MENU'): void {
    const { width, height } = this.scale;
    const panel = this.add.container(width / 2, height / 2).setDepth(20);
    this.addNeonPanel(panel, Math.min(width - 30, 390), 190);
    panel.add(
      this.add
        .text(0, -35, message, {
          fontFamily: 'monospace',
          fontSize: '17px',
          color: '#ffff00',
          align: 'center',
          wordWrap: { width: 340 },
        })
        .setOrigin(0.5)
    );
    const button = this.add
      .rectangle(0, 45, 160, 42, 0xd90053)
      .setStrokeStyle(3, 0x00ffee)
      .setInteractive({ useHandCursor: true });
    panel.add([
      button,
      this.add
        .text(0, 45, buttonLabel, {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ffffff',
        })
        .setOrigin(0.5),
    ]);
    button.once('pointerdown', emitDailyBoosterFinished);
  }

  private showCustomCommentPopup(onConfirm: (text: string) => void, onCancel: () => void): void {
    const { width, height } = this.scale;
    const isMobile = width < 550;
    const popupWidth = isMobile ? 320 : 400;
    const popupHeight = 230;

    const overlayBg = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.6)
      .setDepth(30)
      .setInteractive();

    const popupContainer = this.add.container(width / 2, height / 2).setDepth(31);

    this.addNeonPanel(popupContainer, popupWidth, popupHeight);

    const titleText = this.add
      .text(0, -75, 'COMMENT TO CLAIM', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#00ffee',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    popupContainer.add(titleText);

    let commentText = '';
    const inputBox = this.add.graphics();
    inputBox.fillStyle(0x0e172a, 1);
    inputBox.lineStyle(2, 0x475569, 1);
    inputBox.fillRoundedRect(-140, -38, 280, 36, 4);
    inputBox.strokeRoundedRect(-140, -38, 280, 36, 4);
    popupContainer.add(inputBox);

    const inputTextObj = this.add
      .text(-130, -20, 'Type a comment...', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#64748b',
      })
      .setOrigin(0, 0.5);
    popupContainer.add(inputTextObj);

    let focused = false;
    let cursorVisible = false;
    let cursorTimer: Phaser.Time.TimerEvent | null = null;

    const updateInputText = () => {
      let disp = commentText;
      if (disp === '') {
        inputTextObj.setText('Type a comment...');
        inputTextObj.setColor('#64748b');
      } else {
        if (focused && cursorVisible) {
          disp += '|';
        }
        inputTextObj.setText(disp);
        inputTextObj.setColor('#ffffff');
      }
    };

    const startFocus = () => {
      focused = true;
      inputBox.clear();
      inputBox.fillStyle(0x0e172a, 1);
      inputBox.lineStyle(2, 0x00ffee, 1);
      inputBox.fillRoundedRect(-140, -38, 280, 36, 4);
      inputBox.strokeRoundedRect(-140, -38, 280, 36, 4);
      
      if (!cursorTimer) {
        cursorTimer = this.time.addEvent({
          delay: 500,
          loop: true,
          callback: () => {
            cursorVisible = !cursorVisible;
            updateInputText();
          },
        });
      }
    };

    const stopFocus = () => {
      focused = false;
      inputBox.clear();
      inputBox.fillStyle(0x0e172a, 1);
      inputBox.lineStyle(2, 0x475569, 1);
      inputBox.fillRoundedRect(-140, -38, 280, 36, 4);
      inputBox.strokeRoundedRect(-140, -38, 280, 36, 4);
      if (cursorTimer) {
        cursorTimer.remove();
        cursorTimer = null;
      }
      cursorVisible = false;
      updateInputText();
    };

    const hitArea = this.add
      .zone(0, -20, 280, 36)
      .setInteractive({ useHandCursor: true });
    popupContainer.add(hitArea);
    hitArea.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation();
      startFocus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (!focused) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Backspace') {
        commentText = commentText.slice(0, -1);
      } else if (event.key === 'Enter') {
        submit();
      } else if (event.key.length === 1) {
        if (commentText.length < 50) {
          commentText += event.key;
        }
      }
      updateInputText();
    };
    window.addEventListener('keydown', onKeyDown);

    const cleanup = () => {
      window.removeEventListener('keydown', onKeyDown);
      if (cursorTimer) cursorTimer.remove();
      overlayBg.destroy();
      popupContainer.destroy();
    };

    const submit = () => {
      const text = commentText.trim();
      if (!text) {
        this.showFloatingText(
          width / 2,
          height / 2 - 120,
          'Please enter a comment!',
          '#ff0055'
        );
        return;
      }
      cleanup();
      onConfirm(text);
    };

    const closeBtn = this.add.container(popupWidth / 2 - 20, -popupHeight / 2 + 20);
    const closeText = this.add
      .text(0, 0, 'X', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#f43f5e',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    closeBtn.add(closeText);
    popupContainer.add(closeBtn);
    closeText.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation();
      cleanup();
      onCancel();
    });

    const submitBtn = this.add.container(65, 35);
    
    const subShadow = this.add.graphics();
    subShadow.fillStyle(0xff00ff, 1);
    subShadow.fillRoundedRect(-57, -17, 120, 36, 4);
    submitBtn.add(subShadow);

    const subBg = this.add.graphics();
    subBg.fillStyle(0x9d174d, 1);
    subBg.lineStyle(2, 0xffffff, 1);
    subBg.fillRoundedRect(-60, -20, 120, 36, 4);
    subBg.strokeRoundedRect(-60, -20, 120, 36, 4);
    submitBtn.add(subBg);

    const subText = this.add
      .text(0, -2, 'YES! >^_^<', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    submitBtn.add(subText);

    const subHit = this.add
      .zone(0, 0, 120, 36)
      .setInteractive({ useHandCursor: true });
    submitBtn.add(subHit);
    popupContainer.add(submitBtn);

    subHit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation();
      submit();
    });

    const cancelBtn = this.add.container(-65, 35);

    const canBg = this.add.graphics();
    canBg.fillStyle(0x1e293b, 1);
    canBg.lineStyle(2, 0x475569, 1);
    canBg.fillRoundedRect(-60, -20, 120, 36, 4);
    canBg.strokeRoundedRect(-60, -20, 120, 36, 4);
    cancelBtn.add(canBg);

    const canText = this.add
      .text(0, -2, 'CANCEL', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#94a3b8',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    cancelBtn.add(canText);

    const canHit = this.add
      .zone(0, 0, 120, 36)
      .setInteractive({ useHandCursor: true });
    cancelBtn.add(canHit);
    popupContainer.add(canHit);

    canHit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation();
      cleanup();
      onCancel();
    });

    const finePrint = this.add
      .text(0, 80, 'This will submit a comment as you!', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#f43f5e',
        align: 'center',
      })
      .setOrigin(0.5);
    popupContainer.add(finePrint);

    overlayBg.on('pointerdown', () => {
      stopFocus();
    });
  }
}
