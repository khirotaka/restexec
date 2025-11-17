/**
 * Environment variable utilities for Deno child processes
 */

/**
 * Build environment variables for Deno child processes
 * Includes system-required variables (PATH, DENO_DIR) and merges user-defined variables
 *
 * System variables (PATH, DENO_DIR) from the parent process take precedence when they exist.
 * If system variables are not present, user-provided values may be used.
 * This design prevents privilege escalation while allowing flexibility in controlled environments.
 *
 * @param userEnv - Optional user-defined environment variables to merge
 * @returns Allowed environment variables object with system variables taking precedence
 */
export function buildAllowedEnv(
  userEnv?: Record<string, string>,
): Record<string, string> {
  const allowedEnv: Record<string, string> = {};

  // Merge user-defined environment variables first
  if (userEnv) {
    Object.assign(allowedEnv, userEnv);
  }

  // System variables take precedence (security-critical)
  // These override any user-provided values to prevent privilege escalation
  const path = Deno.env.get('PATH');
  const denoDir = Deno.env.get('DENO_DIR');
  if (path) allowedEnv.PATH = path;
  if (denoDir) allowedEnv.DENO_DIR = denoDir;

  return allowedEnv;
}
