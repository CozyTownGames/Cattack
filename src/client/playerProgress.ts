export type ProgressDelta = {
  wins?: number;
  xp?: number;
  catsCollected?: number;
};

export type PlayerProgress = {
  level: number;
  totalXp: number;
  levelXp: number;
  nextLevelXp: number;
  gold: number;
};

const KEYS = {
  wins: 'player_total_wins',
  xp: 'player_total_xp',
  catsCollected: 'player_lifetime_cat_cards',
};

const readCount = (key: string): number => {
  const value = Number(localStorage.getItem(key) ?? '0');
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
};

export function getLevelProgress(totalXp: number): Pick<PlayerProgress, 'level' | 'levelXp' | 'nextLevelXp'> {
  let level = 1;
  let levelXp = totalXp;
  let nextLevelXp = level * 100;
  while (levelXp >= nextLevelXp) {
    levelXp -= nextLevelXp;
    level++;
    nextLevelXp = level * 100;
  }
  return { level, levelXp, nextLevelXp };
}

export function getPlayerProgress(): PlayerProgress {
  const totalXp = readCount(KEYS.xp);
  return { ...getLevelProgress(totalXp), totalXp, gold: readCount('player_card_coins') };
}

const emitProgress = (xpAwarded = 0): PlayerProgress => {
  const progress = getPlayerProgress();
  window.dispatchEvent(new CustomEvent('playerProgressChanged', { detail: progress }));
  if (xpAwarded > 0) {
    window.dispatchEvent(new CustomEvent('playerXpAwarded', { detail: xpAwarded }));
  }
  return progress;
};

export function changePlayerGold(delta: number): PlayerProgress {
  const gold = Math.max(0, readCount('player_card_coins') + Math.floor(delta));
  localStorage.setItem('player_card_coins', String(gold));
  return emitProgress();
}

const getInitialCatCount = (): number => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem('player_owned_companion_cats') ?? '[]');
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
};

export function reportPlayerProgress(delta: ProgressDelta): PlayerProgress {
  const existingLifetimeCats = localStorage.getItem(KEYS.catsCollected);
  if (existingLifetimeCats === null) {
    localStorage.setItem(KEYS.catsCollected, String(getInitialCatCount()));
  }

  const wins = readCount(KEYS.wins) + Math.max(0, Math.floor(delta.wins ?? 0));
  const xp = readCount(KEYS.xp) + Math.max(0, Math.floor(delta.xp ?? 0));
  const catsCollected = readCount(KEYS.catsCollected) + Math.max(0, Math.floor(delta.catsCollected ?? 0));
  localStorage.setItem(KEYS.wins, String(wins));
  localStorage.setItem(KEYS.xp, String(xp));
  localStorage.setItem(KEYS.catsCollected, String(catsCollected));

  fetch('/api/global-progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wins, xp, catsCollected }),
  }).catch((error) => console.error('Failed to sync player progress', error));

  return emitProgress(Math.max(0, Math.floor(delta.xp ?? 0)));
}
