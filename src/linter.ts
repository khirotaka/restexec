import { join } from 'jsr:@std/path@^1.0.10';
import { logger } from './utils/logger.ts';
import { ExecutionError, FileNotFoundError, TimeoutError } from './utils/errors.ts';
import { config } from './config.ts';
import type { LintOutput, LintResult } from './types/index.ts';
import { processManager } from './utils/processManager.ts';

// 10MB buffer limit
const MAX_BUFFER = 10 * 1024 * 1024;
const SIGKILL_GRACE_PERIOD_MS = 1000;

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
  const startTime = Date.now();

  // Construct file path
  const filePath = join(workspaceDir, `${codeId}.ts`);

  // Check if file exists
  try {
    await Deno.stat(filePath);
  } catch (_error) {
    logger.error(`File not found: ${filePath}`);
    throw new FileNotFoundError(codeId);
  }

  // Increment active process count
  processManager.increment();
  const activeCount = processManager.getActiveCount();
  logger.info(`Linting code: ${codeId} (timeout: ${timeout}ms, active processes: ${activeCount})`);

  // Execute lint - decrement counter when done
  try {
    return await new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let isTimedOut = false;
      let isKilled = false;
      let isSettled = false; // Prevent multiple resolve/reject calls
      let killTimeoutId: number | undefined; // Track SIGKILL timer for cleanup

      // Build Deno lint command arguments
      const denoArgs = ['lint', '--json', filePath];

      // Whitelist environment variables (minimal for Deno)
      const allowedEnv: Record<string, string> = {};
      const path = Deno.env.get('PATH');
      const denoDir = Deno.env.get('DENO_DIR');
      if (path) allowedEnv.PATH = path;
      if (denoDir) allowedEnv.DENO_DIR = denoDir;

      // Create Deno command
      const command = new Deno.Command(config.deno.path, {
        args: denoArgs,
        cwd: workspaceDir,
        env: allowedEnv,
        stdout: 'piped',
        stderr: 'piped',
        stdin: 'null',
      });

      // Spawn process
      const child = command.spawn();

      // Read stdout
      (async () => {
        const decoder = new TextDecoder();
        for await (const chunk of child.stdout) {
          if (stdout.length > MAX_BUFFER) {
            if (!isSettled) {
              isSettled = true;
              logger.warn(`Lint stdout buffer limit exceeded for ${codeId}, sending SIGTERM`);
              try {
                child.kill('SIGTERM');
                killTimeoutId = setTimeout(() => {
                  try {
                    child.kill('SIGKILL');
                  } catch {
                    // Process might already be terminated
                  }
                }, SIGKILL_GRACE_PERIOD_MS);
              } catch {
                // Ignore if process is already dead
              }
              reject(new ExecutionError('stdout buffer limit exceeded', { maxBuffer: MAX_BUFFER }));
            }
            return;
          }
          stdout += decoder.decode(chunk);
        }
      })();

      // Read stderr
      (async () => {
        const decoder = new TextDecoder();
        for await (const chunk of child.stderr) {
          if (stderr.length > MAX_BUFFER) {
            if (!isSettled) {
              isSettled = true;
              logger.warn(`Lint stderr buffer limit exceeded for ${codeId}, sending SIGTERM`);
              try {
                child.kill('SIGTERM');
                killTimeoutId = setTimeout(() => {
                  try {
                    child.kill('SIGKILL');
                  } catch {
                    // Process might already be terminated
                  }
                }, SIGKILL_GRACE_PERIOD_MS);
              } catch {
                // Ignore if process is already dead
              }
              reject(new ExecutionError('stderr buffer limit exceeded', { maxBuffer: MAX_BUFFER }));
            }
            return;
          }
          stderr += decoder.decode(chunk);
        }
      })();

      // Set up timeout
      const timeoutId = setTimeout(() => {
        isTimedOut = true;
        logger.warn(`Lint timeout for ${codeId}, sending SIGTERM`);
        try {
          child.kill('SIGTERM');
        } catch {
          // Ignore if process is already dead
        }

        // Wait 1 second, then send SIGKILL
        killTimeoutId = setTimeout(() => {
          if (!isKilled) {
            logger.warn(`Lint process did not terminate, sending SIGKILL`);
            try {
              child.kill('SIGKILL');
            } catch {
              // Ignore if process is already dead
            }
          }
        }, SIGKILL_GRACE_PERIOD_MS);
      }, timeout);

      // Wait for process to complete
      (async () => {
        try {
          const status = await child.status;
          isKilled = true;
          clearTimeout(timeoutId);
          if (killTimeoutId !== undefined) {
            clearTimeout(killTimeoutId);
          }

          // Skip if promise is already settled
          if (isSettled) {
            return;
          }

          const executionTime = Date.now() - startTime;
          const code = status.code;
          const signal = status.signal;

          logger.info(`Lint process exited: ${codeId} (code: ${code}, signal: ${signal}, time: ${executionTime}ms)`);

          // Mark as settled before resolving/rejecting
          isSettled = true;

          // Check if timed out
          if (isTimedOut) {
            reject(new TimeoutError(timeout));
            return;
          }

          // Parse result
          try {
            const result = parseLintOutput(stdout, stderr, code, signal, executionTime);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        } catch (error) {
          clearTimeout(timeoutId);
          if (killTimeoutId !== undefined) {
            clearTimeout(killTimeoutId);
          }

          // Skip if promise is already settled
          if (isSettled) {
            return;
          }

          isSettled = true;
          logger.error(`Lint process error for ${codeId}:`, error as Error);
          reject(
            new ExecutionError(`Failed to execute lint process: ${(error as Error).message}`, {
              error: (error as Error).message,
            }),
          );
        }
      })();
    });
  } finally {
    // Always decrement counter when execution completes (success or failure)
    processManager.decrement();
  }
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
