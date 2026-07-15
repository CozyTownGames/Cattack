export type SceneChangedPayload = { scene: string };
export type ShowExitButtonPayload = {
  active: boolean;
  styleType?: 'leaderboard' | 'defeat';
};

export function emitSceneChanged(payload: SceneChangedPayload): void {
  window.dispatchEvent(new CustomEvent('sceneChanged', { detail: payload }));
}

export function onSceneChanged(handler: (payload: SceneChangedPayload) => void): () => void {
  const listener = (event: Event) => {
    if (event instanceof CustomEvent && typeof event.detail?.scene === 'string') {
      handler(event.detail);
    }
  };
  window.addEventListener('sceneChanged', listener);
  return () => window.removeEventListener('sceneChanged', listener);
}

export function emitPlayerHearts(current: number, maximum: number): void {
  window.dispatchEvent(new CustomEvent('playerHeartsChanged', { detail: { current, maximum } }));
}

export function onPlayerHeartsChanged(handler: (current: number, maximum: number) => void): () => void {
  const listener = (event: Event) => {
    if (event instanceof CustomEvent && typeof event.detail?.current === 'number' && typeof event.detail?.maximum === 'number') {
      handler(event.detail.current, event.detail.maximum);
    }
  };
  window.addEventListener('playerHeartsChanged', listener);
  return () => window.removeEventListener('playerHeartsChanged', listener);
}

export function emitStarterPackOpened(): void {
  window.dispatchEvent(new CustomEvent('starterPackOpened'));
}

export function onStarterPackOpened(handler: () => void): () => void {
  window.addEventListener('starterPackOpened', handler);
  return () => window.removeEventListener('starterPackOpened', handler);
}

export function emitDailyBoosterFinished(): void {
  window.dispatchEvent(new CustomEvent('dailyBoosterFinished'));
}

export function onDailyBoosterFinished(handler: () => void): () => void {
  window.addEventListener('dailyBoosterFinished', handler);
  return () => window.removeEventListener('dailyBoosterFinished', handler);
}

export function emitIntelToast(message: string): void {
  window.dispatchEvent(new CustomEvent('intelToast', { detail: { msg: message } }));
}

export function onIntelToast(handler: (message: string) => void): () => void {
  const listener = (event: Event) => {
    if (event instanceof CustomEvent && typeof event.detail?.msg === 'string') {
      handler(event.detail.msg);
    }
  };
  window.addEventListener('intelToast', listener);
  return () => window.removeEventListener('intelToast', listener);
}

export function onShowExitButton(handler: (payload: ShowExitButtonPayload) => void): () => void {
  const listener = (event: Event) => {
    if (event instanceof CustomEvent && typeof event.detail?.active === 'boolean') {
      handler(event.detail);
    }
  };
  window.addEventListener('showExitButton', listener);
  return () => window.removeEventListener('showExitButton', listener);
}

export function emitShowClaimButton(active: boolean): void {
  window.dispatchEvent(new CustomEvent('showClaimButton', { detail: { active } }));
}

export function onShowClaimButton(handler: (active: boolean) => void): () => void {
  const listener = (event: Event) => {
    if (event instanceof CustomEvent && typeof event.detail?.active === 'boolean') {
      handler(event.detail.active);
    }
  };
  window.addEventListener('showClaimButton', listener);
  return () => window.removeEventListener('showClaimButton', listener);
}

export function emitReturnToInlineSplash(): void {
  window.dispatchEvent(new CustomEvent('returnToInlineSplash'));
}

export function onReturnToInlineSplash(handler: () => void): () => void {
  window.addEventListener('returnToInlineSplash', handler);
  return () => window.removeEventListener('returnToInlineSplash', handler);
}

export function emitExpeditionGoldChanged(gold: number): void {
  window.dispatchEvent(new CustomEvent('expeditionGoldChanged', { detail: { gold } }));
}

export function onExpeditionGoldChanged(handler: (gold: number) => void): () => void {
  const listener = (event: Event) => {
    if (event instanceof CustomEvent && typeof event.detail?.gold === 'number') handler(event.detail.gold);
  };
  window.addEventListener('expeditionGoldChanged', listener);
  return () => window.removeEventListener('expeditionGoldChanged', listener);
}
