import { Router, Request, Response } from 'express';
import type { ExecuteRequest, ApiResponse } from '../types/index.js';
import { validateExecuteRequest } from '../middleware/validation.js';
import { executeCode } from '../executor.js';
import { config } from '../config.js';
import { RestExecError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.post('/execute', validateExecuteRequest, async (req: Request<{}, ApiResponse, ExecuteRequest>, res: Response<ApiResponse>) => {
  const startTime = Date.now();
  const { codeId, timeout = config.defaultTimeout } = req.body;

  try {
    // Execute code
    const result = await executeCode({
      codeId,
      timeout,
      workspaceDir: config.workspaceDir,
      toolsDir: config.toolsDir,
    });

    // Parse the JSON output
    const parsedOutput = JSON.parse(result.output);

    const response: ApiResponse = {
      success: true,
      result: parsedOutput,
      executionTime: result.executionTime,
    };

    res.json(response);
  } catch (error) {
    logger.error(`Execution failed for ${codeId}:`, error instanceof Error ? error : undefined);

    // Handle RestExecError
    if (error instanceof RestExecError) {
      const errorResponse: ApiResponse = {
        success: false,
        error: {
          type: error.type,
          message: error.message,
          details: error.details,
        },
        executionTime: Date.now() - startTime,
      };

      res.status(error.statusCode).json(errorResponse);
      return;
    }

    // Handle unexpected errors
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
