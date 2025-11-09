import { load } from '@std/dotenv';
import { serve } from 'hono/deno';
import { createApp } from './app.ts';
import { config } from './config.ts';
import { logger } from './utils/logger.ts';

// Load environment variables from .env file
await load({ export: true });

const app = createApp();

logger.info(`Server starting on port ${config.port}`);
logger.info(`Workspace directory: ${config.workspaceDir}`);
logger.info(`Tools directory: ${config.toolsDir}`);
logger.info(`Default timeout: ${config.defaultTimeout}ms`);

// Graceful shutdown handling
const abortController = new AbortController();

Deno.addSignalListener('SIGTERM', () => {
  logger.info('SIGTERM signal received: shutting down gracefully');
  abortController.abort();
  Deno.exit(0);
});

Deno.addSignalListener('SIGINT', () => {
  logger.info('SIGINT signal received: shutting down gracefully');
  abortController.abort();
  Deno.exit(0);
});

// Start the server
serve(
  {
    fetch: app.fetch,
    port: config.port,
    signal: abortController.signal,
    onListen: ({ port }) => {
      logger.info(`Server started successfully on port ${port}`);
    },
  },
);
