import { Context } from '@oak/oak';
import { config } from '../config.ts';
import { ValidationError } from '../utils/errors.ts';
import type { ExecuteRequest } from '../types/index.ts';

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

  const { codeId, timeout } = body;

  // Validate codeId
  if (!codeId) {
    throw new ValidationError('codeId is required', { field: 'codeId' });
  }

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

  // Store validated body in state for the next middleware
  ctx.state.body = body;
  await next();
}
