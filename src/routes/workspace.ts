import { Router } from '@oak/oak';
import { join } from 'jsr:@std/path@1.0.8';
import type { ApiResponse, WorkspaceSaveRequest, WorkspaceSaveResult } from '../types/index.ts';
import { validateWorkspaceSaveRequest } from '../middleware/validation.ts';
import { config } from '../config.ts';
import { logger } from '../utils/logger.ts';

const router = new Router();

/**
 * Saves TypeScript code to workspace directory
 */
router.put('/workspace', validateWorkspaceSaveRequest, async (ctx) => {
  const { codeId, code } = ctx.state.body as WorkspaceSaveRequest;

  try {
    // Construct file path
    const fileName = `${codeId}.ts`;
    const filePath = join(config.workspaceDir, fileName);

    // Write to temporary file first for atomicity
    const tempFilePath = `${filePath}.tmp`;

    logger.info(`Saving code to workspace`, { codeId, size: code.length, path: filePath });

    // Write to temporary file
    await Deno.writeTextFile(tempFilePath, code);

    // Check if file exists (for logging overwrite operations)
    let isOverwrite = false;
    try {
      await Deno.stat(filePath);
      isOverwrite = true;
      logger.warn(`Overwriting existing file`, { codeId, path: filePath });
    } catch {
      // File doesn't exist, this is a new file
    }

    // Atomic rename
    await Deno.rename(tempFilePath, filePath);

    // Get file stats for response
    const fileInfo = await Deno.stat(filePath);

    logger.info(`Code saved successfully`, {
      codeId,
      path: filePath,
      size: fileInfo.size,
      isOverwrite,
    });

    const result: WorkspaceSaveResult = {
      codeId,
      filePath,
      size: fileInfo.size,
    };

    const response: ApiResponse = {
      success: true,
      result,
      executionTime: 0, // Not applicable for file save operations
    };

    ctx.response.status = 200;
    ctx.response.body = response;
  } catch (error) {
    // Error will be handled by error middleware
    logger.error(`Failed to save code to workspace`, {
      codeId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
});

export default router;
