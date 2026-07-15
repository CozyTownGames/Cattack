import * as Phaser from 'phaser';
import {
  emitExpeditionGoldChanged,
  emitIntelToast,
  emitPlayerHearts,
  emitReturnToInlineSplash,
  emitSceneChanged,
  emitShowClaimButton,
} from '../eventBus';
import { gameStore } from '../../shared/gameStore';
import { changePlayerGold, reportPlayerProgress } from '../playerProgress';
import type {
  ExpeditionCard,
  ExpeditionMapId,
  ExpeditionOpponent,
  WildBattleResult,
} from '../../shared/expedition';
import { isSoundMuted } from '../soundSettings';
import { createCardSprite } from './cardBattle/cardGraphics';
import { makeCard } from './cardBattle/cardRules';
import { COMPANION_CATS, type CompanionCatId } from './cardBattle/companionCats';
import { getCatCardFrame } from './cardBattle/catCardFrames';

type MapConfig = {
  mapKey: string;
  mapUrl: string;
  textureKey: string;
  textureUrl: string;
  tilesetName: string;
};

type PathTile = { column: number; row: number };
type PathNode = PathTile & { cost: number; estimate: number };
const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const MAPS: Record<ExpeditionMapId, MapConfig> = {
  arcade: {
    mapKey: 'expedition_arcade_map',
    mapUrl: 'Buildings/Arcade/arcade-map.json',
    textureKey: 'expedition_arcade_tiles',
    textureUrl: 'Buildings/Arcade/arcade_tileset.PNG',
    tilesetName: 'arcade',
  },
  medical: {
    mapKey: 'expedition_medical_map',
    mapUrl: 'Buildings/Medical/medical-map.json',
    textureKey: 'expedition_medical_tiles',
    textureUrl: 'Buildings/Medical/medical_inside_tileset.png',
    tilesetName: 'medical_inside_tileset',
  },
  sewer: {
    mapKey: 'expedition_sewer_map',
    mapUrl: 'Buildings/Sewer/sewer-map.json',
    textureKey: 'expedition_sewer_tiles',
    textureUrl: 'Buildings/Sewer/sewer-inside-tileset.png',
    tilesetName: 'sewer-inside',
  },
  grocery: {
    mapKey: 'expedition_grocery_map',
    mapUrl: 'Buildings/Grocery/grocery-map.json',
    textureKey: 'expedition_grocery_tiles',
    textureUrl: 'Buildings/Grocery/grocery_tileset.png',
    tilesetName: 'Grocery',
  },
  planet: {
    mapKey: 'expedition_planet_map',
    mapUrl: 'Buildings/Planet/planet-map.json',
    textureKey: 'expedition_planet_tiles',
    textureUrl: 'Buildings/Planet/planet-tileset.PNG',
    tilesetName: 'planet',
  },
};

const SUITS: ExpeditionCard['suit'][] = ['sakura', 'ghost', 'leaf', 'water'];
const CAT_IDS = Array.from({ length: 39 }, (_, index) => `c${index + 1}`);
const PLAYER_SPEED = 130;
const INVADER_SPEED = 95;
const INVADER_TRACK_RANGE = 190;
const INVADER_FRAMES_PER_ROW = 5;
const PLAYER_SHOT_RANGE = 210;
const HEART_HEALTH = 20;
const MAX_HEARTS = 5;
const EXPLORATION_MEOW_KEYS = [
  'exploration_meow_1',
  'exploration_meow_2',
  'exploration_meow_3',
  'exploration_meow_4',
  'exploration_meow_5',
];

export class ExplorationScene extends Phaser.Scene {
  private mapId: ExpeditionMapId = 'arcade';
  private map!: Phaser.Tilemaps.Tilemap;
  private floorLayer!: Phaser.Tilemaps.TilemapLayer;
  private exitLayer!: Phaser.Tilemaps.TilemapLayer;
  private collisionLayers: Phaser.Tilemaps.TilemapLayer[] = [];
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private loot!: Phaser.Physics.Arcade.StaticGroup;
  private opponents!: Phaser.Physics.Arcade.StaticGroup;
  private invaders!: Phaser.Physics.Arcade.Group;
  private movementPath: Phaser.Math.Vector2[] = [];
  private dragMovementTarget: Phaser.Math.Vector2 | null = null;
  private encounterOpen = false;
  private exiting = false;
  private resolvedOpponents = new Set<string>();
  private lastInvaderDamageAt = 0;
  private returnSpaceFar: Phaser.GameObjects.TileSprite | null = null;
  private returnSpaceNear: Phaser.GameObjects.TileSprite | null = null;

  constructor() {
    super('ExplorationScene');
  }

  init(data?: { mapId?: ExpeditionMapId }): void {
    this.mapId = data?.mapId ?? gameStore.expeditionMap ?? 'arcade';
    gameStore.expeditionMap = this.mapId;
    gameStore.expeditionHaul = {
      invaderKills: 0,
      xp: 0,
      gold: 0,
      cards: [],
      cats: [],
      food: 0,
    };
    gameStore.pendingWildBattle = null;
    emitExpeditionGoldChanged(0);
    this.movementPath = [];
    this.dragMovementTarget = null;
    this.encounterOpen = false;
    this.exiting = false;
    this.resolvedOpponents = new Set();
    this.returnSpaceFar = null;
    this.returnSpaceNear = null;
  }

  preload(): void {
    const config = MAPS[this.mapId];
    const version = Date.now();
    this.load.tilemapTiledJSON(config.mapKey, `${config.mapUrl}?v=${version}`);
    this.load.image(config.textureKey, `${config.textureUrl}?v=${version}`);
    this.load.image('exploration_return_space', `space/space_tile.png?v=${version}`);
    this.load.spritesheet('expedition_player', `players/main_animations.png?v=${version}`, {
      frameWidth: 24,
      frameHeight: 24,
    });
    this.load.spritesheet('expedition_invaders', `players/invaders.png?v=${version}`, {
      frameWidth: 24,
      frameHeight: 24,
    });
    this.load.image('expedition_coin_pickup', `assets/coin.gif?v=${version}`);
    this.load.spritesheet('expedition_food_pickup', `assets/food.png?v=${version}`, {
      frameWidth: 16,
      frameHeight: 16,
    });
    this.load.spritesheet('expedition_npcs', `players/NPCs.png?v=${version}`, {
      frameWidth: 24,
      frameHeight: 24,
    });
    this.load.spritesheet('expedition_card_pickup', `assets/card-icons.png?v=${version}`, {
      frameWidth: 24,
      frameHeight: 24,
    });
    this.load.spritesheet('card_tiles', 'cards/deck-cards.png', {
      frameWidth: 59,
      frameHeight: 91,
    });
    this.load.image('gold_seal_overlay', 'cards/gold-seal.png');
    this.load.image('mult_seal_overlay', 'cards/mult-seal.png');
    this.load.image('nips_seal_overlay', 'cards/nips-seal.png');
    this.load.image('holo_card_overlay', 'cards/holo-cards.gif');
    this.load.spritesheet('cat_cards_tiles', 'cards/standard-cat-cards.png', {
      frameWidth: 59,
      frameHeight: 91,
    });
    this.load.spritesheet('wild_cat_cards_tiles', 'cards/wild-cat-cards.png', {
      frameWidth: 59,
      frameHeight: 91,
    });
    for (let i = 1; i <= 5; i++) {
      this.load.audio(`exploration_meow_${i}`, `audio/meow-${i}.mp3`);
    }
    this.load.audio('exploration_damage', 'audio/damage.mp3');
    this.load.audio('exploration_coin', 'audio/coin.mp3');
    this.load.audio('exploration_food', 'audio/food-pickup.wav');
  }

  create(): void {
    emitSceneChanged({ scene: 'Exploration' });
    this.emitHearts();
    emitShowClaimButton(false);
    this.createTextures();
    this.createMap();
    this.createInput();
    this.createPlayer();
    this.collisionLayers.forEach((layer) => this.physics.add.collider(this.player, layer));
    this.createInvaders();
    this.createPickups();
    this.createOpponents();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.encounterOpen || this.exiting) return;
      this.dragMovementTarget = null;
      this.setMovementDestination(pointer.worldX, pointer.worldY);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || this.encounterOpen || this.exiting) return;
      if (Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.x, pointer.y) < 8) return;
      this.movementPath = [];
      this.dragMovementTarget = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
    });
    this.input.on('pointerup', () => {
      const target = this.dragMovementTarget;
      this.dragMovementTarget = null;
      if (!target || this.encounterOpen || this.exiting) return;
      this.setMovementDestination(target.x, target.y);
    });

    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      emitSceneChanged({ scene: 'Exploration' });
      this.emitHearts();
      this.consumeWildBattleResult();
    });
  }

  private createMap(): void {
    const config = MAPS[this.mapId];
    this.map = this.make.tilemap({ key: config.mapKey });
    const tileset = this.map.addTilesetImage(config.tilesetName, config.textureKey);
    if (!tileset) throw new Error(`Tileset ${config.tilesetName} could not be loaded`);

    const water = this.map.getLayerIndex('water') >= 0 ? this.map.createLayer('water', tileset, 0, 0, false) : null;
    this.floorLayer = this.requireLayer('floor', tileset);
    this.exitLayer = this.requireLayer('EXIT', tileset);
    const debris = this.map.getLayerIndex('debris') >= 0 ? this.map.createLayer('debris', tileset) : null;
    const walls = this.requireLayer('walls', tileset);
    const objects = this.requireLayer('objects', tileset);
    const accents = this.map.getLayerIndex('accents') >= 0 ? this.map.createLayer('accents', tileset) : null;
    const roof = this.map.getLayerIndex('roof') >= 0 ? this.map.createLayer('roof', tileset) : null;

    water?.setDepth(0);
    const waterHasCollision = this.mapId === 'sewer' || this.mapId === 'planet';
    if (waterHasCollision) water?.setCollisionByExclusion([-1]);
    this.floorLayer.setDepth(1);
    this.exitLayer.setDepth(2);
    debris?.setDepth(2);
    walls.setDepth(3).setCollisionByExclusion([-1]);
    objects.setDepth(4).setCollisionByExclusion([-1]);
    accents?.setDepth(5);
    roof?.setDepth(30);
    this.collisionLayers = waterHasCollision && water instanceof Phaser.Tilemaps.TilemapLayer
      ? [water, walls, objects]
      : [walls, objects];

    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
  }

  private requireLayer(name: string, tileset: Phaser.Tilemaps.Tileset): Phaser.Tilemaps.TilemapLayer {
    const layer = this.map.createLayer(name, tileset, 0, 0, false);
    if (!(layer instanceof Phaser.Tilemaps.TilemapLayer)) {
      throw new Error(`Required map layer ${name} is missing or not CPU-backed`);
    }
    return layer;
  }

  private createInput(): void {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard!.addKey('W'),
      down: this.input.keyboard!.addKey('S'),
      left: this.input.keyboard!.addKey('A'),
      right: this.input.keyboard!.addKey('D'),
    };
  }

  private createPlayer(): void {
    const spawn = this.findFloorPosition(56, true);
    this.player = this.physics.add.sprite(spawn.x, spawn.y, 'expedition_player', 0).setDepth(10);
    this.player.setCollideWorldBounds(true);
    const body = this.player.body;
    if (body instanceof Phaser.Physics.Arcade.Body) body.setSize(14, 14).setOffset(5, 8);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.events.once(Phaser.Scenes.Events.WAKE, () => {
      this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    });
    this.cameras.main.setZoom(1.5);
  }

  private createPickups(): void {
    this.loot = this.physics.add.staticGroup();
    const cardCount = Math.random() < 0.25 ? 1 : 0;
    const coinCount = Phaser.Math.Between(3, 7);
    const foodCount = Phaser.Math.Between(1, 3);
    for (let i = 0; i < cardCount; i++) this.spawnPickup('card', 'expedition_card_pickup');
    for (let i = 0; i < coinCount; i++) this.spawnPickup('coin', 'expedition_coin_pickup');
    for (let i = 0; i < foodCount; i++) this.spawnPickup('food', 'expedition_food_pickup');
    this.physics.add.overlap(this.player, this.loot, (_player, object) => {
      if (!(object instanceof Phaser.Physics.Arcade.Sprite)) return;
      this.collectPickup(object);
    });
  }

  private createInvaders(): void {
    this.invaders = this.physics.add.group();
    const count = Phaser.Math.Between(7, 11);
    const difficulties = Phaser.Utils.Array.Shuffle([
      1,
      2,
      3,
      4,
      ...Array.from({ length: count - 4 }, () => Phaser.Math.Between(1, 4)),
    ]);
    for (let index = 0; index < count; index++) {
      const position = this.findFloorPosition(Phaser.Math.Between(5, 54));
      const difficulty = difficulties[index] ?? 1;
      const frame = (difficulty - 1) * INVADER_FRAMES_PER_ROW
        + Phaser.Math.Between(0, INVADER_FRAMES_PER_ROW - 1);
      const invader = this.invaders.create(position.x, position.y, 'expedition_invaders', frame);
      if (invader instanceof Phaser.Physics.Arcade.Sprite) {
        invader.setDepth(9).setData('health', difficulty);
        const body = invader.body;
        if (body instanceof Phaser.Physics.Arcade.Body) body.setSize(18, 16).setOffset(3, 6);
      }
    }
    this.collisionLayers.forEach((layer) => this.physics.add.collider(this.invaders, layer));
    this.physics.add.overlap(this.player, this.invaders, () => this.damagePlayerFromInvader());
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.autoShootInvader() });
  }

  private damagePlayerFromInvader(): void {
    if (this.time.now < this.lastInvaderDamageAt + 1000) return;
    this.lastInvaderDamageAt = this.time.now;
    gameStore.health = Math.max(0, gameStore.health - HEART_HEALTH);
    this.showPlayerDamageFeedback();
    this.emitHearts();
    emitIntelToast('Invader attack: -1 heart');
    if (gameStore.health === 0) this.showExpeditionGameOver();
  }

  private showPlayerDamageFeedback(): void {
    if (!isSoundMuted()) this.sound.play('exploration_damage', { volume: 0.75 });
    let red = false;
    this.time.addEvent({
      delay: 55,
      repeat: 5,
      callback: () => {
        if (!this.player.active) return;
        red = !red;
        if (red) this.player.setTint(0xff2222);
        else this.player.clearTint();
      },
    });
  }

  private autoShootInvader(): void {
    if (this.encounterOpen || this.exiting || !this.player.active) return;
    let target: Phaser.Physics.Arcade.Sprite | null = null;
    let nearestDistance = PLAYER_SHOT_RANGE;
    this.invaders.getChildren().forEach((child) => {
      if (!(child instanceof Phaser.Physics.Arcade.Sprite) || !child.active) return;
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, child.x, child.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        target = child;
      }
    });
    if (!target) return;

    const projectile = this.physics.add.image(this.player.x, this.player.y, 'expedition_player_shot').setDepth(12);
    this.physics.moveToObject(projectile, target, 280);
    this.physics.add.overlap(projectile, this.invaders, (_shot, enemy) => {
      if (!projectile.active || !(enemy instanceof Phaser.Physics.Arcade.Sprite)) return;
      projectile.destroy();
      this.hitInvader(enemy);
    });
    this.time.delayedCall(1200, () => {
      if (projectile.active) projectile.destroy();
    });
  }

  private hitInvader(invader: Phaser.Physics.Arcade.Sprite): void {
    const healthValue = invader.getData('health');
    const health = typeof healthValue === 'number' ? healthValue - 1 : 0;
    const meowKey = Phaser.Utils.Array.GetRandom(EXPLORATION_MEOW_KEYS);
    this.sound.play(meowKey, { volume: 0.6 });
    if (health > 0) {
      invader.setData('health', health);
      invader.setTint(0xffffff);
      this.time.delayedCall(80, () => {
        if (invader.active) invader.clearTint();
      });
      return;
    }
    invader.destroy();
    gameStore.expeditionHaul.invaderKills++;
    gameStore.expeditionHaul.xp += 10;
  }

  private updateInvaders(): void {
    this.invaders.getChildren().forEach((child) => {
      if (!(child instanceof Phaser.Physics.Arcade.Sprite) || !child.active) return;
      const distance = Phaser.Math.Distance.Between(child.x, child.y, this.player.x, this.player.y);
      if (distance <= INVADER_TRACK_RANGE) {
        this.physics.moveToObject(child, this.player, INVADER_SPEED);
        child.setFlipX(this.player.x < child.x);
      } else {
        child.setVelocity(0);
      }
    });
  }

  private spawnPickup(type: 'card' | 'coin' | 'food', texture: string): void {
    const position = this.findFloorPosition(Phaser.Math.Between(4, 54));
    const frame = type === 'food'
      ? Phaser.Math.Between(0, 349)
      : type === 'card'
        ? Phaser.Math.Between(0, 3)
        : undefined;
    const pickup = this.loot.create(position.x, position.y, texture, frame);
    if (pickup instanceof Phaser.Physics.Arcade.Sprite) {
      pickup.setData('type', type).setDepth(8);
      if (type === 'food') {
        pickup.setScale(1.4);
      } else if (type === 'card') {
        const magentaBorder = this.add
          .rectangle(position.x, position.y, 30, 30)
          .setStrokeStyle(3, 0xff00cc)
          .setDepth(7);
        const yellowBorder = this.add
          .rectangle(position.x, position.y, 30, 30)
          .setStrokeStyle(3, 0xffff00)
          .setAlpha(0)
          .setDepth(7);
        pickup.setData('cardBorders', [magentaBorder, yellowBorder]);
        this.tweens.add({
          targets: [pickup, magentaBorder, yellowBorder],
          y: position.y - 3,
          duration: 700,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        this.tweens.add({
          targets: magentaBorder,
          alpha: 0,
          duration: 240,
          yoyo: true,
          repeat: -1,
          ease: 'Linear',
        });
        this.tweens.add({
          targets: yellowBorder,
          alpha: 1,
          duration: 240,
          yoyo: true,
          repeat: -1,
          ease: 'Linear',
        });
      } else if (type === 'coin') {
        pickup.setDisplaySize(16, 16);
        const fullScale = pickup.scaleX;
        this.tweens.add({
          targets: pickup,
          scaleX: { from: fullScale, to: fullScale * 0.12 },
          duration: 320,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
      pickup.refreshBody();
    }
  }

  private collectPickup(pickup: Phaser.Physics.Arcade.Sprite): void {
    if (this.encounterOpen || this.exiting) return;
    const type = pickup.getData('type');
    const cardBorders = pickup.getData('cardBorders');
    if (Array.isArray(cardBorders)) {
      cardBorders.forEach((border) => {
        if (border instanceof Phaser.GameObjects.Rectangle) border.destroy();
      });
    }
    pickup.destroy();
    if (type === 'card') {
      const card = this.randomCard();
      this.showCardClaimPopup(card);
    } else if (type === 'coin') {
      if (!isSoundMuted()) this.sound.play('exploration_coin', { volume: 0.5 });
      const amount = Phaser.Math.Between(4, 12);
      gameStore.expeditionHaul.gold += amount;
      emitExpeditionGoldChanged(gameStore.expeditionHaul.gold);
      emitIntelToast(`+${amount} gold`);
    } else if (type === 'food') {
      if (!isSoundMuted()) this.sound.play('exploration_food', { volume: 0.75 });
      gameStore.health = Math.min(MAX_HEARTS * HEART_HEALTH, gameStore.health + HEART_HEALTH);
      gameStore.expeditionHaul.food++;
      this.emitHearts();
      emitIntelToast('Food recovered: +1 heart');
    }
  }

  private showCardClaimPopup(card: ExpeditionCard): void {
    this.encounterOpen = true;
    this.player.setVelocity(0);
    this.movementPath = [];
    this.cameras.main.stopFollow();
    this.physics.pause();

    const uiScale = 1 / this.cameras.main.zoom;
    const panelWidth = Math.min(300, this.scale.width - 24);
    const panelHeight = Math.min(390, this.scale.height - 30);
    const worldCenterX = this.cameras.main.worldView.centerX;
    const worldCenterY = this.cameras.main.worldView.centerY;
    const claimedCard = makeCard(card.suit, card.rank, card.holographic === true, card.seals ?? []);

    const panel = this.add
      .container(worldCenterX, worldCenterY)
      .setDepth(120)
      .setScale(0);
    panel.add(this.add.rectangle(-6, -6, panelWidth, panelHeight, 0x090d16, 0)
      .setStrokeStyle(4, 0xffbb00));
    panel.add(this.add.rectangle(6, 6, panelWidth, panelHeight, 0x090d16, 0)
      .setStrokeStyle(4, 0xff00ff));
    panel.add(this.add.rectangle(0, 0, panelWidth, panelHeight, 0x090d16, 0.98)
      .setStrokeStyle(4, 0x00ffee));

    const titleY = -panelHeight / 2 + 28;
    panel.add(this.add.text(3, titleY - 2, 'CARD DISCOVERED', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffff00', fontStyle: 'bold',
    }).setOrigin(0.5));
    panel.add(this.add.text(-2, titleY + 2, 'CARD DISCOVERED', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ff00ff', fontStyle: 'bold',
    }).setOrigin(0.5));
    panel.add(this.add.text(0, titleY, 'CARD DISCOVERED', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5));

    const cardSprite = createCardSprite(this, 0, -32, claimedCard, false);
    cardSprite.setScale(2.2);
    panel.add(cardSprite);

    panel.add(
      this.add
        .text(0, panelHeight / 2 - 78, claimedCard.name.toUpperCase(), {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ffffff',
          align: 'center',
          wordWrap: { width: panelWidth - 32 },
        })
        .setOrigin(0.5)
    );

    const claimY = panelHeight / 2 - 35;
    panel.add(this.add.rectangle(-4, claimY - 4, 130, 42, 0xffbb00));
    panel.add(this.add.rectangle(4, claimY + 4, 130, 42, 0xff00ff));
    const claimButton = this.add.rectangle(0, claimY, 130, 42, 0xd90053)
      .setStrokeStyle(3, 0x00ffee)
      .setInteractive({ useHandCursor: true });
    panel.add([claimButton, this.add.text(0, claimY, 'CLAIM', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5)]);
    claimButton.on('pointerover', () => claimButton.setScale(1.04));
    claimButton.on('pointerout', () => claimButton.setScale(1));
    claimButton.once('pointerdown', () => {
      claimButton.disableInteractive();
      gameStore.expeditionHaul.cards.push(card);
      emitIntelToast(`Card secured: ${card.suit} ${card.rank}`);
      panel.destroy(true);
      this.encounterOpen = false;
      this.physics.resume();
      this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    });

    this.tweens.add({
      targets: panel,
      scale: uiScale,
      duration: 320,
      ease: 'Back.easeOut',
    });
  }

  private createOpponents(): void {
    this.opponents = this.physics.add.staticGroup();
    const count = Phaser.Math.Between(1, 3);
    for (let i = 0; i < count; i++) {
      const position = this.findFloorPosition(Phaser.Math.Between(5, 52));
      const opponent = this.buildOpponent(i);
      const npcColumn = Phaser.Math.Between(0, 7);
      const marker = this.opponents.create(position.x, position.y, 'expedition_npcs', npcColumn);
      if (marker instanceof Phaser.Physics.Arcade.Sprite) {
        marker.setData('opponent', opponent).setData('npcColumn', npcColumn).setDepth(9);
      }
    }
    this.physics.add.overlap(this.player, this.opponents, (_player, object) => {
      if (!(object instanceof Phaser.Physics.Arcade.Sprite) || this.encounterOpen || gameStore.pendingWildBattle) return;
      const opponent = object.getData('opponent');
      if (this.isOpponent(opponent) && !this.resolvedOpponents.has(opponent.id)) {
        this.showEncounter(object, opponent);
      }
    });
    this.time.addEvent({
      delay: 900,
      loop: true,
      callback: () => {
        this.opponents.getChildren().forEach((child) => {
          if (!(child instanceof Phaser.Physics.Arcade.Sprite) || !child.active || Math.random() > 0.55) return;
          const column = child.getData('npcColumn');
          if (typeof column === 'number') child.setFrame(Phaser.Math.Between(0, 2) * 8 + column);
        });
      },
    });
  }

  private showEncounter(marker: Phaser.Physics.Arcade.Sprite, opponent: ExpeditionOpponent): void {
    this.encounterOpen = true;
    this.player.setVelocity(0);
    this.movementPath = [];
    this.cameras.main.stopFollow();
    const uiScale = 1 / this.cameras.main.zoom;
    const panelWidth = Math.min(340, this.scale.width - 24);
    const worldCenterX = this.cameras.main.worldView.centerX;
    const worldCenterY = this.cameras.main.worldView.centerY;
    const panel = this.add.container(worldCenterX, worldCenterY).setDepth(100).setScale(uiScale);
    panel.add(this.add.rectangle(0, 0, panelWidth, 180, 0x090d16, 0.97).setStrokeStyle(3, 0xffbb00));
    panel.add(this.add.text(0, -55, `${opponent.name} challenges you`, {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', align: 'center', wordWrap: { width: panelWidth - 28 },
    }).setOrigin(0.5));
    const buttonWidth = Math.min(130, (panelWidth - 42) / 2);
    const buttonOffset = buttonWidth / 2 + 7;
    const ignore = this.makeDialogButton(-buttonOffset, 48, 'IGNORE', 0x475569, panel, buttonWidth);
    const battle = this.makeDialogButton(buttonOffset, 48, 'BATTLE', 0xdc2626, panel, buttonWidth);
    ignore.on('pointerdown', () => {
      this.resolvedOpponents.add(opponent.id);
      marker.setTint(0x64748b);
      panel.destroy();
      this.encounterOpen = false;
      this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    });
    battle.once('pointerdown', () => {
      battle.disableInteractive();
      panel.destroy(true);
      this.encounterOpen = false;
      this.scene.stop('CardBattleScene');
      this.scene.launch('CardBattleScene', { wildOpponent: opponent });
      this.scene.sleep();
    });
  }

  private makeDialogButton(x: number, y: number, label: string, color: number, parent: Phaser.GameObjects.Container, width = 120): Phaser.GameObjects.Rectangle {
    const button = this.add.rectangle(x, y, width, 42, color).setStrokeStyle(2, 0xffffff).setInteractive({ useHandCursor: true });
    parent.add([button, this.add.text(x, y, label, { fontFamily: 'monospace', fontSize: '13px', color: '#ffffff' }).setOrigin(0.5)]);
    return button;
  }

  private consumeWildBattleResult(): void {
    const result = gameStore.pendingWildBattle;
    if (!result) return;
    gameStore.pendingWildBattle = null;
    this.applyBattleResult(result);
  }

  private applyBattleResult(result: WildBattleResult): void {
    this.resolvedOpponents.add(result.opponentId);
    const marker = this.opponents.getChildren().find((child) => {
      if (!(child instanceof Phaser.Physics.Arcade.Sprite)) return false;
      const opponent = child.getData('opponent');
      return this.isOpponent(opponent) && opponent.id === result.opponentId;
    });
    if (marker instanceof Phaser.Physics.Arcade.Sprite) marker.destroy();
    if (result.won) {
      gameStore.expeditionHaul.xp += 25;
      if (result.reward?.kind === 'cat') gameStore.expeditionHaul.cats.push(result.reward.catId);
      if (result.reward?.kind === 'standard') gameStore.expeditionHaul.cards.push(result.reward.card);
      emitIntelToast('Battle won: +25 XP and 1 card');
    } else {
      gameStore.health = Math.max(0, gameStore.health - HEART_HEALTH);
      this.showPlayerDamageFeedback();
      this.emitHearts();
      emitIntelToast('Battle lost: -1 heart');
      if (gameStore.health === 0) {
        this.showExpeditionGameOver();
        return;
      }
    }
    this.showBattleResultPopup(result);
  }

  private showBattleResultPopup(result: WildBattleResult): void {
    this.encounterOpen = true;
    this.player.setVelocity(0);
    this.movementPath = [];
    this.cameras.main.stopFollow();

    const uiScale = 1 / this.cameras.main.zoom;
    const panelWidth = Math.min(340, this.scale.width - 24);
    const rewardedCat = result.reward?.kind === 'cat' && this.isCompanionCatId(result.reward.catId)
      ? COMPANION_CATS[result.reward.catId]
      : null;
    const panelHeight = rewardedCat ? 305 : 200;
    const worldCenterX = this.cameras.main.worldView.centerX;
    const worldCenterY = this.cameras.main.worldView.centerY;

    const panel = this.add.container(worldCenterX, worldCenterY).setDepth(100).setScale(uiScale);
    panel.add(this.add.rectangle(0, 0, panelWidth, panelHeight, 0x090d16, 0.97).setStrokeStyle(3, result.won ? 0x00cc44 : 0xdc2626));
    
    const title = result.won ? '🐾 PURR-FECT VICTORY!' : '💥 CAT-ASTROPHIC DEFEAT!';
    panel.add(this.add.text(0, -panelHeight / 2 + 30, title, {
      fontFamily: 'monospace', fontSize: '16px', color: result.won ? '#00cc44' : '#ff4444', fontStyle: 'bold'
    }).setOrigin(0.5));
    panel.add(this.add.text(0, -panelHeight / 2 + 55, result.won
      ? 'YOU CLAWED PAST THE BADDIE! ~MEOW'
      : 'OOF... THAT ONE WAS A REAL HISSS-TAKE.', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffff00', align: 'center',
      wordWrap: { width: panelWidth - 24 },
    }).setOrigin(0.5));

    let details = result.won 
      ? 'REWARDS:\n💰 +25 GOLD\n✨ +25 XP'
      : 'PENALTY:\n❤️ -1 HEART';

    if (result.won) details = 'REWARDS:\n+1 CARD\n+25 XP';
    panel.add(this.add.text(rewardedCat ? 62 : 0, rewardedCat ? -63 : 8, details, {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffffff', align: 'center', lineSpacing: 5
    }).setOrigin(0.5));

    if (rewardedCat) {
      const frame = getCatCardFrame(rewardedCat.id);
      panel.add(this.add.rectangle(-96, 25, 78, 116, 0x160b24, 1).setStrokeStyle(2, 0xffff00));
      panel.add(this.add.sprite(-96, 25, frame.sheet, frame.frame).setScale(1.18));
      panel.add(this.add.text(56, -5, rewardedCat.name.toUpperCase(), {
        fontFamily: 'monospace', fontSize: '14px', color: '#ffff00', fontStyle: 'bold', align: 'center',
        wordWrap: { width: 165 },
      }).setOrigin(0.5));
      panel.add(this.add.text(56, 45, rewardedCat.description, {
        fontFamily: 'monospace', fontSize: '10px', color: '#ffffff', align: 'center', lineSpacing: 3,
        wordWrap: { width: 165 },
      }).setOrigin(0.5));
    }

    const buttonWidth = 100;
    const okButton = this.makeDialogButton(0, panelHeight / 2 - 30, 'OK', result.won ? 0x00cc44 : 0xdc2626, panel, buttonWidth);

    okButton.once('pointerdown', () => {
      okButton.disableInteractive();
      panel.destroy(true);
      this.encounterOpen = false;
      this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    });
  }

  private emitHearts(): void {
    emitPlayerHearts(Math.ceil(gameStore.health / HEART_HEALTH), MAX_HEARTS);
  }


  private createTextures(): void {
    this.makeTexture('expedition_player_shot', 0x67e8f9, 7, 7);
  }

  private makeTexture(key: string, color: number, width: number, height: number): void {
    if (this.textures.exists(key)) return;
    const graphics = this.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(color).fillRect(0, 0, width, height);
    graphics.lineStyle(2, 0xffffff).strokeRect(0, 0, width, height);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }

  private findFloorPosition(preferredRow: number, searchUp = false): Phaser.Math.Vector2 {
    const direction = searchUp ? -1 : 1;
    for (let offset = 0; offset < this.map.height; offset++) {
      const row = Phaser.Math.Clamp(preferredRow + offset * direction, 1, this.map.height - 2);
      const columns = Phaser.Utils.Array.Shuffle(Array.from({ length: this.map.width - 2 }, (_, index) => index + 1));
      for (const column of columns) {
        if (!this.isWalkable(column, row)) continue;
        return new Phaser.Math.Vector2(
          this.floorLayer.tileToWorldX(column) + this.map.tileWidth / 2,
          this.floorLayer.tileToWorldY(row) + this.map.tileHeight / 2,
        );
      }
    }
    return new Phaser.Math.Vector2(this.map.widthInPixels / 2, this.map.heightInPixels / 2);
  }

  private isBlocked(column: number, row: number): boolean {
    for (const name of ['walls', 'objects']) {
      const layer = this.map.getLayer(name)?.tilemapLayer;
      const tile = layer?.getTileAt(column, row);
      if (tile && tile.index >= 0) return true;
    }
    return false;
  }

  private isWalkable(column: number, row: number): boolean {
    if (column < 0 || row < 0 || column >= this.map.width || row >= this.map.height) return false;
    const floor = this.floorLayer.getTileAt(column, row);
    const debris = this.mapId === 'planet'
      ? this.map.getLayer('debris')?.tilemapLayer?.getTileAt(column, row)
      : null;
    const water = this.mapId === 'planet' || this.mapId === 'sewer'
      ? this.map.getLayer('water')?.tilemapLayer?.getTileAt(column, row)
      : null;
    const hasWalkableGround = Boolean(
      (floor && floor.index >= 0) || (debris && debris.index >= 0)
    );
    const hasWater = Boolean(water && water.index >= 0);
    return hasWalkableGround && !hasWater && !this.isBlocked(column, row);
  }

  private setMovementDestination(worldX: number, worldY: number): void {
    const startColumn = this.floorLayer.worldToTileX(this.player.x);
    const startRow = this.floorLayer.worldToTileY(this.player.y);
    const requestedColumn = this.floorLayer.worldToTileX(worldX);
    const requestedRow = this.floorLayer.worldToTileY(worldY);
    if (startColumn === null || startRow === null || requestedColumn === null || requestedRow === null) return;
    const destination = this.findNearestWalkableTile(requestedColumn, requestedRow);
    if (!destination) return;
    const tiles = this.findTilePath({ column: startColumn, row: startRow }, destination);
    if (tiles.length === 0) return;
    this.movementPath = tiles.slice(1).map((tile) => new Phaser.Math.Vector2(
      this.floorLayer.tileToWorldX(tile.column) + this.map.tileWidth / 2,
      this.floorLayer.tileToWorldY(tile.row) + this.map.tileHeight / 2,
    ));
  }

  private findNearestWalkableTile(column: number, row: number): PathTile | null {
    const clampedColumn = Phaser.Math.Clamp(column, 0, this.map.width - 1);
    const clampedRow = Phaser.Math.Clamp(row, 0, this.map.height - 1);
    if (this.isWalkable(clampedColumn, clampedRow)) return { column: clampedColumn, row: clampedRow };
    for (let radius = 1; radius <= 8; radius++) {
      for (let y = clampedRow - radius; y <= clampedRow + radius; y++) {
        for (let x = clampedColumn - radius; x <= clampedColumn + radius; x++) {
          if (Math.abs(x - clampedColumn) !== radius && Math.abs(y - clampedRow) !== radius) continue;
          if (this.isWalkable(x, y)) return { column: x, row: y };
        }
      }
    }
    return null;
  }

  private findTilePath(start: PathTile, destination: PathTile): PathTile[] {
    const keyFor = (tile: PathTile) => `${tile.column},${tile.row}`;
    const destinationKey = keyFor(destination);
    const open: PathNode[] = [{ ...start, cost: 0, estimate: 0 }];
    const bestCost = new Map<string, number>([[keyFor(start), 0]]);
    const parents = new Map<string, PathTile>();
    const visited = new Set<string>();
    const directions: PathTile[] = [
      { column: 1, row: 0 }, { column: -1, row: 0 },
      { column: 0, row: 1 }, { column: 0, row: -1 },
    ];

    while (open.length > 0) {
      open.sort((a, b) => (a.cost + a.estimate) - (b.cost + b.estimate));
      const current = open.shift();
      if (!current) break;
      const currentKey = keyFor(current);
      if (visited.has(currentKey)) continue;
      visited.add(currentKey);
      if (currentKey === destinationKey) {
        const path: PathTile[] = [destination];
        let cursorKey = destinationKey;
        while (cursorKey !== keyFor(start)) {
          const parent = parents.get(cursorKey);
          if (!parent) return [];
          path.push(parent);
          cursorKey = keyFor(parent);
        }
        return path.reverse();
      }

      directions.forEach((direction) => {
        const next = { column: current.column + direction.column, row: current.row + direction.row };
        if (!this.isWalkable(next.column, next.row)) return;
        const nextKey = keyFor(next);
        const nextCost = current.cost + 1;
        if (nextCost >= (bestCost.get(nextKey) ?? Number.POSITIVE_INFINITY)) return;
        bestCost.set(nextKey, nextCost);
        parents.set(nextKey, { column: current.column, row: current.row });
        open.push({
          ...next,
          cost: nextCost,
          estimate: Math.abs(destination.column - next.column) + Math.abs(destination.row - next.row),
        });
      });
    }
    return [];
  }

  private buildOpponent(index: number): ExpeditionOpponent {
    return {
      id: `${this.mapId}_opponent_${index}`,
      name: `Wild Challenger ${index + 1}`,
      cards: Array.from({ length: 15 }, () => ({
        suit: Phaser.Math.RND.pick(SUITS),
        rank: Phaser.Math.Between(2, 14),
      })),
      cats: Phaser.Utils.Array.Shuffle([...CAT_IDS]).slice(0, Phaser.Math.Between(1, 3)),
    };
  }

  private randomCard(): ExpeditionCard {
    const seals = Math.random() < 0.3
      ? [Phaser.Utils.Array.GetRandom(['gold', 'red', 'purple'] as const)]
      : [];
    return {
      suit: Phaser.Math.RND.pick(SUITS),
      rank: Phaser.Math.Between(2, 14),
      holographic: Math.random() < 0.12,
      seals,
    };
  }

  private saveFoundCard(card: ExpeditionCard): void {
    const rawDeck: unknown = JSON.parse(localStorage.getItem('player_card_deck') ?? '[]');
    const deck = Array.isArray(rawDeck) ? rawDeck : [];
    const upgradedCard = deck.find((value) => (
      isRecord(value)
      && (value.suit ?? value.family) === card.suit
      && (value.rank ?? value.number) === card.rank
    ));
    if (isRecord(upgradedCard) && (card.holographic || card.seals?.length)) {
      const storedSeals = Array.isArray(upgradedCard.seals)
        ? upgradedCard.seals.filter((seal): seal is string => typeof seal === 'string')
        : [];
      upgradedCard.holographic = upgradedCard.holographic === true || card.holographic === true;
      upgradedCard.seals = [...new Set([...storedSeals, ...(card.seals ?? [])])];
    } else {
      deck.push({ ...card, number: card.rank, family: card.suit });
    }
    localStorage.setItem('player_card_deck', JSON.stringify(deck));
    const rawUnlocked: unknown = JSON.parse(localStorage.getItem('player_unlocked_cards') ?? '[]');
    const unlocked = Array.isArray(rawUnlocked) ? rawUnlocked.filter((value): value is string => typeof value === 'string') : [];
    const key = `${card.suit}-${card.rank}`;
    if (!unlocked.includes(key)) unlocked.push(key);
    localStorage.setItem('player_unlocked_cards', JSON.stringify(unlocked));
  }

  private saveFoundCat(catId: string): void {
    const rawOwned: unknown = JSON.parse(localStorage.getItem('player_owned_companion_cats') ?? '[]');
    const owned = Array.isArray(rawOwned)
      ? rawOwned.filter((value): value is string => typeof value === 'string')
      : [];
    if (!owned.includes(catId)) owned.push(catId);
    localStorage.setItem('player_owned_companion_cats', JSON.stringify(owned));
  }

  private isOpponent(value: unknown): value is ExpeditionOpponent {
    if (!value || typeof value !== 'object') return false;
    return 'id' in value && typeof value.id === 'string' && 'cards' in value && Array.isArray(value.cards) && 'cats' in value && Array.isArray(value.cats);
  }

  private isCompanionCatId(value: string): value is CompanionCatId {
    return value in COMPANION_CATS;
  }

  private showExpeditionGameOver(): void {
    if (this.exiting) return;
    this.exiting = true;
    this.player.setVelocity(0);
    this.movementPath = [];
    this.physics.pause();
    emitSceneChanged({ scene: 'ExpeditionGameOver' });

    const haul = gameStore.expeditionHaul;
    const itemCount = haul.cards.length + haul.cats.length + haul.food;
    const uiScale = 1 / this.cameras.main.zoom;
    const centerX = this.cameras.main.worldView.centerX;
    const centerY = this.cameras.main.worldView.centerY;
    const panel = this.add.container(centerX, centerY).setDepth(250).setScale(uiScale);
    panel.add(this.add.rectangle(0, 0, 330, 245, 0x090611, 0.98).setStrokeStyle(3, 0xff0055));
    panel.add(this.add.text(0, -88, 'EXPEDITION LOST', {
      fontFamily: 'monospace', fontSize: '21px', color: '#ff5c93', fontStyle: 'bold',
    }).setOrigin(0.5));
    panel.add(this.add.text(0, -20, [
      `GOLD LOST   ${haul.gold}`,
      `XP LOST     ${haul.xp}`,
      `CARDS LOST  ${haul.cards.length + haul.cats.length}`,
      `ITEMS LOST  ${itemCount}`,
    ].join('\n'), {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffcc00', lineSpacing: 5,
    }).setOrigin(0.5));
    const menuButton = this.makeDialogButton(0, 88, 'MAIN MENU', 0x9f1239, panel, 145);
    menuButton.once('pointerdown', () => {
      gameStore.expeditionHaul = { invaderKills: 0, xp: 0, gold: 0, cards: [], cats: [], food: 0 };
      gameStore.pendingWildBattle = null;
      gameStore.expeditionMap = null;
      emitExpeditionGoldChanged(0);
      emitShowClaimButton(false);
      localStorage.removeItem('mode');
      emitReturnToInlineSplash();
    });
  }

  private extract(): void {
    if (this.exiting) return;
    this.exiting = true;
    const haul = gameStore.expeditionHaul;
    emitExpeditionGoldChanged(0);
    if (haul.gold > 0) changePlayerGold(haul.gold);
    if (haul.xp > 0 || haul.cats.length > 0) reportPlayerProgress({ xp: haul.xp, catsCollected: haul.cats.length });
    haul.cards.forEach((card) => this.saveFoundCard(card));
    haul.cats.forEach((catId) => this.saveFoundCat(catId));
    this.player.setVelocity(0);
    this.movementPath = [];
    this.cameras.main.stopFollow();
    this.cameras.main.setZoom(1);
    this.cameras.main.setScroll(0, 0);
    emitSceneChanged({ scene: 'ReturnHome' });

    const { width, height } = this.scale;

    this.returnSpaceFar = this.add
      .tileSprite(0, 0, width, height, 'exploration_return_space')
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(150)
      .setAlpha(0);
    this.returnSpaceNear = this.add
      .tileSprite(0, 0, width, height, 'exploration_return_space')
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(151)
      .setTileScale(1.6)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);

    this.tweens.add({
      targets: this.returnSpaceFar,
      alpha: 1,
      duration: 350,
      ease: 'Quad.easeOut',
    });
    this.tweens.add({
      targets: this.returnSpaceNear,
      alpha: 0.35,
      duration: 500,
      ease: 'Quad.easeOut',
    });

    const panelWidth = Math.min(390, width - 24);
    const panelHeight = Math.min(330, height - 40);
    const panel = this.add
      .container(width / 2, height / 2)
      .setDepth(200)
      .setScrollFactor(0)
      .setAlpha(0);
    panel.add(this.add.rectangle(0, 0, panelWidth, panelHeight, 0x090d16, 0.98).setStrokeStyle(3, 0x00ffee));
    panel.add(this.add.text(0, -panelHeight / 2 + 38, 'EXPEDITION HAUL', { fontFamily: 'monospace', fontSize: '19px', color: '#00ffee' }).setOrigin(0.5));
    const summary = [
      `INVADER WINS  ${haul.invaderKills}`,
      `XP GAINED     ${haul.xp}`,
      `GOLD EARNED   ${haul.gold}`,
      `CARDS SECURED ${haul.cards.length + haul.cats.length}`,
      `FOOD FOUND    ${haul.food}`,
    ].join('\n');
    panel.add(this.add.text(0, -12, summary, { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', lineSpacing: 7 }).setOrigin(0.5));
    this.tweens.add({
      targets: panel,
      alpha: 1,
      duration: 300,
      delay: 180,
      ease: 'Quad.easeOut',
    });
    emitShowClaimButton(true);
  }

  override update(): void {
    if (this.returnSpaceFar) this.returnSpaceFar.tilePositionX += 0.7;
    if (this.returnSpaceNear) this.returnSpaceNear.tilePositionX += 2.2;
    if (!this.player?.body || this.encounterOpen || this.exiting) return;
    this.consumeWildBattleResult();
    this.updateInvaders();
    let x = 0;
    let y = 0;
    if (this.cursors.left.isDown || this.wasd.left.isDown) x--;
    if (this.cursors.right.isDown || this.wasd.right.isDown) x++;
    if (this.cursors.up.isDown || this.wasd.up.isDown) y--;
    if (this.cursors.down.isDown || this.wasd.down.isDown) y++;
    if (x || y) {
      this.movementPath = [];
      this.dragMovementTarget = null;
      const direction = new Phaser.Math.Vector2(x, y).normalize().scale(PLAYER_SPEED);
      this.player.setVelocity(direction.x, direction.y);
    } else if (this.dragMovementTarget) {
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        this.dragMovementTarget.x,
        this.dragMovementTarget.y,
      );
      if (distance < 4) this.player.setVelocity(0);
      else this.physics.moveToObject(this.player, this.dragMovementTarget, PLAYER_SPEED);
    } else if (this.movementPath.length > 0) {
      const target = this.movementPath[0];
      if (!target) {
        this.movementPath = [];
        this.player.setVelocity(0);
      } else {
        const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, target.x, target.y);
        if (distance < 4) {
          this.player.setPosition(target.x, target.y);
          this.movementPath.shift();
        }
        const nextTarget = this.movementPath[0];
        if (nextTarget) this.physics.moveToObject(this.player, nextTarget, PLAYER_SPEED);
        else this.player.setVelocity(0);
      }
    } else {
      this.player.setVelocity(0);
    }

    const tileY = this.floorLayer.worldToTileY(this.player.y);
    const tileX = this.floorLayer.worldToTileX(this.player.x);
    const exitTile = tileX !== null && tileY !== null ? this.exitLayer.getTileAt(tileX, tileY) : null;
    if (exitTile && exitTile.index >= 0) this.extract();
  }
}
