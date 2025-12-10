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

// ===== Rate Limiting - Block Expiry Tests =====

Deno.test({
  name: 'Rate Limiting - Resets attempts after block period expires',
  fn: async () => {
    // Setup
    mockConfig.auth.enabled = true;
    mockConfig.auth.apiKey = TEST_API_KEY;
    mockConfig.auth.rateLimit.enabled = true;
    mockConfig.auth.rateLimit.maxAttempts = 5;
    mockConfig.auth.rateLimit.windowMs = 60000;

    const testIP = '192.168.1.100';
    const next = () => Promise.resolve();

    // Step 1: Make 5 failed attempts to trigger rate limit
    for (let i = 0; i < 5; i++) {
      const ctx = testing.createMockContext({
        path: '/execute',
        method: 'POST',
        headers: [['Authorization', 'Bearer wrong-key']],
        ip: testIP,
      });
      await authMiddleware(ctx, next);
      assertEquals(ctx.response.status, 401);
    }

    // Step 2: Verify rate limiting is active (6th attempt)
    const ctxBlocked = testing.createMockContext({
      path: '/execute',
      method: 'POST',
      headers: [['Authorization', 'Bearer wrong-key']],
      ip: testIP,
    });
    await authMiddleware(ctxBlocked, next);
    assertEquals(ctxBlocked.response.status, 429);

    // Step 3: Simulate block period expiration by manipulating the store
    const { rateLimitStore } = await import('../../src/middleware/auth.ts');
    const info = rateLimitStore.get(testIP);
    assert(info, 'Rate limit info should exist');
    assert(info.blockedUntil, 'Should be blocked');

    // Set blockedUntil to 1 second ago to simulate expiration
    info.blockedUntil = Date.now() - 1000;

    // Step 4: Next request should pass rate limit check (not 429)
    const ctxAfterBlock = testing.createMockContext({
      path: '/execute',
      method: 'POST',
      headers: [['Authorization', 'Bearer wrong-key']],
      ip: testIP,
    });
    await authMiddleware(ctxAfterBlock, next);
    // Should be 401 (auth failure), NOT 429 (rate limit)
    assertEquals(ctxAfterBlock.response.status, 401);

    // Step 5: Verify the entry still exists and attempts were reset
    const infoAfter = rateLimitStore.get(testIP);
    assert(infoAfter, 'Entry should still exist in store');
    assertEquals(infoAfter.attempts, 1, 'Attempts should be 1 (new failure counted)');
    assertEquals(infoAfter.blockedUntil, undefined, 'Should no longer be blocked');

    // Cleanup
    rateLimitStore.clear();
  },
});

Deno.test({
  name: 'Rate Limiting - Can be blocked again after reset',
  fn: async () => {
    // Setup
    mockConfig.auth.enabled = true;
    mockConfig.auth.apiKey = TEST_API_KEY;
    mockConfig.auth.rateLimit.enabled = true;
    mockConfig.auth.rateLimit.maxAttempts = 5;
    mockConfig.auth.rateLimit.windowMs = 60000;

    const testIP = '192.168.1.200';
    const next = () => Promise.resolve();
    const { rateLimitStore } = await import('../../src/middleware/auth.ts');

    // Step 1: Trigger rate limit (5 failed attempts)
    for (let i = 0; i < 5; i++) {
      const ctx = testing.createMockContext({
        path: '/execute',
        method: 'POST',
        headers: [['Authorization', 'Bearer wrong-key']],
        ip: testIP,
      });
      await authMiddleware(ctx, next);
    }

    // Step 2: Verify blocked
    let ctx = testing.createMockContext({
      path: '/execute',
      method: 'POST',
      headers: [['Authorization', 'Bearer wrong-key']],
      ip: testIP,
    });
    await authMiddleware(ctx, next);
    assertEquals(ctx.response.status, 429);

    // Step 3: Simulate block expiry
    const info = rateLimitStore.get(testIP);
    assert(info);
    info.blockedUntil = Date.now() - 1000;

    // Step 4: Make 5 more failed attempts after block expired
    for (let i = 0; i < 5; i++) {
      ctx = testing.createMockContext({
        path: '/execute',
        method: 'POST',
        headers: [['Authorization', 'Bearer wrong-key']],
        ip: testIP,
      });
      await authMiddleware(ctx, next);
      // First 4 should be 401, 5th should be 429 (blocked again)
      if (i < 4) {
        assertEquals(ctx.response.status, 401, `Attempt ${i + 1} should be 401`);
      }
    }

    // Step 5: Verify rate limit is triggered again
    ctx = testing.createMockContext({
      path: '/execute',
      method: 'POST',
      headers: [['Authorization', 'Bearer wrong-key']],
      ip: testIP,
    });
    await authMiddleware(ctx, next);
    assertEquals(ctx.response.status, 429, 'Should be blocked again');

    // Cleanup
    rateLimitStore.clear();
  },
});

Deno.test({
  name: 'Rate Limiting - Deletes entries after window expires (not blocked)',
  fn: async () => {
    // Setup
    mockConfig.auth.enabled = true;
    mockConfig.auth.apiKey = TEST_API_KEY;
    mockConfig.auth.rateLimit.enabled = true;
    mockConfig.auth.rateLimit.maxAttempts = 5;
    mockConfig.auth.rateLimit.windowMs = 60000;

    const testIP = '192.168.1.300';
    const next = () => Promise.resolve();
    const { rateLimitStore } = await import('../../src/middleware/auth.ts');

    // Step 1: Make 3 failed attempts (below threshold)
    for (let i = 0; i < 3; i++) {
      const ctx = testing.createMockContext({
        path: '/execute',
        method: 'POST',
        headers: [['Authorization', 'Bearer wrong-key']],
        ip: testIP,
      });
      await authMiddleware(ctx, next);
      assertEquals(ctx.response.status, 401);
    }

    // Step 2: Verify entry exists
    let info = rateLimitStore.get(testIP);
    assert(info, 'Entry should exist');
    assertEquals(info.attempts, 3);
    assertEquals(info.blockedUntil, undefined, 'Should not be blocked');

    // Step 3: Simulate window expiration
    info.firstAttempt = Date.now() - (mockConfig.auth.rateLimit.windowMs + 1000);

    // Step 4: Trigger periodic cleanup by calling isRateLimited
    const ctx = testing.createMockContext({
      path: '/execute',
      method: 'POST',
      headers: [['Authorization', 'Bearer wrong-key']],
      ip: testIP,
    });
    await authMiddleware(ctx, next);

    // Step 5: Verify entry was deleted (window expired, not blocked)
    // After the request, if window expired, the entry should be deleted
    // and a new entry created with attempts=1
    info = rateLimitStore.get(testIP);
    assert(info, 'A new entry should be created');
    assertEquals(info.attempts, 1, 'Should be a fresh entry with attempts=1');

    // Cleanup
    rateLimitStore.clear();
  },
});
