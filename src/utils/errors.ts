import type { ErrorType } from '../types/index.ts';

/**
 * Base error class for restexec
 */
export class RestExecError extends Error {
  public readonly type: ErrorType;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(type: ErrorType, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.type = type;
    this.statusCode = statusCode;
    this.details = details;
    this.name = this.constructor.name;
  }
}

/**
 * Thrown when the specified code file is not found
 */
export class FileNotFoundError extends RestExecError {
  constructor(codeId: string) {
    super(
      'FileNotFoundError',
      `Code file not found: ${codeId}`,
      404,
      { codeId }
    );
  }
}

/**
 * Thrown when code execution exceeds the timeout limit
 */
export class TimeoutError extends RestExecError {
  constructor(timeout: number) {
    super(
      'TimeoutError',
      `Code execution timed out after ${timeout}ms`,
      408,
      { timeout }
    );
  }
}

/**
 * Thrown when code execution fails
 */
export class ExecutionError extends RestExecError {
  constructor(message: string, details?: unknown) {
    super(
      'ExecutionError',
      message,
      500,
      details
    );
  }
}
