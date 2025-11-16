/**
 * External library dependencies for restexec sandbox environment
 *
 * All external libraries must be pre-cached at build time due to the --cached-only flag.
 * Add any required libraries here with exact versions to ensure reproducible builds.
 *
 * Usage:
 * 1. Add library imports with exact versions
 * 2. Update import_map.json with corresponding aliases
 * 3. Rebuild Docker container to cache dependencies
 */

// ===== Utility Libraries =====
// Modern utility library with optimized performance
export * from 'https://esm.sh/es-toolkit@1.41.0';

// ===== Date/Time Libraries =====
// Comprehensive date manipulation library
export * from 'https://esm.sh/date-fns@3.0.0';

// ===== Validation Libraries =====
// TypeScript-first schema validation
export * from 'https://esm.sh/zod@3.22.4';

// ===== Data Processing =====
// CSV parser and writer
export * from 'https://esm.sh/papaparse@5.4.1';

// ===== String/ID Generation =====
// Secure, URL-friendly unique ID generator
export * from 'https://esm.sh/nanoid@5.0.9';

// ===== Math Libraries =====
// High-precision decimal arithmetic
export * from 'https://esm.sh/decimal.js@10.4.3';
