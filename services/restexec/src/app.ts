import { Application, Context } from '@oak/oak';
import healthRouter from './routes/health.ts';
import executeRouter from './routes/execute.ts';
import lintRouter from './routes/lint.ts';
import workspaceRouter from './routes/workspace.ts';
import { logger } from './utils/logger.ts';
import type { ApiResponse } from './types/index.ts';
import { RestExecError } from './utils/errors.ts';
import { processManager } from './utils/processManager.ts';
import { authMiddleware } from './middleware/auth.ts';

export function createApp(): Application {
  const app = new Application();

  // Add startTime to state
  app.use(async (ctx, next) => {
    ctx.state.startTime = Date.now();
    await next();
  });

  // Request logging middleware with active process count
  app.use(async (ctx, next) => {
    const activeProcesses = processManager.getActiveCount();
    logger.info(`${ctx.request.method} ${ctx.request.url.pathname} (active processes: ${activeProcesses})`);
    await next();
    const finalActiveProcesses = processManager.getActiveCount();
    const duration = Date.now() - ctx.state.startTime;
    logger.info(
      `${ctx.request.method} ${ctx.request.url.pathname} completed in ${duration}ms (active processes: ${finalActiveProcesses})`,
    );
  });

  // Authentication Middleware
  app.use(authMiddleware);

  // Error handler (must be before routes to catch route errors)
  app.use(async (ctx: Context, next) => {
    try {
      await next();
    } catch (err) {
      const executionTime = Date.now() - ctx.state.startTime;
      const error = err instanceof Error ? err : new Error(String(err));

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

  // Routes
  app.use(healthRouter.routes());
  app.use(healthRouter.allowedMethods());
  app.use(executeRouter.routes());
  app.use(executeRouter.allowedMethods());
  app.use(lintRouter.routes());
  app.use(lintRouter.allowedMethods());
  app.use(workspaceRouter.routes());
  app.use(workspaceRouter.allowedMethods());

  // 404 handler (must be last)
  app.use((ctx) => {
    const executionTime = Date.now() - ctx.state.startTime;
    ctx.response.status = 404;
    ctx.response.body = {
      success: false,
      error: {
        type: 'FileNotFoundError',
        message: 'Route not found',
      },
      executionTime,
    } satisfies ApiResponse;
  });

  return app;
}
