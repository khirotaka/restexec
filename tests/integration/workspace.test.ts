import { assertEquals, assertExists } from '@std/assert';
import { createApp } from '../../src/app.ts';
import type { ApiResponse, ErrorResponse, WorkspaceSaveResult } from '../../src/types/index.ts';
import { join } from 'jsr:@std/path@1.0.8';
import { config } from '../../src/config.ts';

/**
 * Workspace Save Integration Tests
 * These tests verify the /workspace endpoint by starting a real server and making fetch requests
 *
 * Run with: deno test --allow-read --allow-write --allow-net --allow-env --allow-run tests/integration/workspace.test.ts
 */

// Global server state
const serverController = new AbortController();
let serverUrl: string;
let _listenPromise: Promise<void>;
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
  _listenPromise = app.listen({ port, signal: serverController.signal });

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
  name: 'Workspace - PUT /workspace saves TypeScript code successfully',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const codeId = 'test-save-basic';
    const code = 'const message = "Hello, World!";\nconsole.log(JSON.stringify({ message }));';

    const response = await fetch(`${serverUrl}/workspace`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId, code }),
    });

    assertEquals(response.status, 200);
    const body = await response.json() as ApiResponse;
    assertEquals(body.success, true);

    if (!body.success) throw new Error('Expected success response');
    const result = body.result as WorkspaceSaveResult;
    assertEquals(result.codeId, codeId);
    assertEquals(result.filePath, join(config.workspaceDir, `${codeId}.ts`));
    assertExists(result.size);

    // Verify file was actually created
    const filePath = join(config.workspaceDir, `${codeId}.ts`);
    const fileContent = await Deno.readTextFile(filePath);
    assertEquals(fileContent, code);

    // Cleanup
    await Deno.remove(filePath);
  },
});

Deno.test({
  name: 'Workspace - PUT /workspace with missing codeId returns 400',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const response = await fetch(`${serverUrl}/workspace`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'console.log("test");' }), // missing codeId
    });

    assertEquals(response.status, 400);
    const body = await response.json() as ErrorResponse;
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'ValidationError');
    assertEquals(body.error.message, 'codeId is required');
  },
});

Deno.test({
  name: 'Workspace - PUT /workspace with missing code returns 400',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const response = await fetch(`${serverUrl}/workspace`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId: 'test-code' }), // missing code
    });

    assertEquals(response.status, 400);
    const body = await response.json() as ErrorResponse;
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'ValidationError');
    assertEquals(body.error.message, 'code is required');
  },
});

Deno.test({
  name: 'Workspace - PUT /workspace with empty code returns 400',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const response = await fetch(`${serverUrl}/workspace`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId: 'test-code', code: '   ' }), // empty code
    });

    assertEquals(response.status, 400);
    const body = await response.json() as ErrorResponse;
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'ValidationError');
    assertEquals(body.error.message, 'code must not be empty');
  },
});

Deno.test({
  name: 'Workspace - PUT /workspace with path traversal in codeId returns 400',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const response = await fetch(`${serverUrl}/workspace`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId: '../etc/passwd', code: 'console.log("test");' }),
    });

    assertEquals(response.status, 400);
    const body = await response.json() as ErrorResponse;
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'ValidationError');
    assertEquals(body.error.message, 'codeId must not contain path separators or parent directory references');
  },
});

Deno.test({
  name: 'Workspace - PUT /workspace with invalid codeId characters returns 400',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const response = await fetch(`${serverUrl}/workspace`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId: 'test@code!', code: 'console.log("test");' }),
    });

    assertEquals(response.status, 400);
    const body = await response.json() as ErrorResponse;
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'ValidationError');
    assertEquals(body.error.message, 'codeId must contain only alphanumeric characters, hyphens, and underscores');
  },
});

Deno.test({
  name: 'Workspace - PUT /workspace with long codeId returns 400',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const longCodeId = 'a'.repeat(256); // Exceeds 255 character limit

    const response = await fetch(`${serverUrl}/workspace`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId: longCodeId, code: 'console.log("test");' }),
    });

    assertEquals(response.status, 400);
    const body = await response.json() as ErrorResponse;
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'ValidationError');
    assertEquals(body.error.message, 'codeId must not exceed 255 characters');
  },
});

Deno.test({
  name: 'Workspace - PUT /workspace with code exceeding size limit returns 400',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    // Create code that exceeds 10MB limit
    const MAX_CODE_SIZE = 10 * 1024 * 1024; // 10MB
    const largeCode = 'a'.repeat(MAX_CODE_SIZE + 1);

    const response = await fetch(`${serverUrl}/workspace`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId: 'test-large', code: largeCode }),
    });

    assertEquals(response.status, 400);
    const body = await response.json() as ErrorResponse;
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'ValidationError');
    assertEquals(body.error.message, 'Code size exceeds maximum allowed size');
  },
});

Deno.test({
  name: 'Workspace - PUT /workspace overwrites existing file',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const codeId = 'test-overwrite';
    const code1 = 'console.log("first version");';
    const code2 = 'console.log("second version");';

    // Save first version
    const response1 = await fetch(`${serverUrl}/workspace`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId, code: code1 }),
    });

    assertEquals(response1.status, 200);

    // Save second version (overwrite)
    const response2 = await fetch(`${serverUrl}/workspace`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId, code: code2 }),
    });

    assertEquals(response2.status, 200);

    // Verify file contains second version
    const filePath = join(config.workspaceDir, `${codeId}.ts`);
    const fileContent = await Deno.readTextFile(filePath);
    assertEquals(fileContent, code2);

    // Cleanup
    await Deno.remove(filePath);
  },
});

// TODO: Add integration test for save + execute workflow
// Currently skipped due to executor requiring specific code format (async main function)

Deno.test({
  name: 'Workspace - PUT /workspace with non-JSON body returns 400',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const response = await fetch(`${serverUrl}/workspace`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    assertEquals(response.status, 400);
    const body = await response.json() as ErrorResponse;
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'ValidationError');
    assertEquals(body.error.message, 'Invalid JSON in request body');
  },
});

// Phase 2: Markdown Code Block Extraction Tests

Deno.test({
  name: 'Workspace - PUT /workspace extracts code from ```typescript block',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const codeId = 'test-markdown-typescript';
    const plainCode = 'console.log(JSON.stringify({ message: "Hello from markdown" }));';
    const code = `\`\`\`typescript\n${plainCode}\n\`\`\``;

    const response = await fetch(`${serverUrl}/workspace`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId, code }),
    });

    assertEquals(response.status, 200);
    const body = await response.json() as ApiResponse;
    assertEquals(body.success, true);

    // Verify file contains extracted code (without markdown)
    const filePath = join(config.workspaceDir, `${codeId}.ts`);
    const fileContent = await Deno.readTextFile(filePath);
    assertEquals(fileContent, plainCode);

    // Cleanup
    await Deno.remove(filePath);
  },
});

Deno.test({
  name: 'Workspace - PUT /workspace extracts code from ```ts block',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const codeId = 'test-markdown-ts';
    const plainCode = 'const x = 42;\nconsole.log(JSON.stringify({ x }));';
    const code = `\`\`\`ts\n${plainCode}\n\`\`\``;

    const response = await fetch(`${serverUrl}/workspace`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId, code }),
    });

    assertEquals(response.status, 200);
    const body = await response.json() as ApiResponse;
    assertEquals(body.success, true);

    // Verify file contains extracted code (without markdown)
    const filePath = join(config.workspaceDir, `${codeId}.ts`);
    const fileContent = await Deno.readTextFile(filePath);
    assertEquals(fileContent, plainCode);

    // Cleanup
    await Deno.remove(filePath);
  },
});

Deno.test({
  name: 'Workspace - PUT /workspace handles multiline markdown code',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const codeId = 'test-markdown-multiline';
    const plainCode = `interface User {
  name: string;
  age: number;
}

const user: User = {
  name: "Alice",
  age: 30
};

console.log(JSON.stringify(user));`;
    const code = `\`\`\`typescript\n${plainCode}\n\`\`\``;

    const response = await fetch(`${serverUrl}/workspace`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId, code }),
    });

    assertEquals(response.status, 200);
    const body = await response.json() as ApiResponse;
    assertEquals(body.success, true);

    // Verify file contains extracted code (without markdown)
    const filePath = join(config.workspaceDir, `${codeId}.ts`);
    const fileContent = await Deno.readTextFile(filePath);
    assertEquals(fileContent, plainCode);

    // Cleanup
    await Deno.remove(filePath);
  },
});

Deno.test({
  name: 'Workspace - PUT /workspace handles markdown with leading/trailing whitespace',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const codeId = 'test-markdown-whitespace';
    const plainCode = 'console.log("test");';
    const code = `  \`\`\`typescript\n${plainCode}\n\`\`\`  `;

    const response = await fetch(`${serverUrl}/workspace`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId, code }),
    });

    assertEquals(response.status, 200);
    const body = await response.json() as ApiResponse;
    assertEquals(body.success, true);

    // Verify file contains extracted code (without markdown and whitespace)
    const filePath = join(config.workspaceDir, `${codeId}.ts`);
    const fileContent = await Deno.readTextFile(filePath);
    assertEquals(fileContent, plainCode);

    // Cleanup
    await Deno.remove(filePath);
  },
});

Deno.test({
  name: 'Workspace - PUT /workspace preserves plain code when not markdown',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await ensureServerStarted();

    const codeId = 'test-plain-preserved';
    const code = 'const message = "Not markdown";\nconsole.log(message);';

    const response = await fetch(`${serverUrl}/workspace`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId, code }),
    });

    assertEquals(response.status, 200);
    const body = await response.json() as ApiResponse;
    assertEquals(body.success, true);

    // Verify file contains original code as-is
    const filePath = join(config.workspaceDir, `${codeId}.ts`);
    const fileContent = await Deno.readTextFile(filePath);
    assertEquals(fileContent, code);

    // Cleanup
    await Deno.remove(filePath);
  },
});
