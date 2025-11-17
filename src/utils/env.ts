/**
 * Environment variable utilities for Deno child processes
 */

/**
 * Build environment variables for Deno child processes
 * Includes system-required variables and merges user-defined variables
 *
 * System variables (PATH, DENO_DIR, HOME, USER, PWD, SHELL, etc.) are inherited from the parent process only.
 * User-provided values for protected keys are ignored to prevent privilege escalation and impersonation attacks.
 * DENO_* prefixed variables are also protected to prevent Deno configuration override.
 * Other safe user-defined variables are merged after filtering protected keys.
 *
 * This design enforces that security-critical environment variables cannot be overridden by user input,
 * maintaining the principle of least privilege and preventing privilege escalation attacks.
 *
 * @param userEnv - Optional user-defined environment variables to merge (protected keys and DENO_* will be ignored)
 * @returns Allowed environment variables object with system variables from parent process and safe user variables
 */
export function buildAllowedEnv(
  userEnv?: Record<string, string>,
): Record<string, string> {
  const allowedEnv: Record<string, string> = {};

  // Protected keys that cannot be overridden by user input
  // These are inherited from parent process only
  // Includes system variables that could be used for privilege escalation or impersonation
  const protectedKeys = new Set([
    'PATH',
    'DENO_DIR',
    'HOME',
    'USER',
    'PWD',
    'SHELL',
    'HOSTNAME',
    'TMPDIR',
    'TEMP',
    'TMP',
  ]);

  // Merge user-defined environment variables, excluding protected keys
  if (userEnv) {
    for (const [key, value] of Object.entries(userEnv)) {
      // Skip protected keys and DENO_* prefixed variables
      if (!protectedKeys.has(key) && !key.startsWith('DENO_')) {
        allowedEnv[key] = value;
      }
    }
  }

  // System variables are always inherited from parent process (security-critical)
  // These cannot be overridden by user input to prevent privilege escalation
  const path = Deno.env.get('PATH');
  const denoDir = Deno.env.get('DENO_DIR');
  if (path) allowedEnv.PATH = path;
  if (denoDir) allowedEnv.DENO_DIR = denoDir;

  return allowedEnv;
}
