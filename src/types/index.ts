// Request types
export interface ExecuteRequest {
  codeId: string;
  timeout?: number;
}

// Response types
export interface SuccessResponse {
  success: true;
  result: any;
  executionTime: number;
}

export interface ErrorResponse {
  success: false;
  error: {
    type: ErrorType;
    message: string;
    details?: any;
  };
  executionTime?: number;
}

export type ApiResponse = SuccessResponse | ErrorResponse;

// Error types
export type ErrorType =
  | 'ValidationError'
  | 'FileNotFoundError'
  | 'TimeoutError'
  | 'ExecutionError'
  | 'InternalError';

// Health check types
export interface HealthResponse {
  status: 'ok';
  uptime: number;
  activeProcesses: number;
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  version: string;
}

// Process execution types
export interface ExecutionResult {
  success: true;
  output: object;
  exitCode: number | null;
  signal: Deno.Signal | null;
  executionTime: number;
}

// Logger types
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  level: LogLevel;
}
