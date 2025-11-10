/**
 * External library dependencies
 *
 * This file defines all external libraries that should be cached during
 * container build time. Since the executor uses `--no-remote` flag,
 * all external dependencies must be pre-cached.
 *
 * To add a new library:
 * 1. Add the import statement below with the full URL and version
 * 2. Update import_map.json to map the library to the URL
 * 3. Rebuild the Docker container to cache the new dependency
 *
 * The Dockerfile will run `deno cache deps.ts` to download and cache
 * all dependencies listed here.
 */

// Example libraries - uncomment and add your own as needed

// es-toolkit: Modern utility library
export * from "https://esm.sh/es-toolkit@1.27.0";

// date-fns: Date manipulation library
export * from "https://esm.sh/date-fns@3.0.0";

// zod: TypeScript-first validation library
// export * from "https://esm.sh/zod@3.22.4";

// lodash-es: Utility library
// export * from "https://esm.sh/lodash-es@4.17.21";

// mathjs: Math library
// export * from "https://esm.sh/mathjs@12.4.0";

// nanoid: Unique ID generator
// export * from "https://esm.sh/nanoid@5.0.4";

/**
 * IMPORTANT: Version Pinning
 *
 * Always specify exact versions (e.g., @1.27.0) instead of version ranges
 * (e.g., @^1.0.0) to ensure reproducible builds.
 */

/**
 * CDN Usage Guidelines
 *
 * Recommended CDNs for Deno:
 * - esm.sh: NPM packages as ES modules (best for NPM ecosystem)
 * - deno.land/x: Deno-specific modules
 * - cdn.jsdelivr.net: Fast global CDN
 *
 * Example URLs:
 * - esm.sh: https://esm.sh/package-name@version
 * - deno.land/x: https://deno.land/x/module@version/mod.ts
 */
