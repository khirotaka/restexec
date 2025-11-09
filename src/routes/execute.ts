import { Router, Request, Response, NextFunction } from 'express';
import type { ExecuteRequest, ApiResponse } from '../types/index.js';
import { validateExecuteRequest } from '../middleware/validation.js';
import { executeCode } from '../executor.js';
import { config } from '../config.js';

const router = Router();

router.post(
  '/execute',
  validateExecuteRequest,
  async (req: Request<{}, ApiResponse, ExecuteRequest>, res: Response<ApiResponse>, next: NextFunction) => {
    const { codeId, timeout = config.defaultTimeout } = req.body;

    try {
      // Execute code
      const result = await executeCode({
        codeId,
        timeout,
        workspaceDir: config.workspaceDir,
      });

      const response: ApiResponse = {
        success: true,
        result: result.output,
        executionTime: result.executionTime,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
