/**
 * Security-related constants
 */

/**
 * List of forbidden environment variable keys that cannot be set by users.
 * These are system-critical environment variables that must be protected
 * from user override to prevent:
 * - PATH injection attacks
 * - Execution environment manipulation
 * - Security bypasses
 *
 * This list is used by:
 * - validation.ts: To reject requests with forbidden env keys
 * - processRunner.ts: To filter out forbidden keys before process execution
 */
export const FORBIDDEN_ENV_KEYS = [
  'PATH', // System executable search path - critical for security
  'DENO_DIR', // Deno cache directory - affects module resolution
  'HOME', // User home directory - affects file access
  'USER', // Current user - affects permissions
  'PWD', // Current working directory - affects relative paths
  'SHELL', // Shell executable - affects subprocess behavior
  'HOSTNAME', // System hostname - system information
  'TMPDIR', // Temporary directory - affects temp file location
  'TEMP', // Temporary directory (Windows) - affects temp file location
  'TMP', // Temporary directory (alternative) - affects temp file location
] as const;

/**
 * Type-safe list of forbidden environment variable keys
 */
export type ForbiddenEnvKey = typeof FORBIDDEN_ENV_KEYS[number];
