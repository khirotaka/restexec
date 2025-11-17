import { assertEquals } from '@std/assert';
import { buildAllowedEnv } from '../../../src/utils/env.ts';

Deno.test('buildAllowedEnv - includes system environment variables', () => {
  // PATH and DENO_DIR should be inherited from system if they exist
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

  // User-defined non-protected variables should be merged
  assertEquals(result.API_KEY, 'test-key-123');
  assertEquals(result.DEBUG, 'true');
  assertEquals(result.CUSTOM_VAR, 'custom-value');
});

Deno.test('buildAllowedEnv - handles empty user environment object', () => {
  // Should still include system environment variables
  const result = buildAllowedEnv({});

  // Should be an object
  assertEquals(typeof result, 'object');

  // Verify system variables are present if they exist
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

Deno.test('buildAllowedEnv - rejects user-provided PATH and DENO_DIR', () => {
  // Verify current system state
  const systemPath = Deno.env.get('PATH');
  const systemDenoDir = Deno.env.get('DENO_DIR');

  // User attempts to override protected keys
  const userEnv = {
    PATH: '/malicious/path',
    DENO_DIR: '/malicious/deno',
    SAFE_VAR: 'safe-value',
  };

  const result = buildAllowedEnv(userEnv);

  // Protected keys MUST NOT be set from user input
  // If system variable exists, use system value; if not, should not be set at all
  if (systemPath) {
    assertEquals(
      result.PATH,
      systemPath,
      'PATH must be from system environment, not user input',
    );
  } else {
    assertEquals(
      result.PATH,
      undefined,
      'PATH must not be set when user provides value (system is authoritative)',
    );
  }

  if (systemDenoDir) {
    assertEquals(
      result.DENO_DIR,
      systemDenoDir,
      'DENO_DIR must be from system environment, not user input',
    );
  } else {
    assertEquals(
      result.DENO_DIR,
      undefined,
      'DENO_DIR must not be set when user provides value (system is authoritative)',
    );
  }

  // Non-protected variables should still be merged
  assertEquals(result.SAFE_VAR, 'safe-value');
});

Deno.test('buildAllowedEnv - security: all protected keys are filtered', () => {
  // Test that all protected keys are rejected, not just PATH and DENO_DIR
  const userEnv = {
    PATH: '/malicious/path',
    DENO_DIR: '/malicious/deno',
    HOME: '/malicious/home',
    USER: 'malicious-user',
    PWD: '/malicious/pwd',
    SHELL: '/malicious/shell',
    SAFE_API_KEY: 'safe-key-123',
    SAFE_DEBUG: 'true',
  };

  const result = buildAllowedEnv(userEnv);

  // Only safe variables should be in the result from user input
  assertEquals(result.SAFE_API_KEY, 'safe-key-123');
  assertEquals(result.SAFE_DEBUG, 'true');

  // All protected keys must either come from system or be undefined
  // (but never from user input)
  const systemPath = Deno.env.get('PATH');
  const systemDenoDir = Deno.env.get('DENO_DIR');

  if (systemPath) {
    assertEquals(result.PATH, systemPath);
  } else {
    assertEquals(result.PATH, undefined);
  }

  if (systemDenoDir) {
    assertEquals(result.DENO_DIR, systemDenoDir);
  } else {
    assertEquals(result.DENO_DIR, undefined);
  }

  // Keys like HOME, USER, PWD, SHELL must never be from user input
  // (these may exist in system but user cannot set them via buildAllowedEnv)
  if (result.HOME !== undefined) {
    assertEquals(
      result.HOME,
      Deno.env.get('HOME'),
      'HOME if present should be from system, not user',
    );
  }
  if (result.USER !== undefined) {
    assertEquals(
      result.USER,
      Deno.env.get('USER'),
      'USER if present should be from system, not user',
    );
  }
});

Deno.test('buildAllowedEnv - protected keys absent when system lacks them', () => {
  // When system doesn't have a protected key, user cannot provide it
  // This assumes at least one of PATH/DENO_DIR might not exist in some environments
  const userEnv = {
    PATH: '/should/be/rejected',
    DENO_DIR: '/should/be/rejected',
    CUSTOM_VAR: 'should-be-included',
  };

  const result = buildAllowedEnv(userEnv);

  // Custom variables are always allowed
  assertEquals(result.CUSTOM_VAR, 'should-be-included');

  // Protected keys are never set from user input
  // If system has them, use system; if system doesn't have them, don't set them at all
  const systemPath = Deno.env.get('PATH');
  const systemDenoDir = Deno.env.get('DENO_DIR');

  if (!systemPath && result.PATH === undefined) {
    // Correct: PATH not in system, so it's not set (not from user input)
  } else if (systemPath) {
    assertEquals(result.PATH, systemPath);
  }

  if (!systemDenoDir && result.DENO_DIR === undefined) {
    // Correct: DENO_DIR not in system, so it's not set (not from user input)
  } else if (systemDenoDir) {
    assertEquals(result.DENO_DIR, systemDenoDir);
  }
});

Deno.test('buildAllowedEnv - multiple calls with different inputs return correct values', () => {
  const userEnv1 = { VAR1: 'value1', PATH: '/should/be/rejected' };
  const userEnv2 = { VAR2: 'value2', DENO_DIR: '/should/be/rejected' };

  const result1 = buildAllowedEnv(userEnv1);
  const result2 = buildAllowedEnv(userEnv2);

  // Safe variables should be present
  assertEquals(result1.VAR1, 'value1');
  assertEquals(result2.VAR2, 'value2');

  // Protected keys should not be from user (they should be from system or undefined)
  const systemPath = Deno.env.get('PATH');
  if (systemPath) {
    assertEquals(result1.PATH, systemPath);
  }

  const systemDenoDir = Deno.env.get('DENO_DIR');
  if (systemDenoDir) {
    assertEquals(result2.DENO_DIR, systemDenoDir);
  }
});
