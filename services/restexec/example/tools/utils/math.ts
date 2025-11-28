/**
 * Math Utilities
 *
 * Common mathematical operations.
 */

export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('Division by zero');
  }
  return a / b;
}

export function sum(numbers: number[]): number {
  return numbers.reduce((acc, num) => acc + num, 0);
}

export function average(numbers: number[]): number {
  if (numbers.length === 0) {
    throw new Error('Cannot calculate average of empty array');
  }
  return sum(numbers) / numbers.length;
}

export function max(numbers: number[]): number {
  if (numbers.length === 0) {
    throw new Error('Cannot find max of empty array');
  }
  return Math.max(...numbers);
}

export function min(numbers: number[]): number {
  if (numbers.length === 0) {
    throw new Error('Cannot find min of empty array');
  }
  return Math.min(...numbers);
}
