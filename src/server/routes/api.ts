import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  DecrementResponse,
  IncrementResponse,
  InitResponse,
  LeaderboardResponse,
} from '../../shared/api';
import type {
  BattleChallengeResponse,
  BattleChallengeSnapshot,
  BattleChallengeStats,
  BattleTurnSnapshot,
} from '../../shared/cardBattle';
import { getPlayCardLimitForCats, MAX_EQUIPPED_CATS } from '../../shared/cardBattle';
import { isBoardSkinId, isCardSkinId } from '../../shared/cosmetics';
import {
  PLAYER_PROFILE_KEYS,
  PLAYER_PROFILE_VERSION,
  type PlayerProfileValues,
  type StoredPlayerProfile,
} from '../../shared/playerProfile';
import type { DailyBoosterResponse, DailyBoosterReward } from '../../shared/dailyBooster';
import { getCardClaimFlairTier } from '../../shared/cardClaimFlair';

type ErrorResponse = {
  status: 'error';
  message: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const getPlayerProfileKey = async (): Promise<string | null> => {
  const playerId = context.userId ?? await reddit.getCurrentUsername();
  return playerId ? `player_profile:v${PLAYER_PROFILE_VERSION}:${playerId}` : null;
};

const readProfileValues = (value: unknown): PlayerProfileValues | null => {
  if (!isRecord(value)) return null;
  const allowedKeys = new Set<string>(PLAYER_PROFILE_KEYS);
  const values: PlayerProfileValues = {};
  for (const [key, storedValue] of Object.entries(value)) {
    if (!allowedKeys.has(key) || typeof storedValue !== 'string' || storedValue.length > 100_000) return null;
    const profileKey = PLAYER_PROFILE_KEYS.find((candidate) => candidate === key);
    if (profileKey) values[profileKey] = storedValue;
  }
  return values;
};

const isBattleTurn = (value: unknown): value is BattleTurnSnapshot => {
  if (!isRecord(value)) return false;
  const { cards, cats, holographicCats, score } = value;
  const validSuits = ['sakura', 'ghost', 'leaf', 'water'];
  return Array.isArray(cards)
    && cards.length > 0
    && cards.length <= getPlayCardLimitForCats(cats)
    && cards.every((card) => (
      isRecord(card)
      && typeof card.rank === 'number'
      && Number.isInteger(card.rank)
      && card.rank >= 2
      && card.rank <= 14
      && typeof card.suit === 'string'
      && validSuits.includes(card.suit)
      && (card.holographic === undefined || typeof card.holographic === 'boolean')
      && (card.seals === undefined || (
        Array.isArray(card.seals)
        && card.seals.length <= 3
        && card.seals.every((seal) => seal === 'gold' || seal === 'red' || seal === 'purple')
      ))
    ))
    && Array.isArray(cats)
    && cats.length <= MAX_EQUIPPED_CATS
    && cats.every((cat) => typeof cat === 'string' && /^c(?:[1-9]|[1-3][0-9])$/.test(cat))
    && new Set(cats).size === cats.length
    && (holographicCats === undefined || (
      Array.isArray(holographicCats)
      && holographicCats.length <= cats.length
      && holographicCats.every((cat) => typeof cat === 'string' && cats.includes(cat))
    ))
    && typeof score === 'number'
    && Number.isFinite(score)
    && Number.isSafeInteger(score)
    && score >= 0;
};

const isPublishableBattle = (
  value: unknown
): value is Pick<BattleChallengeSnapshot, 'title' | 'turns' | 'cumulativeScore' | 'boardSkin' | 'cardSkin'> => {
  if (!isRecord(value)) return false;
  const { title, turns, cumulativeScore, boardSkin, cardSkin } = value;
  return Array.isArray(turns)
    && turns.length === 3
    && turns.every(isBattleTurn)
    && (title === undefined || (
      typeof title === 'string'
      && title.trim().length > 0
      && title.trim().length <= 60
    ))
    && typeof cumulativeScore === 'number'
    && Number.isSafeInteger(cumulativeScore)
    && cumulativeScore > 0
    && cumulativeScore === turns.reduce((total, turn) => total + turn.score, 0)
    && (boardSkin === undefined || isBoardSkinId(boardSkin))
    && (cardSkin === undefined || isCardSkinId(cardSkin));
};

const isBattleChallenge = (value: unknown): value is BattleChallengeSnapshot => (
  isRecord(value)
  && value.version === 1
  && typeof value.defenderUsername === 'string'
  && (value.seed === undefined || typeof value.seed === 'string')
  && isPublishableBattle(value)
);

const getBattleStats = async (postId: string): Promise<BattleChallengeStats> => {
  const [playsValue, challengerWinsValue] = await Promise.all([
    redis.get(`card_battle_stats:${postId}:plays`),
    redis.get(`card_battle_stats:${postId}:challenger_wins`),
  ]);
  const plays = playsValue ? parseInt(playsValue) : 0;
  const challengerWins = challengerWinsValue ? parseInt(challengerWinsValue) : 0;
  const defenderWins = Math.max(0, plays - challengerWins);
  return {
    plays,
    defenderVictoryRate: plays > 0 ? Math.round((defenderWins / plays) * 100) : 0,
  };
};

const getBattleParticipantId = async (): Promise<string | undefined> => (
  context.userId ?? await reddit.getCurrentUsername() ?? context.loid
);

const getBattleResultKey = (postId: string, participantId: string, seed?: string): string => (
  `card_battle_result:${postId}:${seed ?? 'legacy'}:${participantId}`
);

const viewerHasWonBattle = async (postId: string, challenge: BattleChallengeSnapshot): Promise<boolean> => {
  const participantId = await getBattleParticipantId();
  if (!participantId) return false;
  const [seededResult, legacyResult] = await Promise.all([
    redis.get(getBattleResultKey(postId, participantId, challenge.seed)),
    redis.get(`card_battle_result:${postId}:${participantId}`),
  ]);
  if (seededResult === 'challenger' || legacyResult === 'challenger') return true;

  // Recover wins completed before seed-specific result persistence was added.
  // A saved leaderboard score above the immutable defender score proves the win.
  const username = await reddit.getCurrentUsername();
  if (!username) return false;
  const leaderboard = await redis.zRange(`card_leaderboard:${postId}`, 0, -1, { by: 'rank' });
  const completedWin = leaderboard.some((entry) => {
    try {
      const member: unknown = JSON.parse(entry.member);
      return isRecord(member)
        && typeof member.username === 'string'
        && member.username.toLowerCase() === username.toLowerCase()
        && entry.score > challenge.cumulativeScore;
    } catch {
      return false;
    }
  });
  if (!completedWin) return false;
  await redis.set(getBattleResultKey(postId, participantId, challenge.seed), 'challenger');
  return true;
};

const getDefenderSnoovatarUrl = async (username: string): Promise<string | undefined> => {
  try {
    return await reddit.getSnoovatarUrl(username);
  } catch {
    return undefined;
  }
};

const getViewerBattleProfile = async (): Promise<{ username?: string; snoovatarUrl?: string }> => {
  const username = await reddit.getCurrentUsername();
  if (!username) return {};
  const snoovatarUrl = await getDefenderSnoovatarUrl(username);
  return {
    username,
    ...(snoovatarUrl ? { snoovatarUrl } : {}),
  };
};

const getDefenderGlobalStanding = async (
  username: string
): Promise<{ rank: number | null; wins: number }> => {
  const winsKey = 'global:leaderboard:wins';
  const [wins, ascendingRank, playerCount] = await Promise.all([
    redis.zScore(winsKey, username),
    redis.zRank(winsKey, username),
    redis.zCard(winsKey),
  ]);
  return {
    rank: ascendingRank === undefined ? null : playerCount - ascendingRank,
    wins: wins ?? 0,
  };
};

export const api = new Hono();

const createDailyBoosterChoices = (): DailyBoosterReward[] => {
  const suits = ['sakura', 'ghost', 'leaf', 'water'] as const;
  const seals = ['gold', 'red', 'purple'] as const;
  return Array.from({ length: 3 }, () => {
    const roll = Math.random();
    const catId = `c${Math.floor(Math.random() * 39) + 1}`;
    if (roll < 0.35) return { kind: 'cat', catId };
    const suit = suits[Math.floor(Math.random() * suits.length)] ?? 'sakura';
    const rank = Math.floor(Math.random() * 13) + 2;
    if (roll < 0.6) return { kind: 'holoDeck', suit, rank };
    if (roll < 0.9) return { kind: 'sealedDeck', suit, rank, seal: seals[Math.floor(Math.random() * seals.length)] ?? 'gold' };
    return { kind: 'holoCat', catId };
  });
};

const getDailyBoosterAvailability = async (postId: string): Promise<{ active: boolean; expired: boolean; expiresAt: number | null }> => {
  const [marker, storedExpiresAt] = await Promise.all([
    redis.get(`daily_booster_post:${postId}`),
    redis.get(`daily_booster_expires_at:${postId}`),
  ]);
  const expiresAt = storedExpiresAt ? Number(storedExpiresAt) : null;
  if (expiresAt !== null && Number.isFinite(expiresAt)) {
    const expired = Date.now() >= expiresAt;
    return { active: !expired && Boolean(marker), expired, expiresAt };
  }
  return { active: Boolean(marker), expired: false, expiresAt: null };
};

api.get('/daily-booster', async (c) => {
  const postId = context.postId;
  const playerId = context.userId ?? await reddit.getCurrentUsername();
  if (!postId) {
    return c.json<DailyBoosterResponse>({ status: 'success', active: false, expired: false, claimed: false, choices: [] });
  }
  const availability = await getDailyBoosterAvailability(postId);
  if (!availability.active) {
    return c.json<DailyBoosterResponse>({ status: 'success', active: false, expired: availability.expired, claimed: false, choices: [] });
  }
  if (!playerId) return c.json<ErrorResponse>({ status: 'error', message: 'Signed-in player required' }, 401);
  const claimKey = `daily_booster_claim:${postId}:${playerId}`;
  const claimed = await redis.get(claimKey);
  if (claimed) return c.json<DailyBoosterResponse>({ status: 'success', active: true, expired: false, claimed: true, choices: [] });
  const choicesKey = `daily_booster_choices:${postId}:${playerId}`;
  const storedChoices = await redis.get(choicesKey);
  const choices: DailyBoosterReward[] = storedChoices ? JSON.parse(storedChoices) : createDailyBoosterChoices();
  if (!storedChoices && availability.expiresAt !== null) {
    await redis.set(choicesKey, JSON.stringify(choices), { expiration: new Date(availability.expiresAt) });
  }
  return c.json<DailyBoosterResponse>({ status: 'success', active: true, expired: false, claimed: false, choices });
});

api.post('/daily-booster/claim', async (c) => {
  const postId = context.postId;
  const playerId = context.userId ?? await reddit.getCurrentUsername();
  if (!postId || !playerId) {
    return c.json<ErrorResponse>({ status: 'error', message: 'Daily booster unavailable' }, 400);
  }
  const availability = await getDailyBoosterAvailability(postId);
  if (!availability.active) return c.json<ErrorResponse>({ status: 'error', message: 'Daily booster expired' }, 410);
  const body: unknown = await c.req.json();
  if (!isRecord(body) || typeof body.index !== 'number' || !Number.isInteger(body.index) || body.index < 0 || body.index > 2) {
    return c.json<ErrorResponse>({ status: 'error', message: 'Invalid reward choice' }, 400);
  }
  const claimKey = `daily_booster_claim:${postId}:${playerId}`;
  if (await redis.get(claimKey)) return c.json<ErrorResponse>({ status: 'error', message: 'Daily booster already claimed' }, 409);
  const storedChoices = await redis.get(`daily_booster_choices:${postId}:${playerId}`);
  if (!storedChoices) return c.json<ErrorResponse>({ status: 'error', message: 'Daily booster choices missing' }, 400);
  const choices: DailyBoosterReward[] = JSON.parse(storedChoices);
  const reward = choices[body.index];
  if (!reward) return c.json<ErrorResponse>({ status: 'error', message: 'Reward unavailable' }, 400);
  if (availability.expiresAt === null) return c.json<ErrorResponse>({ status: 'error', message: 'Daily booster expiration missing' }, 400);
  await redis.set(claimKey, JSON.stringify(reward), { expiration: new Date(availability.expiresAt) });
  return c.json({ status: 'success', reward });
});

api.get('/player-profile', async (c) => {
  const key = await getPlayerProfileKey();
  if (!key) return c.json<ErrorResponse>({ status: 'error', message: 'Signed-in player required' }, 401);
  const stored = await redis.get(key);
  if (!stored) return c.json({ status: 'success', profile: null });
  try {
    const profile: unknown = JSON.parse(stored);
    if (!isRecord(profile) || profile.version !== PLAYER_PROFILE_VERSION || typeof profile.updatedAt !== 'number' || !readProfileValues(profile.values)) {
      return c.json<ErrorResponse>({ status: 'error', message: 'Stored player profile is invalid' }, 500);
    }
    return c.json({ status: 'success', profile });
  } catch {
    return c.json<ErrorResponse>({ status: 'error', message: 'Stored player profile is unreadable' }, 500);
  }
});

api.put('/player-profile', async (c) => {
  const key = await getPlayerProfileKey();
  if (!key) return c.json<ErrorResponse>({ status: 'error', message: 'Signed-in player required' }, 401);
  const body: unknown = await c.req.json();
  if (!isRecord(body) || body.version !== PLAYER_PROFILE_VERSION) {
    return c.json<ErrorResponse>({ status: 'error', message: 'Invalid profile version' }, 400);
  }
  const values = readProfileValues(body.values);
  if (!values) return c.json<ErrorResponse>({ status: 'error', message: 'Invalid player profile' }, 400);
  const profile: StoredPlayerProfile = { version: PLAYER_PROFILE_VERSION, updatedAt: Date.now(), values };
  await redis.set(key, JSON.stringify(profile));
  return c.json({ status: 'success', updatedAt: profile.updatedAt });
});

api.get('/init', async (c) => {
  const { postId } = context;

  if (!postId) {
    console.error('API Init Error: postId not found in devvit context');
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required but missing from context',
      },
      400
    );
  }

  try {
    const [count, username] = await Promise.all([
      redis.get('count'),
      reddit.getCurrentUsername(),
    ]);

    return c.json<InitResponse>({
      type: 'init',
      postId: postId,
      count: count ? parseInt(count) : 0,
      username: username ?? 'anonymous',
    });
  } catch (error) {
    console.error(`API Init Error for post ${postId}:`, error);
    let errorMessage = 'Unknown error during initialization';
    if (error instanceof Error) {
      errorMessage = `Initialization failed: ${error.message}`;
    }
    return c.json<ErrorResponse>(
      { status: 'error', message: errorMessage },
      400
    );
  }
});

api.get('/card-battle', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>({ status: 'error', message: 'postId is required' }, 400);
  }

  try {
    const stored = await redis.get(`card_battle:${postId}`);
    if (!stored) {
      return c.json<BattleChallengeResponse>({
        status: 'success',
        challenge: null,
        stats: null,
        viewerHasWon: false,
      });
    }

    const challenge: unknown = JSON.parse(stored);
    if (!isBattleChallenge(challenge)) {
      return c.json<BattleChallengeResponse>({
        status: 'success',
        challenge: null,
        stats: null,
        viewerHasWon: false,
      });
    }

    const [stats, viewerHasWon, defenderSnoovatarUrl, viewerProfile, defenderStanding] = await Promise.all([
      getBattleStats(postId),
      viewerHasWonBattle(postId, challenge),
      getDefenderSnoovatarUrl(challenge.defenderUsername),
      getViewerBattleProfile(),
      getDefenderGlobalStanding(challenge.defenderUsername),
    ]);

    return c.json<BattleChallengeResponse>({
      status: 'success',
      challenge,
      stats,
      viewerHasWon,
      ...(defenderSnoovatarUrl ? { defenderSnoovatarUrl } : {}),
      defenderGlobalRank: defenderStanding.rank,
      defenderGlobalWins: defenderStanding.wins,
      ...(viewerProfile.username ? { viewerUsername: viewerProfile.username } : {}),
      ...(viewerProfile.snoovatarUrl ? { viewerSnoovatarUrl: viewerProfile.snoovatarUrl } : {}),
    });
  } catch (error) {
    console.error('Failed to load card battle:', error);
    return c.json<ErrorResponse>({ status: 'error', message: 'Failed to load battle' }, 500);
  }
});

api.post('/record-card-battle-result', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>({ status: 'error', message: 'postId is required' }, 400);
  }

  const payload: unknown = await c.req.json();
  if (!isRecord(payload) || typeof payload.challengerWon !== 'boolean') {
    return c.json<ErrorResponse>({ status: 'error', message: 'Invalid battle result' }, 400);
  }

  try {
    const stored = await redis.get(`card_battle:${postId}`);
    if (!stored) {
      return c.json<ErrorResponse>({ status: 'error', message: 'Battle challenge not found' }, 404);
    }
    const challenge: unknown = JSON.parse(stored);
    if (!isBattleChallenge(challenge)) {
      return c.json<ErrorResponse>({ status: 'error', message: 'Invalid battle challenge' }, 400);
    }

    const participantId = await getBattleParticipantId();
    if (!participantId) {
      return c.json({ status: 'success', recorded: false, stats: await getBattleStats(postId) });
    }

    const resultKey = getBattleResultKey(postId, participantId, challenge.seed);
    const legacyResultKey = `card_battle_result:${postId}:${participantId}`;
    const [seededResult, legacyResult, currentUsername] = await Promise.all([
      redis.get(resultKey),
      redis.get(legacyResultKey),
      reddit.getCurrentUsername(),
    ]);
    const existingResult = seededResult ?? legacyResult;

    // Let the creator test and complete their own seeded battle, but do not let
    // that self-test affect the public plays or defender victory percentage.
    if (currentUsername?.toLowerCase() === challenge.defenderUsername.toLowerCase()) {
      if (payload.challengerWon && existingResult !== 'challenger') {
        await redis.set(resultKey, 'challenger');
        return c.json({ status: 'success', recorded: true, stats: await getBattleStats(postId) });
      }
      return c.json({ status: 'success', recorded: false, stats: await getBattleStats(postId) });
    }
    if (existingResult === 'challenger') {
      return c.json({ status: 'success', recorded: false, stats: await getBattleStats(postId) });
    }

    if (existingResult === 'defender') {
      if (payload.challengerWon) {
        await redis.set(resultKey, 'challenger');
        await redis.incrBy(`card_battle_stats:${postId}:challenger_wins`, 1);
        return c.json({ status: 'success', recorded: true, stats: await getBattleStats(postId) });
      }
      return c.json({ status: 'success', recorded: false, stats: await getBattleStats(postId) });
    }

    await redis.set(resultKey, payload.challengerWon ? 'challenger' : 'defender');
    await redis.incrBy(`card_battle_stats:${postId}:plays`, 1);
    if (payload.challengerWon) {
      await redis.incrBy(`card_battle_stats:${postId}:challenger_wins`, 1);
    }

    return c.json({ status: 'success', recorded: true, stats: await getBattleStats(postId) });
  } catch (error) {
    console.error('Failed to record card battle result:', error);
    return c.json<ErrorResponse>({ status: 'error', message: 'Failed to record battle result' }, 500);
  }
});

api.post('/publish-card-battle', async (c) => {
  const payload: unknown = await c.req.json();
  if (!isPublishableBattle(payload)) {
    return c.json<ErrorResponse>({ status: 'error', message: 'Invalid battle snapshot' }, 400);
  }

  const subredditName = context.subredditName;
  if (!subredditName) {
    return c.json<ErrorResponse>({ status: 'error', message: 'subreddit is required' }, 400);
  }

  try {
    const username = await reddit.getCurrentUsername() ?? 'Anonymous Cat';
    const battleTitle = payload.title?.trim().replace(/[\r\n\t]+/g, ' ') ?? 'Untitled Challenge';
    const challenge: BattleChallengeSnapshot = {
      version: 1,
      defenderUsername: username,
      title: battleTitle,
      seed: crypto.randomUUID(),
      ...(payload.boardSkin ? { boardSkin: payload.boardSkin } : {}),
      ...(payload.cardSkin ? { cardSkin: payload.cardSkin } : {}),
      turns: payload.turns,
      cumulativeScore: payload.cumulativeScore,
    };
    const post = await reddit.submitCustomPost({
      subredditName,
      title: `VS. BATTLE: ${battleTitle}`,
      entry: 'default',
      runAs: 'USER',
      userGeneratedContent: {
        text: `Cattack battle challenge created by u/${username}: ${battleTitle}`,
      },
    });

    await redis.set(`card_battle:${post.id}`, JSON.stringify(challenge));
    return c.json({ status: 'success', postId: post.id });
  } catch (error) {
    console.error('Failed to publish card battle:', error);
    return c.json<ErrorResponse>({ status: 'error', message: 'Failed to publish battle' }, 500);
  }
});

api.post('/increment', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required',
      },
      400
    );
  }

  const count = await redis.incrBy('count', 1);
  return c.json<IncrementResponse>({
    count,
    postId,
    type: 'increment',
  });
});

api.post('/decrement', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required',
      },
      400
    );
  }

  const count = await redis.incrBy('count', -1);
  return c.json<DecrementResponse>({
    count,
    postId,
    type: 'decrement',
  });
});

api.post('/submit-score', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>({ status: 'error', message: 'postId missing from context' }, 400);
  }

  const leaderboardKey = `leaderboard:${postId}`;
  const { score } = await c.req.json<{ score: number }>();
  let username = await reddit.getCurrentUsername();
  if (!username) {
    username = 'Guest_' + Math.random().toString(36).substring(2, 6);
  }

  // Fetch existing score to only save if it's better (lower seconds)
  const existingScore = await redis.zScore(leaderboardKey, username);
  if (existingScore === undefined || existingScore === null || score < existingScore) {
    await redis.zAdd(leaderboardKey, { member: username, score: score });
  }

  const rank = await redis.zRank(leaderboardKey, username);
  const bestScore = await redis.zScore(leaderboardKey, username);

  return c.json<LeaderboardResponse>({
    status: 'success',
    leaderboard: [],
    userRank: rank !== undefined && rank !== null ? rank + 1 : null,
    userBest: bestScore !== undefined && bestScore !== null ? bestScore : score,
    username,
  });
});

api.get('/leaderboard', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>({ status: 'error', message: 'postId missing from context' }, 400);
  }

  const leaderboardKey = `leaderboard:${postId}`;
  const username = await reddit.getCurrentUsername();

  // Get top 10 scores sorted ascending (lowest time first)
  const rawList = await redis.zRange(leaderboardKey, 0, 9, {
    by: 'rank',
  });

  const leaderboard = rawList.map((entry) => ({
    member: entry.member,
    score: entry.score,
  }));

  let userRank = null;
  let userBest = null;
  if (username) {
    const rank = await redis.zRank(leaderboardKey, username);
    const best = await redis.zScore(leaderboardKey, username);
    if (rank !== undefined && rank !== null) userRank = rank + 1;
    if (best !== undefined && best !== null) userBest = best;
  }

  return c.json<LeaderboardResponse>({
    status: 'success',
    leaderboard,
    userRank,
    userBest,
  });
});

api.get('/card-challenger', async (c) => {
  const { postId } = context;
  const isEasy = c.req.query('easy') === 'true';

  const BOTS = [
    {
      username: 'u/SpaceCorgi',
      score: 100,
      cards: [
        { rank: 2, suit: 'sakura', number: 2, family: 'sakura' },
        { rank: 3, suit: 'ghost', number: 3, family: 'ghost' },
        { rank: 4, suit: 'leaf', number: 4, family: 'leaf' },
        { rank: 6, suit: 'water', number: 6, family: 'water' }
      ]
    },
    {
      username: 'u/CardMaster',
      score: 168,
      cards: [
        { rank: 5, suit: 'sakura', number: 5, family: 'sakura' },
        { rank: 5, suit: 'ghost', number: 5, family: 'ghost' },
        { rank: 7, suit: 'leaf', number: 7, family: 'leaf' },
        { rank: 8, suit: 'water', number: 8, family: 'water' }
      ]
    },
    {
      username: 'u/NebulaKitten',
      score: 494,
      cards: [
        { rank: 8, suit: 'sakura', number: 8, family: 'sakura' },
        { rank: 12, suit: 'ghost', number: 12, family: 'ghost' },
        { rank: 8, suit: 'leaf', number: 8, family: 'leaf' },
        { rank: 11, suit: 'sakura', number: 11, family: 'sakura' }
      ]
    },
    {
      username: 'u/DeepSpaceCat',
      score: 1562,
      cards: [
        { rank: 14, suit: 'sakura', number: 14, family: 'sakura' },
        { rank: 13, suit: 'ghost', number: 13, family: 'ghost' },
        { rank: 12, suit: 'leaf', number: 12, family: 'leaf' },
        { rank: 9, suit: 'sakura', number: 9, family: 'sakura' }
      ]
    }
  ];

  if (isEasy) {
    return c.json({
      status: 'success',
      challenger: BOTS[0]
    });
  }

  if (!postId) {
    // Fallback to random bot if no postId
    const randomBot = BOTS[Math.floor(Math.random() * BOTS.length)];
    return c.json({ status: 'success', challenger: randomBot });
  }

  try {
    const cardLeaderboardKey = `card_leaderboard:${postId}`;
    // Fetch all members (limit to top 50)
    const rawList = await redis.zRange(cardLeaderboardKey, 0, 49, { by: 'rank' });

    if (!rawList || rawList.length === 0) {
      // Pick a random harder bot
      const randomBot = BOTS[Math.floor(Math.random() * (BOTS.length - 1)) + 1];
      return c.json({ status: 'success', challenger: randomBot });
    }

    // Pick a random challenger from the leaderboard
    const randomEntry = rawList[Math.floor(Math.random() * rawList.length)];
    if (!randomEntry) {
      const randomBot = BOTS[Math.floor(Math.random() * (BOTS.length - 1)) + 1];
      return c.json({ status: 'success', challenger: randomBot });
    }
    const data = JSON.parse(randomEntry.member);

    return c.json({
      status: 'success',
      challenger: {
        username: data.username,
        score: randomEntry.score,
        cards: data.cards
      }
    });
  } catch (error) {
    console.error('Error fetching card challenger:', error);
    const randomBot = BOTS[Math.floor(Math.random() * BOTS.length)];
    return c.json({ status: 'success', challenger: randomBot });
  }
});

api.get('/card-leaderboard', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json({ status: 'error', message: 'postId is required' }, 400);
  }

  try {
    const cardLeaderboardKey = `card_leaderboard:${postId}`;
    let username = await reddit.getCurrentUsername();
    if (!username) {
      username = 'Guest';
    }

    // Get all entries sorted descending by score (fetch ascending, then reverse in memory)
    const rawList = await redis.zRange(cardLeaderboardKey, 0, -1, { by: 'rank' });
    rawList.reverse();

    const leaderboardWithStats = rawList.map((entry, index) => {
      let parsedName: string;
      let xp = 0;
      let highestHand = 0;
      let highestMult = 1;
      try {
        const data: unknown = JSON.parse(entry.member);
        parsedName = isRecord(data) && typeof data.username === 'string' ? data.username : 'Unknown';
        xp = isRecord(data) && typeof data.xp === 'number' ? data.xp : 0;
        highestHand = isRecord(data) && typeof data.highestHand === 'number' ? data.highestHand : 0;
        highestMult = isRecord(data) && typeof data.highestMult === 'number' ? data.highestMult : 1;
      } catch (e) {
        parsedName = entry.member;
      }
      return {
        rank: index + 1,
        username: parsedName,
        score: entry.score,
        xp,
        highestHand,
        highestMult,
      };
    });

    const leaderboard = leaderboardWithStats.map(({ rank, username: entryUsername, score }) => ({
      rank,
      username: entryUsername,
      score,
    }));

    let userRank = null;
    let userBest = null;
    if (username) {
      const userIndex = leaderboardWithStats.findIndex((entry) => entry.username === username);
      if (userIndex !== -1) {
        userRank = userIndex + 1;
        userBest = leaderboardWithStats[userIndex]?.score || null;
      }
    }

    const playerEntry = leaderboardWithStats.find((entry) => entry.username === username);

    return c.json({
      status: 'success',
      leaderboard,
      userRank,
      userBest,
      username,
      playerStats: playerEntry ? {
        rank: playerEntry.rank,
        score: playerEntry.score,
        xp: playerEntry.xp,
        highestHand: playerEntry.highestHand,
        highestMult: playerEntry.highestMult,
      } : null,
    });
  } catch (error) {
    console.error('Error fetching card leaderboard:', error);
    return c.json({ status: 'error', message: 'Failed to fetch leaderboard' }, 500);
  }
});

api.post('/submit-card-score', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json({ status: 'error', message: 'postId is required' }, 400);
  }

  try {
    const body: unknown = await c.req.json();
    if (!isRecord(body) || typeof body.score !== 'number' || !Number.isSafeInteger(body.score)) {
      return c.json({ status: 'error', message: 'Invalid card score' }, 400);
    }
    const turns = Array.isArray(body.turns) && body.turns.length === 3 && body.turns.every(isBattleTurn)
      ? body.turns
      : null;
    if (!turns || body.score !== turns.reduce((total, turn) => total + turn.score, 0)) {
      return c.json({ status: 'error', message: 'Card score does not match battle turns' }, 400);
    }
    const score = Math.max(0, Math.floor(body.score));
    const cards = turns.flatMap((turn) => turn.cards);
    const xp = typeof body.xp === 'number' && Number.isFinite(body.xp) ? Math.max(0, Math.floor(body.xp)) : 0;
    const highestHand = typeof body.highestHand === 'number' && Number.isFinite(body.highestHand)
      ? Math.max(0, Math.floor(body.highestHand))
      : 0;
    const highestMult = typeof body.highestMult === 'number' && Number.isFinite(body.highestMult)
      ? Math.max(1, body.highestMult)
      : 1;
    let username = await reddit.getCurrentUsername();
    if (!username) {
      username = 'Guest_' + Math.random().toString(36).substring(2, 6);
    }

    const cardLeaderboardKey = `card_leaderboard:${postId}`;
    
    // Fetch all leaderboard entries to find if this user already has an entry
    const rawList = await redis.zRange(cardLeaderboardKey, 0, -1, { by: 'rank' });
    let existingMemberString: string | null = null;
    let existingScore: number | null = null;
    let existingCards: unknown[] = [];
    let existingXp = 0;
    let existingHighestHand = 0;
    let existingHighestMult = 1;

    for (const entry of rawList) {
      try {
        const data: unknown = JSON.parse(entry.member);
        if (isRecord(data) && data.username === username) {
          existingMemberString = entry.member;
          existingScore = entry.score;
          existingCards = Array.isArray(data.cards) ? data.cards : [];
          existingXp = typeof data.xp === 'number' ? data.xp : 0;
          existingHighestHand = typeof data.highestHand === 'number' ? data.highestHand : 0;
          existingHighestMult = typeof data.highestMult === 'number' ? data.highestMult : 1;
          break;
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    }

    if (existingMemberString) {
      await redis.zRem(cardLeaderboardKey, [existingMemberString]);
    }

    const isNewBest = existingScore === null || score > existingScore;
    const newMemberObj = {
      username,
      cards: isNewBest ? cards : existingCards,
      xp: Math.max(existingXp, xp),
      highestHand: Math.max(existingHighestHand, highestHand),
      highestMult: Math.max(existingHighestMult, highestMult),
    };

    await redis.zAdd(cardLeaderboardKey, {
      member: JSON.stringify(newMemberObj),
      score: Math.max(existingScore ?? 0, score),
    });

    return c.json({ status: 'success' });
  } catch (error) {
    console.error('Error submitting card score:', error);
    return c.json({ status: 'error', message: 'Failed to submit score' }, 500);
  }
});

const GLOBAL_LEADERBOARD_KEYS = {
  wins: 'global:leaderboard:wins',
  xp: 'global:leaderboard:xp',
  cats: 'global:leaderboard:cats',
  cardsClaimed: 'global:leaderboard:cards-claimed',
};

const readProgressCount = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0 ? value : null
);

const syncCardClaimFlair = async (username: string, cardsClaimed: number): Promise<void> => {
  const subredditName = context.subredditName;
  if (!subredditName) return;

  const existingCardsClaimed = await redis.zScore(GLOBAL_LEADERBOARD_KEYS.cardsClaimed, username);
  const rankedCardsClaimed = Math.max(existingCardsClaimed ?? 0, cardsClaimed);
  await redis.zAdd(GLOBAL_LEADERBOARD_KEYS.cardsClaimed, { member: username, score: rankedCardsClaimed });

  const earnedTier = getCardClaimFlairTier(rankedCardsClaimed);
  if (!earnedTier) return;
  const ascendingRank = await redis.zRank(GLOBAL_LEADERBOARD_KEYS.cardsClaimed, username);
  const rankedPlayers = await redis.zCard(GLOBAL_LEADERBOARD_KEYS.cardsClaimed);
  if (ascendingRank === undefined) return;
  const globalRank = rankedPlayers - ascendingRank;

  try {
    await reddit.setUserFlair({
      subredditName,
      username,
      text: `${earnedTier.emoji} ${rankedCardsClaimed} Cats | Global Rank #${globalRank}`,
    });
  } catch (error) {
    console.error('Failed to apply card claim flair:', error);
  }
};

api.post('/global-progress', async (c) => {
  try {
    const body: unknown = await c.req.json();
    if (!isRecord(body)) return c.json({ status: 'error', message: 'Invalid progress' }, 400);
    const wins = readProgressCount(body.wins);
    const xp = readProgressCount(body.xp);
    const cats = readProgressCount(body.catsCollected);
    const cardsClaimed = readProgressCount(body.cardsClaimed);
    const cardsClaimedDelta = readProgressCount(body.cardsClaimedDelta);
    if (
      wins === null
      || xp === null
      || cats === null
      || cardsClaimed === null
      || cardsClaimedDelta === null
      || cardsClaimedDelta > cardsClaimed
    ) return c.json({ status: 'error', message: 'Invalid progress' }, 400);
    const username = await reddit.getCurrentUsername();
    if (!username) return c.json({ status: 'error', message: 'Reddit account required' }, 401);
    for (const [key, score] of [[GLOBAL_LEADERBOARD_KEYS.wins, wins], [GLOBAL_LEADERBOARD_KEYS.xp, xp], [GLOBAL_LEADERBOARD_KEYS.cats, cats]] as const) {
      const existing = await redis.zScore(key, username);
      await redis.zAdd(key, { member: username, score: Math.max(existing ?? 0, score) });
    }
    if (cardsClaimedDelta > 0) await syncCardClaimFlair(username, cardsClaimed);
    return c.json({ status: 'success' });
  } catch (error) {
    console.error('Error syncing global progress:', error);
    return c.json({ status: 'error', message: 'Failed to sync progress' }, 500);
  }
});

api.get('/global-leaderboards', async (c) => {
  try {
    const loadBoard = async (key: string) => {
      const entries = await redis.zRange(key, 0, 9, { by: 'rank', reverse: true });
      return entries.map((entry, index) => ({ rank: index + 1, username: entry.member, score: entry.score }));
    };
    const [wins, xp, cats] = await Promise.all([loadBoard(GLOBAL_LEADERBOARD_KEYS.wins), loadBoard(GLOBAL_LEADERBOARD_KEYS.xp), loadBoard(GLOBAL_LEADERBOARD_KEYS.cats)]);
    return c.json({ status: 'success', wins, xp, cats });
  } catch (error) {
    console.error('Error fetching global leaderboards:', error);
    return c.json({ status: 'error', message: 'Failed to fetch leaderboards' }, 500);
  }
});
