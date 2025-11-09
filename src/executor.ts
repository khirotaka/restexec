import { join } from '@std/path';
import { logger } from './utils/logger.ts';
import { FileNotFoundError, TimeoutError, ExecutionError } from './utils/errors.ts';
import { config } from './config.ts';
import type { ExecutionResult } from './types/index.ts';

// 10MB buffer limit
const MAX_BUFFER = 10 * 1024 * 1024;

/**
 * Build Deno command arguments with permissions
 */
function buildDenoArgs(filePath: string): string[] {
  const args = ['run', '--no-prompt'];

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
  } catch (error) {
    logger.error(`File not found: ${filePath}`);
    throw new FileNotFoundError(codeId);
  }

  logger.info(`Executing code: ${codeId} (timeout: ${timeout}ms)`);

  // Execute code with Deno
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let isTimedOut = false;
    let isKilled = false;
    let isSettled = false; // Prevent multiple resolve/reject calls

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
    });

    // Spawn the process
    const child = command.spawn();

    // Collect stdout
    (async () => {
      const decoder = new TextDecoder();
      for await (const chunk of child.stdout) {
        if (isSettled) break;

        stdout += decoder.decode(chunk);

        if (stdout.length > MAX_BUFFER) {
          if (!isSettled) {
            isSettled = true;
            logger.warn(`Process stdout buffer limit exceeded for ${codeId}, sending SIGTERM`);
            try {
              child.kill('SIGTERM');
              setTimeout(() => {
                if (!isKilled) {
                  logger.warn(`Process did not terminate after buffer limit, sending SIGKILL`);
                  try {
                    child.kill('SIGKILL');
                  } catch {
                    // Ignore if already killed
                  }
                }
              }, 1000);
            } catch {
              // Process might have already exited
            }
            reject(
              new ExecutionError('stdout buffer limit exceeded', { maxBuffer: MAX_BUFFER }),
            );
          }
          break;
        }
      }
    })();

    // Collect stderr
    (async () => {
      const decoder = new TextDecoder();
      for await (const chunk of child.stderr) {
        if (isSettled) break;

        stderr += decoder.decode(chunk);

        if (stderr.length > MAX_BUFFER) {
          if (!isSettled) {
            isSettled = true;
            logger.warn(`Process stderr buffer limit exceeded for ${codeId}, sending SIGTERM`);
            try {
              child.kill('SIGTERM');
              setTimeout(() => {
                if (!isKilled) {
                  logger.warn(`Process did not terminate after buffer limit, sending SIGKILL`);
                  try {
                    child.kill('SIGKILL');
                  } catch {
                    // Ignore if already killed
                  }
                }
              }, 1000);
            } catch {
              // Process might have already exited
            }
            reject(
              new ExecutionError('stderr buffer limit exceeded', { maxBuffer: MAX_BUFFER }),
            );
          }
          break;
        }
      }
    })();

    // Set up timeout
    const timeoutId = setTimeout(() => {
      isTimedOut = true;
      logger.warn(`Process timeout for ${codeId}, sending SIGTERM`);
      try {
        child.kill('SIGTERM');

        // Wait 1 second, then send SIGKILL
        setTimeout(() => {
          if (!isKilled) {
            logger.warn(`Process did not terminate, sending SIGKILL`);
            try {
              child.kill('SIGKILL');
            } catch {
              // Ignore if already killed
            }
          }
        }, 1000);
      } catch {
        // Process might have already exited
      }
    }, timeout);

    // Handle process exit
    (async () => {
      try {
        const status = await child.status;
        isKilled = true;
        clearTimeout(timeoutId);

        // Skip if promise is already settled
        if (isSettled) {
          return;
        }

        const executionTime = Date.now() - startTime;

        logger.info(
          `Process exited: ${codeId} (code: ${status.code}, signal: ${status.signal ?? 'none'}, time: ${executionTime}ms)`,
        );

        // Mark as settled before resolving/rejecting
        isSettled = true;

        // Check if timed out
        if (isTimedOut) {
          reject(new TimeoutError(timeout));
          return;
        }

        // Parse result
        try {
          const result = parseOutput(
            stdout,
            stderr,
            status.code,
            status.signal ?? null,
            executionTime,
          );
          resolve(result);
        } catch (error) {
          reject(error);
        }
      } catch (error) {
        clearTimeout(timeoutId);

        // Skip if promise is already settled
        if (isSettled) {
          return;
        }

        isSettled = true;
        logger.error(`Process error for ${codeId}:`, error);
        reject(
          new ExecutionError(
            `Failed to spawn process: ${error instanceof Error ? error.message : String(error)}`,
            {
              error: error instanceof Error ? error.message : String(error),
            },
          ),
        );
      }
    })();
  });
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
  } catch (error) {
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
