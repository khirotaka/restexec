import express, { Express, Request, Response, NextFunction } from 'express';
import healthRouter from './routes/health.js';
import executeRouter from './routes/execute.js';
import { logger } from './utils/logger.js';
import type { ApiResponse } from './types/index.js';
import { RestExecError } from './utils/errors.js';

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(express.json());

  // Add startTime to res.locals
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.startTime = Date.now();
    next();
  });

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
    const executionTime = Date.now() - res.locals.startTime;
    res.status(404).json({
      success: false,
      error: {
        type: 'ValidationError',
        message: 'Not found',
      },
      executionTime,
    });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response<ApiResponse>, _next: NextFunction) => {
    const executionTime = Date.now() - res.locals.startTime;

    if (err instanceof RestExecError) {
      logger.warn(`Request failed with ${err.type}: ${err.message}`);
      res.status(err.statusCode).json({
        success: false,
        error: {
          type: err.type,
          message: err.message,
          details: err.details,
        },
        executionTime,
      });
      return;
    }

    logger.error('Unhandled error', err);
    res.status(500).json({
      success: false,
      error: {
        type: 'InternalError',
        message: 'Internal server error',
      },
      executionTime,
    });
  });

  return app;
}
