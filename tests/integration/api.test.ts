import { assertEquals, assertExists } from '@std/assert';
import { createApp } from '../../src/app.ts';
import { TestEnvironment } from '../helpers/setup.ts';
import { config } from '../../src/config.ts';

Deno.test('API Integration - Health Check', async (t) => {
  const app = createApp();

  await t.step('should return health check status', async () => {
    const req = new Request('http://localhost/health');
    const res = await app.request(req);

    assertEquals(res.status, 200);

    const body = await res.json();
    assertEquals(body.status, 'ok');
    assertEquals(body.version, config.version);
    assertExists(body.uptime);
    assertExists(body.activeProcesses);
    assertExists(body.memoryUsage);
    assertExists(body.memoryUsage.rss);
    assertExists(body.memoryUsage.heapTotal);
    assertExists(body.memoryUsage.heapUsed);
    assertExists(body.memoryUsage.external);
  });
});

Deno.test('API Integration - Execute Endpoint', async (t) => {
  const app = createApp();
  const env = new TestEnvironment();

  await t.step('setup', async () => {
    await env.setup();
    (config as any).workspaceDir = env.workspaceDir;
    (config as any).toolsDir = env.toolsDir;
    (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;
  });

  await t.step('should execute code successfully', async () => {
    await env.writeCode(
      'test-success',
      `
        console.log(JSON.stringify({
          success: true,
          message: "Hello from test",
        }));
      `,
    );

    const req = new Request('http://localhost/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId: 'test-success' }),
    });
    const res = await app.request(req);

    assertEquals(res.status, 200);

    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(body.result, {
      success: true,
      message: 'Hello from test',
    });
    assertExists(body.executionTime);
  });

  await t.step('should execute code with custom timeout', async () => {
    await env.writeCode(
      'test-timeout',
      `
        console.log(JSON.stringify({ success: true }));
      `,
    );

    const req = new Request('http://localhost/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId: 'test-timeout', timeout: 10000 }),
    });
    const res = await app.request(req);

    assertEquals(res.status, 200);

    const body = await res.json();
    assertEquals(body.success, true);
  });

  await t.step('should return 400 for missing codeId', async () => {
    const req = new Request('http://localhost/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await app.request(req);

    assertEquals(res.status, 400);

    const body = await res.json();
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'ValidationError');
    assertEquals(body.error.message, 'codeId is required');
  });

  await t.step('should return 400 for invalid codeId format', async () => {
    const req = new Request('http://localhost/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId: '../evil' }),
    });
    const res = await app.request(req);

    assertEquals(res.status, 400);

    const body = await res.json();
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'ValidationError');
    assertEquals(
      body.error.message,
      'codeId must not contain path separators or parent directory references',
    );
  });

  await t.step('should return 400 for invalid timeout', async () => {
    const req = new Request('http://localhost/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId: 'test', timeout: -1 }),
    });
    const res = await app.request(req);

    assertEquals(res.status, 400);

    const body = await res.json();
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'ValidationError');
  });

  await t.step('should return 404 for non-existent code file', async () => {
    const req = new Request('http://localhost/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId: 'non-existent' }),
    });
    const res = await app.request(req);

    assertEquals(res.status, 404);

    const body = await res.json();
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'FileNotFoundError');
  });

  await t.step('should return 500 for code with runtime error', async () => {
    await env.writeCode(
      'runtime-error',
      `
        throw new Error("Intentional error");
      `,
    );

    const req = new Request('http://localhost/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId: 'runtime-error' }),
    });
    const res = await app.request(req);

    assertEquals(res.status, 500);

    const body = await res.json();
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'ExecutionError');
  });

  await t.step('should return 408 for code that times out', async () => {
    await env.writeCode(
      'infinite-loop',
      `
        while (true) {
          // Infinite loop
        }
      `,
    );

    const req = new Request('http://localhost/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId: 'infinite-loop', timeout: 1000 }),
    });
    const res = await app.request(req);

    assertEquals(res.status, 408);

    const body = await res.json();
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'TimeoutError');
  });

  await t.step('should handle multiple concurrent requests', async () => {
    await env.writeCode('concurrent-1', `console.log(JSON.stringify({ id: 1 }));`);
    await env.writeCode('concurrent-2', `console.log(JSON.stringify({ id: 2 }));`);
    await env.writeCode('concurrent-3', `console.log(JSON.stringify({ id: 3 }));`);

    const [res1, res2, res3] = await Promise.all([
      app.request(
        new Request('http://localhost/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codeId: 'concurrent-1' }),
        }),
      ),
      app.request(
        new Request('http://localhost/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codeId: 'concurrent-2' }),
        }),
      ),
      app.request(
        new Request('http://localhost/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codeId: 'concurrent-3' }),
        }),
      ),
    ]);

    const body1 = await res1.json();
    const body2 = await res2.json();
    const body3 = await res3.json();

    assertEquals(body1.result, { id: 1 });
    assertEquals(body2.result, { id: 2 });
    assertEquals(body3.result, { id: 3 });
  });

  await t.step('should execute code with import map', async () => {
    await env.writeTool(
      'utils/helper.ts',
      `
        export function greet(name: string): string {
          return \`Hello, \${name}!\`;
        }
      `,
    );

    await env.writeCode(
      'with-import',
      `
        import { greet } from '@/utils/helper.ts';

        const message = greet('World');
        console.log(JSON.stringify({
          success: true,
          message: message,
        }));
      `,
    );

    const req = new Request('http://localhost/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId: 'with-import' }),
    });
    const res = await app.request(req);

    assertEquals(res.status, 200);

    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(body.result, {
      success: true,
      message: 'Hello, World!',
    });
  });

  await t.step('cleanup', async () => {
    await env.cleanup();
  });
});

Deno.test('API Integration - 404 Handler', async (t) => {
  const app = createApp();

  await t.step('should return 404 for unknown GET routes', async () => {
    const req = new Request('http://localhost/unknown');
    const res = await app.request(req);

    assertEquals(res.status, 404);

    const body = await res.json();
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'ValidationError');
    assertEquals(body.error.message, 'Not found');
  });

  await t.step('should return 404 for unknown POST routes', async () => {
    const req = new Request('http://localhost/unknown', { method: 'POST' });
    const res = await app.request(req);

    assertEquals(res.status, 404);

    const body = await res.json();
    assertEquals(body.success, false);
    assertEquals(body.error.type, 'ValidationError');
    assertEquals(body.error.message, 'Not found');
  });
});
