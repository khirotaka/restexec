/**
 * Environment variable utilities for Deno child processes
 */

/**
 * Build environment variables for Deno child processes
 * Includes system-required variables (PATH, DENO_DIR) and merges user-defined variables
 *
 * @param userEnv - Optional user-defined environment variables to merge
 * @returns Allowed environment variables object
 */
export function buildAllowedEnv(
  userEnv?: Record<string, string>,
): Record<string, string> {
  // Whitelist environment variables (minimal for Deno)
  const allowedEnv: Record<string, string> = {};

  // System-required environment variables
  const path = Deno.env.get('PATH');
  const denoDir = Deno.env.get('DENO_DIR');
  if (path) allowedEnv.PATH = path;
  if (denoDir) allowedEnv.DENO_DIR = denoDir;

  // Merge user-defined environment variables
  if (userEnv) {
  // System-required environment variables (these should NOT be overridden)
  const path = Deno.env.get('PATH');
  const denoDir = Deno.env.get('DENO_DIR');

  // Merge user-defined environment variables first
  if (userEnv) {
    Object.assign(allowedEnv, userEnv);
  }

  // System variables take precedence (override user values if present)
  if (path) allowedEnv.PATH = path;
  if (denoDir) allowedEnv.DENO_DIR = denoDir;
  }

  return allowedEnv;
}
