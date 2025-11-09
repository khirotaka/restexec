import express, { Express, Request, Response, NextFunction } from 'express';
import healthRouter from './routes/health.js';
import executeRouter from './routes/execute.js';
import { logger } from './utils/logger.js';
import type { ApiResponse } from './types/index.js';

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(express.json());

  // Request logging middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.info(`${req.method} ${req.path}`);
    next();
  });

  // Routes
  app.use(healthRouter);
  app.use(executeRouter);

  // 404 handler
  app.use((_req: Request, res: Response<ApiResponse>) => {
    res.status(404).json({
      success: false,
      error: {
        type: 'InternalError',
        message: 'Not found',
      },
    });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response<ApiResponse>, _next: NextFunction) => {
    logger.error('Unhandled error', err);
    res.status(500).json({
      success: false,
      error: {
        type: 'InternalError',
        message: 'Internal server error',
      },
    });
  });

  return app;
}
