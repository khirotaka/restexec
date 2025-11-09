import { assertEquals, assertExists, assertRejects } from '@std/assert';
import { executeCode } from '../../src/executor.ts';
import { TestEnvironment } from '../helpers/setup.ts';
import {
  FileNotFoundError,
  TimeoutError,
  ExecutionError,
} from '../../src/utils/errors.ts';
import { config } from '../../src/config.ts';

// Executor test suite
Deno.test('Executor - Successful execution', async (t) => {
  const env = new TestEnvironment();

  await t.step('setup', async () => {
    await env.setup();
    // Override config for testing
    (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;
  });

  await t.step('should execute simple code and return JSON output', async () => {
    await env.writeCode(
      'hello',
      `
        console.log(JSON.stringify({
          success: true,
          message: "Hello, World!",
        }));
      `,
    );

    const result = await executeCode({
      codeId: 'hello',
      timeout: 5000,
      workspaceDir: env.workspaceDir,
    });

    assertEquals(result.success, true);
    assertEquals(result.output, {
      success: true,
      message: 'Hello, World!',
    });
    assertEquals(result.exitCode, 0);
    assertEquals(result.signal, null);
    assertExists(result.executionTime);
  });

  await t.step('should execute code with complex JSON output', async () => {
    await env.writeCode(
      'complex',
      `
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
      `,
    );

    const result = await executeCode({
      codeId: 'complex',
      timeout: 5000,
      workspaceDir: env.workspaceDir,
    });

    assertEquals(result.success, true);
    assertEquals((result.output as any).success, true);
    assertExists((result.output as any).data);
    assertEquals((result.output as any).data.number, 42);
    assertEquals((result.output as any).data.array, [1, 2, 3]);
  });

  await t.step('should execute async code', async () => {
    await env.writeCode(
      'async',
      `
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
      `,
    );

    const result = await executeCode({
      codeId: 'async',
      timeout: 5000,
      workspaceDir: env.workspaceDir,
    });

    assertEquals(result.success, true);
    assertExists(result.executionTime);
  });

  await t.step('should handle non-JSON output by wrapping it', async () => {
    await env.writeCode(
      'text',
      `
        console.log("Plain text output");
      `,
    );

    const result = await executeCode({
      codeId: 'text',
      timeout: 5000,
      workspaceDir: env.workspaceDir,
    });

    assertEquals(result.success, true);
    assertEquals(result.output, {
      success: true,
      result: 'Plain text output',
    });
  });

  await t.step('should handle empty output', async () => {
    await env.writeCode(
      'empty',
      `
        // No output
      `,
    );

    const result = await executeCode({
      codeId: 'empty',
      timeout: 5000,
      workspaceDir: env.workspaceDir,
    });

    assertEquals(result.success, true);
    assertEquals(result.output, {
      success: true,
      result: null,
    });
  });

  await t.step('cleanup', async () => {
    await env.cleanup();
  });
});

Deno.test('Executor - Error handling', async (t) => {
  const env = new TestEnvironment();

  await t.step('setup', async () => {
    await env.setup();
    (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;
  });

  await t.step('should throw FileNotFoundError when file does not exist', async () => {
    await assertRejects(
      async () => {
        await executeCode({
          codeId: 'non-existent',
          timeout: 5000,
          workspaceDir: env.workspaceDir,
        });
      },
      FileNotFoundError,
    );
  });

  await t.step('should throw ExecutionError on syntax error', async () => {
    await env.writeCode(
      'syntax-error',
      `
        const result = {
          message: "This will fail"
        // Missing closing brace
      `,
    );

    await assertRejects(
      async () => {
        await executeCode({
          codeId: 'syntax-error',
          timeout: 5000,
          workspaceDir: env.workspaceDir,
        });
      },
      ExecutionError,
    );
  });

  await t.step('should throw ExecutionError on runtime error', async () => {
    await env.writeCode(
      'runtime-error',
      `
        function throwError() {
          throw new Error("Intentional runtime error");
        }
        throwError();
      `,
    );

    await assertRejects(
      async () => {
        await executeCode({
          codeId: 'runtime-error',
          timeout: 5000,
          workspaceDir: env.workspaceDir,
        });
      },
      ExecutionError,
    );
  });

  await t.step('should throw TimeoutError when execution exceeds timeout', async () => {
    await env.writeCode(
      'timeout',
      `
        while (true) {
          // Infinite loop
        }
      `,
    );

    await assertRejects(
      async () => {
        await executeCode({
          codeId: 'timeout',
          timeout: 1000,
          workspaceDir: env.workspaceDir,
        });
      },
      TimeoutError,
    );
  });

  await t.step('cleanup', async () => {
    await env.cleanup();
  });
});

Deno.test('Executor - Import map support', async (t) => {
  const env = new TestEnvironment();

  await t.step('setup', async () => {
    await env.setup();
    (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;
  });

  await t.step('should use import map for module resolution', async () => {
    // Create a tool module
    await env.writeTool(
      'utils/math.ts',
      `
        export function add(a: number, b: number): number {
          return a + b;
        }
      `,
    );

    // Create code that imports the tool
    await env.writeCode(
      'with-import',
      `
        import { add } from '@/utils/math.ts';

        const result = add(2, 3);
        console.log(JSON.stringify({
          success: true,
          result: result,
        }));
      `,
    );

    const result = await executeCode({
      codeId: 'with-import',
      timeout: 5000,
      workspaceDir: env.workspaceDir,
    });

    assertEquals(result.success, true);
    assertEquals(result.output, {
      success: true,
      result: 5,
    });
  });

  await t.step('cleanup', async () => {
    await env.cleanup();
  });
});
