import { assertEquals } from '@std/assert';
import { buildAllowedEnv } from '../../../src/utils/env.ts';

Deno.test('buildAllowedEnv - includes system environment variables', () => {
  // PATH and DENO_DIR should be included if they exist in the system
  // (They may not exist in all environments, so we just check the object structure)
  const result = buildAllowedEnv();

  // Should be an object
  assertEquals(typeof result, 'object');

  // If PATH exists in system, it should be included
  const systemPath = Deno.env.get('PATH');
  if (systemPath) {
    assertEquals(result.PATH, systemPath);
  }

  // If DENO_DIR exists in system, it should be included
  const systemDenoDir = Deno.env.get('DENO_DIR');
  if (systemDenoDir) {
    assertEquals(result.DENO_DIR, systemDenoDir);
  }
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
  // Should still include system environment variables
  const result = buildAllowedEnv({});

  // Should still include system environment variables
  assertEquals(typeof result, 'object');

  // Verify system variables are present
  const systemPath = Deno.env.get('PATH');
  if (systemPath) {
    assertEquals(result.PATH, systemPath);
  }
});

Deno.test('buildAllowedEnv - handles undefined user environment', () => {
  const result = buildAllowedEnv(undefined);

  // Should include system environment variables
  assertEquals(typeof result, 'object');
});

Deno.test('buildAllowedEnv - system variables take precedence over user input', () => {
  // Set up system environment for testing
  const originalPath = Deno.env.get('PATH');
  const originalDenoDir = Deno.env.get('DENO_DIR');

  // Test that user cannot override system variables
  const userEnv = {
    PATH: '/malicious/path',
    DENO_DIR: '/malicious/deno',
    SAFE_VAR: 'safe-value',
  };

  const result = buildAllowedEnv(userEnv);

  // System variables should take precedence (not user-provided values)
  // This is a security feature - system environment variables cannot be overridden
  if (originalPath) {
    assertEquals(
      result.PATH,
      originalPath,
      'PATH should not be overridden by user input when system PATH exists',
    );
  } else {
    // If PATH doesn't exist in system, user-provided value is used
    assertEquals(
      result.PATH,
      '/malicious/path',
      'PATH can be provided by user only if not in system',
    );
  }

  if (originalDenoDir) {
    assertEquals(
      result.DENO_DIR,
      originalDenoDir,
      'DENO_DIR should not be overridden by user input when system DENO_DIR exists',
    );
  } else {
    // If DENO_DIR doesn't exist in system, user-provided value is used
    assertEquals(
      result.DENO_DIR,
      '/malicious/deno',
      'DENO_DIR can be provided by user only if not in system',
    );
  }

  // Safe variables should still be merged
  assertEquals(result.SAFE_VAR, 'safe-value');
});

Deno.test('buildAllowedEnv - security: validates that only system PATH/DENO_DIR are used', () => {
  const originalPath = Deno.env.get('PATH');
  const originalDenoDir = Deno.env.get('DENO_DIR');

  // Even if user-provided values are passed, system variables take absolute precedence
  const userEnv = {
    PATH: '/malicious/path',
    DENO_DIR: '/malicious/deno',
    CUSTOM_VAR: 'custom-value',
  };

  const result = buildAllowedEnv(userEnv);

  // System variables must always be used if they exist
  if (originalPath) {
    assertEquals(
      result.PATH,
      originalPath,
      'Must use system PATH even when user provides different value',
    );
  }
  if (originalDenoDir) {
    assertEquals(
      result.DENO_DIR,
      originalDenoDir,
      'Must use system DENO_DIR even when user provides different value',
    );
  }

  // Custom variables should be preserved
  assertEquals(result.CUSTOM_VAR, 'custom-value');
});

Deno.test('buildAllowedEnv - handles missing system variables gracefully', () => {
  const userEnv = { OTHER_VAR: 'value', ANOTHER_VAR: 'another' };

  const result = buildAllowedEnv(userEnv);

  assertEquals(typeof result, 'object');
  assertEquals(result.OTHER_VAR, 'value');
  assertEquals(result.ANOTHER_VAR, 'another');

  // System variables that don't exist shouldn't be added
  const systemPath = Deno.env.get('PATH');
  const systemDenoDir = Deno.env.get('DENO_DIR');

  if (!systemPath) {
    assertEquals(
      result.PATH,
      undefined,
      'PATH should not be added if not in system environment',
    );
  }
  if (!systemDenoDir) {
    assertEquals(
      result.DENO_DIR,
      undefined,
      'DENO_DIR should not be added if not in system environment',
    );
  }
});

Deno.test('buildAllowedEnv - multiple calls with different inputs return correct values', () => {
  const userEnv1 = { VAR1: 'value1' };
  const userEnv2 = { VAR2: 'value2' };

  const result1 = buildAllowedEnv(userEnv1);
  const result2 = buildAllowedEnv(userEnv2);

  assertEquals(result1.VAR1, 'value1');
  assertEquals(result2.VAR2, 'value2');
});
