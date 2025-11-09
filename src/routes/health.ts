import { Router } from '@oak/oak';
import { config } from '../config.ts';
import type { HealthResponse } from '../types/index.ts';

const router = new Router();

router.get('/health', (ctx) => {
  const memUsage = Deno.memoryUsage();

  const response: HealthResponse = {
    status: 'ok',
    uptime: performance.now() / 1000, // Convert to seconds
    activeProcesses: 0, // Will be updated later with actual process tracking
    memoryUsage: {
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
    },
    version: config.version,
  };

  ctx.response.body = response;
});

export default router;
