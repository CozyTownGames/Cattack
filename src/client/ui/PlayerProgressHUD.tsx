import { useEffect, useState } from 'react';
import { getPlayerProgress, type PlayerProgress } from '../playerProgress';
import {
  onExpeditionGoldChanged,
  onPlayerHeartsChanged,
  onSceneChanged,
} from '../eventBus';
import { gameStore } from '../../shared/gameStore';
import { isSoundMuted, onSoundMutedChanged, toggleSoundMuted } from '../soundSettings';

type PlayerProgressHUDProps = {
  showStatus: boolean;
  showHearts?: boolean;
};

export function PlayerProgressHUD({ showStatus, showHearts = false }: PlayerProgressHUDProps) {
  const [progress, setProgress] = useState<PlayerProgress>(getPlayerProgress);
  const [xpToast, setXpToast] = useState<{ amount: number; id: number } | null>(null);
  const [scene, setScene] = useState('');
  const [hearts, setHearts] = useState({ current: 5, maximum: 5 });
  const [expeditionGold, setExpeditionGold] = useState(() => gameStore.expeditionMap ? gameStore.expeditionHaul.gold : 0);
  const [soundMuted, setSoundMutedState] = useState(isSoundMuted);

  useEffect(() => {
    const updateProgress = (event: Event) => {
      if (event instanceof CustomEvent && event.detail && typeof event.detail.level === 'number') {
        setProgress(event.detail);
      }
    };
    const showXp = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'number') {
        setXpToast({ amount: event.detail, id: Date.now() });
      }
    };
    window.addEventListener('playerProgressChanged', updateProgress);
    window.addEventListener('playerXpAwarded', showXp);
    const stopScene = onSceneChanged((payload) => {
      setScene(payload.scene);
    });
    const stopHearts = onPlayerHeartsChanged((current, maximum) => setHearts({ current, maximum }));
    const stopExpeditionGold = onExpeditionGoldChanged(setExpeditionGold);
    const stopSound = onSoundMutedChanged(setSoundMutedState);
    return () => {
      window.removeEventListener('playerProgressChanged', updateProgress);
      window.removeEventListener('playerXpAwarded', showXp);
      stopScene();
      stopHearts();
      stopExpeditionGold();
      stopSound();
    };
  }, []);

  return (
    <div style={styles.root}>
      {showStatus && (
        <div style={styles.status}>
          <div style={styles.row}>
            <span>LV {progress.level}</span>
            <span style={styles.gold}>◆ {(progress.gold + expeditionGold).toLocaleString()} GOLD</span>
          </div>
          <div style={styles.progressRow}>
            <div style={styles.track}>
              <div style={{ ...styles.fill, width: `${(progress.levelXp / progress.nextLevelXp) * 100}%` }} />
            </div>
            <div style={styles.xpLabel}>{progress.levelXp} / {progress.nextLevelXp} XP</div>
          </div>
          {showHearts && scene === 'Exploration' && (
            <div style={styles.hearts} aria-label={`${hearts.current} of ${hearts.maximum} hearts`}>
              {Array.from({ length: hearts.maximum }, (_, index) => (
                <span
                  key={index}
                  style={{
                    ...styles.heartIcon,
                    backgroundPosition: index < hearts.current ? '0 0' : '-16px 0',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        style={styles.soundToggle}
        onClick={() => setSoundMutedState(toggleSoundMuted())}
        aria-label={soundMuted ? 'Turn sound on' : 'Mute sound'}
        title={soundMuted ? 'Sound off' : 'Sound on'}
      >
        {soundMuted ? '🔇' : '🔊'}
      </button>
      {xpToast && (
        <div key={xpToast.id} style={styles.xpToast}>+{xpToast.amount} XP</div>
      )}
    </div>
  );
}


const styles = {
  root: {
    position: 'fixed' as const,
    top: 8,
    right: 8,
    zIndex: 13000,
    pointerEvents: 'none' as const,
    fontFamily: 'monospace',
  },
  status: {
    width: 'clamp(138px, 23vw, 178px)',
    padding: '5px 7px',
    border: '2px solid #fbbf24',
    borderRadius: 0,
    background: 'rgba(5, 8, 18, 0.96)',
    color: '#ffffff',
    boxShadow: '3px 3px 0 rgba(0, 255, 238, 0.35)',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 6,
    fontSize: 'clamp(8px, 1.4vw, 10px)',
    fontWeight: 'bold' as const,
    lineHeight: 1,
  },
  gold: { color: '#fbbf24' },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
  },
  track: {
    flex: 1,
    height: 4,
    overflow: 'hidden',
    border: '1px solid #164e63',
    borderRadius: 0,
    background: '#111827',
  },
  fill: {
    height: '100%',
    borderRadius: 0,
    background: '#00ffee',
  },
  xpLabel: {
    color: '#a5f3fc',
    fontSize: '7px',
    lineHeight: 1,
    whiteSpace: 'nowrap' as const,
    textAlign: 'right' as const,
  },
  hearts: {
    marginTop: 3,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 0,
  },
  heartIcon: {
    display: 'inline-block',
    width: 16,
    height: 16,
    backgroundImage: "url('assets/hearts.png')",
    backgroundSize: '32px 16px',
    imageRendering: 'pixelated' as const,
  },
  xpToast: {
    position: 'absolute' as const,
    top: 42,
    right: 4,
    color: '#67e8f9',
    fontSize: '17px',
    fontWeight: 'bold' as const,
    textShadow: '0 2px 3px #000, 0 0 8px #06b6d4',
    animation: 'xpFloatFade 1.4s ease-out forwards',
  },
  soundToggle: {
    display: 'block',
    marginTop: 5,
    marginLeft: 'auto',
    padding: 2,
    border: 0,
    outline: 0,
    background: 'transparent',
    color: '#ffffff',
    fontSize: 20,
    lineHeight: 1,
    cursor: 'pointer',
    pointerEvents: 'auto' as const,
    filter: 'drop-shadow(1px 1px 0 #ff00ff) drop-shadow(-1px -1px 0 #00ffee)',
  },
  settingsToggle: {
    display: 'flex',
    width: 30,
    height: 28,
    marginLeft: 'auto',
    padding: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
    border: '1px solid #00ffee',
    background: '#090d1a',
    color: '#00ffee',
    boxShadow: '2px 2px 0 rgba(255, 0, 255, 0.55)',
    fontFamily: 'monospace',
    fontSize: 19,
    cursor: 'pointer',
    pointerEvents: 'auto' as const,
  },
  settingsPanel: {
    width: 172,
    marginTop: 5,
    marginLeft: 'auto',
    padding: '8px 9px 9px',
    border: '2px solid #00ffee',
    background: 'rgba(5, 8, 18, 0.98)',
    color: '#ffffff',
    boxShadow: '4px 4px 0 rgba(255, 0, 255, 0.65), -2px -2px 0 rgba(255, 187, 0, 0.45)',
    pointerEvents: 'auto' as const,
  },
  settingsHeader: {
    color: '#ffff00',
    fontSize: 10,
    fontWeight: 'bold' as const,
    letterSpacing: 1,
  },
  warningHeader: { color: '#ff5c93', fontSize: 10, fontWeight: 'bold' as const, letterSpacing: 0.5 },
  warningText: { color: '#ffcc00', fontSize: 9, lineHeight: 1.55, textAlign: 'center' as const },
  confirmButtons: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 },
  cancelButton: {
    padding: '6px 3px', border: '1px solid #00ffee', borderRadius: 0, background: '#111827', color: '#00ffee',
    fontFamily: 'monospace', fontSize: 8, fontWeight: 'bold' as const, cursor: 'pointer',
  },
  leaveButton: {
    padding: '6px 3px', border: '1px solid #ff0055', borderRadius: 0, background: '#190817', color: '#ff5c93',
    fontFamily: 'monospace', fontSize: 8, fontWeight: 'bold' as const, cursor: 'pointer',
  },
  settingsRule: { height: 2, margin: '6px 0 4px', background: '#ff00ff' },
  settingRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 31,
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold' as const,
  },
  settingButton: {
    width: 48,
    padding: '4px 3px',
    border: '1px solid',
    borderRadius: 0,
    background: '#111827',
    fontFamily: 'monospace',
    fontSize: 9,
    fontWeight: 'bold' as const,
    cursor: 'pointer',
  },
  mainMenuButton: {
    width: '100%',
    marginTop: 6,
    padding: '7px 5px',
    border: '2px solid #ff0055',
    borderRadius: 0,
    background: '#190817',
    color: '#ffcc00',
    boxShadow: '2px 2px 0 rgba(255, 0, 255, 0.55)',
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 'bold' as const,
    cursor: 'pointer',
  },
};
