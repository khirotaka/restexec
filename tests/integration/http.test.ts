import { assertEquals, assertExists } from '@std/assert';
import { createApp } from '../../src/app.ts';
import { TestEnvironment } from '../helpers/setup.ts';
import { config } from '../../src/config.ts';
import type { ApiResponse, ErrorResponse, HealthResponse } from '../../src/types/index.ts';

/**
 * HTTP Integration Tests
 * These tests verify the actual HTTP layer by starting a real server and making fetch requests
 *
 * NOTE: These tests share a single server instance for all tests.
 * Run with: deno test --allow-read --allow-write --allow-net --allow-env --allow-run tests/integration/http.test.ts
 */

// Global server state
const serverController = new AbortController();
let serverUrl: string;
let listenPromise: Promise<void>;
let serverStarted = false;

// Helper to ensure server is started before each test
async function ensureServerStarted() {
  if (serverStarted) return;

  const app = createApp();

  // Find an available port by creating a temporary listener
  const tmpListener = Deno.listen({ port: 0 }); // Let OS assign available port
  const port = (tmpListener.addr as Deno.NetAddr).port;
  tmpListener.close(); // Close it so Oak can bind to it

  // Start server with abort controller for proper cleanup
  listenPromise = app.listen({ port, signal: serverController.signal });

  serverUrl = `http://localhost:${port}`;

  // Wait for server to be ready by polling /health endpoint
  const maxRetries = 10;
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
}

Deno.test({
  name: 'HTTP - GET /health returns 200 with health info',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const response = await fetch(`${serverUrl}/health`);

    assertEquals(response.status, 200);
    const body = await response.json() as HealthResponse;
    assertEquals(body.status, 'ok');
    assertExists(body.uptime);
    assertExists(body.activeProcesses);
    assertExists(body.memoryUsage);
    assertExists(body.version);
  },
});

Deno.test({
  name: 'HTTP - POST /execute with missing codeId returns 400 ValidationError',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const response = await fetch(`${serverUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeout: 5000 }), // missing codeId
    });

    assertEquals(response.status, 400);
    const body = await response.json() as ErrorResponse;
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'ValidationError');
    assertEquals(body.error.message, 'codeId is required');
    assertExists(body.executionTime);
  },
});

Deno.test({
  name: 'HTTP - POST /execute with path traversal returns 400 ValidationError',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const response = await fetch(`${serverUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId: '../etc/passwd', timeout: 5000 }),
    });

    assertEquals(response.status, 400);
    const body = await response.json() as ErrorResponse;
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'ValidationError');
    assertEquals(
      body.error.message,
      'codeId must not contain path separators or parent directory references',
    );
    assertExists(body.executionTime);
  },
});

Deno.test({
  name: 'HTTP - POST /execute with invalid timeout returns 400 ValidationError',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const response = await fetch(`${serverUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId: 'test', timeout: 999999 }),
    });

    assertEquals(response.status, 400);
    const body = await response.json() as ErrorResponse;
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'ValidationError');
    assertExists(body.executionTime);
  },
});

Deno.test({
  name: 'HTTP - POST /execute with non-existent file returns 404 FileNotFoundError',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const env = new TestEnvironment();
    await env.setup();

    // Save original config values for restoration
    const originalWorkspaceDir = config.workspaceDir;
    const originalImportMap = config.deno.importMap;

    try {
      // deno-lint-ignore no-explicit-any
      (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;
      // deno-lint-ignore no-explicit-any
      (config as any).workspaceDir = env.workspaceDir;

      const response = await fetch(`${serverUrl}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeId: 'non-existent', timeout: 5000 }),
      });

      assertEquals(response.status, 404);
      const body = await response.json() as ErrorResponse;
      assertEquals(body.success, false);
      assertEquals(body.error.type, 'FileNotFoundError');
      assertExists(body.executionTime);
    } finally {
      // Restore original config values before cleanup
      // deno-lint-ignore no-explicit-any
      (config as any).workspaceDir = originalWorkspaceDir;
      // deno-lint-ignore no-explicit-any
      (config as any).deno.importMap = originalImportMap;
      await env.cleanup();
    }
  },
});

Deno.test({
  name: 'HTTP - POST /execute with valid request returns 200',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const env = new TestEnvironment();
    await env.setup();

    // Save original config values for restoration
    const originalWorkspaceDir = config.workspaceDir;
    const originalImportMap = config.deno.importMap;

    try {
      // deno-lint-ignore no-explicit-any
      (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;
      // deno-lint-ignore no-explicit-any
      (config as any).workspaceDir = env.workspaceDir;

      await env.writeCode(
        'test-code',
        `
      console.log(JSON.stringify({
        success: true,
        message: "Test successful",
      }));
    `,
      );

      const response = await fetch(`${serverUrl}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeId: 'test-code', timeout: 5000 }),
      });

      assertEquals(response.status, 200);
      const body = await response.json() as ApiResponse;
      assertEquals(body.success, true);
      assertExists(body);
    } finally {
      // Restore original config values before cleanup
      // deno-lint-ignore no-explicit-any
      (config as any).workspaceDir = originalWorkspaceDir;
      // deno-lint-ignore no-explicit-any
      (config as any).deno.importMap = originalImportMap;
      await env.cleanup();
    }
  },
});

Deno.test({
  name: 'HTTP - GET /nonexistent returns 404',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const response = await fetch(`${serverUrl}/nonexistent`);

    assertEquals(response.status, 404);
    const body = await response.json() as ErrorResponse;
    assertEquals(body.success, false);
    assertEquals(body.error.message, 'Route not found');
    assertExists(body.executionTime);
  },
});

Deno.test({
  name: 'HTTP - POST /execute with env variables returns 200',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const env = new TestEnvironment();
    await env.setup();

    const originalWorkspaceDir = config.workspaceDir;
    const originalImportMap = config.deno.importMap;

    try {
      // deno-lint-ignore no-explicit-any
      (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;
      // deno-lint-ignore no-explicit-any
      (config as any).workspaceDir = env.workspaceDir;

      await env.writeCode(
        'env-test',
        `
      const apiKey = Deno.env.get('API_KEY');
      console.log(JSON.stringify({
        success: true,
        apiKey: apiKey,
      }));
    `,
      );

      const response = await fetch(`${serverUrl}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codeId: 'env-test',
          timeout: 5000,
          env: {
            API_KEY: 'secret-123',
          },
        }),
      });

      assertEquals(response.status, 200);
      const body = await response.json() as ApiResponse;
      assertEquals(body.success, true);
      if (body.success) {
        // deno-lint-ignore no-explicit-any
        assertEquals((body.result as any).apiKey, 'secret-123');
      }
    } finally {
      // deno-lint-ignore no-explicit-any
      (config as any).workspaceDir = originalWorkspaceDir;
      // deno-lint-ignore no-explicit-any
      (config as any).deno.importMap = originalImportMap;
      await env.cleanup();
    }
  },
});

Deno.test({
  name: 'HTTP - POST /execute with forbidden env key returns 400',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const response = await fetch(`${serverUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codeId: 'test',
        env: {
          PATH: '/usr/bin',
        },
      }),
    });

    assertEquals(response.status, 400);
    const body = await response.json() as ErrorResponse;
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'ValidationError');
    assertEquals(body.error.message, 'env key "PATH" is forbidden');
  },
});

// Cleanup: Stop the server after all tests
Deno.test({
  name: 'HTTP - Server cleanup',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    if (!serverStarted) return; // Server was never started

    // Abort the server
    serverController.abort();

    // Wait for the server to stop and give Oak time to cleanup
    await Promise.race([
      listenPromise.catch(() => {}), // Ignore all errors including AbortError
      new Promise((resolve) => setTimeout(resolve, 200)), // Timeout after 200ms
    ]);
  },
});
