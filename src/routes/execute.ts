import { Hono } from 'hono';
import type { ExecuteRequest, ApiResponse } from '../types/index.ts';
import { validateExecuteRequest } from '../middleware/validation.ts';
import { executeCode } from '../executor.ts';
import { config } from '../config.ts';

const app = new Hono();

app.post(
  '/execute',
  validateExecuteRequest,
  async (c) => {
    const body: ExecuteRequest = c.get('body');
    const { codeId, timeout = config.defaultTimeout } = body;

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

      return c.json(response);
    } catch (error) {
      throw error; // Will be handled by error handler
    }
  },
);

export default app;
