import { useState, useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import * as Phaser from 'phaser';
import { SplashScene } from './scenes/SplashScene';
import { ExpeditionFlightScene } from './scenes/ExpeditionFlightScene';
import { ExplorationScene } from './scenes/ExplorationScene';
import { CardBattleScene } from './scenes/CardBattleScene';
import { StarterBoosterScene } from './scenes/StarterBoosterScene';
import { DailyBoosterScene } from './scenes/DailyBoosterScene';
import { VsBattleIntroScene } from './scenes/VsBattleIntroScene';
import { gameStore } from '../shared/gameStore';
import type { InitResponse } from '../shared/api';
import type { BattleChallengeResponse } from '../shared/cardBattle';
import type { DailyBoosterResponse } from '../shared/dailyBooster';
import { CardTrophyView } from './ui/CardTrophyView';
import { CardShopView } from './ui/CardShopView';
import { GlobalLeaderboardView } from './ui/GlobalLeaderboardView';
import { reportPlayerProgress } from './playerProgress';
import { GameHUD } from './ui/GameHUD';
import { PlayerProgressHUD } from './ui/PlayerProgressHUD';
import { onDailyBoosterFinished, onReturnToInlineSplash, onStarterPackOpened } from './eventBus';
import { installDomUiSounds, installPhaserUiSounds } from './uiSounds';
import { isCrtEnabled, onCrtEnabledChanged } from './soundSettings';
import { hydratePlayerProfile, startPlayerProfileSync } from './playerProfileSync';
import { installCrispPhaserText } from './crispPhaserText';

type InlineMode = 'splash' | 'explore' | 'vsIntro' | 'battle' | 'dailyBooster';

const needsStarterPack = (): boolean => {
  if (localStorage.getItem('player_starter_pack_opened') === '1') return false;
  try {
    const deck: unknown = JSON.parse(localStorage.getItem('player_card_deck') ?? '[]');
    return !Array.isArray(deck) || deck.length < 52;
  } catch {
    return true;
  }
};

function SplashApp() {
  const [isBattleHovered, setIsBattleHovered] = useState(false);
  const [isExploreHovered, setIsExploreHovered] = useState(false);
  const [isTrophyHovered, setIsTrophyHovered] = useState(false);
  const [showTrophyCase, setShowTrophyCase] = useState(false);
  const [isShopHovered, setIsShopHovered] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [isLeaderboardHovered, setIsLeaderboardHovered] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [inlineMode, setInlineMode] = useState<InlineMode>('splash');
  const [showStarterPack, setShowStarterPack] = useState(needsStarterPack);
  const [battleRouteReady, setBattleRouteReady] = useState(false);
  const [crtEnabled, setCrtEnabled] = useState(isCrtEnabled);
  const deferredInlineMode = useRef<InlineMode | null>(null);

  useEffect(() => {
    reportPlayerProgress({});
    fetch('/api/init')
      .then((res) => res.json())
      .then((data: InitResponse) => {
        console.log('[splash] Init response:', data);
        if (data.type === 'init') {
          gameStore.dailySeed = data.postId || 'daily_seed_fallback';
          window.dispatchEvent(new CustomEvent('preview_init'));
        }
      })
      .catch((err) => console.error('[splash] Init error:', err));

    Promise.all([
      fetch('/api/card-battle').then((res) => res.json()),
      fetch('/api/daily-booster').then((res) => res.json()),
    ])
      .then(([data, daily]: [BattleChallengeResponse, DailyBoosterResponse]) => {
        const publishedChallenge = data.challenge ?? null;
        gameStore.pendingVsBattleIntro = data;
        const skipAutoLaunch = sessionStorage.getItem('skip_shared_battle_autostart') === '1';
        sessionStorage.removeItem('skip_shared_battle_autostart');
        if (daily.active) {
          if (needsStarterPack()) deferredInlineMode.current = 'dailyBooster';
          else setInlineMode('dailyBooster');
        } else if (publishedChallenge && !skipAutoLaunch) {
          const nextMode: InlineMode = data.viewerHasWon ? 'battle' : 'vsIntro';
          if (needsStarterPack()) deferredInlineMode.current = nextMode;
          else setInlineMode(nextMode);
        }
        setBattleRouteReady(true);
      })
      .catch((err) => {
        console.error('[splash] Card battle load error:', err);
        setBattleRouteReady(true);
      });
  }, []);

  useEffect(() => onReturnToInlineSplash(() => setInlineMode('splash')), []);
  useEffect(() => onDailyBoosterFinished(() => setInlineMode('splash')), []);
  useEffect(() => onStarterPackOpened(() => {
    setShowStarterPack(false);
    const nextMode = deferredInlineMode.current;
    deferredInlineMode.current = null;
    if (nextMode) setInlineMode(nextMode);
  }), []);
  useEffect(() => onCrtEnabledChanged(setCrtEnabled), []);

  useEffect(() => {
    if (!battleRouteReady) return;
    console.log('[splash] Booting Phaser preview...');
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: 'phaser-preview-container',
      backgroundColor: '#0b0b1e',
      pixelArt: true,
      render: {
        pixelArt: true,
        antialias: false,
        roundPixels: true,
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
      scene: showStarterPack
        ? [StarterBoosterScene]
        : inlineMode === 'dailyBooster'
          ? [DailyBoosterScene, SplashScene, CardBattleScene, ExpeditionFlightScene, ExplorationScene]
        : inlineMode === 'splash'
        ? [SplashScene]
        : inlineMode === 'vsIntro'
          ? [VsBattleIntroScene, CardBattleScene, ExpeditionFlightScene, ExplorationScene]
        : inlineMode === 'battle'
          ? [CardBattleScene, ExpeditionFlightScene, ExplorationScene]
          : [ExpeditionFlightScene, ExplorationScene, CardBattleScene],
    };

    const game = new Phaser.Game(config);
    installPhaserUiSounds(game);
    installCrispPhaserText(game);

    return () => {
      console.log('[splash] Destroying Phaser preview...');
      game.destroy(true);
    };
  }, [battleRouteReady, inlineMode, showStarterPack]);

  const containInlinePointer = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
  };

  const handleBattle = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    gameStore.pendingVsBattleIntro = null;
    gameStore.startFreshCardBattle = true;
    setInlineMode('battle');
  };

  const handlePlay = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    setInlineMode('explore');
  };

  return (
    <div
      className={crtEnabled && inlineMode === 'splash' ? 'splash-crt-ui' : undefined}
      style={{ ...styles.ugcContainer, pointerEvents: !battleRouteReady || showStarterPack ? 'none' : inlineMode === 'splash' ? 'auto' : 'none' }}
    >
      {battleRouteReady && <PlayerProgressHUD showStatus={!showStarterPack && (inlineMode === 'splash' || inlineMode === 'explore') && !showTrophyCase && !showLeaderboard} showHearts />}
      {battleRouteReady && inlineMode !== 'splash' && <GameHUD showProgress={false} />}
      <div className="splash-top-row" style={{ ...styles.topRow, display: battleRouteReady && inlineMode === 'splash' && !showStarterPack ? 'flex' : 'none' }}>
        <img
          src="assets/cattack-logo.png"
          alt="Cattack!"
          draggable={false}
          className="splash-game-logo"
          style={styles.gameLogo}
        />
      </div>

      {battleRouteReady && inlineMode === 'splash' && !showStarterPack && showTrophyCase && <CardTrophyView onClose={() => setShowTrophyCase(false)} />}
      {battleRouteReady && inlineMode === 'splash' && !showStarterPack && showShop && <CardShopView onClose={() => setShowShop(false)} />}
      {battleRouteReady && inlineMode === 'splash' && !showStarterPack && showLeaderboard && <GlobalLeaderboardView onClose={() => setShowLeaderboard(false)} />}

      <div style={{ ...styles.worldMap, display: battleRouteReady && inlineMode === 'splash' && !showStarterPack ? 'block' : 'none' }}>
        <button
          className="splash-world-button"
          style={{
            ...styles.worldButton,
            ...styles.shopPosition,
            transform: isShopHovered ? 'scale(1.06)' : 'scale(1)',
          }}
          onClick={() => setShowShop(true)}
          onPointerDown={containInlinePointer}
          onMouseEnter={() => setIsShopHovered(true)}
          onMouseLeave={() => setIsShopHovered(false)}
          id="shop-btn"
        >
          <img src="planets/2.png" alt="" style={styles.planetImage} />
          <span className="splash-world-label" style={styles.worldButtonLabel}>SHOP</span>
        </button>
        <button
          className="splash-world-button"
          style={{
            ...styles.worldButton,
            ...styles.explorePosition,
            transform: isExploreHovered ? 'scale(1.06)' : 'scale(1)',
          }}
          onClick={handlePlay}
          onPointerDown={containInlinePointer}
          onMouseEnter={() => setIsExploreHovered(true)}
          onMouseLeave={() => setIsExploreHovered(false)}
          id="splash-explore-btn"
        >
          <img src="planets/3.png" alt="" style={styles.planetImage} />
          <span className="splash-world-label" style={styles.worldButtonLabel}>EXPLORE</span>
        </button>
        <button
          className="splash-world-button"
          style={{
            ...styles.worldButton,
            ...styles.battlePosition,
            transform: isBattleHovered ? 'translateX(-50%) scale(1.08)' : 'translateX(-50%) scale(1)',
          }}
          onClick={handleBattle}
          onPointerDown={containInlinePointer}
          onMouseEnter={() => setIsBattleHovered(true)}
          onMouseLeave={() => setIsBattleHovered(false)}
          id="splash-battle-btn"
        >
          <img src="planets/4.png" alt="" style={styles.planetImage} />
          <span className="splash-world-label" style={styles.worldButtonLabel}>BATTLE</span>
        </button>
        <button
          className="splash-world-button"
          style={{
            ...styles.worldButton,
            ...styles.trophyPosition,
            transform: isTrophyHovered ? 'scale(1.06)' : 'scale(1)',
          }}
          onClick={() => setShowTrophyCase(true)}
          onPointerDown={containInlinePointer}
          onMouseEnter={() => setIsTrophyHovered(true)}
          onMouseLeave={() => setIsTrophyHovered(false)}
          id="trophy-case-btn"
        >
          <img src="planets/5.png" alt="" style={styles.planetImage} />
          <span className="splash-world-label" style={styles.worldButtonLabel}>CATDEX</span>
        </button>
        <button
          className="splash-world-button"
          style={{
            ...styles.worldButton,
            ...styles.leaderboardPosition,
            transform: isLeaderboardHovered ? 'scale(1.06)' : 'scale(1)',
          }}
          onClick={() => setShowLeaderboard(true)}
          onPointerDown={containInlinePointer}
          onMouseEnter={() => setIsLeaderboardHovered(true)}
          onMouseLeave={() => setIsLeaderboardHovered(false)}
          id="global-leaderboard-btn"
        >
          <img src="planets/6.png" alt="" style={styles.planetImage} />
          <span className="splash-world-label" style={styles.worldButtonLabel}>RANKS</span>
        </button>
      </div>

      {/* Bottom spacing */}
      <div style={styles.bottomRow}>
        <div />
      </div>
    </div>
  );
}

const styles = {
  trophyIconBtn: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    border: '2px solid #e2e8f0',
    color: '#ffffff',
    fontSize: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'transform 0.15s ease, background-color 0.15s ease, border-color 0.15s, box-shadow 0.15s',
    outline: 'none',
  },
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '20px',
  },
  ugcContainer: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    flexDirection: 'column' as const,
  },
  topRow: {
    position: 'absolute' as const,
    top: '20px',
    left: '20px',
    right: '20px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gameLogo: {
    display: 'block',
    width: 'clamp(180px, 36vw, 280px)',
    height: 'auto',
    objectFit: 'contain' as const,
    imageRendering: 'pixelated' as const,
    pointerEvents: 'none' as const,
    userSelect: 'none' as const,
    filter: 'drop-shadow(0 0 8px rgba(0, 255, 238, 0.45))',
  },
  playsCount: {
    fontSize: '18px',
    fontWeight: 'bold' as const,
    color: '#ffffff',
    fontFamily: "inherit",
    background: 'rgba(0, 0, 0, 0.5)',
    padding: '4px 12px',
    borderRadius: '4px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
  },
  worldMap: {
    position: 'absolute' as const,
    inset: 0,
  },
  worldButton: {
    position: 'absolute' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    width: 'clamp(92px, 19vw, 150px)',
    aspectRatio: '1',
    padding: 0,
    border: 0,
    borderRadius: '50%',
    background: 'transparent',
    color: '#ffffff',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'transform 0.15s ease, filter 0.15s ease',
    filter: 'drop-shadow(0 0 10px rgba(0, 255, 238, 0.4))',
  },
  planetImage: {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const,
    imageRendering: 'pixelated' as const,
  },
  worldButtonLabel: {
    position: 'relative' as const,
    zIndex: 1,
    maxWidth: '90%',
    color: '#ffffff',
    fontFamily: '"Jersey 25", "VT323", monospace',
    fontSize: 'clamp(18px, 3.1vw, 28px)',
    fontWeight: 'bold' as const,
    lineHeight: 1.25,
    textAlign: 'center' as const,
    textShadow: '0 2px 2px #000, 0 0 6px #000, 0 0 8px #000',
  },
  shopPosition: {
    top: '18%',
    left: '5%',
  },
  trophyPosition: {
    bottom: '8%',
    left: '7%',
  },
  explorePosition: {
    top: '18%',
    right: '5%',
  },
  leaderboardPosition: {
    bottom: '8%',
    right: '7%',
  },
  battlePosition: {
    bottom: '2%',
    left: '50%',
    transform: 'translateX(-50%)',
  },
  bottomRow: {
    position: 'absolute' as const,
    bottom: '20px',
    left: '20px',
    right: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  madeByContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    background: 'rgba(0, 0, 0, 0.5)',
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid rgba(0, 255, 238, 0.3)',
  },
  madeByLabel: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: "inherit",
  },
  madeByAuthor: {
    fontSize: '14px',
    fontWeight: 'bold' as const,
    color: '#00ffee',
    fontFamily: "inherit",
  },
  playButton: {
    border: '2px solid #ffffff',
    borderRadius: '4px',
    padding: '14px 30px',
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
    fontFamily: "inherit",
    transition: 'transform 0.15s ease, background 0.15s ease, box-shadow 0.15s',
  },
  trophyButton: {
    border: '2px solid #eab308',
    borderRadius: '4px',
    padding: '10px 24px',
    background: '#854d0e',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'transform 0.15s ease, box-shadow 0.15s',
  },
  buildButton: {
    border: '2.5px solid #00ffee',
    borderRadius: '4px',
    padding: '12px 32px',
    fontSize: '18px',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
    fontFamily: "inherit",
    transition: 'transform 0.15s ease, background 0.15s ease, color 0.15s ease, box-shadow 0.15s',
  },
};

document.addEventListener('DOMContentLoaded', async () => {
  document.body.style.touchAction = 'none';
  installDomUiSounds();
  await hydratePlayerProfile();
  startPlayerProfileSync();
  const uiRoot = document.getElementById('ui-root');
  if (uiRoot) {
    const root = createRoot(uiRoot);
    root.render(<SplashApp />);
  }
});
