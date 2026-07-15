import * as Phaser from 'phaser';

export class StarfieldController {
  private scene: Phaser.Scene;
  private starFar!: Phaser.GameObjects.TileSprite;
  private starMid!: Phaser.GameObjects.TileSprite;
  private twinkleStars!: Phaser.GameObjects.Group;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public create(width: number, height: number) {
    // Generate far stars tiled texture dynamically if it doesn't exist
    if (!this.scene.textures.exists('stars_bg_tiled')) {
      const canvasTex = this.scene.textures.createCanvas('stars_bg_tiled', 512, 512);
      if (canvasTex) {
        const tex = this.scene.textures.get('stars_tileset');
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

    // Create twinkle animations if they don't exist
    if (!this.scene.anims.exists('twinkle_star_1')) {
      this.scene.anims.create({
        key: 'twinkle_star_1',
        frames: this.scene.anims.generateFrameNumbers('stars_animation1', {}),
        frameRate: Phaser.Math.Between(4, 7),
        repeat: -1,
      });
    }
    if (!this.scene.anims.exists('twinkle_star_2')) {
      this.scene.anims.create({
        key: 'twinkle_star_2',
        frames: this.scene.anims.generateFrameNumbers('stars_animation2', {}),
        frameRate: Phaser.Math.Between(4, 7),
        repeat: -1,
      });
    }
    if (!this.scene.anims.exists('twinkle_star_3')) {
      this.scene.anims.create({
        key: 'twinkle_star_3',
        frames: this.scene.anims.generateFrameNumbers('stars_animation3', {}),
        frameRate: Phaser.Math.Between(4, 7),
        repeat: -1,
      });
    }

    // Far background stars
    this.starFar = this.scene.add
      .tileSprite(0, 0, width, height, 'stars_bg_tiled')
      .setOrigin(0)
      .setDepth(0)
      .setScrollFactor(0);

    // Mid background space tile overlay
    this.starMid = this.scene.add
      .tileSprite(0, 0, width, height, 'space_tile')
      .setOrigin(0)
      .setDepth(1)
      .setScrollFactor(0)
      .setAlpha(0.55)
      .setBlendMode(Phaser.BlendModes.ADD);

    // Twinkling foreground stars
    this.twinkleStars = this.scene.add.group();
    for (let i = 0; i < 35; i++) {
      const rx = Phaser.Math.Between(0, width);
      const ry = Phaser.Math.Between(0, height);

      const type = Phaser.Math.Between(1, 3);
      const key = `stars_animation${type}`;
      const animKey = `twinkle_star_${type}`;

      const star = this.scene.add.sprite(rx, ry, key, 0);
      star.setDepth(2);
      star.setScrollFactor(0);
      star.play(animKey);

      const animState = star.anims.currentAnim;
      if (animState) {
        star.anims.setProgress(Phaser.Math.FloatBetween(0, 1));
      }
      star.setData('speed', Phaser.Math.FloatBetween(1.8, 3.8));
      this.twinkleStars.add(star);
    }
  }

  public update(parallaxMultiplier: number, width: number, height: number) {
    this.starFar.tilePositionY -= 0.3 * parallaxMultiplier;
    this.starMid.tilePositionY -= 0.9 * parallaxMultiplier;

    // Twinkling stars scroll down
    this.twinkleStars.getChildren().forEach((starObj) => {
      const star = starObj as Phaser.GameObjects.Sprite;
      const speed = star.getData('speed') as number;
      star.y += speed * parallaxMultiplier;
      if (star.y > height + 16) {
        star.y = -16;
        star.x = Phaser.Math.Between(0, width);
        star.setData('speed', Phaser.Math.FloatBetween(1.8, 3.8));
      }
    });
  }

  public scrollHorizontal(cameraX: number) {
    this.starFar.tilePositionX = cameraX * 0.05;
    this.starMid.tilePositionX = cameraX * 0.15;
  }

  public setSize(newWidth: number, newHeight: number) {
    if (this.starFar) this.starFar.setSize(newWidth, newHeight);
    if (this.starMid) this.starMid.setSize(newWidth, newHeight);
  }
}
