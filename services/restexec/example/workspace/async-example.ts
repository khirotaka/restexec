/**
 * Async Example
 *
 * This example demonstrates asynchronous operations.
 */

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchData(id: number): Promise<{ id: number; data: string }> {
  await delay(100);
  return {
    id,
    data: `Data for item ${id}`,
  };
}

async function main() {
  const startTime = Date.now();

  // Parallel execution
  const results = await Promise.all([
    fetchData(1),
    fetchData(2),
    fetchData(3),
  ]);

  const endTime = Date.now();
  const duration = endTime - startTime;

  const result = {
    results,
    executionTime: `${duration}ms`,
    status: 'success',
  };

  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error.message,
  }));
  Deno.exit(1);
});
