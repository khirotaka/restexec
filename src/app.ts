import { Hono } from 'hono';
import healthRouter from './routes/health.ts';
import executeRouter from './routes/execute.ts';
import { logger } from './utils/logger.ts';
import type { ApiResponse } from './types/index.ts';
import { RestExecError } from './utils/errors.ts';

export function createApp() {
  const app = new Hono();

  // Middleware to add startTime to context
  app.use('*', async (c, next) => {
    c.set('startTime', Date.now());
    await next();
  });

  // Request logging middleware
  app.use('*', async (c, next) => {
    logger.info(`${c.req.method} ${c.req.path}`);
    await next();
  });

  // Routes
  app.route('/', healthRouter);
  app.route('/', executeRouter);

  // 404 handler
  app.notFound((c) => {
    const executionTime = Date.now() - c.get('startTime');
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          type: 'ValidationError',
          message: 'Not found',
        },
        executionTime,
      },
      404,
    );
  });

  // Error handler
  app.onError((err, c) => {
    const executionTime = Date.now() - c.get('startTime');

    if (err instanceof RestExecError) {
      logger.warn(`Request failed with ${err.type}: ${err.message}`);
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            type: err.type,
            message: err.message,
            details: err.details,
          },
          executionTime,
        },
        err.statusCode,
      );
    }

    logger.error('Unhandled error', err);
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          type: 'InternalError',
          message: 'Internal server error',
        },
        executionTime,
      },
      500,
    );
  });

  return app;
}
