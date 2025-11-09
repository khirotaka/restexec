export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  workspaceDir: process.env.WORKSPACE_DIR || '/workspace',
  toolsDir: process.env.TOOLS_DIR || '/tools',
  defaultTimeout: parseInt(process.env.DEFAULT_TIMEOUT || '5000', 10),
  maxTimeout: parseInt(process.env.MAX_TIMEOUT || '300000', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
  version: '1.0.0',
} as const;
