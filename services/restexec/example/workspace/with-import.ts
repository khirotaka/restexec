/**
 * Example with Import
 *
 * This example demonstrates importing utilities from the /tools directory.
 */

import { add, multiply } from 'utils/math.ts';
import { capitalize, reverse } from 'utils/string.ts';

async function main() {
  const num1 = 10;
  const num2 = 5;
  const text = 'hello world';

  const result = {
    math: {
      addition: `${num1} + ${num2} = ${add(num1, num2)}`,
      multiplication: `${num1} × ${num2} = ${multiply(num1, num2)}`,
    },
    string: {
      original: text,
      capitalized: capitalize(text),
      reversed: reverse(text),
    },
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
