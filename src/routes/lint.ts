import { Router } from '@oak/oak';
import type { ApiResponse, LintRequest } from '../types/index.ts';
import { validateLintRequest } from '../middleware/validation.ts';
import { lintCode } from '../linter.ts';
import { config } from '../config.ts';

const router = new Router();

router.post('/lint', validateLintRequest, async (ctx) => {
  const { codeId, timeout = config.defaultTimeout } = ctx.state.body as LintRequest;

  try {
    // Lint code
    const result = await lintCode({
      codeId,
      timeout,
      workspaceDir: config.workspaceDir,
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
