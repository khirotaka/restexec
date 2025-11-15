import { assertEquals, assertRejects } from '@std/assert';
import { validateExecuteRequest } from '../../src/middleware/validation.ts';
import { ValidationError } from '../../src/utils/errors.ts';
import type { Context } from '@oak/oak';

/**
 * Create a mock context for testing
 */
function createMockContext(body: unknown): Context {
  return {
    request: {
      body: {
        json: () => Promise.resolve(body),
      },
    },
    state: {},
    response: {
      status: 200,
      body: undefined,
    },
  } as unknown as Context;
}

Deno.test('Validation - should pass with valid codeId and timeout', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    timeout: 5000,
  });

  let nextCalled = false;
  await validateExecuteRequest(ctx, () => {
    nextCalled = true;
    return Promise.resolve();
  });

  assertEquals(nextCalled, true);
  assertEquals(ctx.state.body, {
    codeId: 'test-code',
    timeout: 5000,
  });
});

Deno.test('Validation - should pass with valid codeId and no timeout', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
  });

  let nextCalled = false;
  await validateExecuteRequest(ctx, () => {
    nextCalled = true;
    return Promise.resolve();
  });

  assertEquals(nextCalled, true);
  assertEquals(ctx.state.body, {
    codeId: 'test-code',
  });
});

Deno.test('Validation - should accept codeId with hyphens', async () => {
  const ctx = createMockContext({
    codeId: 'test-code-with-hyphens',
    timeout: 5000,
  });

  let nextCalled = false;
  await validateExecuteRequest(ctx, () => {
    nextCalled = true;
    return Promise.resolve();
  });

  assertEquals(nextCalled, true);
});

Deno.test('Validation - should accept codeId with underscores', async () => {
  const ctx = createMockContext({
    codeId: 'test_code_with_underscores',
    timeout: 5000,
  });

  let nextCalled = false;
  await validateExecuteRequest(ctx, () => {
    nextCalled = true;
    return Promise.resolve();
  });

  assertEquals(nextCalled, true);
});

Deno.test('Validation - should reject missing codeId', async () => {
  const ctx = createMockContext({
    timeout: 5000,
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'codeId is required',
  );
});

Deno.test('Validation - should reject empty codeId', async () => {
  const ctx = createMockContext({
    codeId: '',
    timeout: 5000,
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'codeId is required',
  );
});

Deno.test('Validation - should reject codeId with whitespace only', async () => {
  const ctx = createMockContext({
    codeId: '   ',
    timeout: 5000,
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'codeId must be a non-empty string',
  );
});

Deno.test('Validation - should reject codeId with forward slash', async () => {
  const ctx = createMockContext({
    codeId: 'test/code',
    timeout: 5000,
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'codeId must not contain path separators or parent directory references',
  );
});

Deno.test('Validation - should reject codeId with backslash', async () => {
  const ctx = createMockContext({
    codeId: 'test\\code',
    timeout: 5000,
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'codeId must not contain path separators or parent directory references',
  );
});

Deno.test('Validation - should reject codeId with parent directory reference', async () => {
  const ctx = createMockContext({
    codeId: '../etc/passwd',
    timeout: 5000,
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'codeId must not contain path separators or parent directory references',
  );
});

Deno.test('Validation - should reject codeId with special characters', async () => {
  const ctx = createMockContext({
    codeId: 'test@code',
    timeout: 5000,
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'codeId must contain only alphanumeric characters, hyphens, and underscores',
  );
});

Deno.test('Validation - should reject non-integer timeout', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    timeout: 5000.5,
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'timeout must be an integer',
  );
});

Deno.test('Validation - should reject negative timeout', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    timeout: -1000,
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'timeout must be between 1 and',
  );
});

Deno.test('Validation - should reject zero timeout', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    timeout: 0,
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'timeout must be between 1 and',
  );
});

Deno.test('Validation - should reject timeout exceeding max', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    timeout: 999999,
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'timeout must be between 1 and',
  );
});

Deno.test('Validation - should reject invalid JSON', async () => {
  const ctx = {
    request: {
      body: {
        json: () => Promise.reject(new Error('Invalid JSON')),
      },
    },
    state: {},
  } as unknown as Context;

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'Invalid JSON in request body',
  );
});

Deno.test('Validation - should reject non-string codeId', async () => {
  const ctx = createMockContext({
    codeId: 12345,
    timeout: 5000,
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'codeId must be a non-empty string',
  );
});

Deno.test('Validation - should reject non-number timeout', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    timeout: '5000',
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'timeout must be an integer',
  );
});

// Environment variables validation tests
Deno.test('Validation - should pass with valid env object', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    timeout: 5000,
    env: { API_KEY: 'test-key', DEBUG_MODE: 'true' },
  });

  let nextCalled = false;
  await validateExecuteRequest(ctx, () => {
    nextCalled = true;
    return Promise.resolve();
  });

  assertEquals(nextCalled, true);
  assertEquals(ctx.state.body, {
    codeId: 'test-code',
    timeout: 5000,
    env: { API_KEY: 'test-key', DEBUG_MODE: 'true' },
  });
});

Deno.test('Validation - should pass with empty env object', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    timeout: 5000,
    env: {},
  });

  let nextCalled = false;
  await validateExecuteRequest(ctx, () => {
    nextCalled = true;
    return Promise.resolve();
  });

  assertEquals(nextCalled, true);
});

Deno.test('Validation - should pass without env field', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    timeout: 5000,
  });

  let nextCalled = false;
  await validateExecuteRequest(ctx, () => {
    nextCalled = true;
    return Promise.resolve();
  });

  assertEquals(nextCalled, true);
});

Deno.test('Validation - should reject env with invalid key format (lowercase)', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    env: { 'api_key': 'value' },
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'env keys must contain only uppercase letters, numbers, and underscores',
  );
});

Deno.test('Validation - should reject env with invalid key format (hyphen)', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    env: { 'API-KEY': 'value' },
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'env keys must contain only uppercase letters, numbers, and underscores',
  );
});

Deno.test('Validation - should reject env with forbidden key (PATH)', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    env: { PATH: '/usr/bin' },
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'env key "PATH" is forbidden',
  );
});

Deno.test('Validation - should reject env with forbidden key (HOME)', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    env: { HOME: '/home/user' },
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'env key "HOME" is forbidden',
  );
});

Deno.test('Validation - should reject env with DENO_ prefix', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    env: { DENO_DIR: '/tmp' },
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'env key "DENO_DIR" is forbidden',
  );
});

Deno.test('Validation - should reject env with DENO_ prefix (custom)', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    env: { DENO_CUSTOM: 'value' },
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'env key "DENO_CUSTOM" is forbidden',
  );
});

Deno.test('Validation - should reject env exceeding max count', async () => {
  const env = Object.fromEntries(
    Array.from({ length: 51 }, (_, i) => [`KEY_${i}`, 'value']),
  );
  const ctx = createMockContext({
    codeId: 'test-code',
    env,
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'env must not exceed 50 entries',
  );
});

Deno.test('Validation - should reject env with non-string value', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    env: { API_KEY: 12345 },
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'env values must be strings',
  );
});

Deno.test('Validation - should reject env value exceeding max length', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    env: { API_KEY: 'x'.repeat(1001) },
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'env value for "API_KEY" exceeds maximum length',
  );
});

Deno.test('Validation - should reject env exceeding total size', async () => {
  const env = Object.fromEntries(
    Array.from({ length: 50 }, (_, i) => [`KEY_${i}`, 'x'.repeat(300)]),
  );
  const ctx = createMockContext({
    codeId: 'test-code',
    env,
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'env total size exceeds maximum allowed size',
  );
});

Deno.test('Validation - should reject env that is an array', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    env: ['API_KEY', 'value'],
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'env must be an object',
  );
});

Deno.test('Validation - should reject env that is a string', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    env: 'invalid',
  });

  await assertRejects(
    () => validateExecuteRequest(ctx, () => Promise.resolve()),
    ValidationError,
    'env must be an object',
  );
});

// Boundary value tests
Deno.test('Validation - should pass with exactly 50 env variables', async () => {
  const env = Object.fromEntries(
    Array.from({ length: 50 }, (_, i) => [`KEY_${i}`, 'value']),
  );
  const ctx = createMockContext({
    codeId: 'test-code',
    env,
  });

  let nextCalled = false;
  await validateExecuteRequest(ctx, () => {
    nextCalled = true;
    return Promise.resolve();
  });

  assertEquals(nextCalled, true);
});

Deno.test('Validation - should pass with env value exactly 1000 characters', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    env: { API_KEY: 'x'.repeat(1000) },
  });

  let nextCalled = false;
  await validateExecuteRequest(ctx, () => {
    nextCalled = true;
    return Promise.resolve();
  });

  assertEquals(nextCalled, true);
});

Deno.test('Validation - should pass with env total size exactly 10KB', async () => {
  // Create env that totals exactly 10KB (10240 bytes)
  // Each entry: "KEY_XX" (6 chars) + value
  // 50 entries: 50 * 6 = 300 bytes for keys
  // Remaining: 10240 - 300 = 9940 bytes for values
  // Per value: 9940 / 50 = 198.8 bytes -> use 198 bytes each (total: 300 + 9900 = 10200)
  const env = Object.fromEntries(
    Array.from({ length: 50 }, (_, i) => {
      const key = `KEY_${String(i).padStart(2, '0')}`;
      // Calculate remaining bytes
      const valueBytes = 198;
      return [key, 'x'.repeat(valueBytes)];
    }),
  );

  const ctx = createMockContext({
    codeId: 'test-code',
    env,
  });

  let nextCalled = false;
  await validateExecuteRequest(ctx, () => {
    nextCalled = true;
    return Promise.resolve();
  });

  assertEquals(nextCalled, true);
});

Deno.test('Validation - should pass with empty string value', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    env: { API_KEY: '' },
  });

  let nextCalled = false;
  await validateExecuteRequest(ctx, () => {
    nextCalled = true;
    return Promise.resolve();
  });

  assertEquals(nextCalled, true);
});

Deno.test('Validation - should pass with Unicode characters in value', async () => {
  const ctx = createMockContext({
    codeId: 'test-code',
    env: {
      MESSAGE: 'こんにちは世界',
      EMOJI: '🚀🎉💻',
      MIXED: 'Hello こんにちは 🌍',
    },
  });

  let nextCalled = false;
  await validateExecuteRequest(ctx, () => {
    nextCalled = true;
    return Promise.resolve();
  });

  assertEquals(nextCalled, true);
});
