import { spawn, ChildProcess } from 'child_process';
import { access, constants } from 'fs/promises';
import { join } from 'path';
import { logger } from './utils/logger.js';
import { FileNotFoundError, TimeoutError, ExecutionError } from './utils/errors.js';
import { config } from './config.js';
import type { ExecutionResult } from './types/index.js';

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
    await access(filePath, constants.R_OK);
  } catch (error) {
    logger.error(`File not found: ${filePath}`);
    throw new FileNotFoundError(codeId);
  }

  logger.info(`Executing code: ${codeId} (timeout: ${timeout}ms)`);

  // Execute code with tsx
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let isTimedOut = false;
    let isKilled = false;
    let isSettled = false; // Prevent multiple resolve/reject calls

    // Build Deno command arguments
    const denoArgs = buildDenoArgs(filePath);

    // Whitelist environment variables (minimal for Deno)
    const allowedEnv = {
      PATH: process.env.PATH,
      DENO_DIR: process.env.DENO_DIR, // Allow Deno cache dir if specified
    };

    // Spawn Deno process
    const child: ChildProcess = spawn(config.deno.path, denoArgs, {
      cwd: workspaceDir,
      env: allowedEnv,
      timeout: 0, // We handle timeout manually to allow for graceful shutdown
    });

    // Collect stdout
    child.stdout?.on('data', (data: Buffer) => {
      if (stdout.length > MAX_BUFFER) {
        if (!isSettled) {
          isSettled = true;
          logger.warn(`Process stdout buffer limit exceeded for ${codeId}, sending SIGTERM`);
          child.kill('SIGTERM');
          setTimeout(() => {
            if (child.exitCode === null) {
              logger.warn(`Process did not terminate after buffer limit, sending SIGKILL`);
              child.kill('SIGKILL');
            }
          }, 1000);
          reject(new ExecutionError('stdout buffer limit exceeded', { maxBuffer: MAX_BUFFER }));
        }
        return;
      }
      stdout += data.toString();
    });

    // Collect stderr
    child.stderr?.on('data', (data: Buffer) => {
      if (stderr.length > MAX_BUFFER) {
        if (!isSettled) {
          isSettled = true;
          logger.warn(`Process stderr buffer limit exceeded for ${codeId}, sending SIGTERM`);
          child.kill('SIGTERM');
          setTimeout(() => {
            if (child.exitCode === null) {
              logger.warn(`Process did not terminate after buffer limit, sending SIGKILL`);
              child.kill('SIGKILL');
            }
          }, 1000);
          reject(new ExecutionError('stderr buffer limit exceeded', { maxBuffer: MAX_BUFFER }));
        }
        return;
      }
      stderr += data.toString();
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      isTimedOut = true;
      logger.warn(`Process timeout for ${codeId}, sending SIGTERM`);
      child.kill('SIGTERM');

      // Wait 1 second, then send SIGKILL
      setTimeout(() => {
        if (!isKilled && child.exitCode === null) {
          logger.warn(`Process did not terminate, sending SIGKILL`);
          child.kill('SIGKILL');
        }
      }, 1000);
    }, timeout);

    // Handle process exit
    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      isKilled = true;
      clearTimeout(timeoutId);

      // Skip if promise is already settled
      if (isSettled) {
        return;
      }

      const executionTime = Date.now() - startTime;

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
    });

    // Handle process errors
    child.on('error', (error: Error) => {
      clearTimeout(timeoutId);

      // Skip if promise is already settled
      if (isSettled) {
        return;
      }

      isSettled = true;
      logger.error(`Process error for ${codeId}:`, error);
      reject(new ExecutionError(`Failed to spawn process: ${error.message}`, { error: error.message }));
    });
  });
}

/**
 * Parse process output and construct execution result
 */
function parseOutput(
  stdout: string,
  stderr: string,
  exitCode: number | null,
  signal: NodeJS.Signals | null,
  executionTime: number
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
