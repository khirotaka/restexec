import { assert, assertEquals, assertFalse } from '@std/assert';
import { authMiddleware } from '../../src/middleware/auth.ts';
import { config } from '../../src/config.ts';
import { Context, testing } from '@oak/oak';

// Mock config for testing
// We need to cast to any to modify read-only properties for testing
// deno-lint-ignore no-explicit-any
const mockConfig = config as any;

const TEST_API_KEY = 'test-api-key-must-be-at-least-32-chars-long';

Deno.test({
  name: 'Auth Middleware - Skips auth when disabled',
  fn: async () => {
    mockConfig.auth.enabled = false;

    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
      ctx.response.status = 200; // Simulate successful route handler
      ctx.response.body = { success: true };
    };

    const ctx = testing.createMockContext({
      path: '/execute',
      method: 'POST',
    });

    await authMiddleware(ctx, next);

    assert(nextCalled);
    assertEquals(ctx.response.status, 200); // Default status
  },
});

Deno.test({
  name: 'Auth Middleware - Skips auth for public paths even if enabled',
  fn: async () => {
    mockConfig.auth.enabled = true;
    mockConfig.auth.apiKey = TEST_API_KEY;

    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
    };

    const ctx = testing.createMockContext({
      path: '/health',
      method: 'GET',
    });

    await authMiddleware(ctx, next);

    assert(nextCalled);
  },
});

Deno.test({
  name: 'Auth Middleware - Rejects missing header',
  fn: async () => {
    mockConfig.auth.enabled = true;
    mockConfig.auth.apiKey = TEST_API_KEY;

    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
    };

    const ctx = testing.createMockContext({
      path: '/execute',
      method: 'POST',
    });

    await authMiddleware(ctx, next);

    assertFalse(nextCalled);
    assertEquals(ctx.response.status, 401);
    // deno-lint-ignore no-explicit-any
    const body = ctx.response.body as any;
    assertEquals(body.error.type, 'UnauthorizedError');
    assertEquals(body.error.message, 'Missing Authorization header');
  },
});

Deno.test({
  name: 'Auth Middleware - Rejects invalid format',
  fn: async () => {
    mockConfig.auth.enabled = true;
    mockConfig.auth.apiKey = TEST_API_KEY;

    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
    };

    const ctx = testing.createMockContext({
      path: '/execute',
      method: 'POST',
      headers: [['Authorization', 'Basic 123']],
    });

    await authMiddleware(ctx, next);

    assertFalse(nextCalled);
    assertEquals(ctx.response.status, 401);
    // deno-lint-ignore no-explicit-any
    const body = ctx.response.body as any;
    assertEquals(body.error.type, 'UnauthorizedError');
    assertEquals(body.error.message, 'Invalid Authorization header format');
  },
});

Deno.test({
  name: 'Auth Middleware - Rejects invalid key',
  fn: async () => {
    mockConfig.auth.enabled = true;
    mockConfig.auth.apiKey = TEST_API_KEY;

    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
    };

    const ctx = testing.createMockContext({
      path: '/execute',
      method: 'POST',
      headers: [['Authorization', 'Bearer wrong-key']],
    });

    await authMiddleware(ctx, next);

    assertFalse(nextCalled);
    assertEquals(ctx.response.status, 401);
    // deno-lint-ignore no-explicit-any
    const body = ctx.response.body as any;
    assertEquals(body.error.type, 'UnauthorizedError');
    assertEquals(body.error.message, 'Invalid API key');
  },
});

Deno.test({
  name: 'Auth Middleware - Allows valid key',
  fn: async () => {
    mockConfig.auth.enabled = true;
    mockConfig.auth.apiKey = TEST_API_KEY;

    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
    };

    const ctx = testing.createMockContext({
      path: '/execute',
      method: 'POST',
      headers: [['Authorization', `Bearer ${TEST_API_KEY}`]],
    });

    await authMiddleware(ctx, next);

    assert(nextCalled);
  },
});
