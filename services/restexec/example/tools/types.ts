/**
 * Common Type Definitions
 *
 * Shared types that can be used across different workspace scripts.
 */

export interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}

export interface ApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
  timestamp: string;
}

export type ValidationResult = Result<string[]>;

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';
