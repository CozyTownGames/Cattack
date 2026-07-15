import { useEffect, useState } from 'react';
import { emitReturnToInlineSplash, emitShowClaimButton, onIntelToast, onSceneChanged, onShowClaimButton, onShowExitButton } from '../eventBus';
import { PlayerProgressHUD } from './PlayerProgressHUD';

type GameHUDProps = { showProgress?: boolean };

export function GameHUD({ showProgress = true }: GameHUDProps) {
  const [toast, setToast] = useState<string | null>(null);
  const [showExit, setShowExit] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const [scene, setScene] = useState('');

  useEffect(() => {
    let toastTimer: ReturnType<typeof setTimeout> | null = null;
    const stopToast = onIntelToast((message) => {
      setToast(message);
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => setToast(null), 2600);
    });
    const stopExit = onShowExitButton(({ active }) => setShowExit(active));
    const stopClaim = onShowClaimButton(setShowClaim);
    const stopScene = onSceneChanged((payload) => setScene(payload.scene));
    return () => {
      stopToast();
      stopExit();
      stopClaim();
      stopScene();
      if (toastTimer) clearTimeout(toastTimer);
    };
  }, []);

  const exit = () => {
    localStorage.removeItem('mode');
    emitShowClaimButton(false);
    emitReturnToInlineSplash();
  };

  return (
    <div style={styles.root}>
      {showProgress && <PlayerProgressHUD showStatus={scene === 'Exploration' || scene === 'ExpeditionFlight'} showHearts />}
      {toast && <div style={styles.toast}>{toast}</div>}
      {showExit && <button style={styles.exit} onClick={exit}>EXIT</button>}
      {showClaim && <button style={styles.claim} onClick={exit}>CLAIM</button>}
    </div>
  );
}

const styles = {
  root: {
    position: 'fixed' as const,
    inset: 0,
    pointerEvents: 'none' as const,
    zIndex: 1000,
  },
  toast: {
    position: 'absolute' as const,
    top: 18,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '9px 16px',
    border: '2px solid #00ffee',
    borderRadius: 6,
    background: 'rgba(9, 13, 22, 0.94)',
    color: '#ffffff',
    fontFamily: 'monospace',
    fontWeight: 'bold' as const,
    pointerEvents: 'none' as const,
  },
  exit: {
    position: 'absolute' as const,
    right: 16,
    bottom: 16,
    padding: '10px 20px',
    border: '2px solid #ffffff',
    borderRadius: 5,
    background: '#334155',
    color: '#ffffff',
    fontFamily: 'monospace',
    fontWeight: 'bold' as const,
    pointerEvents: 'auto' as const,
    cursor: 'pointer',
  },
  claim: {
    position: 'absolute' as const,
    left: '50%',
    top: 'calc(50% + 105px)',
    transform: 'translateX(-50%)',
    minWidth: 150,
    padding: '13px 24px',
    border: '2px solid #ffffff',
    borderRadius: 5,
    background: '#0891b2',
    color: '#ffffff',
    fontFamily: 'monospace',
    fontSize: 17,
    fontWeight: 'bold' as const,
    pointerEvents: 'auto' as const,
    cursor: 'pointer',
  },
};
