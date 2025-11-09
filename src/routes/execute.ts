import { Router, Request, Response } from 'express';
import type { ExecuteRequest, ApiResponse } from '../types/index.js';
import { validateExecuteRequest } from '../middleware/validation.js';

const router = Router();

router.post('/execute', validateExecuteRequest, async (req: Request<{}, ApiResponse, ExecuteRequest>, res: Response<ApiResponse>) => {
  const startTime = Date.now();

  try {
    // This will be implemented in the next phase
    const result = {
      success: true as const,
      result: {
        message: 'Execution engine not yet implemented',
        codeId: req.body.codeId,
      },
      executionTime: Date.now() - startTime,
    };

    res.json(result);
  } catch (error) {
    const errorResponse: ApiResponse = {
      success: false,
      error: {
        type: 'InternalError',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      executionTime: Date.now() - startTime,
    };

    res.status(500).json(errorResponse);
  }
});

export default router;
