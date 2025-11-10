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
