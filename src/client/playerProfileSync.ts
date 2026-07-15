import {
  PLAYER_PROFILE_KEYS,
  PLAYER_PROFILE_VERSION,
  type PlayerProfileValues,
  type StoredPlayerProfile,
} from '../shared/playerProfile';

type ProfileResponse = {
  status: 'success';
  profile: StoredPlayerProfile | null;
};

let syncStarted = false;
let saveTimer: number | null = null;
let lastSavedSnapshot = '';
let saveInFlight: Promise<void> | null = null;

const readLocalProfile = (): PlayerProfileValues => {
  const values: PlayerProfileValues = {};
  PLAYER_PROFILE_KEYS.forEach((key) => {
    const value = localStorage.getItem(key);
    if (value !== null) values[key] = value;
  });
  return values;
};

const serializeLocalProfile = (): string => JSON.stringify(readLocalProfile());

const applyProfile = (profile: StoredPlayerProfile): void => {
  PLAYER_PROFILE_KEYS.forEach((key) => {
    const value = profile.values[key];
    if (typeof value === 'string') localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  });
};

const saveProfile = async (): Promise<void> => {
  const snapshot = serializeLocalProfile();
  if (snapshot === lastSavedSnapshot) return;
  const values: PlayerProfileValues = JSON.parse(snapshot);
  const response = await fetch('/api/player-profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: PLAYER_PROFILE_VERSION, values }),
    keepalive: true,
  });
  if (!response.ok) throw new Error(`Profile save failed (${response.status})`);
  lastSavedSnapshot = snapshot;
};

const queueSave = (): void => {
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    saveInFlight = saveProfile()
      .catch((error) => console.error('[profile] Redis save failed:', error))
      .finally(() => { saveInFlight = null; });
  }, 500);
};

export const hydratePlayerProfile = async (): Promise<void> => {
  try {
    const response = await fetch('/api/player-profile');
    if (!response.ok) return;
    const data: ProfileResponse = await response.json();
    if (data.profile) {
      applyProfile(data.profile);
      lastSavedSnapshot = serializeLocalProfile();
      window.dispatchEvent(new CustomEvent('player-profile-hydrated'));
      return;
    }

    const localSnapshot = serializeLocalProfile();
    lastSavedSnapshot = '';
    if (localSnapshot !== '{}') await saveProfile();
  } catch (error) {
    console.error('[profile] Redis hydration failed; using local cache:', error);
  }
};

export const startPlayerProfileSync = (): void => {
  if (syncStarted) return;
  syncStarted = true;
  lastSavedSnapshot = serializeLocalProfile();

  window.setInterval(() => {
    if (serializeLocalProfile() !== lastSavedSnapshot) queueSave();
  }, 1000);

  const flush = (): void => {
    if (serializeLocalProfile() === lastSavedSnapshot || saveInFlight) return;
    void saveProfile().catch((error) => console.error('[profile] Redis flush failed:', error));
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush();
  });
};
