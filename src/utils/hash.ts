/**
 * Hash utility functions for file integrity verification
 */

/**
 * Calculate SHA-256 hash of a string
 * @param content - The string content to hash
 * @returns Promise<string> - The SHA-256 hash in hexadecimal format
 */
export async function calculateSHA256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex;
}
