import { assertEquals } from '@std/assert';
import { buildAllowedEnv } from '../../src/utils/env.ts';

Deno.test('buildAllowedEnv - システム環境変数のみを返す', () => {
  // Setup: システム環境変数を設定
  Deno.env.set('PATH', '/usr/bin:/bin');
  Deno.env.set('DENO_DIR', '/home/user/.deno');

  const result = buildAllowedEnv();

  assertEquals(result.PATH, '/usr/bin:/bin');
  assertEquals(result.DENO_DIR, '/home/user/.deno');
  assertEquals(Object.keys(result).length, 2);
});

Deno.test('buildAllowedEnv - ユーザー定義環境変数をマージする', () => {
  // Setup: システム環境変数を設定
  Deno.env.set('PATH', '/usr/bin:/bin');
  Deno.env.set('DENO_DIR', '/home/user/.deno');

  const userEnv = {
    API_KEY: 'secret-123',
    DEBUG_MODE: 'true',
  };

  const result = buildAllowedEnv(userEnv);

  assertEquals(result.PATH, '/usr/bin:/bin');
  assertEquals(result.DENO_DIR, '/home/user/.deno');
  assertEquals(result.API_KEY, 'secret-123');
  assertEquals(result.DEBUG_MODE, 'true');
  assertEquals(Object.keys(result).length, 4);
});

Deno.test('buildAllowedEnv - システム環境変数が存在しない場合でも動作する', () => {
  // Setup: システム環境変数を削除
  const originalPath = Deno.env.get('PATH');
  const originalDenoDir = Deno.env.get('DENO_DIR');
  Deno.env.delete('PATH');
  Deno.env.delete('DENO_DIR');

  try {
    const userEnv = { CUSTOM_VAR: 'value' };
    const result = buildAllowedEnv(userEnv);

    assertEquals(result.CUSTOM_VAR, 'value');
    assertEquals(result.PATH, undefined);
    assertEquals(result.DENO_DIR, undefined);
    assertEquals(Object.keys(result).length, 1);
  } finally {
    // Cleanup: 元の環境変数を復元
    if (originalPath) Deno.env.set('PATH', originalPath);
    if (originalDenoDir) Deno.env.set('DENO_DIR', originalDenoDir);
  }
});

Deno.test('buildAllowedEnv - 空のユーザー環境変数でも動作する', () => {
  // Setup: システム環境変数を設定
  Deno.env.set('PATH', '/usr/bin:/bin');
  Deno.env.set('DENO_DIR', '/home/user/.deno');

  const result = buildAllowedEnv({});

  assertEquals(result.PATH, '/usr/bin:/bin');
  assertEquals(result.DENO_DIR, '/home/user/.deno');
  assertEquals(Object.keys(result).length, 2);
});
