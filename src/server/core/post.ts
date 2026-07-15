import { reddit, context, redis } from '@devvit/web/server';
import { EntrypointHeight } from '@devvit/protos/types/reddit/devvit/post/v1/post.js';
import { getDailySeed } from '../../shared/seed';

export const createPost = async (options?: { isDailyBooster?: boolean }) => {
  const isDailyBooster = options?.isDailyBooster ?? false;
  const subredditName = context.subredditName;
  if (!subredditName) {
    throw new Error('Subreddit name not found in context');
  }

  const dailySeed = getDailySeed();

  const now = new Date();
  const formattedDate = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'UTC',
  });

  const title = isDailyBooster
    ? `CATTACK! Grab Your Booster Pack, Meow! — ${formattedDate}`
    : `CATTACK! Play Now, Meow! — ${formattedDate}`;

  console.log(`[post] Creating post (isDailyBooster: ${isDailyBooster}): "${title}" in r/${subredditName}`);

  const post = await reddit.submitCustomPost({
    subredditName,
    title,
    entry: 'default',
    styles: {
      height: EntrypointHeight.TALL,
      backgroundColorDark: '#000000FF',
    },
  });

  if (isDailyBooster) {
    const boosterExpiresAt = Date.now() + 24 * 60 * 60 * 1000;
    await redis.set(`daily_booster_post:${post.id}`, dailySeed, {
      expiration: new Date(boosterExpiresAt),
    });
    await redis.set(`daily_booster_expires_at:${post.id}`, String(boosterExpiresAt));
  }

  return post;
};
