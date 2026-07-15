import * as Phaser from 'phaser';
import type { DailyBoosterResponse, DailyBoosterReward } from '../../shared/dailyBooster';
import { emitDailyBoosterFinished } from '../eventBus';
import { reportPlayerProgress } from '../playerProgress';
import { createCardSprite } from './cardBattle/cardGraphics';
import { makeCard } from './cardBattle/cardRules';
import { COMPANION_CATS, type CompanionCatId } from './cardBattle/companionCats';
import { getCatCardFrame } from './cardBattle/catCardFrames';

const isCompanionCatId = (value: string): value is CompanionCatId => /^c(?:[1-9]|[1-3][0-9])$/.test(value);

export class DailyBoosterScene extends Phaser.Scene {
  private choices: DailyBoosterReward[] = [];
  private selected = -1;

  constructor() {
    super('DailyBoosterScene');
  }

  preload(): void {
    this.load.image('daily_pack', 'cards/basic-pack.png');
    this.load.image('daily_bg', 'cards/booster-bg.png');
    this.load.image('daily_pile', 'cards/card-pile.png');
    this.load.image('daily_logo', 'assets/cattack-logo.png');
    this.load.spritesheet('daily_falling', 'cards/falling-cards.png', { frameWidth: 59, frameHeight: 91 });
    this.load.spritesheet('card_tiles', 'cards/deck-cards.png', { frameWidth: 59, frameHeight: 91 });
    this.load.spritesheet('cat_cards_tiles', 'cards/standard-cat-cards.png', { frameWidth: 59, frameHeight: 91 });
    this.load.spritesheet('wild_cat_cards_tiles', 'cards/wild-cat-cards.png', { frameWidth: 59, frameHeight: 91 });
    this.load.image('holo_card_overlay', 'cards/holo-cards.gif');
    this.load.image('gold_seal_overlay', 'cards/gold-seal.png');
    this.load.image('mult_seal_overlay', 'cards/mult-seal.png');
    this.load.image('nips_seal_overlay', 'cards/nips-seal.png');
  }

  create(): void {
    const { width, height } = this.scale;
    this.add.tileSprite(0, 0, width, height, 'daily_bg').setOrigin(0).setTint(0x555555).setDepth(-10);
    this.add.image(width / 2, height, 'daily_pile').setOrigin(0.5, 1).setScale(0.75).setDepth(-8);
    const logo = this.add.image(16, 14, 'daily_logo').setOrigin(0).setDepth(20);
    logo.setScale(Math.min(0.42, (width * 0.24) / logo.width));
    this.createFallingCards();

    void fetch('/api/daily-booster').then((response) => response.json()).then((data: DailyBoosterResponse) => {
      if (data.expired) {
        this.showFinished('So sad - You missed your pack.', 'OK fine!');
        return;
      }
      if (!data.active) {
        emitDailyBoosterFinished();
        return;
      }
      if (data.claimed) {
        this.showFinished('TODAY\'S PACK IS ALREADY CLAIMED!');
        return;
      }
      this.choices = data.choices;
      this.showPack();
    }).catch(() => this.showFinished('PACK SIGNAL LOST!'));
  }

  private createFallingCards(): void {
    const { width, height } = this.scale;
    const frames = this.textures.get('daily_falling').getFrameNames().filter((frame) => frame !== '__BASE');
    for (let index = 0; index < 12; index++) {
      const card = this.add.sprite(Phaser.Math.Between(0, width), Phaser.Math.Between(-100, height), 'daily_falling', frames[index % frames.length] ?? '0')
        .setDepth(-9).setAlpha(0.58).setScale(Phaser.Math.FloatBetween(0.55, 0.85));
      this.tweens.add({ targets: card, y: height + 110, angle: Phaser.Math.Between(-80, 80), duration: Phaser.Math.Between(5000, 9000), repeat: -1, delay: index * 180 });
    }
  }

  private addNeonPanel(container: Phaser.GameObjects.Container, width: number, height: number): void {
    container.add(this.add.rectangle(-6, -6, width, height, 0x080b1c, 0).setStrokeStyle(4, 0xffbb00));
    container.add(this.add.rectangle(6, 6, width, height, 0x080b1c, 0).setStrokeStyle(4, 0xff00ff));
    container.add(this.add.rectangle(0, 0, width, height, 0x080b1c, 0.98).setStrokeStyle(4, 0x00ffee));
  }

  private showPack(): void {
    const { width, height } = this.scale;
    const panel = this.add.container(width / 2, height / 2).setDepth(10);
    this.addNeonPanel(panel, Math.min(width - 24, 470), Math.min(height - 24, 470));
    panel.add(this.add.text(0, -190, 'DAILY FREE BOOSTER!', { fontFamily: 'monospace', fontSize: '24px', color: '#ffff00', fontStyle: 'bold', stroke: '#ff00ff', strokeThickness: 2 }).setOrigin(0.5));
    panel.add(this.add.text(0, -155, 'TAP PACK TO OPEN // PICK ONE CARD', { fontFamily: 'monospace', fontSize: '11px', color: '#00ffee' }).setOrigin(0.5));
    const pack = this.add.image(0, 30, 'daily_pack').setScale(1.2).setInteractive({ useHandCursor: true });
    panel.add(pack);
    this.tweens.add({ targets: pack, y: 22, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    pack.once('pointerdown', () => {
      this.tweens.killTweensOf(pack);
      panel.destroy(true);
      this.showChoices();
    });
  }

  private showChoices(): void {
    const { width, height } = this.scale;
    const panel = this.add.container(width / 2, height / 2).setDepth(10);
    this.addNeonPanel(panel, Math.min(width - 24, 470), Math.min(height - 24, 470));
    panel.add(this.add.text(0, -190, 'PICK ONE! ~MEOW', { fontFamily: 'monospace', fontSize: '23px', color: '#ffffff', fontStyle: 'bold', stroke: '#ff00ff', strokeThickness: 2 }).setOrigin(0.5));
    const spacing = Math.min(120, (width - 70) / 3);
    const cards: Phaser.GameObjects.Container[] = [];
    this.choices.forEach((reward, index) => {
      const holder = this.add.container((index - 1) * spacing, -20).setScale(0.9).setSize(70, 120).setInteractive({ useHandCursor: true });
      if (reward.kind === 'cat' || reward.kind === 'holoCat') {
        const catId = isCompanionCatId(reward.catId) ? reward.catId : 'c1';
        const frame = getCatCardFrame(catId);
        holder.add(this.add.sprite(0, 0, frame.sheet, frame.frame));
        if (reward.kind === 'holoCat') holder.add(this.add.image(0, 0, 'holo_card_overlay').setAlpha(0.58).setBlendMode(Phaser.BlendModes.ADD));
        holder.add(this.add.text(0, 60, COMPANION_CATS[catId]?.name ?? 'CAT CARD', { fontFamily: 'monospace', fontSize: '9px', color: '#ffff00' }).setOrigin(0.5));
      } else {
        const card = makeCard(reward.suit, reward.rank, reward.kind === 'holoDeck', reward.kind === 'sealedDeck' ? [reward.seal] : []);
        holder.add(createCardSprite(this, 0, 0, card, false));
        holder.add(this.add.text(0, 60, card.name.toUpperCase(), { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff', align: 'center', wordWrap: { width: 90 } }).setOrigin(0.5));
      }
      holder.on('pointerdown', () => {
        this.selected = index;
        cards.forEach((card, cardIndex) => card.setScale(cardIndex === index ? 1.08 : 0.9).setY(cardIndex === index ? -32 : -20));
        claim.setAlpha(1).setInteractive({ useHandCursor: true });
      });
      panel.add(holder);
      cards.push(holder);
    });
    const claim = this.add.rectangle(0, 150, 150, 42, 0xd90053).setStrokeStyle(3, 0x00ffee).setAlpha(0.4);
    panel.add([claim, this.add.text(0, 150, 'CLAIM CARD', { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5)]);
    claim.once('pointerdown', () => void this.claimReward(panel));
  }

  private async claimReward(panel: Phaser.GameObjects.Container): Promise<void> {
    if (this.selected < 0) return;
    const response = await fetch('/api/daily-booster/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: this.selected }) });
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

  private storeReward(reward: DailyBoosterReward): void {
    if (reward.kind === 'cat' || reward.kind === 'holoCat') {
      const raw: unknown = JSON.parse(localStorage.getItem('player_owned_companion_cats') ?? '[]');
      const cats = Array.isArray(raw) ? raw.filter((value) => typeof value === 'string') : [];
      cats.push(reward.catId);
      localStorage.setItem('player_owned_companion_cats', JSON.stringify(cats));
      if (reward.kind === 'holoCat') {
        const holoRaw: unknown = JSON.parse(localStorage.getItem('player_holographic_companion_cats') ?? '[]');
        const holos = new Set(Array.isArray(holoRaw) ? holoRaw.filter((value) => typeof value === 'string') : []);
        holos.add(reward.catId);
        localStorage.setItem('player_holographic_companion_cats', JSON.stringify([...holos]));
      }
      reportPlayerProgress({ catsCollected: 1, cardsClaimed: 1, xp: 25 });
      return;
    }
    const raw: unknown = JSON.parse(localStorage.getItem('player_card_deck') ?? '[]');
    const deck = Array.isArray(raw) ? raw : [];
    deck.push(makeCard(reward.suit, reward.rank, reward.kind === 'holoDeck', reward.kind === 'sealedDeck' ? [reward.seal] : []));
    localStorage.setItem('player_card_deck', JSON.stringify(deck));
    reportPlayerProgress({ cardsClaimed: 1 });
  }

  private showFinished(message: string, buttonLabel = 'MAIN MENU'): void {
    const { width, height } = this.scale;
    const panel = this.add.container(width / 2, height / 2).setDepth(20);
    this.addNeonPanel(panel, Math.min(width - 30, 390), 190);
    panel.add(this.add.text(0, -35, message, { fontFamily: 'monospace', fontSize: '17px', color: '#ffff00', align: 'center', wordWrap: { width: 340 } }).setOrigin(0.5));
    const button = this.add.rectangle(0, 45, 160, 42, 0xd90053).setStrokeStyle(3, 0x00ffee).setInteractive({ useHandCursor: true });
    panel.add([button, this.add.text(0, 45, buttonLabel, { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' }).setOrigin(0.5)]);
    button.once('pointerdown', emitDailyBoosterFinished);
  }
}
