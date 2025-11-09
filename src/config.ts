/**
 * Parse comma-separated environment variable into array
 */
function parseArrayEnv(envVar: string | undefined, defaultValue: string[]): string[] {
  if (!envVar || envVar.trim() === '') {
    return defaultValue;
  }
  return envVar.split(',').map(s => s.trim()).filter(s => s !== '');
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
  port: parseInt(process.env.PORT || '3000', 10),
  workspaceDir: process.env.WORKSPACE_DIR || '/workspace',
  toolsDir: process.env.TOOLS_DIR || '/tools',
  defaultTimeout: parseInt(process.env.DEFAULT_TIMEOUT || '5000', 10),
  maxTimeout: parseInt(process.env.MAX_TIMEOUT || '300000', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
  version: '1.0.0',

  // Deno runtime configuration
  deno: {
    path: process.env.DENO_PATH || 'deno',
    importMap: process.env.DENO_IMPORT_MAP || '/workspace/import_map.json',
    permissions: {
      allowRead: parseArrayEnv(process.env.DENO_ALLOW_READ, ['/workspace', '/tools']),
      allowWrite: parseArrayEnv(process.env.DENO_ALLOW_WRITE, []),
      allowNet: parseArrayEnv(process.env.DENO_ALLOW_NET, []),
      allowRun: parseBooleanEnv(process.env.DENO_ALLOW_RUN, false),
    },
  },
} as const;
