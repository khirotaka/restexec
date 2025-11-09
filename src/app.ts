import { Application, Context } from '@oak/oak';
import healthRouter from './routes/health.ts';
import executeRouter from './routes/execute.ts';
import { logger } from './utils/logger.ts';
import type { ApiResponse } from './types/index.ts';
import { RestExecError } from './utils/errors.ts';

export function createApp(): Application {
  const app = new Application();

  // Add startTime to state
  app.use(async (ctx, next) => {
    ctx.state.startTime = Date.now();
    await next();
  });

  // Request logging middleware
  app.use(async (ctx, next) => {
    logger.info(`${ctx.request.method} ${ctx.request.url.pathname}`);
    await next();
  });

  // Routes
  app.use(healthRouter.routes());
  app.use(healthRouter.allowedMethods());
  app.use(executeRouter.routes());
  app.use(executeRouter.allowedMethods());

  // Error handler
  app.use(async (ctx: Context, next) => {
    try {
      await next();
    } catch (err) {
      const error = err as Error;
      const executionTime = Date.now() - ctx.state.startTime;

      if (error instanceof RestExecError) {
        logger.warn(`Request failed with ${error.type}: ${error.message}`);
        ctx.response.status = error.statusCode;
        ctx.response.body = {
          success: false,
          error: {
            type: error.type,
            message: error.message,
            details: error.details,
          },
          executionTime,
        } satisfies ApiResponse;
        return;
      }

      logger.error('Unhandled error', error);
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: {
          type: 'InternalError',
          message: 'Internal server error',
        },
        executionTime,
      } satisfies ApiResponse;
    }
  });

  // 404 handler (must be last)
  app.use((ctx) => {
    const executionTime = Date.now() - ctx.state.startTime;
    ctx.response.status = 404;
    ctx.response.body = {
      success: false,
      error: {
        type: 'ValidationError',
        message: 'Not found',
      },
      executionTime,
    } satisfies ApiResponse;
  });

  return app;
}
