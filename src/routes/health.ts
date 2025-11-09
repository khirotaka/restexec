import { Router, Request, Response } from 'express';
import { config } from '../config.js';
import type { HealthResponse } from '../types/index.js';

const router = Router();

router.get('/health', (_req: Request, res: Response<HealthResponse>) => {
  const memUsage = process.memoryUsage();

  const response: HealthResponse = {
    status: 'ok',
    uptime: process.uptime(),
    activeProcesses: 0, // Will be updated later with actual process tracking
    memoryUsage: {
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
    },
    version: config.version,
  };

  res.json(response);
});

export default router;
