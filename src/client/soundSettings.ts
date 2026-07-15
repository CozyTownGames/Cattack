const SOUND_MUTED_KEY = 'cattack_sound_muted';
const SOUND_CHANGED_EVENT = 'cattackSoundChanged';
const CRT_ENABLED_KEY = 'cattack_crt_enabled';
const CRT_CHANGED_EVENT = 'cattackCrtChanged';

export const isSoundMuted = (): boolean => (
  localStorage.getItem(SOUND_MUTED_KEY) === '1'
);

export const setSoundMuted = (muted: boolean): void => {
  localStorage.setItem(SOUND_MUTED_KEY, muted ? '1' : '0');
  window.dispatchEvent(new CustomEvent(SOUND_CHANGED_EVENT, { detail: { muted } }));
};

export const toggleSoundMuted = (): boolean => {
  const muted = !isSoundMuted();
  setSoundMuted(muted);
  return muted;
};

export const onSoundMutedChanged = (handler: (muted: boolean) => void): (() => void) => {
  const listener = (event: Event): void => {
    if (event instanceof CustomEvent && typeof event.detail?.muted === 'boolean') {
      handler(event.detail.muted);
    }
  };
  window.addEventListener(SOUND_CHANGED_EVENT, listener);
  return () => window.removeEventListener(SOUND_CHANGED_EVENT, listener);
};

export const isCrtEnabled = (): boolean => localStorage.getItem(CRT_ENABLED_KEY) !== '0';

export const setCrtEnabled = (enabled: boolean): void => {
  localStorage.setItem(CRT_ENABLED_KEY, enabled ? '1' : '0');
  window.dispatchEvent(new CustomEvent(CRT_CHANGED_EVENT, { detail: { enabled } }));
};

export const toggleCrtEnabled = (): boolean => {
  const enabled = !isCrtEnabled();
  setCrtEnabled(enabled);
  return enabled;
};

export const onCrtEnabledChanged = (handler: (enabled: boolean) => void): (() => void) => {
  const listener = (event: Event): void => {
    if (event instanceof CustomEvent && typeof event.detail?.enabled === 'boolean') handler(event.detail.enabled);
  };
  window.addEventListener(CRT_CHANGED_EVENT, listener);
  return () => window.removeEventListener(CRT_CHANGED_EVENT, listener);
};
