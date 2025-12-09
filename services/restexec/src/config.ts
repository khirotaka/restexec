/**
 * Parse comma-separated environment variable into array
 */
function parseArrayEnv(envVar: string | undefined, defaultValue: string[]): string[] {
  if (!envVar || envVar.trim() === '') {
    return defaultValue;
  }
  return envVar.split(',').map((s) => s.trim()).filter((s) => s !== '');
}

/**
 * Parse boolean environment variable
 */
function parseBooleanEnv(envVar: string | undefined, defaultValue: boolean | undefined): boolean | undefined {
  if (!envVar) {
    return defaultValue;
  }
  return envVar.toLowerCase() === 'true';
}

/**
 * Shared constants used across multiple modules
 */
export const constants = {
  MAX_BUFFER: 10 * 1024 * 1024, // 10MB
  SIGKILL_GRACE_PERIOD_MS: 1000, // 1 second
  MAX_CODE_SIZE: 10 * 1024 * 1024, // 10MB
} as const;

export const config = {
  port: parseInt(Deno.env.get('PORT') || '3000', 10),
  workspaceDir: Deno.env.get('WORKSPACE_DIR') || '/workspace',
  toolsDir: Deno.env.get('TOOLS_DIR') || '/tools',
  defaultTimeout: parseInt(Deno.env.get('DEFAULT_TIMEOUT') || '5000', 10),
  maxTimeout: parseInt(Deno.env.get('MAX_TIMEOUT') || '300000', 10),
  logLevel: Deno.env.get('LOG_LEVEL') || 'info',
  version: '1.0.0',

  // Deno runtime configuration
  deno: {
    path: Deno.env.get('DENO_PATH') || 'deno',
    importMap: Deno.env.get('DENO_IMPORT_MAP') || '/workspace/import_map.json',
    permissions: {
      allowRead: parseArrayEnv(Deno.env.get('DENO_ALLOW_READ'), ['/workspace', '/tools']),
      allowWrite: parseArrayEnv(Deno.env.get('DENO_ALLOW_WRITE'), []),
      allowNet: parseArrayEnv(Deno.env.get('DENO_ALLOW_NET'), []),
      allowRun: parseBooleanEnv(Deno.env.get('DENO_ALLOW_RUN'), false),
    },
  },

  // Authentication & Authorization
  auth: {
    enabled: parseBooleanEnv(Deno.env.get('AUTH_ENABLED'), undefined), // undefined means not set
    apiKey: Deno.env.get('AUTH_API_KEY') || '',
    trustedProxyIPs: parseArrayEnv(Deno.env.get('AUTH_TRUSTED_PROXY_IPS'), []),
    rateLimit: {
      enabled: parseBooleanEnv(Deno.env.get('AUTH_RATE_LIMIT_ENABLED'), true),
      maxAttempts: parseInt(Deno.env.get('AUTH_RATE_LIMIT_MAX_ATTEMPTS') || '5', 10),
      windowMs: parseInt(Deno.env.get('AUTH_RATE_LIMIT_WINDOW_MS') || '60000', 10),
      trustProxy: parseBooleanEnv(Deno.env.get('AUTH_RATE_LIMIT_TRUST_PROXY'), false),
    },
  },
} as const;

// Startup validation
export function validateAuthConfig() {
  // Check if AUTH_ENABLED is explicitly set
  // Note: parseBooleanEnv returns defaultValue if env is not set.
  // We used 'undefined' as default value above (which is technically not boolean but handled by the any/unknown nature of env var parsing usually,
  // but to be type safe let's adjust the logic slightly or check the raw env var here).
  // Actually, let's check the raw env var here for the "explicitly set" requirement.
  const rawAuthEnabled = Deno.env.get('AUTH_ENABLED');
  if (rawAuthEnabled === undefined) {
    console.error('[ERROR] AUTH_ENABLED must be explicitly set to "true" or "false"');
    Deno.exit(1);
  }

  if (config.auth.enabled) {
    if (!config.auth.apiKey) {
      console.error('[ERROR] AUTH_ENABLED is true but AUTH_API_KEY is not set');
      Deno.exit(1);
    }
    if (config.auth.apiKey.length < 32) {
      console.error(
        `[ERROR] AUTH_API_KEY must be at least 32 characters long (current: ${config.auth.apiKey.length})`,
      );
      Deno.exit(1);
    }
  }
}
