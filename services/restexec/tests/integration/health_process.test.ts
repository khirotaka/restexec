import { assertEquals } from '@std/assert';
import { createServerHarness, pollHealth } from '../helpers/httpServer.ts';
import { TestEnvironment } from '../helpers/setup.ts';
import { config } from '../../src/config.ts';
import { processManager } from '../../src/utils/processManager.ts';
import type { ApiResponse } from '../../src/types/index.ts';

/**
 * Health Check Process Management Tests
 *
 * These tests verify that:
 * 1. The /health endpoint accurately tracks active processes
 * 2. The processManager correctly increments/decrements during execution
 * 3. Subprocess spawning works correctly (not mocked)
 * 4. Process counts return to baseline after execution completes
 *
 * Run with: deno test --allow-read --allow-write --allow-net --allow-env --allow-run tests/integration/health_process.test.ts
 */

Deno.test({
  name: 'Health - activeProcesses increments during code execution',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const harness = createServerHarness();
    const env = new TestEnvironment();

    try {
      await harness.start();
      await env.setup();

      // Reset process manager to ensure clean state
      processManager.reset();

      // Save original config values
      const originalWorkspaceDir = config.workspaceDir;
      const originalImportMap = config.deno.importMap;

      try {
        // Configure test environment
        // deno-lint-ignore no-explicit-any
        (config as any).workspaceDir = env.workspaceDir;
        // deno-lint-ignore no-explicit-any
        (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;

        // Create a code file that runs for a short period
        // This gives us time to poll /health and observe the active process
        await env.writeCode(
          'ping',
          `
          // Wait 200ms to ensure we can observe the active process
          await new Promise(resolve => setTimeout(resolve, 200));
          console.log(JSON.stringify({ success: true, message: "pong" }));
          `,
        );

        // Get baseline health
        const baseline = await harness.getHealth();
        const baselineProcesses = baseline.activeProcesses;

        // Start execution (don't await yet)
        const executePromise = fetch(`${harness.serverUrl}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codeId: 'ping', timeout: 5000 }),
        });

        // Poll health to verify activeProcesses increased
        const duringExecution = await pollHealth(
          harness,
          (health) => health.activeProcesses > baselineProcesses,
          {
            intervalMs: 50,
            timeoutMs: 1000,
            description: `activeProcesses to increase from ${baselineProcesses}`,
          },
        );

        assertEquals(
          duringExecution.activeProcesses,
          baselineProcesses + 1,
          `Expected activeProcesses to be ${baselineProcesses + 1} during execution, ` +
            `got ${duringExecution.activeProcesses}`,
        );

        // Wait for execution to complete
        const response = await executePromise;
        assertEquals(response.status, 200, 'Execution should succeed');

        const result = await response.json() as ApiResponse;
        assertEquals(result.success, true, 'Execution result should be successful');

        // Verify activeProcesses returns to baseline
        const afterExecution = await pollHealth(
          harness,
          (health) => health.activeProcesses === baselineProcesses,
          {
            intervalMs: 50,
            timeoutMs: 1000,
            description: `activeProcesses to return to baseline ${baselineProcesses}`,
          },
        );

        assertEquals(
          afterExecution.activeProcesses,
          baselineProcesses,
          `Expected activeProcesses to return to ${baselineProcesses} after execution, ` +
            `got ${afterExecution.activeProcesses}`,
        );
      } finally {
        // Restore config
        // deno-lint-ignore no-explicit-any
        (config as any).workspaceDir = originalWorkspaceDir;
        // deno-lint-ignore no-explicit-any
        (config as any).deno.importMap = originalImportMap;
      }
    } finally {
      await env.cleanup();
      await harness.stop();
    }
  },
});

Deno.test({
  name: 'Health - activeProcesses tracks multiple concurrent executions',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const harness = createServerHarness();
    const env = new TestEnvironment();

    try {
      await harness.start();
      await env.setup();

      // Reset process manager
      processManager.reset();

      const originalWorkspaceDir = config.workspaceDir;
      const originalImportMap = config.deno.importMap;

      try {
        // deno-lint-ignore no-explicit-any
        (config as any).workspaceDir = env.workspaceDir;
        // deno-lint-ignore no-explicit-any
        (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;

        // Create a code file that runs for a moderate period
        await env.writeCode(
          'slow',
          `
          await new Promise(resolve => setTimeout(resolve, 300));
          console.log(JSON.stringify({ success: true, message: "completed" }));
          `,
        );

        const baseline = await harness.getHealth();
        const baselineProcesses = baseline.activeProcesses;

        // Start 3 concurrent executions
        const executions = [
          fetch(`${harness.serverUrl}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codeId: 'slow', timeout: 5000 }),
          }),
          fetch(`${harness.serverUrl}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codeId: 'slow', timeout: 5000 }),
          }),
          fetch(`${harness.serverUrl}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codeId: 'slow', timeout: 5000 }),
          }),
        ];

        // Poll to see if we can observe 3 active processes
        // Note: This may be flaky as processes might complete quickly
        // but we should at least see an increase
        const duringExecution = await pollHealth(
          harness,
          (health) => health.activeProcesses > baselineProcesses,
          {
            intervalMs: 30,
            timeoutMs: 1000,
            description: `activeProcesses to increase from ${baselineProcesses}`,
          },
        );

        // We should see at least 1 active process, possibly up to 3
        assertEquals(
          duringExecution.activeProcesses > baselineProcesses,
          true,
          `Expected activeProcesses to increase during concurrent executions`,
        );

        // Wait for all executions to complete
        const responses = await Promise.all(executions);

        // Verify all succeeded
        for (const response of responses) {
          assertEquals(response.status, 200);
        }

        // Verify activeProcesses returns to baseline
        const afterExecution = await pollHealth(
          harness,
          (health) => health.activeProcesses === baselineProcesses,
          {
            intervalMs: 50,
            timeoutMs: 2000,
            description: `activeProcesses to return to baseline ${baselineProcesses}`,
          },
        );

        assertEquals(
          afterExecution.activeProcesses,
          baselineProcesses,
          `Expected activeProcesses to return to ${baselineProcesses} after all executions complete`,
        );
      } finally {
        // deno-lint-ignore no-explicit-any
        (config as any).workspaceDir = originalWorkspaceDir;
        // deno-lint-ignore no-explicit-any
        (config as any).deno.importMap = originalImportMap;
      }
    } finally {
      await env.cleanup();
      await harness.stop();
    }
  },
});

Deno.test({
  name: 'Health - activeProcesses decrements even when execution fails',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const harness = createServerHarness();
    const env = new TestEnvironment();

    try {
      await harness.start();
      await env.setup();

      processManager.reset();

      const originalWorkspaceDir = config.workspaceDir;
      const originalImportMap = config.deno.importMap;

      try {
        // deno-lint-ignore no-explicit-any
        (config as any).workspaceDir = env.workspaceDir;
        // deno-lint-ignore no-explicit-any
        (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;

        // Create a code file that throws an error
        await env.writeCode(
          'failing',
          `
          await new Promise(resolve => setTimeout(resolve, 100));
          throw new Error("Intentional failure");
          `,
        );

        const baseline = await harness.getHealth();
        const baselineProcesses = baseline.activeProcesses;

        // Start execution
        const executePromise = fetch(`${harness.serverUrl}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codeId: 'failing', timeout: 5000 }),
        });

        // Poll to see activeProcesses increase
        const duringExecution = await pollHealth(
          harness,
          (health) => health.activeProcesses > baselineProcesses,
          {
            intervalMs: 50,
            timeoutMs: 1000,
            description: `activeProcesses to increase from ${baselineProcesses}`,
          },
        );

        assertEquals(
          duringExecution.activeProcesses,
          baselineProcesses + 1,
        );

        // Wait for execution to complete (it will fail)
        const response = await executePromise;
        assertEquals(response.status, 500, 'Execution should fail');

        // Verify activeProcesses still returns to baseline despite failure
        const afterExecution = await pollHealth(
          harness,
          (health) => health.activeProcesses === baselineProcesses,
          {
            intervalMs: 50,
            timeoutMs: 1000,
            description: `activeProcesses to return to baseline ${baselineProcesses} after failure`,
          },
        );

        assertEquals(
          afterExecution.activeProcesses,
          baselineProcesses,
          `Expected activeProcesses to return to ${baselineProcesses} even after failed execution`,
        );
      } finally {
        // deno-lint-ignore no-explicit-any
        (config as any).workspaceDir = originalWorkspaceDir;
        // deno-lint-ignore no-explicit-any
        (config as any).deno.importMap = originalImportMap;
      }
    } finally {
      await env.cleanup();
      await harness.stop();
    }
  },
});

Deno.test({
  name: 'Health - activeProcesses decrements when execution times out',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const harness = createServerHarness();
    const env = new TestEnvironment();

    try {
      await harness.start();
      await env.setup();

      processManager.reset();

      const originalWorkspaceDir = config.workspaceDir;
      const originalImportMap = config.deno.importMap;

      try {
        // deno-lint-ignore no-explicit-any
        (config as any).workspaceDir = env.workspaceDir;
        // deno-lint-ignore no-explicit-any
        (config as any).deno.importMap = `${env.workspaceDir}/import_map.json`;

        // Create a code file that runs longer than the timeout
        await env.writeCode(
          'timeout',
          `
          // Wait longer than the timeout
          await new Promise(resolve => setTimeout(resolve, 5000));
          console.log(JSON.stringify({ success: true }));
          `,
        );

        const baseline = await harness.getHealth();
        const baselineProcesses = baseline.activeProcesses;

        // Start execution with a short timeout
        const executePromise = fetch(`${harness.serverUrl}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codeId: 'timeout', timeout: 200 }), // 200ms timeout
        });

        // Poll to see activeProcesses increase
        const duringExecution = await pollHealth(
          harness,
          (health) => health.activeProcesses > baselineProcesses,
          {
            intervalMs: 50,
            timeoutMs: 1000,
            description: `activeProcesses to increase from ${baselineProcesses}`,
          },
        );

        assertEquals(
          duringExecution.activeProcesses,
          baselineProcesses + 1,
        );

        // Wait for timeout to occur
        const response = await executePromise;
        assertEquals(response.status, 408, 'Execution should timeout');

        // Verify activeProcesses returns to baseline after timeout
        const afterExecution = await pollHealth(
          harness,
          (health) => health.activeProcesses === baselineProcesses,
          {
            intervalMs: 50,
            timeoutMs: 2000, // Give extra time for SIGKILL cleanup
            description: `activeProcesses to return to baseline ${baselineProcesses} after timeout`,
          },
        );

        assertEquals(
          afterExecution.activeProcesses,
          baselineProcesses,
          `Expected activeProcesses to return to ${baselineProcesses} even after timeout`,
        );
      } finally {
        // deno-lint-ignore no-explicit-any
        (config as any).workspaceDir = originalWorkspaceDir;
        // deno-lint-ignore no-explicit-any
        (config as any).deno.importMap = originalImportMap;
      }
    } finally {
      await env.cleanup();
      await harness.stop();
    }
  },
});

Deno.test({
  name: 'Health - Deno subprocess can actually be spawned',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const env = new TestEnvironment();

    try {
      await env.setup();

      // Create a simple ping script
      await env.writeCode(
        'subprocess-test',
        `
        console.log(JSON.stringify({ success: true, message: "subprocess works" }));
        `,
      );

      // Directly spawn a Deno subprocess (no mocking)
      const command = new Deno.Command(config.deno.path, {
        args: [
          'run',
          '--no-prompt',
          '--quiet',
          '--allow-read',
          env.getCodePath('subprocess-test'),
        ],
        cwd: env.workspaceDir,
        stdout: 'piped',
        stderr: 'piped',
      });

      const child = command.spawn();
      const output = await child.output();

      // Verify subprocess executed successfully
      assertEquals(output.code, 0, 'Subprocess should exit with code 0');

      const stdout = new TextDecoder().decode(output.stdout);
      const result = JSON.parse(stdout.trim());

      assertEquals(result.success, true);
      assertEquals(result.message, 'subprocess works');
    } finally {
      await env.cleanup();
    }
  },
});
