/**
 * Hello World Example
 *
 * This is a simple example that returns a greeting message.
 */

async function main() {
  // 環境変数 TEST_ENV を console に表示
  console.log(`TEST_ENV: ${Deno.env.get('TEST_ENV')}`);

  const result = {
    message: 'Hello, World!',
    timestamp: new Date().toISOString(),
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
