import { createApp } from '../../src/app.ts';
import type { HealthResponse } from '../../src/types/index.ts';

/**
 * HTTP Server Test Harness
 * Provides reusable server lifecycle management for integration tests
 */
export interface ServerHarness {
  serverUrl: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  getHealth(): Promise<HealthResponse>;
}

/**
 * Create a server harness for testing
 *
 * The server will automatically find an available port and provide
 * methods for starting, stopping, and health checking.
 *
 * @returns A server harness instance
 */
export function createServerHarness(): ServerHarness {
  const serverController = new AbortController();
  let serverUrl = '';
  let listenPromise: Promise<void> | null = null;
  let serverStarted = false;

  return {
    get serverUrl() {
      return serverUrl;
    },

    async start() {
      if (serverStarted) {
        throw new Error('Server is already started');
      }

      const app = createApp();

      // Find an available port by creating a temporary listener
      const tmpListener = Deno.listen({ port: 0 }); // Let OS assign available port
      const port = (tmpListener.addr as Deno.NetAddr).port;
      tmpListener.close(); // Close it so Oak can bind to it

      // Start server with abort controller for proper cleanup
      listenPromise = app.listen({ port, signal: serverController.signal });

      serverUrl = `http://localhost:${port}`;

      // Wait for server to be ready by polling /health endpoint
      const maxRetries = 20;
      const retryDelay = 100; // ms
      for (let i = 0; i < maxRetries; i++) {
        try {
          const response = await fetch(`${serverUrl}/health`, { method: 'GET' });
          if (response.ok) {
            serverStarted = true;
            return;
          }
        } catch (_error) {
          // Connection refused - server not ready yet
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }

      throw new Error(`Server failed to start after ${maxRetries * retryDelay}ms`);
    },

    async stop() {
      if (!serverStarted) {
        return; // Server was never started
      }

      // Abort the server
      serverController.abort();

      // Wait for the server to stop and give Oak time to cleanup
      if (listenPromise) {
        await Promise.race([
          listenPromise.catch(() => {}), // Ignore all errors including AbortError
          new Promise((resolve) => setTimeout(resolve, 200)), // Timeout after 200ms
        ]);
      }

      serverStarted = false;
    },

    async getHealth(): Promise<HealthResponse> {
      if (!serverStarted) {
        throw new Error('Server is not started');
      }

      const response = await fetch(`${serverUrl}/health`, { method: 'GET' });
      if (!response.ok) {
        throw new Error(`Health check failed with status ${response.status}`);
      }

      return await response.json() as HealthResponse;
    },
  };
}

/**
 * Poll the health endpoint until a condition is met
 *
 * @param harness - The server harness to poll
 * @param predicate - A function that returns true when the condition is met
 * @param options - Polling options
 * @returns The health response that satisfied the predicate
 */
export async function pollHealth(
  harness: ServerHarness,
  predicate: (health: HealthResponse) => boolean,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    description?: string;
  } = {},
): Promise<HealthResponse> {
  const { intervalMs = 50, timeoutMs = 2000, description = 'condition' } = options;

  const startTime = Date.now();
  const healthChecks: HealthResponse[] = [];

  while (Date.now() - startTime < timeoutMs) {
    const health = await harness.getHealth();
    healthChecks.push(health);

    if (predicate(health)) {
      return health;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Timeout waiting for ${description} after ${timeoutMs}ms. ` +
      `Health checks: ${JSON.stringify(healthChecks, null, 2)}`,
  );
}
