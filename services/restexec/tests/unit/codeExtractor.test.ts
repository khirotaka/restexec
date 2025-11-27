import { assertEquals } from '@std/assert';
import { extractTypeScriptCode, isMarkdownCodeBlock } from '../../src/utils/codeExtractor.ts';

Deno.test('extractTypeScriptCode - returns plain code as-is', () => {
  const plainCode = 'console.log("Hello, World!");';
  const result = extractTypeScriptCode(plainCode);
  assertEquals(result, plainCode);
});

Deno.test('extractTypeScriptCode - extracts code from ```typescript block', () => {
  const input = '```typescript\nconsole.log("Hello, World!");\n```';
  const expected = 'console.log("Hello, World!");';
  const result = extractTypeScriptCode(input);
  assertEquals(result, expected);
});

Deno.test('extractTypeScriptCode - extracts code from ```ts block', () => {
  const input = '```ts\nconsole.log("Hello, World!");\n```';
  const expected = 'console.log("Hello, World!");';
  const result = extractTypeScriptCode(input);
  assertEquals(result, expected);
});

Deno.test('extractTypeScriptCode - handles multiline code in markdown block', () => {
  const input = `\`\`\`typescript
const message = "Hello";
const greeting = \`\${message}, World!\`;
console.log(greeting);
\`\`\``;
  const expected = `const message = "Hello";
const greeting = \`\${message}, World!\`;
console.log(greeting);`;
  const result = extractTypeScriptCode(input);
  assertEquals(result, expected);
});

Deno.test('extractTypeScriptCode - handles code with leading/trailing whitespace in markdown', () => {
  const input = '  ```typescript\nconsole.log("test");\n```  ';
  const expected = 'console.log("test");';
  const result = extractTypeScriptCode(input);
  assertEquals(result, expected);
});

Deno.test('extractTypeScriptCode - handles code with indentation', () => {
  const input = `\`\`\`typescript
function greet(name: string): void {
  console.log(\`Hello, \${name}!\`);
}
greet("World");
\`\`\``;
  const expected = `function greet(name: string): void {
  console.log(\`Hello, \${name}!\`);
}
greet("World");`;
  const result = extractTypeScriptCode(input);
  assertEquals(result, expected);
});

Deno.test('extractTypeScriptCode - preserves empty lines in code', () => {
  const input = `\`\`\`typescript
const a = 1;

const b = 2;
\`\`\``;
  const expected = `const a = 1;

const b = 2;`;
  const result = extractTypeScriptCode(input);
  assertEquals(result, expected);
});

Deno.test('extractTypeScriptCode - handles complex TypeScript with types and interfaces', () => {
  const input = `\`\`\`typescript
interface User {
  name: string;
  age: number;
}

const user: User = {
  name: "Alice",
  age: 30
};

console.log(JSON.stringify(user));
\`\`\``;
  const expected = `interface User {
  name: string;
  age: number;
}

const user: User = {
  name: "Alice",
  age: 30
};

console.log(JSON.stringify(user));`;
  const result = extractTypeScriptCode(input);
  assertEquals(result, expected);
});

Deno.test('extractTypeScriptCode - does not extract from other language blocks', () => {
  const input = '```javascript\nconsole.log("hello");\n```';
  // Should return as-is since it's not typescript/ts
  const result = extractTypeScriptCode(input);
  assertEquals(result, input);
});

Deno.test('extractTypeScriptCode - handles markdown with extra whitespace after language tag', () => {
  const input = '```typescript  \nconsole.log("test");\n```';
  const expected = 'console.log("test");';
  const result = extractTypeScriptCode(input);
  assertEquals(result, expected);
});

Deno.test('isMarkdownCodeBlock - returns true for typescript block', () => {
  const input = '```typescript\nconsole.log("test");\n```';
  assertEquals(isMarkdownCodeBlock(input), true);
});

Deno.test('isMarkdownCodeBlock - returns true for ts block', () => {
  const input = '```ts\nconsole.log("test");\n```';
  assertEquals(isMarkdownCodeBlock(input), true);
});

Deno.test('isMarkdownCodeBlock - returns false for plain code', () => {
  const input = 'console.log("test");';
  assertEquals(isMarkdownCodeBlock(input), false);
});

Deno.test('isMarkdownCodeBlock - returns false for other language blocks', () => {
  const input = '```javascript\nconsole.log("test");\n```';
  assertEquals(isMarkdownCodeBlock(input), false);
});

Deno.test('isMarkdownCodeBlock - returns false for incomplete markdown', () => {
  const input = '```typescript\nconsole.log("test");';
  assertEquals(isMarkdownCodeBlock(input), false);
});
