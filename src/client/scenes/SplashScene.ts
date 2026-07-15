import * as Phaser from 'phaser';

export class SplashScene extends Phaser.Scene {
  private farStars!: Phaser.GameObjects.TileSprite;
  private nearStars!: Phaser.GameObjects.TileSprite;
  private ship!: Phaser.GameObjects.Image;

  constructor() {
    super('SplashScene');
  }

  preload(): void {
    const version = Date.now();
    this.load.image('splash_space', `space/space_tile.png?v=${version}`);
    this.load.image('splash_ship', `images/player.png?v=${version}`);
    this.load.spritesheet('splash_stars', `space/stars_tileset.png?v=${version}`, {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet('splash_stars_animation1', `space/stars_animation1.png?v=${version}`, {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet('splash_stars_animation2', `space/stars_animation2.png?v=${version}`, {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet('splash_stars_animation3', `space/stars_animation3.png?v=${version}`, {
      frameWidth: 32,
      frameHeight: 32,
    });
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#080719');

    this.farStars = this.add
      .tileSprite(0, 0, width, height, 'splash_space')
      .setOrigin(0)
      .setAlpha(1);
    this.nearStars = this.add
      .tileSprite(0, 0, width, height, 'splash_space')
      .setOrigin(0)
      .setAlpha(0.18);

    for (let type = 1; type <= 3; type++) {
      this.anims.create({
        key: `splash_twinkle_star_${type}`,
        frames: this.anims.generateFrameNumbers(`splash_stars_animation${type}`, {}),
        frameRate: Phaser.Math.Between(4, 7),
        repeat: -1,
      });
    }

    const stars = this.add.group();
    for (let index = 0; index < 24; index++) {
      const type = Phaser.Math.Between(1, 3);
      const texture = this.add.sprite(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        `splash_stars_animation${type}`,
        0
      );
      texture.setAlpha(Phaser.Math.FloatBetween(0.35, 0.9));
      texture.setScale(Phaser.Math.FloatBetween(0.5, 1));
      texture.setData('speed', Phaser.Math.FloatBetween(0.15, 0.55));
      texture.play(`splash_twinkle_star_${type}`);
      texture.anims.setProgress(Phaser.Math.FloatBetween(0, 1));
      stars.add(texture);
    }

    this.ship = this.add.image(width * 0.5, height * 0.52, 'splash_ship').setScale(2).setAngle(90);
    this.tweens.add({
      targets: this.ship,
      y: this.ship.y - 10,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.scale.on('resize', this.resizeScene, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.resizeScene, this));
  }

  private resizeScene(size: Phaser.Structs.Size): void {
    this.farStars.setSize(size.width, size.height);
    this.nearStars.setSize(size.width, size.height);
    this.ship.setPosition(size.width * 0.5, size.height * 0.52);
  }

  override update(_time: number, delta: number): void {
    this.farStars.tilePositionX += delta * 0.008;
    this.nearStars.tilePositionX += delta * 0.02;
  }
}
