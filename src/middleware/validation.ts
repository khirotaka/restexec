import { Context, Next } from 'hono';
import { config } from '../config.ts';
import type { ExecuteRequest, ApiResponse } from '../types/index.ts';

/**
 * Creates a validation error response
 */
function createValidationError(
  c: Context,
  message: string,
  details: object,
): Response {
  const executionTime = Date.now() - c.get('startTime');
  return c.json<ApiResponse>(
    {
      success: false,
      error: {
        type: 'ValidationError',
        message,
        details,
      },
      executionTime,
    },
    400,
  );
}

/**
 * Validates the execute request body
 */
export async function validateExecuteRequest(
  c: Context,
  next: Next,
): Promise<Response | void> {
  let body: ExecuteRequest;

  try {
    body = await c.req.json();
  } catch {
    return createValidationError(c, 'Invalid JSON body', {});
  }

  const { codeId, timeout } = body;

  // Validate codeId
  if (!codeId) {
    return createValidationError(c, 'codeId is required', { field: 'codeId' });
  }

  if (typeof codeId !== 'string' || codeId.trim() === '') {
    return createValidationError(
      c,
      'codeId must be a non-empty string',
      { field: 'codeId', value: codeId },
    );
  }

  // Prevent path traversal attacks
  if (codeId.includes('/') || codeId.includes('\\') || codeId.includes('..')) {
    return createValidationError(
      c,
      'codeId must not contain path separators or parent directory references',
      { field: 'codeId', value: codeId },
    );
  }

  // Validate codeId format (alphanumeric, hyphens, underscores only)
  if (!/^[a-zA-Z0-9_-]+$/.test(codeId)) {
    return createValidationError(
      c,
      'codeId must contain only alphanumeric characters, hyphens, and underscores',
      { field: 'codeId', value: codeId },
    );
  }

  // Validate timeout if provided
  if (timeout !== undefined) {
    if (typeof timeout !== 'number' || !Number.isInteger(timeout)) {
      return createValidationError(
        c,
        'timeout must be an integer',
        { field: 'timeout', value: timeout },
      );
    }

    if (timeout < 1 || timeout > config.maxTimeout) {
      return createValidationError(
        c,
        `timeout must be between 1 and ${config.maxTimeout}`,
        { field: 'timeout', value: timeout, max: config.maxTimeout },
      );
    }
  }

  // Store validated body in context
  c.set('body', body);

  await next();
}
