import { assertEquals } from '@std/assert';
import { calculateSHA256 } from '../../src/utils/hash.ts';

Deno.test('calculateSHA256 - calculates correct hash for empty string', async () => {
  const input = '';
  // SHA-256 hash of empty string (known value)
  const expected = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const result = await calculateSHA256(input);
  assertEquals(result, expected);
});

Deno.test('calculateSHA256 - calculates correct hash for simple string', async () => {
  const input = 'hello world';
  // SHA-256 hash of "hello world" (known value)
  const expected = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';
  const result = await calculateSHA256(input);
  assertEquals(result, expected);
});

Deno.test('calculateSHA256 - calculates correct hash for TypeScript code', async () => {
  const input = 'console.log("Hello, World!");';
  // SHA-256 hash of this specific code string
  const expected = 'f7ff9e8b7bb2e09b70935a5d785e0cc5d9d0abf0db0632b0cd754a9f32321a49';
  const result = await calculateSHA256(input);
  assertEquals(result, expected);
});

Deno.test('calculateSHA256 - returns different hashes for different inputs', async () => {
  const input1 = 'console.log("test1");';
  const input2 = 'console.log("test2");';

  const hash1 = await calculateSHA256(input1);
  const hash2 = await calculateSHA256(input2);

  // Hashes should be different
  assertEquals(hash1 === hash2, false);
});

Deno.test('calculateSHA256 - returns same hash for same input (deterministic)', async () => {
  const input = 'const x = 42;';

  const hash1 = await calculateSHA256(input);
  const hash2 = await calculateSHA256(input);

  // Same input should produce same hash
  assertEquals(hash1, hash2);
});

Deno.test('calculateSHA256 - handles multiline code', async () => {
  const input = `function greet(name: string): void {
  console.log(\`Hello, \${name}!\`);
}
greet("World");`;

  const result = await calculateSHA256(input);

  // Should return a valid 64-character hexadecimal string
  assertEquals(result.length, 64);
  assertEquals(/^[a-f0-9]{64}$/.test(result), true);
});

Deno.test('calculateSHA256 - handles Unicode characters', async () => {
  const input = 'console.log("こんにちは世界");';

  const result = await calculateSHA256(input);

  // Should return a valid 64-character hexadecimal string
  assertEquals(result.length, 64);
  assertEquals(/^[a-f0-9]{64}$/.test(result), true);
});
