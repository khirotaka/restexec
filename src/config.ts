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
function parseBooleanEnv(envVar: string | undefined, defaultValue: boolean): boolean {
  if (!envVar) {
    return defaultValue;
  }
  return envVar.toLowerCase() === 'true';
}

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
} as const;
