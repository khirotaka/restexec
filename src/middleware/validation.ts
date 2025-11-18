import { Context } from '@oak/oak';
import { config, constants } from '../config.ts';
import { ValidationError } from '../utils/errors.ts';
import type { ExecuteRequest, LintRequest, WorkspaceSaveRequest } from '../types/index.ts';
import { FORBIDDEN_ENV_KEYS } from '../constants/security.ts';

/**
 * Validates codeId field
 * @param codeId - The code identifier to validate
 * @param options - Optional validation options
 * @throws {ValidationError} If validation fails
 * @param options - Optional validation options
 * @throws {ValidationError} If validation fails
 */
function validateCodeId(codeId: unknown, options?: { maxLength?: number }): void {
  // Validate codeId presence
  if (!codeId) {
    throw new ValidationError('codeId is required', { field: 'codeId' });
  }

  // Validate codeId type and non-empty
  if (typeof codeId !== 'string' || codeId.trim() === '') {
    throw new ValidationError('codeId must be a non-empty string', { field: 'codeId', value: codeId });
  }

  // Prevent path traversal attacks
  if (codeId.includes('/') || codeId.includes('\\') || codeId.includes('..')) {
    throw new ValidationError(
      'codeId must not contain path separators or parent directory references',
      { field: 'codeId', value: codeId },
    );
  }

  // Validate codeId format (alphanumeric, hyphens, underscores only)
  if (!/^[a-zA-Z0-9_-]+$/.test(codeId)) {
    throw new ValidationError(
      'codeId must contain only alphanumeric characters, hyphens, and underscores',
      { field: 'codeId', value: codeId },
    );
  }

  // Validate codeId length if maxLength is specified
  if (options?.maxLength && codeId.length > options.maxLength) {
    throw new ValidationError(
      `codeId must not exceed ${options.maxLength} characters`,
      { field: 'codeId', value: codeId, maxLength: options.maxLength },
    );
  }
}

/**
 * Validates timeout field
 * @param timeout - The timeout value to validate (optional)
 * @param timeout - The timeout value to validate (optional)
 * @throws {ValidationError} If validation fails
 */
function validateTimeout(timeout: unknown): void {
  // Validate timeout if provided
  if (timeout !== undefined) {
    if (typeof timeout !== 'number' || !Number.isInteger(timeout)) {
      throw new ValidationError('timeout must be an integer', { field: 'timeout', value: timeout });
    }

    if (timeout < 1 || timeout > config.maxTimeout) {
      throw new ValidationError(`timeout must be between 1 and ${config.maxTimeout}`, {
        field: 'timeout',
        value: timeout,
        max: config.maxTimeout,
      });
    }
  }
}

/**
 * Validates environment variables
 * @param env - The environment variables object to validate
 * @throws {ValidationError} If validation fails
 */
function validateEnv(env: unknown): void {
  if (env === undefined || env === null) {
    return; // env is optional
  }

  if (typeof env !== 'object' || Array.isArray(env)) {
    throw new ValidationError('env must be an object', { field: 'env', value: typeof env });
  }

  const envRecord = env as Record<string, unknown>;
  const entries = Object.entries(envRecord);

  // Check number of environment variables
  const MAX_ENV_COUNT = 50;
  if (entries.length > MAX_ENV_COUNT) {
    throw new ValidationError(
      `env must not exceed ${MAX_ENV_COUNT} entries`,
      { field: 'env', count: entries.length, max: MAX_ENV_COUNT },
    );
  }

  // Check for reserved/forbidden environment variable names
  let totalSize = 0;
  const MAX_TOTAL_SIZE = 10 * 1024; // 10KB

  for (const [key, value] of entries) {
    // Validate key format
    if (!/^[A-Z0-9_]+$/.test(key)) {
      throw new ValidationError(
        'env keys must contain only uppercase letters, numbers, and underscores',
        { field: 'env', key, pattern: '/^[A-Z0-9_]+$/' },
      );
    }

    // Check for forbidden keys
    const forbiddenKeys = FORBIDDEN_ENV_KEYS as readonly string[];
    if (forbiddenKeys.includes(key) || key.startsWith('DENO_')) {
      throw new ValidationError(
        `env key "${key}" is forbidden`,
        { field: 'env', key, reason: 'reserved system variable' },
      );
    }

    // Validate value type
    if (typeof value !== 'string') {
      throw new ValidationError(
        'env values must be strings',
        { field: 'env', key, value: typeof value },
      );
    }

    // Validate value length
    const MAX_VALUE_LENGTH = 1000;
    if (value.length > MAX_VALUE_LENGTH) {
      throw new ValidationError(
        `env value for "${key}" exceeds maximum length`,
        { field: 'env', key, length: value.length, max: MAX_VALUE_LENGTH },
      );
    }

    // Accumulate total size
    totalSize += key.length + value.length;
  }

  // Check total size
  if (totalSize > MAX_TOTAL_SIZE) {
    throw new ValidationError(
      'env total size exceeds maximum allowed size',
      { field: 'env', size: totalSize, max: MAX_TOTAL_SIZE },
    );
  }
}

/**
 * Validates the execute request body
 */
export async function validateExecuteRequest(ctx: Context, next: () => Promise<unknown>): Promise<void> {
  // Parse JSON with error handling
  let body: ExecuteRequest;
  try {
    body = await ctx.request.body.json() as ExecuteRequest;
  } catch (error) {
    throw new ValidationError(
      'Invalid JSON in request body',
      { error: error instanceof Error ? error.message : String(error) },
    );
  }

  const { codeId, timeout, env } = body;

  // Validate using helper functions
  validateCodeId(codeId);
  validateTimeout(timeout);
  validateEnv(env);

  // Store validated body in state for the next middleware
  ctx.state.body = body;
  await next();
}

/**
 * Validates the lint request body
 * Uses the same validation rules as execute request
 */
export async function validateLintRequest(ctx: Context, next: () => Promise<unknown>): Promise<void> {
  // Parse JSON with error handling
  let body: LintRequest;
  try {
    body = await ctx.request.body.json() as LintRequest;
  } catch (error) {
    throw new ValidationError(
      'Invalid JSON in request body',
      { error: error instanceof Error ? error.message : String(error) },
    );
  }

  const { codeId, timeout } = body;

  // Validate using helper functions
  validateCodeId(codeId);
  validateTimeout(timeout);

  // Store validated body in state for the next middleware
  ctx.state.body = body;
  await next();
}

/**
 * Validates the workspace save request body
 */
export async function validateWorkspaceSaveRequest(ctx: Context, next: () => Promise<unknown>): Promise<void> {
  // Parse JSON with error handling
  let body: WorkspaceSaveRequest;
  try {
    body = await ctx.request.body.json() as WorkspaceSaveRequest;
  } catch (error) {
    throw new ValidationError(
      'Invalid JSON in request body',
      { error: error instanceof Error ? error.message : String(error) },
    );
  }

  const { codeId, code } = body;

  // Validate codeId with max length constraint
  validateCodeId(codeId, { maxLength: 255 });

  // Validate code
  if (code === undefined || code === null) {
    throw new ValidationError('code is required', { field: 'code' });
  }

  if (typeof code !== 'string') {
    throw new ValidationError('code must be a string', { field: 'code', value: typeof code });
  }

  if (code.trim() === '') {
    throw new ValidationError('code must not be empty', { field: 'code' });
  }

  // Validate code size (10MB limit)
  const encoder = new TextEncoder();
  const codeBytes = encoder.encode(code);
  if (codeBytes.length > constants.MAX_CODE_SIZE) {
    throw new ValidationError(
      'Code size exceeds maximum allowed size',
      { field: 'code', maxSize: constants.MAX_CODE_SIZE, actualSize: codeBytes.length },
    );
  }

  // Store validated body in state for the next middleware
  ctx.state.body = body;
  await next();
}
