import { createApp } from './app.ts';
import { config, validateAuthConfig } from './config.ts';
import { logger } from './utils/logger.ts';

// Validate auth config on startup
validateAuthConfig();

const app = createApp();

// Setup signal handlers for graceful shutdown
const abortController = new AbortController();
const { signal } = abortController;

Deno.addSignalListener('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  abortController.abort();
  // Give the server a brief moment to clean up, then force exit
  setTimeout(() => {
    logger.info('Exiting process');
    Deno.exit(0);
  }, 100);
});

Deno.addSignalListener('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  abortController.abort();
  // Give the server a brief moment to clean up, then force exit
  setTimeout(() => {
    logger.info('Exiting process');
    Deno.exit(0);
  }, 100);
});

logger.info(`Server starting on port ${config.port}`);
logger.info(`Workspace directory: ${config.workspaceDir}`);
logger.info(`Tools directory: ${config.toolsDir}`);
logger.info(`Default timeout: ${config.defaultTimeout}ms`);

// Start the server
await app.listen({
  port: config.port,
  signal,
});

logger.info('HTTP server closed');
Deno.exit(0);
