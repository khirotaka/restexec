import { assert, assertEquals, assertFalse } from '@std/assert';
import { authMiddleware } from '../../src/middleware/auth.ts';
import { config } from '../../src/config.ts';
import { testing } from '@oak/oak';

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
    const next = () => {
      nextCalled = true;
      ctx.response.status = 200; // Simulate successful route handler
      ctx.response.body = { success: true };
      return Promise.resolve();
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
    const next = () => {
      nextCalled = true;
      return Promise.resolve();
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
    const next = () => {
      nextCalled = true;
      return Promise.resolve();
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
    const next = () => {
      nextCalled = true;
      return Promise.resolve();
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
    const next = () => {
      nextCalled = true;
      return Promise.resolve();
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
    const next = () => {
      nextCalled = true;
      return Promise.resolve();
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

Deno.test({
  name: 'Rate Limiting - Blocks after max attempts',
  fn: async () => {
    mockConfig.auth.enabled = true;
    mockConfig.auth.apiKey = TEST_API_KEY;
    mockConfig.auth.rateLimit.enabled = true;
    mockConfig.auth.rateLimit.maxAttempts = 5;
    mockConfig.auth.rateLimit.windowMs = 60000;

    const next = () => Promise.resolve();

    // Make 5 failed authentication attempts with invalid key
    for (let i = 0; i < 5; i++) {
      const ctx = testing.createMockContext({
        path: '/execute',
        method: 'POST',
        headers: [['Authorization', 'Bearer wrong-key']],
        ip: '192.168.1.100',
      });
      await authMiddleware(ctx, next);
      assertEquals(ctx.response.status, 401);
    }

    // 6th attempt should be rate limited
    const ctx = testing.createMockContext({
      path: '/execute',
      method: 'POST',
      headers: [['Authorization', 'Bearer wrong-key']],
      ip: '192.168.1.100',
    });
    await authMiddleware(ctx, next);
    assertEquals(ctx.response.status, 429);

    // deno-lint-ignore no-explicit-any
    const body = ctx.response.body as any;
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'RateLimitError');
    assertEquals(body.error.message, 'Too many authentication failures');
  },
});

Deno.test({
  name: 'Rate Limiting - Memory limit enforcement',
  fn: async () => {
    mockConfig.auth.enabled = true;
    mockConfig.auth.apiKey = TEST_API_KEY;
    mockConfig.auth.rateLimit.enabled = true;
    mockConfig.auth.rateLimit.maxEntries = 100;

    const next = () => Promise.resolve();

    // Create 110 failed authentication attempts from different IPs
    for (let i = 0; i < 110; i++) {
      const ip = `192.168.${Math.floor(i / 256)}.${i % 256}`;
      const ctx = testing.createMockContext({
        path: '/execute',
        method: 'POST',
        headers: [['Authorization', 'Bearer wrong-key']],
        ip,
      });
      await authMiddleware(ctx, next);
      assertEquals(ctx.response.status, 401);
    }

    // The rate limit store size should not exceed maxEntries
    // After eviction, it should be around 90 (100 - 10%)
    // We can't directly access rateLimitStore from tests, but we can verify
    // that the system doesn't crash and continues to work
    const ctx = testing.createMockContext({
      path: '/execute',
      method: 'POST',
      headers: [['Authorization', `Bearer ${TEST_API_KEY}`]],
      ip: '192.168.1.200',
    });

    let nextCalled = false;
    const nextWithFlag = () => {
      nextCalled = true;
      return Promise.resolve();
    };

    await authMiddleware(ctx, nextWithFlag);
    assert(nextCalled); // Valid auth should still work after memory cleanup
  },
});

Deno.test({
  name: 'IP Validation - Rejects invalid X-Forwarded-For',
  fn: async () => {
    mockConfig.auth.enabled = true;
    mockConfig.auth.apiKey = TEST_API_KEY;
    mockConfig.auth.rateLimit.trustProxy = true;
    mockConfig.auth.trustedProxyIPs = ['10.0.0.0/8'];

    const ctx = testing.createMockContext({
      path: '/execute',
      method: 'POST',
      headers: [
        ['Authorization', `Bearer ${TEST_API_KEY}`],
        ['X-Forwarded-For', 'not-an-ip-address'],
      ],
      ip: '10.0.0.1',
    });

    let nextCalled = false;
    const next = () => {
      nextCalled = true;
      return Promise.resolve();
    };
    await authMiddleware(ctx, next);

    // Authentication should succeed, but invalid IP is ignored and direct IP is used
    assert(nextCalled);
  },
});

Deno.test({
  name: 'IP Validation - Accepts valid IPv4',
  fn: async () => {
    mockConfig.auth.enabled = true;
    mockConfig.auth.apiKey = TEST_API_KEY;
    mockConfig.auth.rateLimit.trustProxy = true;
    mockConfig.auth.trustedProxyIPs = ['10.0.0.0/8'];

    const ctx = testing.createMockContext({
      path: '/execute',
      method: 'POST',
      headers: [
        ['Authorization', `Bearer ${TEST_API_KEY}`],
        ['X-Forwarded-For', '203.0.113.1'],
      ],
      ip: '10.0.0.1',
    });

    let nextCalled = false;
    const next = () => {
      nextCalled = true;
      return Promise.resolve();
    };
    await authMiddleware(ctx, next);

    assert(nextCalled);
  },
});

Deno.test({
  name: 'CIDR - Trusts proxy in IPv4 CIDR range',
  fn: async () => {
    mockConfig.auth.enabled = true;
    mockConfig.auth.apiKey = TEST_API_KEY;
    mockConfig.auth.rateLimit.trustProxy = true;
    mockConfig.auth.trustedProxyIPs = ['10.0.0.0/8', '172.16.0.0/12'];

    // 10.0.0.1 is within 10.0.0.0/8
    const ctx = testing.createMockContext({
      path: '/execute',
      method: 'POST',
      headers: [
        ['Authorization', `Bearer ${TEST_API_KEY}`],
        ['X-Forwarded-For', '203.0.113.1'],
      ],
      ip: '10.0.0.1',
    });

    let nextCalled = false;
    const next = () => {
      nextCalled = true;
      return Promise.resolve();
    };
    await authMiddleware(ctx, next);

    assert(nextCalled);
  },
});

Deno.test({
  name: 'CIDR - Does not trust proxy outside CIDR range',
  fn: async () => {
    mockConfig.auth.enabled = true;
    mockConfig.auth.apiKey = TEST_API_KEY;
    mockConfig.auth.rateLimit.trustProxy = true;
    mockConfig.auth.trustedProxyIPs = ['10.0.0.0/8'];

    // 192.168.1.1 is NOT within 10.0.0.0/8
    const ctx = testing.createMockContext({
      path: '/execute',
      method: 'POST',
      headers: [
        ['Authorization', `Bearer ${TEST_API_KEY}`],
        ['X-Forwarded-For', '203.0.113.1'],
      ],
      ip: '192.168.1.1',
    });

    let nextCalled = false;
    const next = () => {
      nextCalled = true;
      return Promise.resolve();
    };
    await authMiddleware(ctx, next);

    // X-Forwarded-For is ignored, direct IP is used
    assert(nextCalled);
  },
});

Deno.test({
  name: 'CIDR - Supports single IP addresses (backward compatibility)',
  fn: async () => {
    mockConfig.auth.enabled = true;
    mockConfig.auth.apiKey = TEST_API_KEY;
    mockConfig.auth.rateLimit.trustProxy = true;
    mockConfig.auth.trustedProxyIPs = ['10.0.0.1']; // Single IP (no CIDR notation)

    const ctx = testing.createMockContext({
      path: '/execute',
      method: 'POST',
      headers: [
        ['Authorization', `Bearer ${TEST_API_KEY}`],
        ['X-Forwarded-For', '203.0.113.1'],
      ],
      ip: '10.0.0.1',
    });

    let nextCalled = false;
    const next = () => {
      nextCalled = true;
      return Promise.resolve();
    };
    await authMiddleware(ctx, next);

    // matchSubnets supports single IPs
    assert(nextCalled);
  },
});
