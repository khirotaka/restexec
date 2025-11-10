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

// Start server before any tests run
const app = createApp();
const port = 8080;

// Start server (don't await - it runs until aborted)
app.listen({ port, signal: serverController.signal });

// Wait for server to start
await new Promise((resolve) => setTimeout(resolve, 300));

const serverUrl = `http://localhost:${port}`;

Deno.test('HTTP - GET /health returns 200 with health info', async () => {
  const response = await fetch(`${serverUrl}/health`);

  assertEquals(response.status, 200);
  const body = await response.json() as HealthResponse;
  assertEquals(body.status, 'ok');
  assertExists(body.uptime);
  assertExists(body.activeProcesses);
  assertExists(body.memoryUsage);
  assertExists(body.version);
});

Deno.test('HTTP - POST /execute with missing codeId returns 400 ValidationError', async () => {
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
});

Deno.test('HTTP - POST /execute with path traversal returns 400 ValidationError', async () => {
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
});

Deno.test('HTTP - POST /execute with invalid timeout returns 400 ValidationError', async () => {
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
});

Deno.test('HTTP - POST /execute with non-existent file returns 404 FileNotFoundError', async () => {
  const env = new TestEnvironment();
  await env.setup();
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
    await env.cleanup();
  }
});

Deno.test('HTTP - POST /execute with valid request returns 200', async () => {
  const env = new TestEnvironment();
  await env.setup();
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
    await env.cleanup();
  }
});

Deno.test('HTTP - GET /nonexistent returns 404', async () => {
  const response = await fetch(`${serverUrl}/nonexistent`);

  assertEquals(response.status, 404);
  const body = await response.json() as ErrorResponse;
  assertEquals(body.success, false);
  assertEquals(body.error.message, 'Route not found');
  assertExists(body.executionTime);
});
