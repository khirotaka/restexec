import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import type { ExecuteRequest, ApiResponse } from '../types/index.js';

/**
 * Creates a validation error response
 */
function createValidationError(
  res: Response<ApiResponse>,
  message: string,
  details: object,
  startTime: number
): void {
  res.status(400).json({
    success: false,
    error: {
      type: 'ValidationError',
      message,
      details,
    },
    executionTime: Date.now() - startTime,
  });
}

/**
 * Validates the execute request body
 */
export function validateExecuteRequest(
  req: Request<{}, ApiResponse, ExecuteRequest>,
  res: Response<ApiResponse>,
  next: NextFunction
): void {
  const startTime = Date.now();
  const { codeId, timeout } = req.body;

  // Validate codeId
  if (!codeId) {
    return createValidationError(res, 'codeId is required', { field: 'codeId' }, startTime);
  }

  if (typeof codeId !== 'string' || codeId.trim() === '') {
    return createValidationError(
      res,
      'codeId must be a non-empty string',
      { field: 'codeId', value: codeId },
      startTime
    );
  }

  // Prevent path traversal attacks
  if (codeId.includes('/') || codeId.includes('\\') || codeId.includes('..')) {
    return createValidationError(
      res,
      'codeId must not contain path separators or parent directory references',
      { field: 'codeId', value: codeId },
      startTime
    );
  }

  // Validate codeId format (alphanumeric, hyphens, underscores only)
  if (!/^[a-zA-Z0-9_-]+$/.test(codeId)) {
    return createValidationError(
      res,
      'codeId must contain only alphanumeric characters, hyphens, and underscores',
      { field: 'codeId', value: codeId },
      startTime
    );
  }

  // Validate timeout if provided
  if (timeout !== undefined) {
    if (typeof timeout !== 'number' || !Number.isInteger(timeout)) {
      return createValidationError(
        res,
        'timeout must be an integer',
        { field: 'timeout', value: timeout },
        startTime
      );
    }

    if (timeout < 1 || timeout > config.maxTimeout) {
      return createValidationError(
        res,
        `timeout must be between 1 and ${config.maxTimeout}`,
        { field: 'timeout', value: timeout, max: config.maxTimeout },
        startTime
      );
    }
  }

  next();
}
