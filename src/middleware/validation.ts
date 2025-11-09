import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import type { ExecuteRequest, ApiResponse } from '../types/index.js';

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
    res.status(400).json({
      success: false,
      error: {
        type: 'ValidationError',
        message: 'codeId is required',
        details: { field: 'codeId' },
      },
      executionTime: Date.now() - startTime,
    });
    return;
  }

  if (typeof codeId !== 'string' || codeId.trim() === '') {
    res.status(400).json({
      success: false,
      error: {
        type: 'ValidationError',
        message: 'codeId must be a non-empty string',
        details: { field: 'codeId', value: codeId },
      },
      executionTime: Date.now() - startTime,
    });
    return;
  }

  // Prevent path traversal attacks
  if (codeId.includes('/') || codeId.includes('\\') || codeId.includes('..')) {
    res.status(400).json({
      success: false,
      error: {
        type: 'ValidationError',
        message: 'codeId must not contain path separators or parent directory references',
        details: { field: 'codeId', value: codeId },
      },
      executionTime: Date.now() - startTime,
    });
    return;
  }

  // Validate codeId format (alphanumeric, hyphens, underscores only)
  if (!/^[a-zA-Z0-9_-]+$/.test(codeId)) {
    res.status(400).json({
      success: false,
      error: {
        type: 'ValidationError',
        message: 'codeId must contain only alphanumeric characters, hyphens, and underscores',
        details: { field: 'codeId', value: codeId },
      },
      executionTime: Date.now() - startTime,
    });
    return;
  }

  // Validate timeout if provided
  if (timeout !== undefined) {
    if (typeof timeout !== 'number' || !Number.isInteger(timeout)) {
      res.status(400).json({
        success: false,
        error: {
          type: 'ValidationError',
          message: 'timeout must be an integer',
          details: { field: 'timeout', value: timeout },
        },
        executionTime: Date.now() - startTime,
      });
      return;
    }

    if (timeout < 1 || timeout > config.maxTimeout) {
      res.status(400).json({
        success: false,
        error: {
          type: 'ValidationError',
          message: `timeout must be between 1 and ${config.maxTimeout}`,
          details: { field: 'timeout', value: timeout, max: config.maxTimeout },
        },
        executionTime: Date.now() - startTime,
      });
      return;
    }
  }

  next();
}
