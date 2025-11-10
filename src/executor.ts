import { join } from 'jsr:@std/path@^1.0.10';
import { logger } from './utils/logger.ts';
import { ExecutionError, FileNotFoundError, TimeoutError } from './utils/errors.ts';
import { config } from './config.ts';
import type { ExecutionResult } from './types/index.ts';
import { processManager } from './utils/processManager.ts';

// 10MB buffer limit
const MAX_BUFFER = 10 * 1024 * 1024;

/**
 * Build Deno command arguments with permissions
 */
function buildDenoArgs(filePath: string): string[] {
  const args = ['run', '--no-prompt', '--no-remote'];

  // Add import map
  if (config.deno.importMap) {
    args.push('--import-map', config.deno.importMap);
  }

  // Add read permissions
  if (config.deno.permissions.allowRead.length > 0) {
    const readPaths = config.deno.permissions.allowRead.join(',');
    args.push(`--allow-read=${readPaths}`);
  }

  // Add write permissions
  if (config.deno.permissions.allowWrite.length > 0) {
    const writePaths = config.deno.permissions.allowWrite.join(',');
    args.push(`--allow-write=${writePaths}`);
  }

  // Add network permissions
  if (config.deno.permissions.allowNet.length > 0) {
    const netHosts = config.deno.permissions.allowNet.join(',');
    args.push(`--allow-net=${netHosts}`);
  }

  // Add run permission (subprocess execution)
  if (config.deno.permissions.allowRun) {
    args.push('--allow-run');
  }

  // Add the file to execute
  args.push(filePath);

  return args;
}

export interface ExecuteOptions {
  codeId: string;
  timeout: number;
  workspaceDir: string;
}

/**
 * Execute TypeScript code in a child process using Deno.
 *
 * The executed script is expected to print a JSON object to standard output
 * for the result to be parsed correctly. If the output is not valid JSON,
 * it will be wrapped in a fallback object.
 */
export async function executeCode(options: ExecuteOptions): Promise<ExecutionResult> {
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
  logger.info(`Executing code: ${codeId} (timeout: ${timeout}ms, active processes: ${activeCount})`);

  // Execute code with Deno - decrement counter when done
  try {
    return await new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let isTimedOut = false;
    let isKilled = false;
    let isSettled = false; // Prevent multiple resolve/reject calls
    let killTimeoutId: number | undefined; // Track SIGKILL timer for cleanup

    // Build Deno command arguments
    const denoArgs = buildDenoArgs(filePath);

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
            logger.warn(`Process stdout buffer limit exceeded for ${codeId}, sending SIGTERM`);
            try {
              child.kill('SIGTERM');
              killTimeoutId = setTimeout(() => {
                try {
                  child.kill('SIGKILL');
                } catch {
                  // Process might already be terminated
                }
              }, 1000);
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
            logger.warn(`Process stderr buffer limit exceeded for ${codeId}, sending SIGTERM`);
            try {
              child.kill('SIGTERM');
              killTimeoutId = setTimeout(() => {
                try {
                  child.kill('SIGKILL');
                } catch {
                  // Process might already be terminated
                }
              }, 1000);
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
      logger.warn(`Process timeout for ${codeId}, sending SIGTERM`);
      try {
        child.kill('SIGTERM');
      } catch {
        // Ignore if process is already dead
      }

      // Wait 1 second, then send SIGKILL
      killTimeoutId = setTimeout(() => {
        if (!isKilled) {
          logger.warn(`Process did not terminate, sending SIGKILL`);
          try {
            child.kill('SIGKILL');
          } catch {
            // Ignore if process is already dead
          }
        }
      }, 1000);
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

        logger.info(`Process exited: ${codeId} (code: ${code}, signal: ${signal}, time: ${executionTime}ms)`);

        // Mark as settled before resolving/rejecting
        isSettled = true;

        // Check if timed out
        if (isTimedOut) {
          reject(new TimeoutError(timeout));
          return;
        }

        // Parse result
        try {
          const result = parseOutput(stdout, stderr, code, signal, executionTime);
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

/**
 * Parse process output and construct execution result
 */
function parseOutput(
  stdout: string,
  stderr: string,
  exitCode: number,
  signal: Deno.Signal | null,
  executionTime: number,
): ExecutionResult {
  // If process was killed by signal, treat as error
  if (signal !== null) {
    throw new ExecutionError(`Process killed by signal: ${signal}`, {
      signal,
      stderr: stderr.trim(),
    });
  }

  // If exit code is not 0, treat as error
  if (exitCode !== 0) {
    throw new ExecutionError(`Process exited with code ${exitCode}`, {
      exitCode,
      stderr: stderr.trim(),
      stdout: stdout.trim(),
    });
  }

  let output: object;
  try {
    const trimmedOutput = stdout.trim();
    output = trimmedOutput ? JSON.parse(trimmedOutput) : { success: true, result: null };
  } catch (_error) {
    logger.warn(`Output is not valid JSON, wrapping in object`);
    output = {
      success: true,
      result: stdout.trim() || null,
    };
  }

  return {
    success: true,
    output,
    exitCode,
    signal,
    executionTime,
  };
}
