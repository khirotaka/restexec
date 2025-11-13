import { Router } from '@oak/oak';
import { join } from 'jsr:@std/path@^1.0.0';
import type { ApiResponse, WorkspaceSaveRequest, WorkspaceSaveResult } from '../types/index.ts';
import { validateWorkspaceSaveRequest } from '../middleware/validation.ts';
import { config } from '../config.ts';
import { logger } from '../utils/logger.ts';
import { extractTypeScriptCode, isMarkdownCodeBlock } from '../utils/codeExtractor.ts';
import { calculateSHA256 } from '../utils/hash.ts';

const router = new Router();

/**
 * Saves TypeScript code to workspace directory
 */
router.put('/workspace', validateWorkspaceSaveRequest, async (ctx) => {
  const startTime = Date.now();
  const { codeId, code } = ctx.state.body as WorkspaceSaveRequest;

  try {
    // Extract TypeScript code from markdown blocks if present
    const isMarkdown = isMarkdownCodeBlock(code);
    const extractedCode = extractTypeScriptCode(code);

    // Calculate byte sizes for logging
    const encoder = new TextEncoder();
    const codeBytes = encoder.encode(code).length;
    const extractedBytes = encoder.encode(extractedCode).length;

    // Construct file path
    const fileName = `${codeId}.ts`;
    const filePath = join(config.workspaceDir, fileName);

    // Write to temporary file first for atomicity
    const tempFilePath = `${filePath}.tmp`;

    logger.info(
      `Saving code to workspace: ${codeId} (size: ${codeBytes} bytes, extracted: ${extractedBytes} bytes, markdown: ${isMarkdown}, path: ${filePath})`,
    );

    // Write to temporary file (use extracted code)
    await Deno.writeTextFile(tempFilePath, extractedCode);

    // Check if file exists (for logging overwrite operations)
    let isOverwrite = false;
    try {
      await Deno.stat(filePath);
      isOverwrite = true;
      logger.warn(`Overwriting existing file: ${codeId} (path: ${filePath})`);
    } catch {
      // File doesn't exist, this is a new file
    }

    // Atomic rename
    await Deno.rename(tempFilePath, filePath);

    // Get file stats for response
    const fileInfo = await Deno.stat(filePath);

    // Calculate SHA-256 hash for logging
    const sha256 = await calculateSHA256(extractedCode);

    logger.info(
      `Code saved successfully: ${codeId} (path: ${filePath}, size: ${fileInfo.size}, sha256: ${sha256}, overwrite: ${isOverwrite})`,
    );

    const result: WorkspaceSaveResult = {
      codeId,
      filePath,
      size: fileInfo.size,
    };

    const executionTime = Date.now() - startTime;

    const response: ApiResponse = {
      success: true,
      result,
      executionTime,
    };

    ctx.response.status = 200;
    ctx.response.body = response;
  } catch (error) {
    // Error will be handled by error middleware
    logger.error(
      `Failed to save code to workspace: ${codeId}`,
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
});

export default router;
