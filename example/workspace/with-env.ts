/**
 * Example: Using Environment Variables
 *
 * This demonstrates how to access environment variables in your code.
 * Environment variables can be passed via the `env` parameter in POST /execute requests.
 */

async function main() {
  // Get environment variables
  const apiKey = Deno.env.get('API_KEY');
  const debugMode = Deno.env.get('DEBUG_MODE');
  const userId = Deno.env.get('USER_ID');

  // Validate required environment variables
  if (!apiKey) {
    throw new Error('API_KEY environment variable is required');
  }

  const result = {
    success: true,
    message: 'Environment variables accessed successfully',
    config: {
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey.length,
      debugMode: debugMode === 'true',
      userId: userId || 'not-provided',
    },
    timestamp: new Date().toISOString(),
  };

  // REQUIRED: Output as JSON
  console.log(JSON.stringify(result));
}

// REQUIRED: Execute with error handling
main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error.message,
  }));
  Deno.exit(1);
});
