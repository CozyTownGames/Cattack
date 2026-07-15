import * as Phaser from 'phaser';

export const installCrispPhaserText = (game: Phaser.Game): void => {
  const resolution = Math.min(window.devicePixelRatio || 1, 2);
  const processed = new WeakSet<Phaser.GameObjects.Text>();

  const sharpen = (object: Phaser.GameObjects.GameObject): void => {
    if (object instanceof Phaser.GameObjects.Text) {
      if (!processed.has(object)) {
        processed.add(object);
        object.setResolution(resolution);
      }
      return;
    }
    if (object instanceof Phaser.GameObjects.Container) {
      object.list.forEach((child) => sharpen(child));
    }
  };

  game.events.on(Phaser.Core.Events.POST_STEP, () => {
    game.scene.getScenes(true).forEach((scene) => {
      scene.children.list.forEach((object) => sharpen(object));
    });
  });
};
