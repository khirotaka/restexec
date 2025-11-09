import { Context } from '@oak/oak';
import { config } from '../config.ts';
import type { ExecuteRequest, ApiResponse } from '../types/index.ts';

/**
 * Creates a validation error response
 */
function createValidationError(ctx: Context, message: string, details: object): void {
  const executionTime = Date.now() - ctx.state.startTime;
  ctx.response.status = 400;
  ctx.response.body = {
    success: false,
    error: {
      type: 'ValidationError',
      message,
      details,
    },
    executionTime,
  } satisfies ApiResponse;
}

/**
 * Validates the execute request body
 */
export async function validateExecuteRequest(ctx: Context, next: () => Promise<unknown>): Promise<void> {
  const body = await ctx.request.body.json() as ExecuteRequest;
  const { codeId, timeout } = body;

  // Validate codeId
  if (!codeId) {
    return createValidationError(ctx, 'codeId is required', { field: 'codeId' });
  }

  if (typeof codeId !== 'string' || codeId.trim() === '') {
    return createValidationError(ctx, 'codeId must be a non-empty string', { field: 'codeId', value: codeId });
  }

  // Prevent path traversal attacks
  if (codeId.includes('/') || codeId.includes('\\') || codeId.includes('..')) {
    return createValidationError(
      ctx,
      'codeId must not contain path separators or parent directory references',
      { field: 'codeId', value: codeId },
    );
  }

  // Validate codeId format (alphanumeric, hyphens, underscores only)
  if (!/^[a-zA-Z0-9_-]+$/.test(codeId)) {
    return createValidationError(
      ctx,
      'codeId must contain only alphanumeric characters, hyphens, and underscores',
      { field: 'codeId', value: codeId },
    );
  }

  // Validate timeout if provided
  if (timeout !== undefined) {
    if (typeof timeout !== 'number' || !Number.isInteger(timeout)) {
      return createValidationError(ctx, 'timeout must be an integer', { field: 'timeout', value: timeout });
    }

    if (timeout < 1 || timeout > config.maxTimeout) {
      return createValidationError(ctx, `timeout must be between 1 and ${config.maxTimeout}`, {
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
