// This file should have no lint issues

function greet(name: string): string {
  return `Hello, ${name}!`;
}

const message = greet("World");
console.log(JSON.stringify({ message, timestamp: Date.now() }));
