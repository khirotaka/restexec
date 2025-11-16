import { join } from '@std/path';
import { logger } from './utils/logger.ts';
import { ExecutionError, FileNotFoundError } from './utils/errors.ts';
import { config } from './config.ts';
import type { ExecutionResult } from './types/index.ts';
import { runProcess } from './utils/processRunner.ts';

/**
 * Build Deno command arguments with permissions
 */
function buildDenoArgs(filePath: string): string[] {
  const args = ['run', '--no-prompt', '--cached-only'];

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

  // Add environment variable access permission
  args.push('--allow-env');

  // Add the file to execute
  args.push(filePath);

  return args;
}

export interface ExecuteOptions {
  codeId: string;
  timeout: number;
  workspaceDir: string;
  env?: Record<string, string>;
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

  // Construct file path
  const filePath = join(workspaceDir, `${codeId}.ts`);

  // Check if file exists
  try {
    await Deno.stat(filePath);
  } catch (_error) {
    logger.error(`File not found: ${filePath}`);
    throw new FileNotFoundError(codeId);
  }

  // Build Deno command arguments
  const denoArgs = buildDenoArgs(filePath);

  // Whitelist environment variables (minimal for Deno)
  const allowedEnv: Record<string, string> = {};
  const path = Deno.env.get('PATH');
  const denoDir = Deno.env.get('DENO_DIR');
  if (path) allowedEnv.PATH = path;
  if (denoDir) allowedEnv.DENO_DIR = denoDir;

  // Merge user-defined environment variables
  if (options.env) {
    Object.assign(allowedEnv, options.env);
  }

  // Create Deno command
  const command = new Deno.Command(config.deno.path, {
    args: denoArgs,
    cwd: workspaceDir,
    env: allowedEnv,
    stdout: 'piped',
    stderr: 'piped',
    stdin: 'null',
  });

  // Execute process with common runner
  const result = await runProcess({
    codeId,
    timeout,
    command,
    logContext: 'Executing',
  });

  // Parse and return execution result
  return parseOutput(
    result.stdout,
    result.stderr,
    result.exitCode,
    result.signal,
    result.executionTime,
  );
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
