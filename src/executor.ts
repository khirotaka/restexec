import { spawn, ChildProcess } from 'child_process';
import { access, constants } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';
import { FileNotFoundError, TimeoutError, ExecutionError } from './utils/errors.js';
import type { ExecutionResult } from './types/index.js';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

export interface ExecuteOptions {
  codeId: string;
  timeout: number;
  workspaceDir: string;
  toolsDir: string;
}

/**
 * Execute TypeScript code in a child process using tsx
 */
export async function executeCode(options: ExecuteOptions): Promise<ExecutionResult> {
  const { codeId, timeout, workspaceDir, toolsDir } = options;
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

    // Spawn tsx process
    // Use tsx from node_modules/.bin or environment variable
    const tsxPath = process.env.TSX_PATH || join(projectRoot, 'node_modules', '.bin', 'tsx');
    const child: ChildProcess = spawn(tsxPath, [filePath], {
      cwd: workspaceDir,
      env: {
        ...process.env,
        NODE_PATH: toolsDir,
      },
      timeout: 0, // We'll handle timeout manually
    });

    // Collect stdout
    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    // Collect stderr
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      isTimedOut = true;
      logger.warn(`Process timeout for ${codeId}, sending SIGTERM`);

      // Send SIGTERM
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

      const executionTime = Date.now() - startTime;

      logger.info(`Process exited: ${codeId} (code: ${code}, signal: ${signal}, time: ${executionTime}ms)`);

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

  // Try to parse JSON output from stdout
  let output: string;
  try {
    // Try to parse as JSON
    const trimmedOutput = stdout.trim();
    if (trimmedOutput) {
      // Validate that it's valid JSON
      JSON.parse(trimmedOutput);
      output = trimmedOutput;
    } else {
      output = JSON.stringify({ success: true, result: null });
    }
  } catch (error) {
    // If not valid JSON, return stdout as-is wrapped in a JSON object
    logger.warn(`Output is not valid JSON, wrapping in object`);
    output = JSON.stringify({
      success: true,
      result: stdout.trim() || null,
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
