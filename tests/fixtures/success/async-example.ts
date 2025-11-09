async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  await delay(100);
  console.log(JSON.stringify({
    success: true,
    message: 'Async execution completed',
  }));
}

main();
