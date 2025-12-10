import { assertEquals } from '@std/assert';

// Note: parseBooleanEnv is not exported from config.ts, so we test it indirectly
// through the config object or create a test version here.
// For demonstration, we'll create a test version of the function.

/**
 * Test version of parseBooleanEnv with the same signature
 */
function parseBooleanEnv(envVar: string | undefined, defaultValue: boolean): boolean;
function parseBooleanEnv(envVar: string | undefined, defaultValue: undefined): boolean | undefined;
function parseBooleanEnv(envVar: string | undefined, defaultValue: boolean | undefined): boolean | undefined {
  if (!envVar) {
    return defaultValue;
  }
  return envVar.toLowerCase() === 'true';
}

Deno.test({
  name: 'parseBooleanEnv - Returns boolean when defaultValue is boolean',
  fn: () => {
    // Type check: result is boolean
    const result: boolean = parseBooleanEnv('true', false);
    assertEquals(result, true);
  },
});

Deno.test({
  name: 'parseBooleanEnv - Returns boolean | undefined when defaultValue is undefined',
  fn: () => {
    // Type check: result is boolean | undefined
    const result: boolean | undefined = parseBooleanEnv(undefined, undefined);
    assertEquals(result, undefined);
  },
});

Deno.test({
  name: 'parseBooleanEnv - Returns defaultValue when env is undefined',
  fn: () => {
    const result = parseBooleanEnv(undefined, false);
    assertEquals(result, false);
  },
});

Deno.test({
  name: 'parseBooleanEnv - Parses "true" correctly',
  fn: () => {
    const result = parseBooleanEnv('true', false);
    assertEquals(result, true);
  },
});

Deno.test({
  name: 'parseBooleanEnv - Parses "false" correctly',
  fn: () => {
    const result = parseBooleanEnv('false', true);
    assertEquals(result, false);
  },
});

Deno.test({
  name: 'parseBooleanEnv - Case insensitive',
  fn: () => {
    assertEquals(parseBooleanEnv('TRUE', false), true);
    assertEquals(parseBooleanEnv('False', true), false);
    assertEquals(parseBooleanEnv('TrUe', false), true);
  },
});

Deno.test({
  name: 'parseBooleanEnv - Non-true values return false',
  fn: () => {
    assertEquals(parseBooleanEnv('yes', false), false);
    assertEquals(parseBooleanEnv('1', false), false);
    assertEquals(parseBooleanEnv('anything', false), false);
  },
});
