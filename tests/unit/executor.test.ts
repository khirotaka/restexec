import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeCode } from '../../src/executor.js';
import { TestEnvironment } from '../helpers/setup.js';
import { FileNotFoundError, TimeoutError, ExecutionError } from '../../src/utils/errors.js';
import { config } from '../../src/config.js';

describe('Executor', () => {
  const env = new TestEnvironment();

  beforeEach(async () => {
    await env.setup();
    // Override config for testing
    (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;
  });

  afterEach(async () => {
    await env.cleanup();
  });

  describe('Successful execution', () => {
    it('should execute simple code and return JSON output', async () => {
      await env.writeCode('hello', `
        console.log(JSON.stringify({
          success: true,
          message: "Hello, World!",
        }));
      `);

      const result = await executeCode({
        codeId: 'hello',
        timeout: 5000,
        workspaceDir: env.workspaceDir,
      });

      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        success: true,
        message: "Hello, World!",
      });
      expect(result.exitCode).toBe(0);
      expect(result.signal).toBeNull();
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should execute code with complex JSON output', async () => {
      await env.writeCode('complex', `
        const data = {
          success: true,
          data: {
            number: 42,
            string: "test",
            array: [1, 2, 3],
            object: { key: "value" },
          },
        };
        console.log(JSON.stringify(data));
      `);

      const result = await executeCode({
        codeId: 'complex',
        timeout: 5000,
        workspaceDir: env.workspaceDir,
      });

      expect(result.success).toBe(true);
      expect(result.output).toHaveProperty('success', true);
      expect(result.output).toHaveProperty('data');
      expect((result.output as any).data.number).toBe(42);
      expect((result.output as any).data.array).toEqual([1, 2, 3]);
    });

    it('should execute async code', async () => {
      await env.writeCode('async', `
        async function delay(ms: number): Promise<void> {
          return new Promise((resolve) => setTimeout(resolve, ms));
        }

        async function main() {
          await delay(100);
          console.log(JSON.stringify({
            success: true,
            message: "Async execution completed",
          }));
        }

        main();
      `);

      const result = await executeCode({
        codeId: 'async',
        timeout: 5000,
        workspaceDir: env.workspaceDir,
      });

      expect(result.success).toBe(true);
      expect(result.executionTime).toBeGreaterThanOrEqual(100);
    });

    it('should handle non-JSON output by wrapping it', async () => {
      await env.writeCode('text', `
        console.log("Plain text output");
      `);

      const result = await executeCode({
        codeId: 'text',
        timeout: 5000,
        workspaceDir: env.workspaceDir,
      });

      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        success: true,
        result: "Plain text output",
      });
    });

    it('should handle empty output', async () => {
      await env.writeCode('empty', `
        // No output
      `);

      const result = await executeCode({
        codeId: 'empty',
        timeout: 5000,
        workspaceDir: env.workspaceDir,
      });

      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        success: true,
        result: null,
      });
    });
  });

  describe('Error handling', () => {
    it('should throw FileNotFoundError when file does not exist', async () => {
      await expect(
        executeCode({
          codeId: 'non-existent',
          timeout: 5000,
          workspaceDir: env.workspaceDir,
        })
      ).rejects.toThrow(FileNotFoundError);
    });

    it('should throw ExecutionError on syntax error', async () => {
      await env.writeCode('syntax-error', `
        const result = {
          message: "This will fail"
        // Missing closing brace
      `);

      await expect(
        executeCode({
          codeId: 'syntax-error',
          timeout: 5000,
          workspaceDir: env.workspaceDir,
        })
      ).rejects.toThrow(ExecutionError);
    });

    it('should throw ExecutionError on runtime error', async () => {
      await env.writeCode('runtime-error', `
        function throwError() {
          throw new Error("Intentional runtime error");
        }
        throwError();
      `);

      await expect(
        executeCode({
          codeId: 'runtime-error',
          timeout: 5000,
          workspaceDir: env.workspaceDir,
        })
      ).rejects.toThrow(ExecutionError);
    });

    it('should throw TimeoutError when execution exceeds timeout', async () => {
      await env.writeCode('timeout', `
        while (true) {
          // Infinite loop
        }
      `);

      await expect(
        executeCode({
          codeId: 'timeout',
          timeout: 1000,
          workspaceDir: env.workspaceDir,
        })
      ).rejects.toThrow(TimeoutError);
    }, 15000); // Increase test timeout for this specific test
  });

  describe('Import map support', () => {
    it('should use import map for module resolution', async () => {
      // Create a tool module
      await env.writeTool('utils/math.ts', `
        export function add(a: number, b: number): number {
          return a + b;
        }
      `);

      // Create code that imports the tool
      await env.writeCode('with-import', `
        import { add } from '@/utils/math.ts';

        const result = add(2, 3);
        console.log(JSON.stringify({
          success: true,
          result: result,
        }));
      `);

      const result = await executeCode({
        codeId: 'with-import',
        timeout: 5000,
        workspaceDir: env.workspaceDir,
      });

      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        success: true,
        result: 5,
      });
    });
  });
});
