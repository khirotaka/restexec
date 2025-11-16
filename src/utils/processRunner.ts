import { logger } from './logger.ts';
import { ExecutionError, TimeoutError } from './errors.ts';
import { processManager } from './processManager.ts';

/**
 * Maximum buffer size for stdout/stderr (10MB)
 */
export const MAX_BUFFER = 10 * 1024 * 1024;

/**
 * Grace period before sending SIGKILL after SIGTERM (1 second)
 */
export const SIGKILL_GRACE_PERIOD_MS = 1000;

/**
 * Process execution result containing raw output and metadata
 */
export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal: Deno.Signal | null;
  executionTime: number;
}

/**
 * Options for running a process
 */
export interface ProcessRunOptions {
  /** Identifier for logging purposes */
  codeId: string;
  /** Timeout in milliseconds */
  timeout: number;
  /** Deno command to execute */
  command: Deno.Command;
  /** Optional context for logging (e.g., "Executing", "Linting") */
  logContext?: string;
}

/**
 * Run a Deno command with common safeguards:
 * - Buffer limit enforcement (10MB for stdout/stderr)
 * - Timeout with SIGTERM → SIGKILL escalation
 * - Process count tracking via processManager
 * - Comprehensive error handling
 *
 * This function handles the low-level process execution logic
 * shared by executeCode and lintCode. Callers are responsible
 * for parsing the raw output into their specific result formats.
 *
 * @param options Process execution options
 * @returns Promise resolving to raw process output and metadata
 * @throws TimeoutError if process exceeds timeout
 * @throws ExecutionError if buffer limits exceeded or process fails
 */
export async function runProcess(
  options: ProcessRunOptions,
): Promise<ProcessResult> {
  const { codeId, timeout, command, logContext = 'Executing' } = options;
  const startTime = Date.now();

  // Increment active process count
  processManager.increment();
  const activeCount = processManager.getActiveCount();
  logger.info(`${logContext} code: ${codeId} (timeout: ${timeout}ms, active processes: ${activeCount})`);

  // Execute process - decrement counter when done
  try {
    return await new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let isTimedOut = false;
      let isSettled = false; // Prevent multiple resolve/reject calls
      let killTimeoutId: number | undefined; // Track SIGKILL timer for cleanup

      // Spawn process
      const child = command.spawn();

      // Read stdout with buffer limit enforcement
      (async () => {
        const decoder = new TextDecoder();
        for await (const chunk of child.stdout) {
          if (stdout.length + chunk.length > MAX_BUFFER) {
            if (!isSettled) {
              isSettled = true;
              logger.warn(`Process stdout buffer limit exceeded for ${codeId}, sending SIGTERM`);
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
      })().catch((error) => {
        // Stream reading errors should not crash the process
        logger.warn(`Error reading stdout for ${codeId}: ${error.message}`);
      });

      // Read stderr with buffer limit enforcement
      (async () => {
        const decoder = new TextDecoder();
        for await (const chunk of child.stderr) {
          if (stderr.length + chunk.length > MAX_BUFFER) {
            if (!isSettled) {
              isSettled = true;
              logger.warn(`Process stderr buffer limit exceeded for ${codeId}, sending SIGTERM`);
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
      })().catch((error) => {
        // Stream reading errors should not crash the process
        logger.warn(`Error reading stderr for ${codeId}: ${error.message}`);
      });

      // Set up timeout with SIGTERM → SIGKILL escalation
      const timeoutId = setTimeout(() => {
        isTimedOut = true;
        logger.warn(`Process timeout for ${codeId}, sending SIGTERM`);
        try {
          child.kill('SIGTERM');
        } catch {
          // Ignore if process is already dead
        }

        // Wait for grace period, then send SIGKILL
        killTimeoutId = setTimeout(() => {
          logger.warn(`Process did not terminate, sending SIGKILL`);
          try {
            child.kill('SIGKILL');
          } catch {
            // Ignore if process is already dead
          }
        }, SIGKILL_GRACE_PERIOD_MS);
      }, timeout);

      // Wait for process to complete
      (async () => {
        try {
          const status = await child.status;
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

          logger.info(`Process exited: ${codeId} (code: ${code}, signal: ${signal}, time: ${executionTime}ms)`);

          // Mark as settled before resolving
          isSettled = true;

          // Check if timed out
          if (isTimedOut) {
            reject(new TimeoutError(timeout));
            return;
          }

          // Resolve with raw process result
          resolve({
            stdout,
            stderr,
            exitCode: code,
            signal,
            executionTime,
          });
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
          logger.error(`Process error for ${codeId}:`, error as Error);
          reject(
            new ExecutionError(`Failed to execute process: ${(error as Error).message}`, {
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
