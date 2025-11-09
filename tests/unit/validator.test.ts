import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateExecuteRequest } from '../../src/middleware/validation.js';
import type { Request, Response, NextFunction } from 'express';
import type { ExecuteRequest, ApiResponse } from '../../src/types/index.js';

describe('Validator Middleware', () => {
  let mockNext: NextFunction;

  beforeEach(() => {
    mockNext = vi.fn();
  });

  function createMockRequest(body: Partial<ExecuteRequest>): Request<{}, ApiResponse, ExecuteRequest> {
    return {
      body: body as ExecuteRequest,
    } as Request<{}, ApiResponse, ExecuteRequest>;
  }

  function createMockResponse(): Response<ApiResponse> {
    const res = {
      locals: { startTime: Date.now() },
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response<ApiResponse>;
    return res;
  }

  describe('codeId validation', () => {
    it('should accept valid codeId', () => {
      const req = createMockRequest({ codeId: 'test-hello' });
      const res = createMockResponse();

      validateExecuteRequest(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should accept codeId with alphanumeric, hyphens, and underscores', () => {
      const req = createMockRequest({ codeId: 'test_hello-123' });
      const res = createMockResponse();

      validateExecuteRequest(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject missing codeId', () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      validateExecuteRequest(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            type: 'ValidationError',
            message: 'codeId is required',
          }),
        })
      );
    });

    it('should reject empty codeId', () => {
      const req = createMockRequest({ codeId: '' });
      const res = createMockResponse();

      validateExecuteRequest(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'codeId is required',
          }),
        })
      );
    });

    it('should reject codeId with forward slash (path traversal)', () => {
      const req = createMockRequest({ codeId: '../test' });
      const res = createMockResponse();

      validateExecuteRequest(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'codeId must not contain path separators or parent directory references',
          }),
        })
      );
    });

    it('should reject codeId with backslash', () => {
      const req = createMockRequest({ codeId: 'test\\evil' });
      const res = createMockResponse();

      validateExecuteRequest(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should reject codeId with parent directory reference', () => {
      const req = createMockRequest({ codeId: 'test..' });
      const res = createMockResponse();

      validateExecuteRequest(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should reject codeId with special characters', () => {
      const req = createMockRequest({ codeId: 'test@hello' });
      const res = createMockResponse();

      validateExecuteRequest(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'codeId must contain only alphanumeric characters, hyphens, and underscores',
          }),
        })
      );
    });

    it('should reject non-string codeId', () => {
      const req = createMockRequest({ codeId: 123 as any });
      const res = createMockResponse();

      validateExecuteRequest(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('timeout validation', () => {
    it('should accept valid timeout', () => {
      const req = createMockRequest({ codeId: 'test', timeout: 5000 });
      const res = createMockResponse();

      validateExecuteRequest(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should accept request without timeout (use default)', () => {
      const req = createMockRequest({ codeId: 'test' });
      const res = createMockResponse();

      validateExecuteRequest(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject non-integer timeout', () => {
      const req = createMockRequest({ codeId: 'test', timeout: 5000.5 });
      const res = createMockResponse();

      validateExecuteRequest(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'timeout must be an integer',
          }),
        })
      );
    });

    it('should reject non-numeric timeout', () => {
      const req = createMockRequest({ codeId: 'test', timeout: '5000' as any });
      const res = createMockResponse();

      validateExecuteRequest(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should reject timeout less than 1', () => {
      const req = createMockRequest({ codeId: 'test', timeout: 0 });
      const res = createMockResponse();

      validateExecuteRequest(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: expect.stringContaining('timeout must be between'),
          }),
        })
      );
    });

    it('should reject timeout exceeding max timeout', () => {
      const req = createMockRequest({ codeId: 'test', timeout: 999999999 });
      const res = createMockResponse();

      validateExecuteRequest(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: expect.stringContaining('timeout must be between'),
          }),
        })
      );
    });

    it('should accept max timeout value', () => {
      const req = createMockRequest({ codeId: 'test', timeout: 300000 });
      const res = createMockResponse();

      validateExecuteRequest(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
