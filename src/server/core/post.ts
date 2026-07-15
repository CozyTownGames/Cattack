import { reddit, context, redis } from '@devvit/web/server';
import { EntrypointHeight } from '@devvit/protos/types/reddit/devvit/post/v1/post.js';
import { getDailySeed } from '../../shared/seed';

function isPostId(str: string): str is `t3_${string}` {
  return str.startsWith('t3_');
}

export const createPost = async () => {
  const subredditName = context.subredditName;
  if (!subredditName) {
    throw new Error('Subreddit name not found in context');
  }

  const dailySeed = getDailySeed();
  const redisKey = `daily_booster_posted:${dailySeed}`;

  // Check if we already posted today's daily run
  const alreadyPosted = await redis.get(redisKey);
  if (alreadyPosted && isPostId(alreadyPosted)) {
    console.log(`[post] Daily run already posted for seed ${dailySeed}: ${alreadyPosted}`);
    return await reddit.getPostById(alreadyPosted);
  }

  const now = new Date();
  const formattedDate = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  const title = `CATTACK! Grab Your FREE Booster Pack, Meow! — ${formattedDate}`;

  console.log(`[post] Creating daily run post: "${title}" in r/${subredditName}`);

  const post = await reddit.submitCustomPost({
    subredditName,
    title,
    entry: 'default',
    styles: {
      height: EntrypointHeight.TALL,
      backgroundColorDark: '#000000FF',
    },
  });

  const boosterExpiresAt = Date.now() + 24 * 60 * 60 * 1000;
  await redis.set(`daily_booster_post:${post.id}`, dailySeed, {
    expiration: new Date(boosterExpiresAt),
  });
  await redis.set(`daily_booster_expires_at:${post.id}`, String(boosterExpiresAt));

  // Save the post ID under the daily seed key (expires in 36 hours)
  await redis.set(redisKey, post.id, { expiration: new Date(Date.now() + 36 * 60 * 60 * 1000) });

  return post;
};
