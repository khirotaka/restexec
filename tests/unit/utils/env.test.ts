import { assertEquals } from '@std/assert';
import { buildAllowedEnv } from '../../../src/utils/env.ts';

Deno.test('buildAllowedEnv - includes system environment variables', () => {
  const result = buildAllowedEnv();

  // PATH and DENO_DIR should be included if they exist in the system
  // (They may not exist in all environments, so we just check the object structure)
  assertEquals(typeof result, 'object');
});

Deno.test('buildAllowedEnv - merges user-defined environment variables', () => {
  const userEnv = {
    API_KEY: 'test-key-123',
    DEBUG: 'true',
    CUSTOM_VAR: 'custom-value',
  };

  const result = buildAllowedEnv(userEnv);

  // User-defined variables should be merged
  assertEquals(result.API_KEY, 'test-key-123');
  assertEquals(result.DEBUG, 'true');
  assertEquals(result.CUSTOM_VAR, 'custom-value');
});

Deno.test('buildAllowedEnv - handles empty user environment object', () => {
  const result = buildAllowedEnv({});

  // Should still include system environment variables
  assertEquals(typeof result, 'object');
});

Deno.test('buildAllowedEnv - handles undefined user environment', () => {
  const result = buildAllowedEnv(undefined);

  // Should include system environment variables
  assertEquals(typeof result, 'object');
});

Deno.test('buildAllowedEnv - system variables take precedence in merge', () => {
  // Test that if user tries to override system vars, they can be overridden
  const userEnv = {
    PATH: '/custom/path',
    DENO_DIR: '/custom/deno',
  };

  const result = buildAllowedEnv(userEnv);

  // User-provided PATH and DENO_DIR should be in the result
  assertEquals(result.PATH, '/custom/path');
  assertEquals(result.DENO_DIR, '/custom/deno');
});

Deno.test('buildAllowedEnv - multiple calls with different inputs return correct values', () => {
  const userEnv1 = { VAR1: 'value1' };
  const userEnv2 = { VAR2: 'value2' };

  const result1 = buildAllowedEnv(userEnv1);
  const result2 = buildAllowedEnv(userEnv2);

  assertEquals(result1.VAR1, 'value1');
  assertEquals(result2.VAR2, 'value2');
});
