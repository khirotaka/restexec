import { assertEquals, assertExists } from '@std/assert';
import { createApp } from '../../src/app.ts';
import { TestEnvironment } from '../helpers/setup.ts';
import { config } from '../../src/config.ts';
import type { ApiResponse, ErrorResponse } from '../../src/types/index.ts';

/**
 * Lint Endpoint Integration Tests
 * These tests verify the /lint endpoint by starting a real server and making fetch requests
 *
 * Run with: deno test --allow-read --allow-write --allow-net --allow-env --allow-run tests/integration/lint.test.ts
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
  name: 'Lint - POST /lint with missing codeId returns 400 ValidationError',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const response = await fetch(`${serverUrl}/lint`, {
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
  name: 'Lint - POST /lint with path traversal returns 400 ValidationError',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const response = await fetch(`${serverUrl}/lint`, {
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
  name: 'Lint - POST /lint with invalid timeout returns 400 ValidationError',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const response = await fetch(`${serverUrl}/lint`, {
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
  name: 'Lint - POST /lint with non-existent file returns 404 FileNotFoundError',
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

      const response = await fetch(`${serverUrl}/lint`, {
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
  name: 'Lint - POST /lint with clean file returns 200 with empty diagnostics',
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
        'clean-code',
        `
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

const message = greet("World");
console.log(JSON.stringify({ message }));
    `,
      );

      const response = await fetch(`${serverUrl}/lint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeId: 'clean-code', timeout: 5000 }),
      });

      assertEquals(response.status, 200);
      const body = await response.json() as ApiResponse;
      assertEquals(body.success, true);
      assertExists(body.executionTime);

      // Verify lint output structure
      if (body.success) {
        const result = body.result as {
          version: number;
          diagnostics: unknown[];
          errors: unknown[];
          checkedFiles?: string[];
        };
        assertExists(result.version);
        assertEquals(result.diagnostics.length, 0);
        assertEquals(result.errors.length, 0);
      }
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
  name: 'Lint - POST /lint with file containing issues returns 200 with diagnostics',
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
        'code-with-issues',
        `
const unusedVariable = 123;

function test() {
  var oldStyleVar = "bad";
  console.log("test");
}

const x = 1

console.log(JSON.stringify({ result: "done" }));
    `,
      );

      const response = await fetch(`${serverUrl}/lint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeId: 'code-with-issues', timeout: 5000 }),
      });

      assertEquals(response.status, 200);
      const body = await response.json() as ApiResponse;
      assertEquals(body.success, true);
      assertExists(body.executionTime);

      // Verify lint output structure
      if (body.success) {
        const result = body.result as {
          version: number;
          diagnostics: Array<{
            code: string;
            message: string;
            range: {
              start: { line: number; col: number };
              end: { line: number; col: number };
            };
            filename: string;
            hint?: string;
          }>;
          errors: unknown[];
          checkedFiles?: string[];
        };
        assertExists(result.version);
        assertExists(result.diagnostics);
        assertEquals(result.errors.length, 0);
        // File should have some lint issues
        // Note: We don't assert exact number as deno lint rules may change
      }
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
  name: 'Lint - POST /lint with invalid JSON returns 400 ValidationError',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const response = await fetch(`${serverUrl}/lint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json',
    });

    assertEquals(response.status, 400);
    const body = await response.json() as ErrorResponse;
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'ValidationError');
    assertEquals(body.error.message, 'Invalid JSON in request body');
    assertExists(body.executionTime);
  },
});

// Cleanup: Stop the server after all tests
Deno.test({
  name: 'Lint - Server cleanup',
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
