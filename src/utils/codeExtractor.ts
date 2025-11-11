/**
 * Code Extraction Utility
 *
 * Extracts TypeScript code from markdown code blocks or returns plain code as-is.
 * This is designed to handle LLM-generated responses that may wrap code in markdown.
 */

/**
 * Extracts TypeScript code from a string that may contain markdown code blocks.
 *
 * Supported formats:
 * 1. Plain TypeScript code (returned as-is)
 * 2. Code wrapped in ```typescript
 * 3. Code wrapped in ```ts
 *
 * @param input - The input string that may contain TypeScript code
 * @returns Extracted TypeScript code
 *
 * @example
 * // Plain code
 * extractTypeScriptCode('console.log("hello");')
 * // Returns: 'console.log("hello");'
 *
 * @example
 * // Markdown wrapped code
 * extractTypeScriptCode('```typescript\nconsole.log("hello");\n```')
 * // Returns: 'console.log("hello");'
 */
export function extractTypeScriptCode(input: string): string {
  // Trim whitespace
  const trimmed = input.trim();

  // Pattern to match markdown code blocks with typescript or ts language identifier
  // Matches: ```typescript\n...code...\n``` or ```ts\n...code...\n```
  const markdownPattern = /^```(?:typescript|ts)\s*\n([\s\S]*?)\n```\s*$/;

  const match = trimmed.match(markdownPattern);

  if (match) {
    // Extract the code between the fence markers
    return match[1];
  }

  // If no markdown block found, return the input as-is (it's already plain code)
  return input;
}

/**
 * Checks if the input contains a markdown code block
 *
 * @param input - The input string to check
 * @returns true if input contains a markdown code block, false otherwise
 */
export function isMarkdownCodeBlock(input: string): boolean {
  const trimmed = input.trim();
  const markdownPattern = /^```(?:typescript|ts)\s*\n[\s\S]*?\n```\s*$/;
  return markdownPattern.test(trimmed);
}
