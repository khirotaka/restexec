import { Router } from '@oak/oak';
import type { ApiResponse, ExecuteRequest } from '../types/index.ts';
import { validateExecuteRequest } from '../middleware/validation.ts';
import { executeCode } from '../executor.ts';
import { config } from '../config.ts';

const router = new Router();

router.post('/execute', validateExecuteRequest, async (ctx) => {
  const { codeId, timeout = config.defaultTimeout, env } = ctx.state.body as ExecuteRequest;

  try {
    // Execute code
    const result = await executeCode({
      codeId,
      timeout,
      workspaceDir: config.workspaceDir,
      env,
    });

    const response: ApiResponse = {
      success: true,
      result: result.output,
      executionTime: result.executionTime,
    };

    ctx.response.body = response;
  } catch (error) {
    // Error will be handled by error middleware
    throw error;
  }
});

export default router;
