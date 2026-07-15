import { Hono } from 'hono';
import type { TaskResponse } from '@devvit/web/server';
import { createPost } from '../core/post';

export const scheduler = new Hono();

scheduler.post('/daily-run-post', async (c) => {
  try {
    console.log('[scheduler] Running scheduled daily-run-post task...');
    const post = await createPost();
    console.log(`[scheduler] Scheduled task complete. Daily run post: ${post.id}`);
    
    return c.json<TaskResponse>(
      {
        status: 'success',
      },
      200
    );
  } catch (error) {
    console.error(`[scheduler] Error in scheduled task: ${error}`);
    return c.json<TaskResponse>(
      {
        status: 'error',
      },
      500
    );
  }
});
