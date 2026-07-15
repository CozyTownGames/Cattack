/**
 * game.ts — Main entry point for the Cattack! game.
 *
 * Critical architecture decisions documented here:
 *
 * 1. NO React StrictMode
 *    React 18 StrictMode mounts → unmounts → remounts every component in dev.
 *    This would call new Phaser.Game() twice, creating two canvases side-by-side.
 *    We use createRoot() without <StrictMode> to guarantee a single Phaser instance.
 *
 * 2. Single Phaser instance with explicit destroy on restart
 *    The gameRestart event destroys the old Phaser instance and creates a fresh one
 *    so the seeded RNG and scene state are fully reset.
 *
 * 3. React mounts AFTER DOMContentLoaded
 *    Ensures #ui-root exists before createRoot() is called.
 */

import * as Phaser from 'phaser';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';

import { ExplorationScene } from './scenes/ExplorationScene';
import { ExpeditionFlightScene } from './scenes/ExpeditionFlightScene';
import { CardBattleScene } from './scenes/CardBattleScene';
import { GameHUD } from './ui/GameHUD';
import { installDomUiSounds, installPhaserUiSounds } from './uiSounds';
import { hydratePlayerProfile, startPlayerProfileSync } from './playerProfileSync';
import { installCrispPhaserText } from './crispPhaserText';



// ── Phaser game factory ────────────────────────────────────────────────────────

function buildPhaserConfig(): Phaser.Types.Core.GameConfig {
  const isCardBattle = localStorage.getItem('mode') === 'card_battle';
  const scenes = isCardBattle
    ? [CardBattleScene, ExpeditionFlightScene, ExplorationScene]
    : [ExpeditionFlightScene, ExplorationScene, CardBattleScene];

  return {
    type: Phaser.AUTO,
    parent: 'game-container',
    backgroundColor: '#0b0b1e',
    render: {
      pixelArt: true,
      antialias: false,
      roundPixels: true
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    fps: {
      target: 60,
      forceSetTimeOut: true,
    },
    scene: scenes,
  };
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrap() {

  // Ensure mobile drag doesn't refresh or scroll the page
  document.body.style.touchAction = 'none';
  installDomUiSounds();
  await hydratePlayerProfile();
  startPlayerProfileSync();

  // ── Mount React HUD (no StrictMode) ────────────────────────────────────────
  const uiRoot = document.getElementById('ui-root');
  if (!uiRoot) throw new Error('#ui-root not found in DOM');

  const root = createRoot(uiRoot);
  root.render(createElement(GameHUD));

  // ── Start Phaser ────────────────────────────────────────────────────────────
  const game: Phaser.Game = new Phaser.Game(buildPhaserConfig());
  installPhaserUiSounds(game);
  installCrispPhaserText(game);

  // Setup ResizeObserver to watch container resize (for responsive webview updates)
  let resizeObserver: ResizeObserver | null = null;
  const setupResizeObserver = (gameInstance: Phaser.Game) => {
    if (resizeObserver) resizeObserver.disconnect();
    const container = document.getElementById('game-container');
    if (container) {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            gameInstance.scale.resize(width, height);
          }
        }
      });
      resizeObserver.observe(container);
    }
  };

  setupResizeObserver(game);

}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  void bootstrap();
} else {
  document.addEventListener('DOMContentLoaded', () => {
    void bootstrap();
  });
}
