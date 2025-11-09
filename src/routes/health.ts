import { Hono } from 'hono';
import { config } from '../config.ts';
import type { HealthResponse } from '../types/index.ts';

const app = new Hono();

app.get('/health', (c) => {
  const memUsage = Deno.memoryUsage();

  const response: HealthResponse = {
    status: 'ok',
    uptime: performance.now() / 1000, // Convert ms to seconds
    activeProcesses: 0, // Will be updated later with actual process tracking
    memoryUsage: {
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
    },
    version: config.version,
  };

  return c.json(response);
});

export default app;
