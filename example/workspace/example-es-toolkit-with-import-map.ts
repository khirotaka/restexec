/**
 * Example: Using es-toolkit with Import Map
 *
 * This example demonstrates how to use external libraries via Import Map.
 * The library alias is defined in /workspace/import_map.json
 *
 * Requirements:
 * - DENO_ALLOW_NET=esm.sh must be set in environment variables
 * - import_map.json must include "es-toolkit": "https://esm.sh/es-toolkit@1.27.0"
 */

import { range, chunk } from "es-toolkit";

async function main() {
    // Create an array from 1 to 20
    const numbers = range(1, 21);

    // Split into chunks of 4
    const chunkedArray = chunk(numbers, 4);

    const result = {
        success: true,
        originalArray: numbers,
        chunkedArray: chunkedArray,
        totalElements: numbers.length,
        chunksCount: chunkedArray.length,
        chunkSize: 4
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
