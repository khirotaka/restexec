import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../src/app.js';
import { TestEnvironment } from '../helpers/setup.js';
import { config } from '../../src/config.js';

describe('API Integration Tests', () => {
  let app: Express;
  const env = new TestEnvironment();

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    await env.setup();
    // Override config for testing
    (config as any).workspaceDir = env.workspaceDir;
    (config as any).toolsDir = env.toolsDir;
    (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;
  });

  afterEach(async () => {
    await env.cleanup();
  });

  describe('GET /health', () => {
    it('should return health check status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        version: config.version,
      });
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('activeProcesses');
      expect(response.body).toHaveProperty('memoryUsage');
      expect(response.body.memoryUsage).toHaveProperty('rss');
      expect(response.body.memoryUsage).toHaveProperty('heapTotal');
      expect(response.body.memoryUsage).toHaveProperty('heapUsed');
      expect(response.body.memoryUsage).toHaveProperty('external');
    });
  });

  describe('POST /execute', () => {
    it('should execute code successfully', async () => {
      await env.writeCode('test-success', `
        console.log(JSON.stringify({
          success: true,
          message: "Hello from test",
        }));
      `);

      const response = await request(app)
        .post('/execute')
        .send({ codeId: 'test-success' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        result: {
          success: true,
          message: "Hello from test",
        },
      });
      expect(response.body.executionTime).toBeGreaterThan(0);
    });

    it('should execute code with custom timeout', async () => {
      await env.writeCode('test-timeout', `
        console.log(JSON.stringify({ success: true }));
      `);

      const response = await request(app)
        .post('/execute')
        .send({ codeId: 'test-timeout', timeout: 10000 })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 400 for missing codeId', async () => {
      const response = await request(app)
        .post('/execute')
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          type: 'ValidationError',
          message: 'codeId is required',
        },
      });
    });

    it('should return 400 for invalid codeId format', async () => {
      const response = await request(app)
        .post('/execute')
        .send({ codeId: '../evil' })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          type: 'ValidationError',
          message: 'codeId must not contain path separators or parent directory references',
        },
      });
    });

    it('should return 400 for invalid timeout', async () => {
      const response = await request(app)
        .post('/execute')
        .send({ codeId: 'test', timeout: -1 })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          type: 'ValidationError',
        },
      });
    });

    it('should return 404 for non-existent code file', async () => {
      const response = await request(app)
        .post('/execute')
        .send({ codeId: 'non-existent' })
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          type: 'FileNotFoundError',
        },
      });
    });

    it('should return 500 for code with runtime error', async () => {
      await env.writeCode('runtime-error', `
        throw new Error("Intentional error");
      `);

      const response = await request(app)
        .post('/execute')
        .send({ codeId: 'runtime-error' })
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          type: 'ExecutionError',
        },
      });
    });

    it('should return 408 for code that times out', async () => {
      await env.writeCode('infinite-loop', `
        while (true) {
          // Infinite loop
        }
      `);

      const response = await request(app)
        .post('/execute')
        .send({ codeId: 'infinite-loop', timeout: 1000 })
        .expect(408);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          type: 'TimeoutError',
        },
      });
    }, 15000); // Increase test timeout

    it('should handle multiple concurrent requests', async () => {
      // Create multiple test files
      await env.writeCode('concurrent-1', `
        console.log(JSON.stringify({ id: 1 }));
      `);
      await env.writeCode('concurrent-2', `
        console.log(JSON.stringify({ id: 2 }));
      `);
      await env.writeCode('concurrent-3', `
        console.log(JSON.stringify({ id: 3 }));
      `);

      // Execute requests in parallel
      const [res1, res2, res3] = await Promise.all([
        request(app).post('/execute').send({ codeId: 'concurrent-1' }),
        request(app).post('/execute').send({ codeId: 'concurrent-2' }),
        request(app).post('/execute').send({ codeId: 'concurrent-3' }),
      ]);

      expect(res1.body.result).toEqual({ id: 1 });
      expect(res2.body.result).toEqual({ id: 2 });
      expect(res3.body.result).toEqual({ id: 3 });
    });

    it('should execute code with import map', async () => {
      // Create a tool module
      await env.writeTool('utils/helper.ts', `
        export function greet(name: string): string {
          return \`Hello, \${name}!\`;
        }
      `);

      // Create code that imports the tool
      await env.writeCode('with-import', `
        import { greet } from '@/utils/helper.ts';

        const message = greet('World');
        console.log(JSON.stringify({
          success: true,
          message: message,
        }));
      `);

      const response = await request(app)
        .post('/execute')
        .send({ codeId: 'with-import' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        result: {
          success: true,
          message: "Hello, World!",
        },
      });
    });
  });

  describe('404 handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/unknown')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          type: 'ValidationError',
          message: 'Not found',
        },
      });
    });

    it('should return 404 for unknown POST routes', async () => {
      const response = await request(app)
        .post('/unknown')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          type: 'ValidationError',
          message: 'Not found',
        },
      });
    });
  });
});
