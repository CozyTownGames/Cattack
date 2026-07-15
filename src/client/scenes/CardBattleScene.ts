import * as Phaser from 'phaser';
import { showForm } from '@devvit/web/client';
import { emitSceneChanged, emitIntelToast } from '../eventBus';
import { getPlayerProgress, reportPlayerProgress, changePlayerGold } from '../playerProgress';
import { isSoundMuted } from '../soundSettings';
import {
  Card,
  Challenger,
  runScoreCalculation as calculateScore,
  makeCard,
  ensureCard,
  CardSuit,
} from './cardBattle/cardRules';
import {
  createCardSprite as makeCardSprite,
  drawCardGraphics,
} from './cardBattle/cardGraphics';
import { showCardLeaderboard as displayCardLeaderboard } from './cardBattle/cardLeaderboard';
import {
  CompanionCatId,
  COMPANION_CATS,
  applyCompanionCats,
} from './cardBattle/companionCats';
import { getCatCardFrame } from './cardBattle/catCardFrames';
import {
  showCatSwapOverlay,
  showCatCardDetailOverlay,
  showOpponentPrizeSelection,
  type OpponentPrize,
} from './cardBattle/cardOverlays';
import {
  runSequentialScoringSequence as executePlayerScoring,
} from './cardBattle/battleSequences';
import type {
  BattleChallengeResponse,
  BattleChallengeSnapshot,
  BattleTurnSnapshot,
} from '../../shared/cardBattle';
import { BASE_PLAY_CARD_LIMIT, getPlayCardLimitForCats, INITIAL_BATTLE_DISCARDS } from '../../shared/cardBattle';
import type { ExpeditionOpponent, WildBattleResult } from '../../shared/expedition';
import { gameStore } from '../../shared/gameStore';
import {
  BOARD_SKINS,
  CARD_SKINS,
  getBoardSkin,
  getCardSkin,
  isBoardSkinId,
  isCardSkinId,
  type BoardSkinId,
  type CardSkinId,
} from '../../shared/cosmetics';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const createSeededRandom = (seed: string): (() => number) => {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffleWithSeed = <T>(values: T[], seed: string): T[] => {
  const shuffled = [...values];
  const random = createSeededRandom(seed);
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = shuffled[index];
    const swap = shuffled[swapIndex];
    if (current === undefined || swap === undefined) continue;
    shuffled[index] = swap;
    shuffled[swapIndex] = current;
  }
  return shuffled;
};

const createStandardBattleDeck = (): Card[] => {
  const suits: CardSuit[] = ['sakura', 'ghost', 'leaf', 'water'];
  return suits.flatMap((suit) => (
    Array.from({ length: 13 }, (_, index) => makeCard(suit, index + 2))
  ));
};

export class CardBattleScene extends Phaser.Scene {
  public playerDeck: Card[] = [];
  public playerHand: Card[] = [];
  public selectedCards: (Card | null)[] = [null, null, null, null, null];

  // Challenger info
  public challenger: Challenger | null = null;
  private isEasyBot = false;
  public botHand: Card[] = [];
  public botHands: Card[][] = [];
  public botCatsByTurn: CompanionCatId[][] = [];
  public botScoresByTurn: number[] = [];
  private recordedBattle: BattleChallengeSnapshot | null = null;
  private wildOpponent: ExpeditionOpponent | null = null;
  public playerTurnSnapshots: BattleTurnSnapshot[] = [];
  public botEquippedCats: CompanionCatId[] = [];
  public holographicCats = new Set<string>();
  public botHolographicCats = new Set<string>();
  private botCompanionSlotLabels: Phaser.GameObjects.Text[] = [];
  public botCompanionCatSprites: Phaser.GameObjects.Container[] = [];

  // Game state flags
  public isBattleStarted = false;
  public coins = 0;

  // Three-turn showdown state
  public handsRemaining = 3;
  public discardsRemaining = INITIAL_BATTLE_DISCARDS;
  public playerCumulativeScore = 0;
  public opponentCumulativeScore = 0;
  public highestHandScore = 0;
  public highestHandMult = 1.0;
  public currentTurn = 1;
  private currentDeckPool: Card[] = [];
  private challengeDeckCycle = 0;
  private battleScoreSeed = crypto.randomUUID();
  private equippedBoardSkin: BoardSkinId = 'classic';
  private equippedCardSkin: CardSkinId = 'classic';

  // UI components for resources
  private resourceText!: Phaser.GameObjects.Text;
  private discardButton!: Phaser.GameObjects.Container;
  private discardBtnText!: Phaser.GameObjects.Text;

  // Card Game Tally
  public baseScore = 0;
  public scoreMult = 1.0;
  public totalScore = 0;

  // Background Parallax
  private starFar!: Phaser.GameObjects.TileSprite;
  private starMid!: Phaser.GameObjects.TileSprite;
  private twinkleStars!: Phaser.GameObjects.Group;

  // Phaser GameObjects
  public cardSpritesInHand: Phaser.GameObjects.Container[] = [];
  public cardSpritesInPlay: (Phaser.GameObjects.Container | null)[] = [
    null,
    null,
    null,
    null,
    null,
  ];

  public getPlayerPlayCardLimit(): number {
    return getPlayCardLimitForCats(this.equippedCats);
  }

  public createEmptyPlayerPlaySlots(): (Card | null)[] {
    return Array.from({ length: this.getPlayerPlayCardLimit() }, () => null);
  }

  public createEmptyPlayerPlaySprites(): (Phaser.GameObjects.Container | null)[] {
    return Array.from({ length: this.getPlayerPlayCardLimit() }, () => null);
  }

  private syncPlayerPlaySlotCapacity(): void {
    const limit = this.getPlayerPlayCardLimit();
    this.selectedCards.length = limit;
    this.cardSpritesInPlay.length = limit;
    for (let index = 0; index < limit; index++) {
      if (this.selectedCards[index] === undefined) this.selectedCards[index] = null;
      if (this.cardSpritesInPlay[index] === undefined) this.cardSpritesInPlay[index] = null;
    }
  }
  public opponentCardSprites: Phaser.GameObjects.Container[] = [];
  public gameboardSprite!: Phaser.GameObjects.Image;

  // UI Panels / Texts
  private battleLogo!: Phaser.GameObjects.Image;
  private playerBankText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private opponentBankText!: Phaser.GameObjects.Text;
  private scoreSubmission: Promise<void> | null = null;
  private challengeResultSubmission: Promise<void> | null = null;
  private defenderProfileContainer: Phaser.GameObjects.Container | null = null;
  public scoreBoardContainer!: Phaser.GameObjects.Container;
  public scoreText!: Phaser.GameObjects.Text;
  public comboLabelText!: Phaser.GameObjects.Text;
  public battleButton!: Phaser.GameObjects.Container;
  private battleBtnText!: Phaser.GameObjects.Text;
  public resultBanner!: Phaser.GameObjects.Container;
  public emitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private slotGraphics!: Phaser.GameObjects.Graphics;
  private dividerGraphics!: Phaser.GameObjects.Graphics;

  // Cat Cards State & UI
  public ownedCats: CompanionCatId[] = [];
  public equippedCats: CompanionCatId[] = [];
  private companionSlotLabels: Phaser.GameObjects.Text[] = [];
  public companionCatSprites: Phaser.GameObjects.Container[] = [];
  private firstBattleTutorialActive = false;
  public companionsOverlayContainer: Phaser.GameObjects.Container | null = null;

  // Cat swap: one optional swap is available between turns only.
  public catSwapUsedThisHand = false;
  public isCatSwapPhase = false;
  public catSwapOverlay: Phaser.GameObjects.Container | null = null;
  public catSwapButton: Phaser.GameObjects.Container | null = null;

  // Discard pile counter
  private discardPileCount = 0;
  private discardPileLabel!: Phaser.GameObjects.Text;

  // Card detail overlay
  public cardDetailOverlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('CardBattleScene');
  }

  init(data?: { wildOpponent?: ExpeditionOpponent }): void {
    const pendingVsChallenge = !data?.wildOpponent && !gameStore.startFreshCardBattle
      ? gameStore.pendingVsBattleIntro?.challenge ?? null
      : null;
    if (pendingVsChallenge) gameStore.pendingVsBattleIntro = null;

    this.playerDeck = [];
    this.playerHand = [];
    this.selectedCards = [null, null, null, null, null];
    this.challenger = null;
    this.isEasyBot = false;
    this.isBattleStarted = false;
    this.baseScore = 0;
    this.scoreMult = 1.0;
    this.totalScore = 0;
    this.handsRemaining = 3;
    this.discardsRemaining = INITIAL_BATTLE_DISCARDS;
    this.playerCumulativeScore = 0;
    this.opponentCumulativeScore = 0;
    this.highestHandScore = 0;
    this.highestHandMult = 1.0;
    this.currentTurn = 1;
    this.currentDeckPool = [];
    this.challengeDeckCycle = 0;
    const storedBoardSkin = localStorage.getItem('player_equipped_board_skin');
    const storedCardSkin = localStorage.getItem('player_equipped_card_skin');
    this.equippedBoardSkin = isBoardSkinId(storedBoardSkin) ? storedBoardSkin : 'classic';
    this.equippedCardSkin = isCardSkinId(storedCardSkin) ? storedCardSkin : 'classic';
    this.cardSpritesInHand = [];
    this.cardSpritesInPlay = [null, null, null, null, null];
    this.opponentCardSprites = [];
    this.ownedCats = [];
    this.equippedCats = [];
    this.companionSlotLabels = [];
    this.companionCatSprites = [];
    this.firstBattleTutorialActive = false;
    this.botHand = [];
    this.botHands = [];
    this.botCatsByTurn = [];
    this.botScoresByTurn = [];
    this.recordedBattle = pendingVsChallenge;
    this.wildOpponent = data?.wildOpponent ?? null;
    this.playerTurnSnapshots = [];
    this.botEquippedCats = [];
    this.holographicCats = new Set();
    this.botHolographicCats = new Set();
    this.botCompanionSlotLabels = [];
    this.botCompanionCatSprites = [];
    this.scoreSubmission = null;
    this.challengeResultSubmission = null;
    this.defenderProfileContainer = null;
    this.companionsOverlayContainer = null;
    this.catSwapUsedThisHand = false;
    this.isCatSwapPhase = false;
    this.catSwapOverlay = null;
    this.catSwapButton = null;
    this.discardPileCount = 0;
    this.cardDetailOverlay = null;
  }


  preload(): void {
    // Generate base sparkle texture
    if (!this.textures.exists('sparkle')) {
      const sparkle = this.textures.createCanvas('sparkle', 8, 8);
      if (sparkle) {
        const ctx = sparkle.context;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(4, 4, 3, 0, Math.PI * 2);
        ctx.fill();
        sparkle.refresh();
      }
    }

    const v = Date.now();
    this.load.spritesheet('stars_tileset', `space/stars_tileset.png?v=${v}`, {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.image('space_tile', `space/space_tile.png?v=${v}`);
    this.load.spritesheet(
      'stars_animation1',
      `space/stars_animation1.png?v=${v}`,
      { frameWidth: 32, frameHeight: 32 }
    );
    this.load.spritesheet(
      'stars_animation2',
      `space/stars_animation2.png?v=${v}`,
      { frameWidth: 32, frameHeight: 32 }
    );
    this.load.spritesheet(
      'stars_animation3',
      `space/stars_animation3.png?v=${v}`,
      { frameWidth: 32, frameHeight: 32 }
    );

    this.load.spritesheet('card_tiles', 'cards/deck-cards.png', {
      frameWidth: 59,
      frameHeight: 91,
      // 13 columns (ranks 2-14) x 4 rows (suits)
    });

    this.load.spritesheet('cat_cards_tiles', 'cards/standard-cat-cards.png', {
      frameWidth: 59,
      frameHeight: 91,
    });

    this.load.spritesheet('wild_cat_cards_tiles', 'cards/wild-cat-cards.png', {
      frameWidth: 59,
      frameHeight: 91,
    });

    this.load.spritesheet('vs_npc_portraits', 'players/NPCs.png', {
      frameWidth: 24,
      frameHeight: 24,
    });

    for (let i = 1; i <= 5; i++) {
      this.load.audio(`score_meow_${i}`, `audio/meow-${i}.mp3`);
    }

    this.load.spritesheet('card_skins', 'cards/card-skins.png', {
      frameWidth: 59,
      frameHeight: 91,
    });
    CARD_SKINS.forEach((skin) => {
      if (skin.textureKey !== 'card_skins') this.load.image(skin.textureKey, skin.image);
    });

    BOARD_SKINS.forEach((skin) => this.load.image(skin.textureKey, skin.image));
    this.load.image('battle_logo', 'assets/cattack-logo.png');
    this.load.image('holo_card_overlay', 'cards/holo-cards.gif');
    this.load.image('gold_seal_overlay', 'cards/gold-seal.png');
    this.load.image('mult_seal_overlay', 'cards/mult-seal.png');
    this.load.image('nips_seal_overlay', 'cards/nips-seal.png');
  }

  create(): void {
    const { width, height } = this.scale;

    // Set linear filter on the cards/skins spritesheets so they scale and rotate smoothly
    if (this.textures.exists('card_tiles')) {
      this.textures.get('card_tiles').setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    if (this.textures.exists('card_skins')) {
      this.textures.get('card_skins').setFilter(Phaser.Textures.FilterMode.LINEAR);
    }

    // Emit scene changed so React HUD updates and hides Scramble-specific overlays
    emitSceneChanged({ scene: 'CardBattle' });

    // Emit again with slight delays to ensure React HUD hears it after mounting
    this.time.delayedCall(300, () => emitSceneChanged({ scene: 'CardBattle' }));
    this.time.delayedCall(800, () => emitSceneChanged({ scene: 'CardBattle' }));

    // 1. Particle emitter setup
    const particles = this.add.particles(0, 0, 'sparkle', {
      lifespan: 600,
      scale: { start: 1.0, end: 0 },
      alpha: { start: 0.8, end: 0 },
      speed: { min: 20, max: 100 },
      blendMode: 'ADD',
      emitting: false,
    });
    this.emitter = particles;

    // 2. Parallax Space Background
    this.cameras.main.setBackgroundColor('#0d0c12');

    if (!this.textures.exists('stars_bg_tiled')) {
      const canvasTex = this.textures.createCanvas('stars_bg_tiled', 512, 512);
      if (canvasTex) {
        const tex = this.textures.get('stars_tileset');
        const maxFrame = Math.max(0, tex.frameTotal - 2);
        for (let i = 0; i < 50; i++) {
          const rx = Phaser.Math.Between(0, 512);
          const ry = Phaser.Math.Between(0, 512);
          const rf = Phaser.Math.Between(0, maxFrame);
          canvasTex.drawFrame('stars_tileset', rf, rx, ry);
        }
        canvasTex.refresh();
      }
    }

    if (!this.anims.exists('twinkle_star_1')) {
      this.anims.create({
        key: 'twinkle_star_1',
        frames: this.anims.generateFrameNumbers('stars_animation1', {}),
        frameRate: Phaser.Math.Between(4, 7),
        repeat: -1,
      });
    }
    if (!this.anims.exists('twinkle_star_2')) {
      this.anims.create({
        key: 'twinkle_star_2',
        frames: this.anims.generateFrameNumbers('stars_animation2', {}),
        frameRate: Phaser.Math.Between(4, 7),
        repeat: -1,
      });
    }
    if (!this.anims.exists('twinkle_star_3')) {
      this.anims.create({
        key: 'twinkle_star_3',
        frames: this.anims.generateFrameNumbers('stars_animation3', {}),
        frameRate: Phaser.Math.Between(4, 7),
        repeat: -1,
      });
    }

    this.starFar = this.add
      .tileSprite(0, 0, width, height, 'stars_bg_tiled')
      .setOrigin(0)
      .setDepth(-4)
      .setScrollFactor(0);
    this.starMid = this.add
      .tileSprite(0, 0, width, height, 'space_tile')
      .setOrigin(0)
      .setDepth(-3)
      .setScrollFactor(0)
      .setAlpha(0.55)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.twinkleStars = this.add.group();
    for (let i = 0; i < 35; i++) {
      const rx = Phaser.Math.Between(0, width);
      const ry = Phaser.Math.Between(0, height);
      const type = Phaser.Math.Between(1, 3);
      const star = this.add.sprite(rx, ry, `stars_animation${type}`, 0);
      star.setDepth(-2);
      star.setScrollFactor(0);
      star.play(`twinkle_star_${type}`);
      if (star.anims.currentAnim)
        star.anims.setProgress(Phaser.Math.FloatBetween(0, 1));
      star.setData('speed', Phaser.Math.FloatBetween(0.5, 1.5));
      this.twinkleStars.add(star);
    }

    // Gameboard Background
    const initialBoardSkin = getBoardSkin(this.recordedBattle?.boardSkin ?? this.equippedBoardSkin);
    this.gameboardSprite = this.add.image(width / 2, height * 0.50, initialBoardSkin.textureKey);
    this.sizeGameboard();
    // Keep the board above space only. All gameplay objects and overlays use
    // the default depth or higher, so they can never render behind the board.
    this.gameboardSprite.setDepth(-1);
    // Nearest neighbor filtering for crisp pixel art
    if (this.textures.exists(initialBoardSkin.textureKey)) {
      this.textures
        .get(initialBoardSkin.textureKey)
        .setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    // 3. Load user coins / deck
    this.loadPlayerData();

    // 4. Setup top bar elements
    this.battleLogo = this.add
      .image(20, 8, 'battle_logo')
      .setOrigin(0, 0)
      .setDepth(10);
    this.sizeBattleLogo();

    this.resourceText = this.add
      .text(20, this.getResourceTextY(), `Hands: ${this.handsRemaining}\nDiscards: ${this.discardsRemaining}`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#00ffee',
      })
      .setOrigin(0, 0)
      .setDepth(10)
      .setVisible(!this.isMobileLayout(width));

    // Companions button removed

    this.playerBankText = this.add
      .text(width / 2 - 58, this.getBankTextY(), 'YOU 0', {
        fontFamily: 'monospace',
        fontSize: this.isMobileLayout(width) ? '10px' : '14px',
        color: '#ffbb00',
      })
      .setOrigin(1, 0)
      .setDepth(10);

    this.turnText = this.add
      .text(width / 2, this.getBankTextY(), 'TURN 1/3', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0)
      .setDepth(10);

    this.opponentBankText = this.add
      .text(width / 2 + 58, this.getBankTextY(), 'OPPONENT 0', {
        fontFamily: 'monospace',
        fontSize: this.isMobileLayout(width) ? '10px' : '14px',
        color: '#ffbb00',
      })
      .setOrigin(0, 0)
      .setDepth(10);

    // Board divider line
    this.dividerGraphics = this.add.graphics();
    this.dividerGraphics.setDepth(4);
    this.drawBoardDivider();

    // Play slot outlines & cat cards
    this.slotGraphics = this.add.graphics();
    this.slotGraphics.setDepth(4);
    this.drawPlaySlots();
    this.renderEquippedCompanionCats();

    // 5. Score board setup
    this.createScoreBoard();

    // 6. Battle Button setup
    this.createBattleButtons();

    // 7. Check if this is the first game
    this.fetchChallengerAndStart();

    // 8. Responsive scale listener
    this.scale.on('resize', this.handleResize, this);
  }

  private loadPlayerData(): void {
    const deckStr = localStorage.getItem('player_card_deck');
    if (deckStr) {
      try {
        const rawDeck = JSON.parse(deckStr);
        // Hydrate raw objects into fully-typed Card instances
        this.playerDeck = rawDeck.map((raw: Record<string, unknown>) => ensureCard(raw as Partial<Card> & { number?: number; family?: string; rank?: number; suit?: string }));
        // Auto-unlock existing cards in the deck
        const unlockedStr =
          localStorage.getItem('player_unlocked_cards') || '[]';
        const unlocked: string[] = JSON.parse(unlockedStr);
        let changed = false;
        this.playerDeck.forEach((card) => {
          const key = `${card.suit}-${card.rank}`;
          if (!unlocked.includes(key)) {
            unlocked.push(key);
            changed = true;
          }
        });
        if (changed) {
          localStorage.setItem(
            'player_unlocked_cards',
            JSON.stringify(unlocked)
          );
        }
      } catch (e) {
        this.playerDeck = [];
      }
    }

    const coinsStr = localStorage.getItem('player_card_coins');
    this.coins = coinsStr ? parseInt(coinsStr) : 0;

    const ownedCatsStr = localStorage.getItem('player_owned_companion_cats');
    if (ownedCatsStr) {
      this.ownedCats = JSON.parse(ownedCatsStr);
    } else {
      this.ownedCats = [];
    }

    const equippedCatsStr = localStorage.getItem('player_companion_cats');
    this.equippedCats = equippedCatsStr ? JSON.parse(equippedCatsStr) : [];

    try {
      const holographicCats: unknown = JSON.parse(localStorage.getItem('player_holographic_companion_cats') ?? '[]');
      this.holographicCats = new Set(Array.isArray(holographicCats)
        ? holographicCats.filter((value): value is string => typeof value === 'string')
        : []);
    } catch {
      this.holographicCats = new Set();
    }
  }

  public savePlayerData(): void {
    localStorage.setItem('player_card_deck', JSON.stringify(this.playerDeck));
    localStorage.setItem('player_card_coins', this.coins.toString());
    localStorage.setItem('player_owned_companion_cats', JSON.stringify(this.ownedCats));
    localStorage.setItem('player_companion_cats', JSON.stringify(this.equippedCats));

    // Auto-unlock cards in the deck
    try {
      const unlockedStr = localStorage.getItem('player_unlocked_cards') || '[]';
      const unlocked: string[] = JSON.parse(unlockedStr);
      let changed = false;
      this.playerDeck.forEach((card) => {
        const key = `${card.suit}-${card.rank}`;
        if (!unlocked.includes(key)) {
          unlocked.push(key);
          changed = true;
        }
      });
      if (changed) {
        localStorage.setItem('player_unlocked_cards', JSON.stringify(unlocked));
      }
    } catch (e) {
      console.error(e);
    }
  }

  private createScoreBoard(): void {
    const { width, height } = this.scale;
    // Position centered between play slots and hand area
    const scoreY = this.getScoreBoardY(height);

    this.scoreBoardContainer = this.add.container(width / 2, scoreY);
    this.scoreBoardContainer.setDepth(150);

    // Background panel (widened from 300 to 360 to accommodate rebranding text)
    const boardBg = this.add.graphics();
    boardBg.fillStyle(0x0c071e, 0.9);
    boardBg.lineStyle(2, 0x00ffee, 0.6);
    boardBg.fillRoundedRect(-180, -18, 360, 36, 6);
    boardBg.strokeRoundedRect(-180, -18, 360, 36, 6);
    this.scoreBoardContainer.add(boardBg);

    // Left text: selection status / combo name
    this.comboLabelText = this.add
      .text(-170, 0, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#00ffee',
      })
      .setOrigin(0, 0.5);
    this.scoreBoardContainer.add(this.comboLabelText);

    // Right text: multiplier and score formula (Rebranded to Nips and Mults)
    this.scoreText = this.add
      .text(170, 0, '0 Nips x 1.0 Mults = 0', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffbb00',
      })
      .setOrigin(1, 0.5);
    this.scoreBoardContainer.add(this.scoreText);
  }

  public drawPlaySlots(): void {
    if (!this.slotGraphics) return;
    this.slotGraphics.clear();
    
    // Clear old companion slot labels
    this.companionSlotLabels.forEach((l) => l.destroy());
    this.companionSlotLabels = [];

    const { width, height } = this.scale;
    const cardScale = this.getCardScale();
    const w = 59 * cardScale;
    const h = 91 * cardScale;

    // 1. Draw active play slots (Daruda/Caruma grants a sixth)
    const playY = height * 0.61;
    const playCardLimit = this.getPlayerPlayCardLimit();
    const playSpacing = this.getPlayCardSpacing(width, cardScale, playCardLimit);
    this.slotGraphics.lineStyle(2, 0x00ffee, 0.3);
    for (let i = 0; i < playCardLimit; i++) {
      const rx = width / 2 + (i - (playCardLimit - 1) / 2) * playSpacing;
      this.slotGraphics.strokeRoundedRect(rx - w / 2, playY - h / 2, w, h, 6);
    }

    // Cat Cards render without passive-slot borders.
    this.botCompanionSlotLabels.forEach((l) => l.destroy());
    this.botCompanionSlotLabels = [];
  }

  private drawBoardDivider(): void {
    if (!this.dividerGraphics) return;
    this.dividerGraphics.clear();
  }

  private createBattleButtons(): void {
    const { width, height } = this.scale;
    const btnY = this.getBattleButtonY(height);

    // 1. Play Hand Button
    this.battleButton = this.add.container(width / 2 - 90, btnY);
    this.battleButton.setDepth(150);

    const playBg = this.add.graphics();
    playBg.fillStyle(0x00cc44, 0.4);
    playBg.lineStyle(3, 0xffffff, 0.5);
    playBg.fillRoundedRect(-75, -20, 150, 40, 8);
    playBg.strokeRoundedRect(-75, -20, 150, 40, 8);
    playBg.setName('bg');
    this.battleButton.add(playBg);

    this.battleBtnText = this.add
      .text(0, 0, 'PLAY HAND', {
        fontFamily: 'monospace',
        fontSize: this.isMobileLayout(width) ? '10px' : '14px',
        color: '#88ffffff',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    this.battleButton.add(this.battleBtnText);

    this.battleButton.setInteractive(
      new Phaser.Geom.Rectangle(-75, -20, 150, 40),
      Phaser.Geom.Rectangle.Contains
    );

    this.battleButton.on('pointerover', () => {
      if (this.isBattleStarted || this.getSelectedCount() === 0) return;
      this.tweens.add({ targets: this.battleButton, scale: 1.05, duration: 100 });
    });
    this.battleButton.on('pointerout', () => {
      this.tweens.add({ targets: this.battleButton, scale: 1.0, duration: 100 });
    });
    this.battleButton.on('pointerdown', () => {
      if (this.isBattleStarted || this.getSelectedCount() === 0) return;
      this.playHandAction();
    });

    // 2. Discard Button
    this.discardButton = this.add.container(width / 2 + 90, btnY);
    this.discardButton.setDepth(150);

    const discardBg = this.add.graphics();
    discardBg.fillStyle(0xcc0033, 0.4);
    discardBg.lineStyle(3, 0xffffff, 0.5);
    discardBg.fillRoundedRect(-75, -20, 150, 40, 8);
    discardBg.strokeRoundedRect(-75, -20, 150, 40, 8);
    discardBg.setName('bg');
    this.discardButton.add(discardBg);

    this.discardBtnText = this.add
      .text(0, 0, 'DISCARD', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#88ffffff',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    this.discardButton.add(this.discardBtnText);

    this.discardButton.setInteractive(
      new Phaser.Geom.Rectangle(-75, -20, 150, 40),
      Phaser.Geom.Rectangle.Contains
    );

    this.discardButton.on('pointerover', () => {
      if (this.isBattleStarted || this.getSelectedCount() === 0 || this.discardsRemaining <= 0) return;
      this.tweens.add({ targets: this.discardButton, scale: 1.05, duration: 100 });
    });
    this.discardButton.on('pointerout', () => {
      this.tweens.add({ targets: this.discardButton, scale: 1.0, duration: 100 });
    });
    this.discardButton.on('pointerdown', () => {
      if (this.isBattleStarted || this.getSelectedCount() === 0) return;
      this.discardSelectedCards();
    });

    this.updateBattleButtonState();

    // 4. Discard pile counter label
    this.discardPileLabel = this.add.text(width - 12, btnY, 'Discard: 0', {
      fontFamily: 'monospace',
      fontSize: '11px', color: '#ff6666',
    }).setOrigin(1, 0.5).setDepth(150).setVisible(false);
  }


  public updateBattleButtonState(): void {
    const count = this.getSelectedCount();
    const playBg = this.battleButton?.getByName('bg') as Phaser.GameObjects.Graphics;
    const discardBg = this.discardButton?.getByName('bg') as Phaser.GameObjects.Graphics;

    if (this.isBattleStarted) {
      if (this.battleButton) this.battleButton.setVisible(false);
      if (this.discardButton) this.discardButton.setVisible(false);
      return;
    }

    if (this.battleButton) this.battleButton.setVisible(true);
    if (this.discardButton) this.discardButton.setVisible(true);

    // Play button active when count > 0 and handsRemaining > 0
    if (count > 0 && this.handsRemaining > 0) {
      playBg?.clear();
      playBg?.fillStyle(0x00cc44, 0.95);
      playBg?.lineStyle(3, 0xffffff, 1.0);
      playBg?.fillRoundedRect(-75, -20, 150, 40, 8);
      playBg?.strokeRoundedRect(-75, -20, 150, 40, 8);
      this.battleBtnText?.setColor('#ffffff');
    } else {
      playBg?.clear();
      playBg?.fillStyle(0x555555, 0.4);
      playBg?.lineStyle(3, 0x888888, 0.5);
      playBg?.fillRoundedRect(-75, -20, 150, 40, 8);
      playBg?.strokeRoundedRect(-75, -20, 150, 40, 8);
      this.battleBtnText?.setColor('#88ffffff');
    }

    // Discard button active when count > 0 and discardsRemaining > 0
    if (count > 0 && this.discardsRemaining > 0) {
      discardBg?.clear();
      discardBg?.fillStyle(0xcc0033, 0.95);
      discardBg?.lineStyle(3, 0xffffff, 1.0);
      discardBg?.fillRoundedRect(-75, -20, 150, 40, 8);
      discardBg?.strokeRoundedRect(-75, -20, 150, 40, 8);
      this.discardBtnText?.setColor('#ffffff');
    } else {
      discardBg?.clear();
      discardBg?.fillStyle(0x555555, 0.4);
      discardBg?.lineStyle(3, 0x888888, 0.5);
      discardBg?.fillRoundedRect(-75, -20, 150, 40, 8);
      discardBg?.strokeRoundedRect(-75, -20, 150, 40, 8);
      this.discardBtnText?.setColor('#88ffffff');
    }
  }

  public fetchChallengerAndStart(): void {
    if (this.wildOpponent) {
      const cards = this.wildOpponent.cards.map((card) => ensureCard(card));
      this.setupMatch({ username: this.wildOpponent.name, score: 0, cards });
      return;
    }
    const url = this.isEasyBot
      ? '/api/card-challenger?easy=true'
      : '/api/card-challenger';

    const fallbackCards: Card[] = [
      makeCard('sakura', 2),
      makeCard('water', 3),
      makeCard('ghost', 4),
      makeCard('leaf', 5),
      makeCard('leaf', 6),
    ];
    const fallbackBot = {
      username: 'u/SpaceCorgi',
      score: this.runScoreCalculation(fallbackCards).score,
      cards: fallbackCards,
    };

    const fetchStandardChallenger = () => fetch(url)
      .then((response) => response.json())
      .then((challengerData) => {
        if (challengerData && challengerData.challenger) {
          const rawChallenger = challengerData.challenger;
          rawChallenger.cards = (rawChallenger.cards || []).map((raw: Record<string, unknown>) => ensureCard(raw));
          this.setupMatch(rawChallenger);
        } else {
          this.setupMatch(fallbackBot);
        }
      });

    if (gameStore.startFreshCardBattle) {
      gameStore.startFreshCardBattle = false;
      void fetchStandardChallenger().catch(() => this.setupMatch(fallbackBot));
      return;
    }

    fetch('/api/card-battle')
      .then((res) => res.json())
      .then((data: BattleChallengeResponse) => {
        const challenge = data.challenge ?? null;
        if (challenge) {
          this.recordedBattle = challenge;
          this.applyBoardSkin(challenge.boardSkin ?? 'classic');
          this.showDefenderProfile(
            challenge.defenderUsername,
            data.defenderSnoovatarUrl,
            data.defenderGlobalRank ?? null,
            data.defenderGlobalWins ?? 0
          );
          if (data.viewerHasWon) {
            this.showCardLeaderboard();
            return;
          }
          const cards = challenge.turns.flatMap((turn) => turn.cards.map((card) => ensureCard(card)));
          this.setupMatch({
            username: challenge.defenderUsername,
            score: challenge.cumulativeScore,
            cards,
          });
          return;
        }

        return fetchStandardChallenger();
      })
      .catch(() => {
        this.setupMatch(fallbackBot);
      });
  }

  private showDefenderProfile(
    username: string,
    snoovatarUrl: string | undefined,
    globalRank: number | null,
    globalWins: number
  ): void {
    this.defenderProfileContainer?.destroy(true);

    const container = this.add
      .container(
        this.getDefenderProfileX(this.scale.width),
        this.getDefenderProfileY(this.scale.height)
      )
      .setDepth(180);
    this.defenderProfileContainer = container;

    const fallbackFrame = Math.floor(
      createSeededRandom(`${this.recordedBattle?.seed ?? username}:defender-profile`)() * 8
    );
    const fallback = this.add
      .sprite(0, this.isMobileLayout() ? -18 : -25, 'vs_npc_portraits', fallbackFrame)
      .setScale(this.isMobileLayout() ? 2.35 : 3.25);
    const usernameText = this.add
      .text(0, this.isMobileLayout() ? 17 : 24, username, {
        fontFamily: 'monospace',
        fontSize: this.isMobileLayout() ? '8px' : '10px',
        color: '#00ffee',
        align: 'center',
        stroke: '#000000',
        strokeThickness: 3,
        fixedWidth: this.isMobileLayout() ? 88 : 108,
      })
      .setOrigin(0.5);
    const rankText = this.add
      .text(
        0,
        this.isMobileLayout() ? 30 : 40,
        this.isMobileLayout()
          ? globalRank === null ? 'UNRANKED' : `GLOBAL #${globalRank}`
          : globalRank === null
            ? `${globalWins.toLocaleString()} WINS · UNRANKED`
            : `${globalWins.toLocaleString()} WINS · GLOBAL #${globalRank}`,
        {
          fontFamily: 'monospace',
          fontSize: this.isMobileLayout() ? '8px' : '9px',
          color: '#ffbb00',
          align: 'center',
          fixedWidth: this.isMobileLayout() ? 92 : 128,
          stroke: '#000000',
          strokeThickness: 3,
        }
      )
      .setOrigin(0.5);
    container.add([fallback, usernameText, rankText]);

    if (!snoovatarUrl) return;
    let textureHash = 2166136261;
    for (let index = 0; index < username.length; index++) {
      textureHash ^= username.charCodeAt(index);
      textureHash = Math.imul(textureHash, 16777619);
    }
    const textureKey = `vs_snoovatar_${textureHash >>> 0}`;
    const showSnoovatar = (): void => {
      if (!container.active || !this.textures.exists(textureKey)) return;
      const avatar = this.add.image(0, this.isMobileLayout() ? -18 : -25, textureKey);
      const maxDimension = Math.max(avatar.width, avatar.height);
      if (maxDimension > 0) avatar.setScale((this.isMobileLayout() ? 58 : 82) / maxDimension);
      fallback.destroy();
      container.addAt(avatar, 0);
    };

    if (this.textures.exists(textureKey)) {
      showSnoovatar();
      return;
    }

    this.load.once(`filecomplete-image-${textureKey}`, showSnoovatar);
    this.load.image(textureKey, snoovatarUrl);
    this.load.start();
  }

  private applyBoardSkin(skinId: BoardSkinId): void {
    if (!this.gameboardSprite) return;
    const skin = getBoardSkin(skinId);
    if (!this.textures.exists(skin.textureKey)) return;
    this.gameboardSprite.setTexture(skin.textureKey);
    this.textures.get(skin.textureKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.sizeGameboard();
  }

  private sizeGameboard(): void {
    if (!this.gameboardSprite) return;
    const scale = this.getLayoutScale() * 2.5;
    this.gameboardSprite.setDisplaySize(240 * scale, 148 * scale);
  }

  public updateUI(): void {
    const playerLeading = this.playerCumulativeScore > this.opponentCumulativeScore;
    const opponentLeading = this.playerCumulativeScore < this.opponentCumulativeScore;
    this.playerBankText.setText(`YOU ${this.playerCumulativeScore.toLocaleString()}`);
    this.opponentBankText.setText(`OPPONENT ${this.opponentCumulativeScore.toLocaleString()}`);
    this.turnText.setText(`TURN ${this.currentTurn}/3`);
    this.playerBankText.setColor(playerLeading ? '#00cc44' : opponentLeading ? '#ff3333' : '#ffbb00');
    this.opponentBankText.setColor(playerLeading ? '#ff3333' : opponentLeading ? '#00cc44' : '#ffbb00');
    if (this.resourceText) {
      this.resourceText.setText(`Hands: ${this.handsRemaining}\nDiscards: ${this.discardsRemaining}`);
    }
  }

  private recordChallengeResult(challengerWon: boolean): Promise<void> {
    return fetch('/api/record-card-battle-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengerWon }),
      keepalive: true,
    })
      .then(() => undefined)
      .catch(() => undefined);
  }

  public drawCards(count: number): Card[] {
    const drawn: Card[] = [];
    for (let i = 0; i < count; i++) {
      if (this.currentDeckPool.length === 0) {
        const challengeSeed = this.recordedBattle?.seed;
        if (challengeSeed) {
          this.currentDeckPool = shuffleWithSeed(
            createStandardBattleDeck(),
            `${challengeSeed}:challenger-deck:${this.challengeDeckCycle}`
          );
          this.challengeDeckCycle++;
        } else {
          this.currentDeckPool = Phaser.Utils.Array.Shuffle([...this.playerDeck]);
        }
      }
      const card = this.currentDeckPool.pop();
      if (card) drawn.push(card);
    }
    return drawn;
  }

  private setupMatch(challenger: Challenger): void {
    // Use recorded opponent data when it contains a complete three-hand match;
    // otherwise create a fair 15-card bot pool from the standard 52-card deck.
    const suits: CardSuit[] = ['sakura', 'ghost', 'leaf', 'water'];
    let opponentCards = challenger.cards.slice(0, 15);
    if (opponentCards.length < 15) {
      const deckPool: Card[] = [];
      for (const suit of suits) {
        for (let rank = 2; rank <= 14; rank++) {
          deckPool.push(makeCard(suit, rank));
        }
      }
      opponentCards = Phaser.Utils.Array.Shuffle(deckPool).slice(0, 15);
    }
    if (!this.recordedBattle) {
      opponentCards = opponentCards.map((card) => makeCard(card.suit, card.rank));
    }
    challenger.cards = opponentCards;

    this.challenger = challenger;
    
    // Reset player resources
    this.handsRemaining = 3;
    this.discardsRemaining = INITIAL_BATTLE_DISCARDS;
    this.playerCumulativeScore = 0;
    this.opponentCumulativeScore = 0;
    this.currentTurn = 1;
    this.playerTurnSnapshots = [];

    this.updateUI();

    // Clean up old card sprites
    this.cardSpritesInHand.forEach((s) => s.destroy());
    this.cardSpritesInHand = [];
    this.opponentCardSprites.forEach((s) => s.destroy());
    this.opponentCardSprites = [];

    this.cardSpritesInPlay.forEach((s) => {
      if (s) s.destroy();
    });
    this.cardSpritesInPlay = this.createEmptyPlayerPlaySprites();
    this.selectedCards = this.createEmptyPlayerPlaySlots();

    this.isBattleStarted = false;

    // Reset scoring
    this.baseScore = 0;
    this.scoreMult = 1.0;
    this.totalScore = 0;
    this.updateScoreBoardDisplay();
    this.updateBattleButtonState();

    // Initialize currentDeckPool
    const challengeSeed = this.recordedBattle?.seed;
    if (challengeSeed) {
      this.currentDeckPool = shuffleWithSeed(
        createStandardBattleDeck(),
        `${challengeSeed}:challenger-deck:0`
      );
      this.challengeDeckCycle = 1;
    } else {
      this.currentDeckPool = Phaser.Utils.Array.Shuffle([...this.playerDeck]);
      this.challengeDeckCycle = 0;
    }

    this.botHands = this.recordedBattle
      ? this.recordedBattle.turns.map((turn) => turn.cards.map((card) => ensureCard(card)))
      : [
          challenger.cards.slice(0, BASE_PLAY_CARD_LIMIT),
          challenger.cards.slice(BASE_PLAY_CARD_LIMIT, BASE_PLAY_CARD_LIMIT * 2),
          challenger.cards.slice(BASE_PLAY_CARD_LIMIT * 2, BASE_PLAY_CARD_LIMIT * 3),
        ];
    this.botHand = this.botHands[0] ?? [];

    if (this.recordedBattle) {
      this.botCatsByTurn = this.recordedBattle.turns.map((turn) =>
        turn.cats.filter(this.isCompanionCatId)
      );
      this.botScoresByTurn = this.recordedBattle.turns.map((turn) => turn.score);
      this.botHolographicCats = new Set(this.recordedBattle.turns[0]?.holographicCats ?? []);
    } else {
      this.botCatsByTurn = [];
      this.botScoresByTurn = [];
      this.botHolographicCats = new Set();
    }

    // Define bot's pre-selected Cat Cards based on username/difficulty
    if (this.wildOpponent) {
      this.botEquippedCats = this.wildOpponent.cats.filter(this.isCompanionCatId);
    } else if (this.botCatsByTurn.length > 0) {
      this.botEquippedCats = this.botCatsByTurn[0] ?? [];
    } else if (this.isEasyBot || challenger.username === 'u/SpaceCorgi') {
      this.botEquippedCats = ['c1'];
    } else if (challenger.username === 'u/CardMaster') {
      this.botEquippedCats = ['c6', 'c11', 'c26'];
    } else if (challenger.username === 'u/NebulaKitten') {
      this.botEquippedCats = ['c8', 'c13', 'c20'];
    } else if (challenger.username === 'u/DeepSpaceCat') {
      this.botEquippedCats = ['c16', 'c24', 'c27'];
    } else {
      const allCatIds: CompanionCatId[] = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12', 'c13', 'c14', 'c15', 'c26', 'c27', 'c29', 'c30'];
      const shuffled = Phaser.Utils.Array.Shuffle([...allCatIds]);
      this.botEquippedCats = shuffled.slice(0, 3);
    }

    // Setup the opponent's first of three five-card hands face-down.
    const { width, height } = this.scale;
    const opponentY = this.getOpponentY(height);
    const opScale = this.getCardScale();
    const spacing = this.getOpponentCardSpacing(width, opScale, this.botHand.length);

    this.botHand.forEach((c, idx) => {
      const rx = this.getOpponentHandCenterX(width) + (idx - (this.botHand.length - 1) / 2) * spacing;
      const cardSprite = this.createCardSprite(rx, opponentY, c, true);
      cardSprite.setScale(opScale);
      this.opponentCardSprites.push(cardSprite);

      this.tweens.add({
        targets: cardSprite,
        y: opponentY,
        scale: opScale,
        duration: 400,
        delay: idx * 100,
        ease: 'Back.easeOut',
      });
    });

    // Auto-equip up to 3 random cats from owned inventory for this match
    if (this.ownedCats.length > 0) {
      const uniqueOwnedCats = [...new Set(this.ownedCats)].filter((catId) => this.isCompanionCatId(catId));
      const shuffledOwned = challengeSeed
        ? shuffleWithSeed(uniqueOwnedCats, `${challengeSeed}:challenger-cats`)
        : Phaser.Utils.Array.Shuffle(uniqueOwnedCats);
      this.equippedCats = shuffledOwned.slice(0, 3);
      localStorage.setItem('player_companion_cats', JSON.stringify(this.equippedCats));
    }
    this.renderEquippedCompanionCats();
    this.botCompanionCatSprites.forEach((s) => s.destroy());
    this.botCompanionCatSprites = [];
    this.renderBotCompanionCats();

    this.catSwapUsedThisHand = false;
    this.isCatSwapPhase = false;
    this.discardPileCount = 0;
    if (this.discardPileLabel) this.discardPileLabel.setText('Discard: 0');

    this.dealPlayerHand();
    this.time.delayedCall(850, () => this.maybeShowFirstBattleTutorial());
  }

  private maybeShowFirstBattleTutorial(): void {
    const hasCompletedStarterPack = localStorage.getItem('player_starter_pack_opened') === '1';
    const hasCompletedTutorial = localStorage.getItem('cattack_first_battle_tutorial') === '1';
    const playerWins = Number(localStorage.getItem('player_total_wins') ?? '0');
    if (
      this.firstBattleTutorialActive
      || !hasCompletedStarterPack
      || hasCompletedTutorial
      || playerWins > 0
      || this.wildOpponent
      || this.recordedBattle
    ) return;

    this.firstBattleTutorialActive = true;
    const { width, height } = this.scale;
    const overlay = this.add.container(0, 0).setDepth(1000);
    const blocker = this.add.rectangle(width / 2, height / 2, width, height, 0x02040d, 0.52)
      .setInteractive({ useHandCursor: true });
    overlay.add(blocker);

    const panel = this.add.container(width / 2, height / 2);
    const panelWidth = Math.min(430, width - 28);
    const panelBackground = this.add.rectangle(0, 0, panelWidth, 150, 0x090d1a, 0.98)
      .setStrokeStyle(3, 0x00ffee);
    const beforeText = this.add.text(0, -38, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', align: 'center',
      wordWrap: { width: panelWidth - 30 }, lineSpacing: 4,
    }).setOrigin(0.5);
    const afterText = this.add.text(0, 35, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', align: 'center',
      wordWrap: { width: panelWidth - 30 }, lineSpacing: 3,
    }).setOrigin(0.5);
    const magentaWord = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ff00ff', fontStyle: 'bold',
    }).setOrigin(0.5);
    const yellowWord = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffff00', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0);
    const tapText = this.add.text(0, 62, 'TAP ANYWHERE  ▶', {
      fontFamily: 'monospace', fontSize: '12px', color: '#00ffee', fontStyle: 'bold',
    }).setOrigin(0.5);
    panel.add([panelBackground, beforeText, afterText, magentaWord, yellowWord, tapText]);
    overlay.add(panel);

    const pointer = this.add.text(0, 0, '▼', {
      fontFamily: 'monospace', fontSize: '30px', color: '#ffff00',
      stroke: '#ff00ff', strokeThickness: 3,
    }).setOrigin(0.5).setVisible(false);
    overlay.add(pointer);
    this.tweens.add({ targets: magentaWord, alpha: 0, duration: 320, yoyo: true, repeat: -1, ease: 'Linear' });
    this.tweens.add({ targets: yellowWord, alpha: 1, duration: 320, yoyo: true, repeat: -1, ease: 'Linear' });
    this.tweens.add({ targets: tapText, alpha: 0.35, duration: 650, yoyo: true, repeat: -1 });

    const steps = [
      {
        before: 'WELCOME TO CATTACK! POKER WITH A',
        flash: 'CAT-TASTIC',
        after: 'TWIST ~MEOW',
        panelX: width / 2,
        panelY: height / 2,
        target: null,
      },
      {
        before: 'THIS IS THE BADDIE.',
        flash: '',
        after: 'YOU WANNA SCORE HIGHER THAN THEM.',
        panelX: width / 2,
        panelY: height * 0.58,
        target: { x: width / 2, y: this.getOpponentY(height) },
      },
      {
        before: 'THESE ARE YOUR',
        flash: 'FURRRRR-IENDS!!!!',
        after: 'THEY HAVE SPECIAL SCORING PERKS.\nCATCH THEM ALL TO MAKE THE BEST COMBOS >^_^<',
        panelX: width * 0.62,
        panelY: height * 0.42,
        target: this.companionCatSprites[0]
          ? { x: this.companionCatSprites[0].x, y: this.companionCatSprites[0].y }
          : this.getPlayerCatPosition(0, width, height, this.getCardScale()),
      },
      {
        before: 'PICK UP TO 5 CARDS',
        flash: 'NOW!!!',
        after: 'MEOW MEOW MEOW :3',
        panelX: width / 2,
        panelY: height * 0.35,
        target: { x: width / 2, y: height - 82 },
      },
    ];

    let stepIndex = 0;
    const showStep = (): void => {
      const step = steps[stepIndex];
      if (!step) return;
      panel.setPosition(step.panelX, step.panelY);
      beforeText.setText(step.before);
      afterText.setText(step.after);
      magentaWord.setText(step.flash).setVisible(Boolean(step.flash));
      yellowWord.setText(step.flash).setVisible(Boolean(step.flash));
      pointer.setVisible(Boolean(step.target));
      this.tweens.killTweensOf(pointer);
      if (step.target) {
        pointer.setPosition(step.target.x, step.target.y - 55);
        this.tweens.add({
          targets: pointer,
          y: step.target.y - 47,
          duration: 280,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    };
    showStep();

    blocker.on('pointerdown', () => {
      if (!isSoundMuted()) {
        const meowIndex = Phaser.Math.Between(1, 5);
        this.sound.play(`score_meow_${meowIndex}`, { volume: 0.6 });
      }
      stepIndex++;
      if (stepIndex < steps.length) {
        showStep();
        return;
      }
      localStorage.setItem('cattack_first_battle_tutorial', '1');
      this.firstBattleTutorialActive = false;
      overlay.destroy(true);
    });
  }


  private dealPlayerHand(): void {
    const initialHandSize = 8 + (this.getPlayerPlayCardLimit() - BASE_PLAY_CARD_LIMIT);
    this.playerHand = this.drawCards(initialHandSize);
    this.renderPlayerHand();
  }

  public renderPlayerHand(): void {
    const { width, height } = this.scale;
    const handY = height - 85;
    const cardCount = this.playerHand.length;
    const cardScale = this.getCardScale();
    const hoverScale = cardScale + 0.08;

    const handWidth = Math.min(
      width * (this.isMobileLayout(width) ? 0.36 : 0.46),
      250 * cardScale,
      cardCount * 55 * cardScale
    );
    const spacing = cardCount > 1 ? handWidth / (cardCount - 1) : 0;
    const maxAngle = this.isMobileLayout(width) ? 20 : 12;

    this.playerHand.forEach((c, idx) => {
      const rx =
        cardCount > 1
          ? this.getPlayerHandCenterX(width) + (idx - (cardCount - 1) / 2) * spacing
          : this.getPlayerHandCenterX(width);

      const centerOffset =
        (idx - (cardCount - 1) / 2) / ((cardCount - 1) / 2 || 1);
      const angle = centerOffset * maxAngle;
      const arcOffset = Math.abs(centerOffset) * (this.isMobileLayout(width) ? 24 : 15);
      const finalY = handY + arcOffset;

      const cardSprite = this.createCardSprite(rx, height + 100, c, false);
      cardSprite.setScale(cardScale);
      cardSprite.setDepth(10 + idx);
      cardSprite.setData('index', idx);
      cardSprite.setData('selected', false);
      cardSprite.setData('cardData', c);
      cardSprite.setData('homeX', rx);
      cardSprite.setData('homeY', finalY);
      cardSprite.setData('homeAngle', angle);

      this.cardSpritesInHand.push(cardSprite);

      cardSprite.setInteractive(
        new Phaser.Geom.Rectangle(-29.5, -45.5, 59, 91),
        Phaser.Geom.Rectangle.Contains
      );

      cardSprite.on('pointerover', () => {
        if (this.isBattleStarted) return;
        if (!cardSprite.getData('selected')) {
          cardSprite.setDepth(100);
          this.tweens.add({
            targets: cardSprite,
            y: finalY - 20,
            angle: 0,
            scale: hoverScale,
            duration: 150,
          });
        }
      });

      cardSprite.on('pointerout', () => {
        if (this.isBattleStarted) return;
        if (!cardSprite.getData('selected')) {
          cardSprite.setDepth(10 + idx);
          this.tweens.add({
            targets: cardSprite,
            y: finalY,
            angle: angle,
            scale: cardScale,
            duration: 150,
          });
        }
      });

      // Tap = select card
      cardSprite.on('pointerdown', () => {
        if (this.isBattleStarted) return;
      });

      cardSprite.on('pointerup', () => {
        if (this.isBattleStarted) return;
        this.toggleCardSelection(cardSprite);
      });

      this.tweens.add({
        targets: cardSprite,
        y: finalY,
        angle: angle,
        scale: cardScale,
        duration: 500,
        delay: idx * 50,
        ease: 'Back.easeOut',
      });
    });
  }

  private discardSelectedCards(): void {
    if (this.discardsRemaining <= 0) {
      this.showFloatingText(this.scale.width / 2, this.scale.height / 2, 'No discards remaining!', '#ff3333');
      return;
    }
    const selectedCount = this.getSelectedCount();
    if (selectedCount === 0) return;

    this.discardsRemaining--;
    this.discardPileCount += selectedCount;
    if (this.discardPileLabel) this.discardPileLabel.setText(`Discard: ${this.discardPileCount}`);
    this.updateUI();

    const selectedIndices: number[] = [];
    this.selectedCards.forEach((card, slotIdx) => {
      if (card) {
        const sprite = this.cardSpritesInPlay[slotIdx];
        if (sprite) {
          this.tweens.add({
            targets: sprite,
            y: sprite.y - 150,
            alpha: 0,
            scale: 0,
            duration: 300,
            onComplete: () => sprite.destroy()
          });
          this.cardSpritesInPlay[slotIdx] = null;
        }

        const handIdx = this.playerHand.findIndex((handCard) => handCard === card);
        if (handIdx !== -1) {
          selectedIndices.push(handIdx);
        }
      }
    });

    selectedIndices.sort((a, b) => b - a).forEach(idx => {
      this.playerHand.splice(idx, 1);
    });

    this.selectedCards = this.createEmptyPlayerPlaySlots();

    const maxHandSize = 8 + (this.getPlayerPlayCardLimit() - BASE_PLAY_CARD_LIMIT);
    const needed = maxHandSize - this.playerHand.length;
    if (needed > 0) {
      const drawn = this.drawCards(needed);
      this.playerHand.push(...drawn);
    }

    this.cardSpritesInHand.forEach(s => {
      if (s && s.active) s.destroy();
    });
    this.cardSpritesInHand = [];

    this.renderPlayerHand();
    this.calculateCurrentHandPreview();
    this.updateBattleButtonState();
  }

  private playHandAction(): void {
    if (this.handsRemaining <= 0) return;
    this.isBattleStarted = true;
    this.isCatSwapPhase = false;
    this.hideCatSwapButton();
    this.updateBattleButtonState();

    this.cardSpritesInHand.forEach((s) => s.disableInteractive());

    this.handsRemaining--;
    this.updateUI();

    this.runSequentialScoringSequence();
  }

  private runSequentialScoringSequence(): void {
    executePlayerScoring(this);
  }



  private toggleCardSelection(cardSprite: Phaser.GameObjects.Container): void {

    const isSelected = cardSprite.getData('selected');
    const cardData = cardSprite.getData('cardData') as Card;
    const { width, height } = this.scale;
    this.syncPlayerPlaySlotCapacity();

    if (!isSelected) {
      // Try to find an empty slot in selected cards
      const emptySlotIdx = this.selectedCards.findIndex((c) => c === null);
      if (emptySlotIdx === -1) {
        // Hand full, shake card
        this.tweens.add({
          targets: cardSprite,
          x: cardSprite.x + 8,
          yoyo: true,
          repeat: 3,
          duration: 50,
        });
        return;
      }

      // Select it
      this.selectedCards[emptySlotIdx] = cardData;
      cardSprite.setData('selected', true);
      cardSprite.setData('slotIndex', emptySlotIdx);

      // Calculate target slot X, Y (matching drawPlaySlots positions)
      const cardScale = this.getCardScale();
      const playCardLimit = this.getPlayerPlayCardLimit();
      const slotSpacing = this.getPlayCardSpacing(width, cardScale, playCardLimit);
      const targetX = width / 2 + (emptySlotIdx - (playCardLimit - 1) / 2) * slotSpacing;
      const targetY = height * 0.61;
      cardSprite.setDepth(100);

      this.tweens.add({
        targets: cardSprite,
        x: targetX,
        y: targetY,
        scale: cardScale,
        angle: 0,
        duration: 300,
        ease: 'Cubic.easeOut',
      });

      this.cardSpritesInPlay[emptySlotIdx] = cardSprite;
    } else {
      // Deselect it
      const slotIdx = cardSprite.getData('slotIndex') as number;
      this.selectedCards[slotIdx] = null;
      this.cardSpritesInPlay[slotIdx] = null;
      cardSprite.setData('selected', false);

      const homeX = cardSprite.getData('homeX') as number;
      const homeY = cardSprite.getData('homeY') as number;
      const homeAngle = (cardSprite.getData('homeAngle') as number) || 0;
      const cardScale = this.getCardScale();
      cardSprite.setDepth(10 + (cardSprite.getData('index') as number));

      this.tweens.add({
        targets: cardSprite,
        x: homeX,
        y: homeY,
        scale: cardScale,
        angle: homeAngle,
        duration: 250,
        ease: 'Cubic.easeOut',
      });
    }

    this.calculateCurrentHandPreview();
    this.updateBattleButtonState();
  }

  private getSelectedCount(): number {
    return this.selectedCards.filter((c) => c !== null).length;
  }

  public calculateCurrentHandPreview(): void {
    const selected = this.selectedCards.filter((c) => c !== null) as Card[];
    if (selected.length === 0) {
      this.baseScore = 0;
      this.scoreMult = 1.0;
      this.totalScore = 0;
      this.comboLabelText.setText('');
      this.updateScoreBoardDisplay();
      return;
    }

    const preview = this.runScoreCalculation(selected);
    this.baseScore = preview.base;
    this.scoreMult = preview.mult;
    this.totalScore = preview.score;

    this.comboLabelText.setText(preview.combo.toUpperCase());

    this.updateScoreBoardDisplay();
  }

  private updateScoreBoardDisplay(): void {
    this.scoreText.setText(
      `${this.baseScore} Nips x ${this.scoreMult.toFixed(1)} Mults = ${this.totalScore.toLocaleString()}`
    );
  }

  public runScoreCalculation(selected: Card[]) {
    const initial = calculateScore(selected, this.equippedCats);
    const isFinalHand = this.isBattleStarted ? this.handsRemaining === 0 : this.handsRemaining === 1;
    const random = this.createPlayerScoreRandom(selected);
    const selectedCards = new Set(selected);
    return applyCompanionCats(this.equippedCats, selected, initial, {
      isFinalHand,
      unplayedHand: this.playerHand.filter((card) => !selectedCards.has(card)),
      discardsRemaining: this.discardsRemaining,
      holographicCats: [...this.holographicCats],
      ...(random ? { random } : {}),
    });
  }

  public createPlayerScoreRandom(selected: Card[]): (() => number) | undefined {
    const challengeSeed = this.recordedBattle?.seed ?? this.battleScoreSeed;
    const cardKey = selected
      .map((card) => `${card.suit}-${card.rank}-${card.holographic ? 'h' : 'n'}-${card.seals.join('.')}`)
      .join('|');
    return createSeededRandom(
      `${challengeSeed}:score:${this.currentTurn}:${this.discardsRemaining}:${this.equippedCats.join(',')}:${cardKey}`
    );
  }

  public createBotScoreRandom(selected: Card[]): () => number {
    const scoreSeed = this.recordedBattle?.seed ?? this.battleScoreSeed;
    const cardKey = selected
      .map((card) => `${card.suit}-${card.rank}-${card.holographic ? 'h' : 'n'}-${card.seals.join('.')}`)
      .join('|');
    return createSeededRandom(
      `${scoreSeed}:bot-score:${this.currentTurn}:${this.botEquippedCats.join(',')}:${cardKey}`
    );
  }

  public beginCatSwapPhase(): void {
    this.isCatSwapPhase = true;
    this.catSwapUsedThisHand = false;

    const hasAvailableSwap = this.ownedCats.some(
      (catId) => !this.equippedCats.includes(catId)
    );
    if (hasAvailableSwap && this.equippedCats.length > 0) {
      this.showCatSwapButton();
    } else {
      this.hideCatSwapButton();
    }
  }

  private showCatSwapButton(): void {
    this.hideCatSwapButton();

    const button = this.add.container(0, 0).setDepth(260);
    const background = this.add.graphics();
    background.fillStyle(0x081321, 0.98);
    background.lineStyle(2, 0x00ffee, 1);
    background.fillRect(-47, -13, 94, 26);
    background.strokeRect(-47, -13, 94, 26);
    button.add(background);
    button.add(this.add.text(0, 0, 'SWAP CATS', {
      fontFamily: '"Jersey 10", "VT323", monospace',
      fontSize: '13px',
      color: '#ffff00',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5));
    button.setInteractive(new Phaser.Geom.Rectangle(-47, -13, 94, 26), Phaser.Geom.Rectangle.Contains);
    button.on('pointerover', () => {
      button.setScale(1.06);
      background.clear();
      background.fillStyle(0x18233a, 1);
      background.lineStyle(2, 0xff00ff, 1);
      background.fillRect(-47, -13, 94, 26);
      background.strokeRect(-47, -13, 94, 26);
    });
    button.on('pointerout', () => {
      button.setScale(1);
      background.clear();
      background.fillStyle(0x081321, 0.98);
      background.lineStyle(2, 0x00ffee, 1);
      background.fillRect(-47, -13, 94, 26);
      background.strokeRect(-47, -13, 94, 26);
    });
    button.on('pointerdown', () => showCatSwapOverlay(this));

    this.catSwapButton = button;
    this.positionCatSwapButton();
  }

  public hideCatSwapButton(): void {
    this.catSwapButton?.destroy();
    this.catSwapButton = null;
  }

  private positionCatSwapButton(): void {
    if (!this.catSwapButton) return;
    const { width, height } = this.scale;
    if (this.isMobileLayout(width)) {
      this.catSwapButton.setPosition(50, height - 206);
      return;
    }
    const cardScale = this.getCardScale();
    const startX = 40 * cardScale;
    const spacingX = 58 * cardScale;
    const equippedCenterX = startX + Math.max(0, this.equippedCats.length - 1) * spacingX / 2;
    this.catSwapButton.setPosition(equippedCenterX, height - 148);
  }

  public recordPlayerTurn(cards: Card[], score: number, mult: number): void {
    this.highestHandScore = Math.max(this.highestHandScore, score);
    this.highestHandMult = Math.max(this.highestHandMult, mult);
    this.playerTurnSnapshots.push({
      cards: cards.map((card) => ({ rank: card.rank, suit: card.suit, holographic: card.holographic, seals: card.seals })),
      cats: [...this.equippedCats],
      holographicCats: this.equippedCats.filter((catId) => this.holographicCats.has(catId)),
      score,
    });
  }

  private isCompanionCatId(value: string): value is CompanionCatId {
    return Object.prototype.hasOwnProperty.call(COMPANION_CATS, value);
  }

  public async publishBattle(title: string): Promise<boolean> {
    const snapshot: Omit<BattleChallengeSnapshot, 'version' | 'defenderUsername'> = {
      title,
      boardSkin: this.equippedBoardSkin,
      cardSkin: this.equippedCardSkin,
      turns: this.playerTurnSnapshots,
      cumulativeScore: this.playerCumulativeScore,
    };

    try {
      const response = await fetch('/api/publish-card-battle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      const data: unknown = await response.json();
      const succeeded = isRecord(data) && data.status === 'success';
      this.showFloatingText(
        this.scale.width / 2,
        this.scale.height / 2 - 120,
        succeeded ? 'BATTLE POST CREATED!' : 'FAILED TO CREATE BATTLE POST',
        succeeded ? '#00cc44' : '#ff3333',
        '14px',
        600
      );
      return succeeded;
    } catch {
      this.showFloatingText(
        this.scale.width / 2,
        this.scale.height / 2 - 120,
        'FAILED TO CREATE BATTLE POST',
        '#ff3333',
        '14px',
        600
      );
      return false;
    }
  }

  public showFloatingText(
    x: number,
    y: number,
    text: string,
    color: string,
    fontSize = '18px',
    depth = 300
  ): void {
    const ft = this.add
      .text(x, y, text, {
        fontFamily: 'monospace',
        fontSize,
        color,
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(depth);

    this.tweens.add({
      targets: ft,
      y: y - 50,
      alpha: 0,
      scale: 1.2,
      duration: 800,
      onComplete: () => ft.destroy(),
    });
  }

  public concludeBattle(playerWonOverride?: boolean): void {
    if (this.equippedCats.includes('c24')) {
      if (Math.random() * 6 < 1) {
        const destroyedIndex = this.ownedCats.indexOf('c24');
        if (destroyedIndex >= 0) this.ownedCats.splice(destroyedIndex, 1);
        this.equippedCats = this.equippedCats.filter((id) => id !== 'c24');
        if (!this.ownedCats.includes('c24')) this.holographicCats.delete('c24');
        localStorage.setItem('player_holographic_companion_cats', JSON.stringify([...this.holographicCats]));
        this.savePlayerData();
        this.showFloatingText(this.scale.width / 2, this.scale.height / 2 - 80, 'XMAS CAT DESTROYED!', '#ff3333');
      }
    }

    const playerWon = playerWonOverride !== undefined
      ? playerWonOverride
      : this.playerCumulativeScore > this.opponentCumulativeScore;

    if (this.recordedBattle && !this.wildOpponent) {
      this.challengeResultSubmission = this.recordChallengeResult(playerWon);
    }

    if (playerWon && !this.wildOpponent) reportPlayerProgress({ wins: 1, xp: 50 });

    // Fade out and destroy all remaining card sprites on board and hand
    const allRemainingSprites = [
      ...this.cardSpritesInHand,
      ...this.opponentCardSprites,
      ...(this.cardSpritesInPlay.filter(
        (s) => s !== null
      ) as Phaser.GameObjects.Container[]),
    ];

    allRemainingSprites.forEach((sprite) => {
      if (sprite && sprite.active) {
        this.tweens.add({
          targets: sprite,
          alpha: 0,
          scale: 0,
          duration: 300,
          onComplete: () => {
            sprite.destroy();
          },
        });
      }
    });

    this.cardSpritesInHand = [];
    this.opponentCardSprites = [];
    this.cardSpritesInPlay = this.createEmptyPlayerPlaySprites();

    // Save final score to backend if it's a new high score
    if (!this.wildOpponent && this.playerCumulativeScore > 0) {
      this.scoreSubmission = fetch('/api/submit-card-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: this.playerCumulativeScore,
          turns: this.playerTurnSnapshots,
          xp: getPlayerProgress().totalXp,
          highestHand: this.highestHandScore,
          highestMult: this.highestHandMult,
        }),
      })
        .then(() => undefined)
        .catch((err) => console.error('Failed to submit card score', err));
    }

    // No-op for compilation flag

    // Display banner
    const bannerHeight = playerWon ? 220 : 300;
    const bannerHalfHeight = bannerHeight / 2;

    this.resultBanner = this.add
      .container(this.scale.width / 2, this.scale.height / 2 - 20)
      .setScale(0);
    this.resultBanner.setDepth(400);

    const borderShadow = this.add.graphics();
    borderShadow.lineStyle(4, 0xffbb00, 1);
    borderShadow.strokeRect(-226, -bannerHalfHeight - 6, 440, bannerHeight);
    borderShadow.lineStyle(4, 0xff00ff, 1);
    borderShadow.strokeRect(-214, -bannerHalfHeight + 6, 440, bannerHeight);
    this.resultBanner.add(borderShadow);
    const bannerBg = this.add.graphics();
    bannerBg.fillStyle(0x080c18, 0.99);
    bannerBg.lineStyle(4, playerWon ? 0x00ffee : 0xff0055, 1.0);
    bannerBg.fillRect(-220, -bannerHalfHeight, 440, bannerHeight);
    bannerBg.strokeRect(-220, -bannerHalfHeight, 440, bannerHeight);
    this.resultBanner.add(bannerBg);

    const titleText = this.add
      .text(0, playerWon ? -67 : -110, playerWon ? 'PURR-FECT VICTORY!' : 'CAT-ASTROPHIC DEFEAT!', {
        fontFamily: 'monospace',
        fontSize: '25px',
        color: playerWon ? '#00ffee' : '#ff3333',
      })
      .setOrigin(0.5);
    this.resultBanner.add(titleText);

    const titleColors = playerWon
      ? ['#00ffee', '#39ff14']
      : ['#ff3333', '#ff00ff'];
    let titleColorIndex = 0;
    let titleFlashEvent: Phaser.Time.TimerEvent | null = null;
    titleFlashEvent = this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        if (!titleText.active) {
          titleFlashEvent?.remove();
          return;
        }
        titleColorIndex = (titleColorIndex + 1) % titleColors.length;
        titleText.setColor(titleColors[titleColorIndex] ?? '#ffffff');
      },
    });
    titleText.once('destroy', () => titleFlashEvent?.remove());

    const narratorText = this.add.text(
      0,
      playerWon ? -38 : -75,
      playerWon
        ? 'YOU OUT-SCORED THE BADDIE! CLAW-SOME! ~MEOW'
        : 'THE BADDIE GOT MORE NIPS... ABSOLUTE HISSS-TERY!',
      {
        fontFamily: 'monospace', fontSize: '11px', color: '#ffff00', align: 'center',
        wordWrap: { width: 390 },
      }
    ).setOrigin(0.5);
    this.resultBanner.add(narratorText);

    if (playerWon) {
      const scoreDetails = this.add
        .text(
          0,
          -5,
          `YOUR NIPS: ${this.playerCumulativeScore.toLocaleString()}\nBADDIE NIPS: ${this.opponentCumulativeScore.toLocaleString()}`,
          {
            fontFamily: 'monospace',
            fontSize: '16px',
            color: '#ffffff',
            align: 'center',
          }
        )
        .setOrigin(0.5);
      this.resultBanner.add(scoreDetails);
    } else {
      // Create Mock Form/Input
      const mockInput = this.add.container(0, -25);
      const inputBg = this.add.graphics();
      inputBg.fillStyle(0x0e172a, 1);
      inputBg.lineStyle(2, 0x475569, 1);
      inputBg.fillRoundedRect(-160, -18, 320, 36, 4);
      inputBg.strokeRoundedRect(-160, -18, 320, 36, 4);
      mockInput.add(inputBg);

      const inputText = this.add.text(-145, 0, 'OP IS A...', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#94a3b8',
      }).setOrigin(0, 0.5);
      mockInput.add(inputText);

      mockInput.setInteractive(new Phaser.Geom.Rectangle(-160, -18, 320, 36), Phaser.Geom.Rectangle.Contains);
      this.resultBanner.add(mockInput);

      // Create Smack Talk Button
      const smackTalkBtn = this.add.container(0, 25);
      const smackTalkShadow = this.add.graphics();
      smackTalkShadow.fillStyle(0xf43f5e, 1);
      smackTalkShadow.fillRect(-87, -13, 180, 32);
      const smackTalkBg = this.add.graphics();
      smackTalkBg.fillStyle(0x9d174d, 1);
      smackTalkBg.lineStyle(2, 0xffffff, 1);
      smackTalkBg.fillRect(-90, -16, 180, 32);
      smackTalkBg.strokeRect(-90, -16, 180, 32);
      smackTalkBtn.add([smackTalkShadow, smackTalkBg]);

      const smackTalkText = this.add.text(0, 0, 'SMACK TALK!!!!', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      smackTalkBtn.add(smackTalkText);

      smackTalkBtn.setInteractive(new Phaser.Geom.Rectangle(-90, -16, 180, 32), Phaser.Geom.Rectangle.Contains);
      this.resultBanner.add(smackTalkBtn);

      // Create Helper warning text under button (magenta)
      const postCommentWarning = this.add.text(0, 55, 'it will post your comment', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#f43f5e',
      }).setOrigin(0.5);
      this.resultBanner.add(postCommentWarning);

      // Setup click handlers
      const openSmackTalkForm = async () => {
        try {
          const result = await showForm({
            title: 'SMACK TALK!!!!',
            description: 'Post your comment to this thread',
            acceptLabel: 'POST COMMENT',
            cancelLabel: 'CANCEL',
            fields: [
              {
                type: 'string',
                name: 'commentText',
                label: 'Your comment',
                defaultValue: 'OP IS A ',
                required: true,
              }
            ]
          });

          if (result.action === 'CANCELED') return;

          const commentText = result.values.commentText.trim();
          if (!commentText) return;

          // Disable buttons temporarily
          smackTalkBtn.disableInteractive();
          mockInput.disableInteractive();

          const response = await fetch('/api/post-comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: commentText }),
          });

          if (response.ok) {
            this.showFloatingText(this.scale.width / 2, this.scale.height / 2 - 120, 'Comment posted!', '#00ff00');
          } else {
            this.showFloatingText(this.scale.width / 2, this.scale.height / 2 - 120, 'Failed to post comment', '#ff0000');
          }

          // Re-enable
          smackTalkBtn.setInteractive();
          mockInput.setInteractive();
        } catch (err) {
          console.error(err);
        }
      };

      mockInput.on('pointerdown', openSmackTalkForm);
      smackTalkBtn.on('pointerdown', openSmackTalkForm);
    }

    if (playerWon) {
      if (this.resultBanner) this.resultBanner.setVisible(false);
      showOpponentPrizeSelection(this, (prize) => this.claimBattlePrize(prize));
    } else {
      this.tweens.add({
        targets: this.resultBanner,
        scale: 1.0,
        duration: 400,
        ease: 'Back.easeOut',
        onComplete: () => {
          if (this.wildOpponent) {
            this.returnToExploration(false, null);
          } else {
            // Show "OK/TRY AGAIN" button
            this.showDefeatRetryButton();
          }
        },
      });
    }
  }

  private claimBattlePrize(prize: OpponentPrize): void {
    if (this.wildOpponent) {
      this.returnToExploration(true, prize);
      return;
    }
    changePlayerGold(50);
    emitIntelToast('Battle won: +50 Gold!');
    if (prize.kind === 'standard') {
      const existing = this.playerDeck.find((card) => (
        card.suit === prize.card.suit && card.rank === prize.card.rank
      ));
      if (existing && (prize.card.holographic || prize.card.seals.length > 0)) {
        existing.holographic = existing.holographic || prize.card.holographic;
        existing.seals = [...new Set([...existing.seals, ...prize.card.seals])];
        existing.base_nips = existing.rank + (existing.seals.includes('purple') ? 20 : 0);
      } else {
        this.playerDeck.push(prize.card);
      }
    } else {
      const wasOwned = this.ownedCats.includes(prize.catId);
      this.ownedCats.push(prize.catId);
      reportPlayerProgress({
        catsCollected: wasOwned ? 0 : 1,
        xp: wasOwned ? 0 : 25,
      });
    }
    reportPlayerProgress({ cardsClaimed: 1 });
    this.savePlayerData();
    if (this.resultBanner) {
      this.resultBanner.setVisible(true);
      this.tweens.add({
        targets: this.resultBanner,
        scale: 1.0,
        duration: 400,
        ease: 'Back.easeOut',
      });
    }
    this.showChallengePrompt();
  }

  private returnToExploration(won: boolean, prize: OpponentPrize | null): void {
    reportPlayerProgress({ wins: won ? 1 : 0 });

    const result: WildBattleResult = {
      opponentId: this.wildOpponent?.id ?? '',
      won,
      reward: prize?.kind === 'standard'
        ? { kind: 'standard', card: {
          suit: prize.card.suit,
          rank: prize.card.rank,
          holographic: prize.card.holographic,
          seals: prize.card.seals,
        } }
        : prize?.kind === 'cat' ? { kind: 'cat', catId: prize.catId } : null,
    };
    gameStore.pendingWildBattle = result;
    this.time.delayedCall(400, () => {
      this.scene.stop();
      this.scene.wake('ExplorationScene', { wildBattleResult: result });
    });
  }

  private showDefeatRetryButton(): void {
    if (this.gameboardSprite) {
      this.gameboardSprite.setVisible(false);
    }

    // 1. Try Again Button
    const tryAgainBtn = this.add.container(-65, 105);
    const tryAgainShadow = this.add.graphics();
    tryAgainShadow.fillStyle(0x00ffee, 1);
    tryAgainShadow.fillRect(-52, -17, 110, 40);
    const tryAgainBg = this.add.graphics();
    tryAgainBg.fillStyle(0xd90053, 1);
    tryAgainBg.lineStyle(2, 0xffff00, 1.0);
    tryAgainBg.fillRect(-55, -20, 110, 40);
    tryAgainBg.strokeRect(-55, -20, 110, 40);
    tryAgainBtn.add([tryAgainShadow, tryAgainBg]);

    const tryAgainText = this.add
      .text(0, 0, 'TRY AGAIN', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    tryAgainBtn.add(tryAgainText);

    this.resultBanner.add(tryAgainBtn);

    tryAgainBtn.setInteractive(
      new Phaser.Geom.Rectangle(-55, -20, 110, 40),
      Phaser.Geom.Rectangle.Contains
    );
    tryAgainBtn.on('pointerover', () => tryAgainBtn.setScale(1.06));
    tryAgainBtn.on('pointerout', () => tryAgainBtn.setScale(1.0));
    tryAgainBtn.on('pointerdown', () => {
      this.scene.restart();
    });

    // 2. Main Menu Button (Drawn natively in Phaser for perfect alignment)
    const mainMenuBtn = this.add.container(65, 105);
    const mainMenuShadow = this.add.graphics();
    mainMenuShadow.fillStyle(0xff00ff, 1);
    mainMenuShadow.fillRect(-52, -17, 110, 40);
    const mainMenuBg = this.add.graphics();
    mainMenuBg.fillStyle(0x111827, 1);
    mainMenuBg.lineStyle(2, 0x94a3b8, 1.0);
    mainMenuBg.fillRect(-55, -20, 110, 40);
    mainMenuBg.strokeRect(-55, -20, 110, 40);
    mainMenuBtn.add([mainMenuShadow, mainMenuBg]);

    const mainMenuText = this.add
      .text(0, 0, 'MAIN MENU', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    mainMenuBtn.add(mainMenuText);

    this.resultBanner.add(mainMenuBtn);

    mainMenuBtn.setInteractive(
      new Phaser.Geom.Rectangle(-55, -20, 110, 40),
      Phaser.Geom.Rectangle.Contains
    );
    mainMenuBtn.on('pointerover', () => mainMenuBtn.setScale(1.06));
    mainMenuBtn.on('pointerout', () => mainMenuBtn.setScale(1.0));
    mainMenuBtn.on('pointerdown', () => {
      sessionStorage.setItem('skip_shared_battle_autostart', '1');
      window.location.href = 'splash.html';
    });
  }

  private showChallengePrompt(): void {
    const promptText = this.add
      .text(0, 36, 'CHALLENGE OTHER PLAYERS?', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#00ffee',
      })
      .setOrigin(0.5);
    this.resultBanner.add(promptText);
    let challengeColorIndex = 0;
    const challengeColors = ['#ff00ff', '#ffff00'];
    const challengeFlash = this.time.addEvent({
      delay: 260,
      loop: true,
      callback: () => {
        if (!promptText.active) {
          challengeFlash.remove();
          return;
        }
        challengeColorIndex = (challengeColorIndex + 1) % challengeColors.length;
        promptText.setColor(challengeColors[challengeColorIndex] ?? '#ff00ff');
      },
    });
    promptText.once('destroy', () => challengeFlash.remove());

    const makeChoiceButton = (x: number, label: string, color: number) => {
      const button = this.add.container(x, 72);
      const shadow = this.add.graphics();
      shadow.fillStyle(label === 'YES' ? 0xffbb00 : 0xff00ff, 1);
      shadow.fillRect(-47, -13, 100, 32);
      const background = this.add.graphics();
      background.fillStyle(color, 0.95);
      background.lineStyle(2, label === 'YES' ? 0x00ffee : 0x94a3b8, 1.0);
      background.fillRect(-50, -16, 100, 32);
      background.strokeRect(-50, -16, 100, 32);
      button.add([shadow, background]);
      const text = this.add.text(0, 0, label, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
      }).setOrigin(0.5);
      button.add(text);
      button.setInteractive(
        new Phaser.Geom.Rectangle(-50, -16, 100, 32),
        Phaser.Geom.Rectangle.Contains
      );
      button.on('pointerover', () => button.setScale(1.06));
      button.on('pointerout', () => button.setScale(1.0));
      this.resultBanner.add(button);
      return { button, text };
    };

    const no = makeChoiceButton(-60, 'NO', 0x111827);
    const yes = makeChoiceButton(60, 'YES', 0xd90053);

    no.button.once('pointerdown', () => {
      no.button.disableInteractive();
      yes.button.disableInteractive();
      this.resultBanner.destroy();
      this.showCardLeaderboard();
    });
    yes.button.on('pointerdown', () => {
      yes.button.disableInteractive();
      no.button.disableInteractive();
      this.showBattlePostDialog(yes.button, no.button, yes.text);
    });
  }

  private showBattlePostDialog(
    yesButton: Phaser.GameObjects.Container,
    noButton: Phaser.GameObjects.Container,
    yesText: Phaser.GameObjects.Text
  ): void {
    const parent = document.getElementById('ui-root');
    if (!parent) return;
    parent.querySelector('[data-battle-post-dialog]')?.remove();
    const overlay = document.createElement('div');
    overlay.dataset.battlePostDialog = 'true';
    overlay.style.cssText = 'position:absolute;inset:0;z-index:15000;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(2,4,13,.88);font-family:monospace;pointer-events:auto;';
    const panel = document.createElement('div');
    panel.style.cssText = 'position:relative;width:min(430px,92vw);padding:22px 20px 18px;border:3px solid #00ffee;background:#080c18;box-shadow:7px 7px 0 #ff00ff,-5px -5px 0 #ffbb00;color:#fff;text-align:center;';
    const heading = document.createElement('div');
    heading.textContent = 'NAME YOUR BATTLE!';
    heading.style.cssText = 'font-size:22px;font-weight:bold;color:#ffff00;text-shadow:2px 2px #ff00ff;margin-bottom:9px;';
    const notice = document.createElement('div');
    notice.textContent = 'HEADS UP, SPACE CAT: POST BATTLE! WILL CREATE A REDDIT POST ON YOUR BEHALF.';
    notice.style.cssText = 'font-size:11px;line-height:1.4;color:#00ffee;margin:0 auto 15px;max-width:370px;';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 60;
    input.placeholder = 'Give this battle a claw-some title...';
    input.autocomplete = 'off';
    input.style.cssText = 'box-sizing:border-box;width:100%;height:44px;padding:0 12px;border:2px solid #ff00ff;border-radius:0;outline:none;background:#111827;color:#fff;font:14px monospace;box-shadow:3px 3px 0 #00ffee;';
    const count = document.createElement('div');
    count.textContent = '0 / 60';
    count.style.cssText = 'margin-top:6px;text-align:right;font-size:9px;color:#94a3b8;';
    const error = document.createElement('div');
    error.style.cssText = 'min-height:18px;margin-top:5px;font-size:10px;color:#ff5c93;';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:7px;';
    const cancel = document.createElement('button');
    cancel.textContent = 'JK BYE.';
    cancel.style.cssText = 'height:42px;border:2px solid #ff0055;background:#190914;color:#fff;font:bold 12px monospace;cursor:pointer;';
    const post = document.createElement('button');
    post.textContent = 'POST BATTLE!';
    post.style.cssText = 'height:42px;border:2px solid #00ffee;background:#d90053;color:#fff;font:bold 12px monospace;cursor:pointer;box-shadow:3px 3px 0 #ffbb00;';
    actions.append(cancel, post);
    panel.append(heading, notice, input, count, error, actions);
    overlay.append(panel);
    parent.append(overlay);

    const restoreButtons = (): void => {
      yesText.setText('YES');
      yesButton.setInteractive(new Phaser.Geom.Rectangle(-50, -16, 100, 32), Phaser.Geom.Rectangle.Contains);
      noButton.setInteractive(new Phaser.Geom.Rectangle(-50, -16, 100, 32), Phaser.Geom.Rectangle.Contains);
    };
    cancel.addEventListener('click', () => {
      overlay.remove();
      restoreButtons();
    });
    input.addEventListener('input', () => {
      count.textContent = `${input.value.length} / 60`;
      error.textContent = '';
    });
    post.addEventListener('click', () => {
      const title = input.value.trim();
      if (!title) {
        error.textContent = 'TYPE A TITLE FIRST, SILLY CAT!';
        input.focus();
        return;
      }
      post.textContent = 'POSTING...';
      post.disabled = true;
      cancel.disabled = true;
      yesText.setText('CREATING...');
      void this.publishBattle(title).then((succeeded) => {
        if (!succeeded) {
          post.textContent = 'POST BATTLE!';
          post.disabled = false;
          cancel.disabled = false;
          yesText.setText('YES');
          error.textContent = 'THE POST ESCAPED! PLEASE TRY AGAIN.';
          return;
        }
        overlay.remove();
        this.time.delayedCall(900, () => {
          if (this.resultBanner?.active) this.resultBanner.destroy();
          this.showCardLeaderboard();
        });
      });
    });
    this.time.delayedCall(80, () => input.focus());
  }

  public async promptForBattleTitle(
    yesButton: Phaser.GameObjects.Container,
    noButton: Phaser.GameObjects.Container,
    yesText: Phaser.GameObjects.Text
  ): Promise<void> {
    try {
      const result = await showForm({
        title: 'NAME YOUR BATTLE',
        description: 'This title will appear on the Reddit challenge post.',
        acceptLabel: 'CREATE POST',
        cancelLabel: 'BACK',
        fields: [
          {
            type: 'string',
            name: 'title',
            label: 'Battle title',
            helpText: 'Up to 60 characters.',
            required: true,
          },
        ],
      });

      if (result.action === 'CANCELED') {
        yesButton.setInteractive(
          new Phaser.Geom.Rectangle(-50, -16, 100, 32),
          Phaser.Geom.Rectangle.Contains
        );
        noButton.setInteractive(
          new Phaser.Geom.Rectangle(-50, -16, 100, 32),
          Phaser.Geom.Rectangle.Contains
        );
        return;
      }

      const title = result.values.title.trim();
      if (title.length === 0 || title.length > 60) {
        this.showFloatingText(
          this.scale.width / 2,
          this.scale.height / 2 - 120,
          'TITLE MUST BE 1–60 CHARACTERS',
          '#ff3333',
          '14px',
          600
        );
        yesButton.setInteractive(
          new Phaser.Geom.Rectangle(-50, -16, 100, 32),
          Phaser.Geom.Rectangle.Contains
        );
        noButton.setInteractive(
          new Phaser.Geom.Rectangle(-50, -16, 100, 32),
          Phaser.Geom.Rectangle.Contains
        );
        return;
      }

      yesText.setText('CREATING...');
      const succeeded = await this.publishBattle(title);
      if (succeeded) {
        this.time.delayedCall(900, () => {
          if (this.resultBanner?.active) this.resultBanner.destroy();
          this.showCardLeaderboard();
        });
        return;
      }

      yesText.setText('YES');
      yesButton.setInteractive(
        new Phaser.Geom.Rectangle(-50, -16, 100, 32),
        Phaser.Geom.Rectangle.Contains
      );
      noButton.setInteractive(
        new Phaser.Geom.Rectangle(-50, -16, 100, 32),
        Phaser.Geom.Rectangle.Contains
      );
    } catch {
      yesText.setText('YES');
      yesButton.setInteractive(
        new Phaser.Geom.Rectangle(-50, -16, 100, 32),
        Phaser.Geom.Rectangle.Contains
      );
      noButton.setInteractive(
        new Phaser.Geom.Rectangle(-50, -16, 100, 32),
        Phaser.Geom.Rectangle.Contains
      );
      this.showFloatingText(
        this.scale.width / 2,
        this.scale.height / 2 - 120,
        'FAILED TO OPEN TITLE FORM',
        '#ff3333',
        '14px',
        600
      );
    }
  }



  public showCardLeaderboard(): void {
    const pendingSubmission = this.scoreSubmission;
    const pendingResult = this.challengeResultSubmission;
    this.scoreSubmission = null;
    this.challengeResultSubmission = null;
    if (!pendingSubmission && !pendingResult) {
      displayCardLeaderboard(this);
      return;
    }

    void Promise.all([
      pendingSubmission ?? Promise.resolve(),
      pendingResult ?? Promise.resolve(),
    ]).finally(() => {
      if (this.sys.isActive()) displayCardLeaderboard(this);
    });
  }

  // ── Procedural Card Sprites ───────────────────────────────────────────

  public getCardScale(): number {
    const scale = this.getLayoutScale();
    return this.isMobileLayout() ? Math.max(scale, 0.78) : scale;
  }

  private getLayoutScale(): number {
    const { width, height } = this.scale;
    const scaleByWidth = width / 640;
    const scaleByHeight = height / 500;
    const scale = Math.min(scaleByWidth, scaleByHeight);
    return Phaser.Math.Clamp(scale, 0.65, 1.4);
  }

  private isMobileLayout(width = this.scale.width): boolean {
    return width <= 480;
  }

  private getBattleLogoWidth(): number {
    return this.isMobileLayout() ? 90 : 110;
  }

  private sizeBattleLogo(): void {
    const logoWidth = this.getBattleLogoWidth();
    this.battleLogo.setDisplaySize(logoWidth, logoWidth * (103 / 290));
  }

  private getResourceTextY(): number {
    return 12 + this.getBattleLogoWidth() * (103 / 290);
  }

  private getScoreBoardY(height = this.scale.height): number {
    return height * 0.11 + (this.isMobileLayout() ? 22 : 0);
  }

  private getBankTextY(): number {
    return this.isMobileLayout() ? 42 : 16;
  }

  private getOpponentY(height = this.scale.height): number {
    return height * 0.26 + (this.isMobileLayout() ? 22 : 0);
  }

  private getDefenderProfileX(width = this.scale.width): number {
    return this.isMobileLayout(width) ? width - 42 : width - 64;
  }

  private getDefenderProfileY(height = this.scale.height): number {
    return this.isMobileLayout() ? height - 66 : height - 55;
  }

  private getCompanionCatScale(cardScale = this.getCardScale()): number {
    return cardScale * (this.isMobileLayout() ? 0.7 : 0.86);
  }

  private getOpponentCardSpacing(width: number, cardScale: number, cardCount = BASE_PLAY_CARD_LIMIT): number {
    if (cardCount <= 1) return 0;
    const cardWidth = 59 * cardScale;
    const preferredSpacing = (this.isMobileLayout(width) ? 50 : 60) * cardScale;
    return Math.min(preferredSpacing, (width - cardWidth - 24) / (cardCount - 1));
  }

  private getOpponentHandCenterX(width = this.scale.width): number {
    return width / 2 + (this.isMobileLayout(width) ? 38 : 0);
  }

  private getPlayerHandCenterX(width = this.scale.width): number {
    return width / 2 + (this.isMobileLayout(width) ? 18 : 0);
  }

  private getPlayCardSpacing(width: number, cardScale: number, cardCount = BASE_PLAY_CARD_LIMIT): number {
    if (cardCount <= 1) return 0;
    const cardWidth = 59 * cardScale;
    return Math.min(100 * cardScale, (width - cardWidth - 24) / (cardCount - 1));
  }

  private getBattleButtonY(height = this.scale.height): number {
    return height * 0.46;
  }

  private getPlayerCatPosition(
    index: number,
    width = this.scale.width,
    height = this.scale.height,
    cardScale = this.getCardScale()
  ): { x: number; y: number } {
    if (this.isMobileLayout(width)) {
      return { x: 36 + index * 28 * cardScale, y: height - 78 };
    }
    return { x: 40 * cardScale + index * 52 * cardScale, y: height - 85 };
  }

  public createCardSprite(
    x: number,
    y: number,
    card: Card,
    faceDown: boolean
  ): Phaser.GameObjects.Container {
    const cardSkin = this.recordedBattle?.cardSkin ?? this.equippedCardSkin;
    const selectedSkin = getCardSkin(cardSkin);
    const sprite = makeCardSprite(
      this,
      x,
      y,
      card,
      faceDown,
      selectedSkin.textureKey,
      selectedSkin.frame
    );
    sprite.setDepth(5);
    return sprite;
  }


  // ── Cat Card Mechanics & UI ──────────────────────────────────────

  public renderEquippedCompanionCats(): void {
    // Clear old sprites
    this.companionCatSprites.forEach((s) => s.destroy());
    this.companionCatSprites = [];

    const { width, height } = this.scale;
    const cardScale = this.getCardScale();
    const catScale = this.getCompanionCatScale(cardScale);

    this.equippedCats.forEach((catId, idx) => {
      const position = this.getPlayerCatPosition(idx, width, height, cardScale);
      const rx = position.x;
      const catY = position.y;
      const cat = COMPANION_CATS[catId];
      if (!cat) return;

      const container = this.add.container(rx, catY);
      container.setDepth(200);
      if (this.isMobileLayout(width)) container.setAngle((idx - 1) * 9);

      const mapEntry = getCatCardFrame(catId);
      const sprite = this.add.sprite(0, 0, mapEntry.sheet, mapEntry.frame);
      sprite.setOrigin(0.5);
      container.add(sprite);
      if (this.holographicCats.has(catId)) {
        const holo = this.add.image(0, 0, 'holo_card_overlay').setAlpha(0.58);
        holo.setBlendMode(Phaser.BlendModes.ADD);
        container.add(holo);
      }

      // Hover tooltip or click description
      container.setInteractive(
        new Phaser.Geom.Rectangle(-29.5, -45.5, 59, 91),
        Phaser.Geom.Rectangle.Contains
      );

      container.on('pointerover', () => {
        container.setScale(catScale * 1.08);
        const color = Phaser.Utils.Array.GetRandom(['#ffff00', '#39ff14', '#ff00ff']);
        this.showFloatingText(rx, catY - 50, cat.name, color, '12px', 300);
      });
      container.on('pointerout', () => {
        container.setScale(catScale);
      });
      container.on('pointerdown', () => {
        showCatCardDetailOverlay(this, catId);
      });

      this.companionCatSprites.push(container);
      container.setScale(catScale);
    });
  }



  // ── Responsive Scale Sizing ──────────────────────────────────────────

  private handleResize(gameSize: Phaser.Structs.Size): void {
    const { width, height } = gameSize;

    // Resize camera
    this.cameras.resize(width, height);

    if (this.starFar) this.starFar.setSize(width, height);
    if (this.starMid) this.starMid.setSize(width, height);

    if (this.gameboardSprite) {
      this.gameboardSprite.setPosition(width / 2, height * 0.50);
      this.sizeGameboard();
    }
    this.positionCatSwapButton();

    // Re-render gradient background
    this.children.list.forEach((child) => {
      if (
        child instanceof Phaser.GameObjects.Graphics &&
        child.x === 0 &&
        child.y === 0
      ) {
        child.clear();
        child.fillGradientStyle(0x0a0518, 0x0a0518, 0x140c2d, 0x140c2d, 1);
        child.fillRect(0, 0, width, height);

        // Grid lines
        child.lineStyle(1, 0x3d1b7a, 0.15);
        const gridSize = 40;
        for (let x = 0; x < width; x += gridSize) {
          child.lineBetween(x, 0, x, height);
        }
        for (let y = 0; y < height; y += gridSize) {
          child.lineBetween(0, y, width, y);
        }
      }
    });

    // Update positions of main UI
    if (this.battleLogo) {
      this.battleLogo.setPosition(20, 8);
      this.sizeBattleLogo();
    }
    if (this.resourceText) this.resourceText.setPosition(20, this.getResourceTextY()).setVisible(!this.isMobileLayout(width));
    if (this.defenderProfileContainer) {
      this.defenderProfileContainer.setPosition(this.getDefenderProfileX(width), this.getDefenderProfileY(height));
    }
    if (this.playerBankText) this.playerBankText.setPosition(width / 2 - 58, this.getBankTextY());
    if (this.turnText) this.turnText.setPosition(width / 2, this.getBankTextY());
    if (this.opponentBankText) this.opponentBankText.setPosition(width / 2 + 58, this.getBankTextY());

    // Redraw board elements
    if (this.dividerGraphics) this.drawBoardDivider();
    if (this.slotGraphics) {
      this.drawPlaySlots();
      this.renderEquippedCompanionCats();
      this.renderBotCompanionCats();
    }

    // Reposition scoreboard (centered horizontally, above opponent's cards)
    if (this.scoreBoardContainer)
      this.scoreBoardContainer.setPosition(width / 2, this.getScoreBoardY(height));

    // Reposition battle button and discard button (centered on the board)
    if (this.battleButton)
      this.battleButton.setPosition(width / 2 - 90, this.getBattleButtonY(height));
    if (this.discardButton)
      this.discardButton.setPosition(width / 2 + 90, this.getBattleButtonY(height));

    // Reposition opponent cards
    const opponentY = this.getOpponentY(height);
    const opScale = this.getCardScale();
    const spacing = this.getOpponentCardSpacing(width, opScale, this.opponentCardSprites.length);
    this.opponentCardSprites.forEach((sprite, idx) => {
      const rx = this.getOpponentHandCenterX(width) + (idx - (this.opponentCardSprites.length - 1) / 2) * spacing;
      sprite.setPosition(rx, opponentY);
      sprite.setScale(opScale);
    });

    // Reposition selected cards in play
    const playY = height * 0.61;
    const playScale = this.getCardScale();
    const playCardLimit = this.getPlayerPlayCardLimit();
    const playSpacing = this.getPlayCardSpacing(width, playScale, playCardLimit);
    this.cardSpritesInPlay.forEach((sprite, idx) => {
      if (sprite) {
        const rx = width / 2 + (idx - (playCardLimit - 1) / 2) * playSpacing;
        sprite.setPosition(rx, playY);
        sprite.setScale(playScale);
      }
    });

    // Reposition cards in hand
    const handY = height - 85;
    const cardCount = this.playerHand.length;
    const cardScale = this.getCardScale();
    const handWidth = Math.min(
      width * (this.isMobileLayout(width) ? 0.36 : 0.46),
      250 * cardScale,
      cardCount * 55 * cardScale
    );
    const handSpacing = cardCount > 1 ? handWidth / (cardCount - 1) : 0;
    const maxAngle = this.isMobileLayout(width) ? 20 : 12;

    this.cardSpritesInHand.forEach((sprite, idx) => {
      const rx =
        cardCount > 1
          ? this.getPlayerHandCenterX(width) + (idx - (cardCount - 1) / 2) * handSpacing
          : this.getPlayerHandCenterX(width);
      const centerOffset =
        (idx - (cardCount - 1) / 2) / ((cardCount - 1) / 2 || 1);
      const arcOffset = Math.abs(centerOffset) * (this.isMobileLayout(width) ? 24 : 15);
      const finalY = handY + arcOffset;
      const angle = centerOffset * maxAngle;

      sprite.setData('homeX', rx);
      sprite.setData('homeY', finalY);
      sprite.setData('homeAngle', angle);

      if (!sprite.getData('selected') && !this.isBattleStarted) {
        sprite.setPosition(rx, finalY);
        sprite.angle = angle;
        sprite.setScale(cardScale);
      }
    });
  }

  public evaluate_bot_hand(): { base: number; mult: number; score: number; combo: string } {
    const sorted = [...this.botHand].sort((a, b) => a.rank - b.rank);
    const initial = calculateScore(sorted, this.botEquippedCats);
    const isFinalHand = this.handsRemaining === 0;
    const resolved = applyCompanionCats(this.botEquippedCats, sorted, initial, {
      isFinalHand,
      unplayedHand: [],
      discardsRemaining: 0,
      holographicCats: [...this.botHolographicCats],
      random: this.createBotScoreRandom(sorted),
    });
    const recordedScore = this.botScoresByTurn[this.currentTurn - 1];
    return recordedScore === undefined ? resolved : { ...resolved, score: recordedScore };
  }

  public prepareNextOpponentHand(): void {
    const nextHand = this.botHands[this.currentTurn - 1];
    if (!nextHand) return;

    this.botHand = nextHand;
    this.botEquippedCats = this.botCatsByTurn[this.currentTurn - 1] ?? this.botEquippedCats;
    this.botHolographicCats = new Set(this.recordedBattle?.turns[this.currentTurn - 1]?.holographicCats ?? []);
    this.renderBotCompanionCats();
    this.opponentCardSprites.forEach((sprite) => sprite.destroy());
    this.opponentCardSprites = [];

    const { width, height } = this.scale;
    const opponentY = this.getOpponentY(height);
    const cardScale = this.getCardScale();
    const spacing = this.getOpponentCardSpacing(width, cardScale, nextHand.length);
    nextHand.forEach((card, index) => {
      const x = this.getOpponentHandCenterX(width) + (index - (nextHand.length - 1) / 2) * spacing;
      const sprite = this.createCardSprite(x, opponentY, card, true);
      sprite.setScale(cardScale);
      this.opponentCardSprites.push(sprite);
    });
  }

  public flipCard(
    cardSprite: Phaser.GameObjects.Container,
    targetScale: number,
    onComplete?: () => void
  ): void {
    this.tweens.add({
      targets: cardSprite,
      scaleX: 0,
      duration: 150,
      onComplete: () => {
        cardSprite.setData('faceDown', false);
        drawCardGraphics(this, cardSprite, false);
        this.tweens.add({
          targets: cardSprite,
          scaleX: targetScale,
          duration: 150,
          onComplete: () => {
            if (onComplete) onComplete();
          },
        });
      },
    });
  }

  private renderBotCompanionCats(): void {
    this.botCompanionCatSprites.forEach((s) => s.destroy());
    this.botCompanionCatSprites = [];

    const { height } = this.scale;
    const cardScale = this.getCardScale();
    const catScale = this.getCompanionCatScale(cardScale);
    const opponentY = this.getOpponentY(height);
    const startX = (this.isMobileLayout() ? 35 : 40) * cardScale;
    const spacingX = (this.isMobileLayout() ? 44 : 52) * cardScale;

    this.botEquippedCats.forEach((catId, idx) => {
      const rx = startX + idx * spacingX;
      const cat = COMPANION_CATS[catId];
      if (!cat) return;

      const container = this.add.container(rx, opponentY);
      container.setDepth(200);

      const mapEntry = getCatCardFrame(catId);
      const sprite = this.add.sprite(0, 0, mapEntry.sheet, mapEntry.frame);
      sprite.setOrigin(0.5);
      container.add(sprite);
      if (this.botHolographicCats.has(catId)) {
        const holo = this.add.image(0, 0, 'holo_card_overlay').setAlpha(0.58);
        holo.setBlendMode(Phaser.BlendModes.ADD);
        container.add(holo);
      }

      container.setInteractive(
        new Phaser.Geom.Rectangle(-29.5, -45.5, 59, 91),
        Phaser.Geom.Rectangle.Contains
      );

      container.on('pointerover', () => {
        container.setScale(catScale * 1.08);
        const color = Phaser.Utils.Array.GetRandom(['#ffff00', '#39ff14', '#ff00ff']);
        this.showFloatingText(rx, opponentY - 50, cat.name, color, '12px', 300);
      });
      container.on('pointerout', () => {
        container.setScale(catScale);
      });
      container.on('pointerdown', () => {
        showCatCardDetailOverlay(this, catId);
      });

      this.botCompanionCatSprites.push(container);
      container.setScale(catScale);
    });
  }



  override update(_time: number, delta: number): void {
    const skipBtn = document.getElementById('skip-scramble-btn');
    if (skipBtn) {
      skipBtn.style.display = 'none';
    }

    if (this.starFar) {
      this.starFar.tilePositionX += 0.03 * delta;
    }
    if (this.starMid) {
      this.starMid.tilePositionX += 0.06 * delta;
    }
    if (this.twinkleStars) {
      this.twinkleStars.getChildren().forEach((starObj) => {
        const star = starObj as Phaser.GameObjects.Sprite;
        const speed = star.getData('speed') as number;
        star.x -= speed * (delta / 16);
        if (star.x < -32) {
          star.x = this.scale.width + 32;
          star.y = Phaser.Math.Between(0, this.scale.height);
        }
      });
    }
  }
}
