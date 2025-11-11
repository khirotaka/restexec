// Request types
export interface ExecuteRequest {
  codeId: string;
  timeout?: number;
}

export interface LintRequest {
  codeId: string;
  timeout?: number;
}

export interface WorkspaceSaveRequest {
  codeId: string;
  code: string;
}

export interface WorkspaceSaveResult {
  codeId: string;
  filePath: string;
  size: number;
}

// Response types
export interface SuccessResponse {
  success: true;
  result: unknown;
  executionTime: number;
}

export interface ErrorResponse {
  success: false;
  error: {
    type: ErrorType;
    message: string;
    details?: unknown;
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

// Lint types
export interface LintDiagnostic {
  code: string;
  message: string;
  range: {
    start: { line: number; col: number };
    end: { line: number; col: number };
  };
  filename: string;
  hint?: string;
}

export interface LintOutput {
  version: number;
  diagnostics: LintDiagnostic[];
  errors: unknown[];
  checkedFiles?: string[];
}

export interface LintResult {
  success: true;
  output: LintOutput;
  exitCode: number | null;
  signal: Deno.Signal | null;
  executionTime: number;
}

// Logger types
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  level: LogLevel;
}
