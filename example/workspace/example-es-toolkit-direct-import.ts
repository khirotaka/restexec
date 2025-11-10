/**
 * Example: Using es-toolkit with Direct URL Import
 *
 * This example demonstrates how to import external libraries directly from a CDN.
 * No modification to import_map.json is required.
 *
 * Requirements:
 * - DENO_ALLOW_NET=esm.sh must be set in environment variables
 */

import { range, chunk, shuffle } from "https://esm.sh/es-toolkit@1.27.0";

async function main() {
    // Create an array from 1 to 20
    const numbers = range(1, 21);

    // Split into chunks of 4
    const chunkedArray = chunk(numbers, 4);

    // Shuffle the original array
    const shuffledArray = shuffle([...numbers]);

    const result = {
        success: true,
        data: {
            original: numbers,
            chunked: chunkedArray,
            shuffled: shuffledArray.slice(0, 10), // Show first 10 elements
        },
        metadata: {
            totalElements: numbers.length,
            chunksCount: chunkedArray.length,
            chunkSize: 4,
            library: "es-toolkit@1.27.0",
            cdnUsed: "esm.sh"
        }
    };

    console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
    console.error(JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
    }));
    Deno.exit(1);
});
