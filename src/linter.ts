import { join } from '@std/path';
import { logger } from './utils/logger.ts';
import { ExecutionError, FileNotFoundError } from './utils/errors.ts';
import { config } from './config.ts';
import type { LintOutput, LintResult } from './types/index.ts';
import { runProcess } from './utils/processRunner.ts';

export interface LintOptions {
  codeId: string;
  timeout: number;
  workspaceDir: string;
}

/**
 * Lint TypeScript code using Deno's built-in linter.
 *
 * The linter is executed with the --json flag to produce structured output.
 */
export async function lintCode(options: LintOptions): Promise<LintResult> {
  const { codeId, timeout, workspaceDir } = options;

  // Construct file path
  const filePath = join(workspaceDir, `${codeId}.ts`);

  // Check if file exists
  try {
    await Deno.stat(filePath);
  } catch (_error) {
    logger.error(`File not found: ${filePath}`);
    throw new FileNotFoundError(codeId);
  }

  // Build Deno lint command arguments
  const denoArgs = ['lint', '--json', filePath];

  // Execute process with common runner (env merging is handled by runProcess)
  const result = await runProcess({
    codeId,
    timeout,
    cmd: config.deno.path,
    args: denoArgs,
    cwd: workspaceDir,
    logContext: 'Linting',
  });

  // Parse and return lint result
  return parseLintOutput(
    result.stdout,
    result.stderr,
    result.exitCode,
    result.signal,
    result.executionTime,
  );
}

/**
 * Parse lint output and construct lint result
 */
function parseLintOutput(
  stdout: string,
  stderr: string,
  exitCode: number,
  signal: Deno.Signal | null,
  executionTime: number,
): LintResult {
  // If process was killed by signal, treat as error
  if (signal !== null) {
    throw new ExecutionError(`Lint process killed by signal: ${signal}`, {
      signal,
      stderr: stderr.trim(),
    });
  }

  // For deno lint, exit code 0 means no issues, exit code 1 means issues found
  // Both are considered successful lint operations
  if (exitCode !== 0 && exitCode !== 1) {
    throw new ExecutionError(`Lint process exited with code ${exitCode}`, {
      exitCode,
      stderr: stderr.trim(),
      stdout: stdout.trim(),
    });
  }

  let output: LintOutput;
  try {
    const trimmedOutput = stdout.trim();
    if (!trimmedOutput) {
      // Empty output means no issues found
      output = {
        version: 1,
        diagnostics: [],
        errors: [],
        checkedFiles: [],
      };
    } else {
      const parsed = JSON.parse(trimmedOutput);

      // Normalize the output structure
      output = {
        version: parsed.version || 1,
        diagnostics: parsed.diagnostics || [],
        errors: parsed.errors || [],
        checkedFiles: parsed.checkedFiles || [],
      };
    }
  } catch (error) {
    logger.error(`Failed to parse lint JSON output: ${(error as Error).message}`);
    throw new ExecutionError('Failed to parse lint output as JSON', {
      error: (error as Error).message,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    });
  }

  return {
    success: true,
    output,
    exitCode,
    signal,
    executionTime,
  };
}
