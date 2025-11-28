/**
 * Example: Using es-toolkit library for array operations
 *
 * This demonstrates how to use the pre-cached es-toolkit library
 * in the restexec sandbox environment.
 */
import { range, chunk, sum } from 'es-toolkit';

async function main() {
  try {
    // Generate range from 1 to 100
    const numbers = range(1, 101);

    // Split into chunks of 10
    const chunked = chunk(numbers, 10);

    // Calculate sum of first chunk
    const firstChunkSum = sum(chunked[0]);

    const result = {
      success: true,
      data: {
        totalNumbers: numbers.length,
        chunksCount: chunked.length,
        firstChunk: chunked[0],
        firstChunkSum,
        lastChunk: chunked[chunked.length - 1],
      },
    };

    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
    Deno.exit(1);
  }
}

main();
