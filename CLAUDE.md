# CLAUDE.md - Project Guide for AI Assistants

This document provides essential context about the **restexec** project to help AI assistants (like Claude) understand the codebase and work effectively on it.

---

## 🌐 Language Preference / 言語優先設定

**IMPORTANT: Language-First Response Policy**

When interacting with developers:
- **Respond in the same language as the user's request**
- If the user asks in Japanese → Respond in Japanese (日本語で返答)
- If the user asks in English → Respond in English
- Maintain consistency throughout the conversation

This allows developers to interact with Claude in their preferred language for better onboarding and collaboration.

**重要: 言語優先のレスポンスポリシー**

開発者とのやり取りでは:
- **ユーザーのリクエストと同じ言語で返答する**
- ユーザーが日本語で質問 → 日本語で返答
- ユーザーが英語で質問 → 英語で返答
- 会話全体を通じて一貫性を保つ

これにより、開発者は好みの言語で Claude とやり取りでき、より良いオンボーディングとコラボレーションが可能になります。

---

## 📋 Table of Contents

- [Project Overview](#project-overview)
- [Quick Start for Developers](#quick-start-for-developers)
- [Architecture](#architecture)
- [API Endpoints](#api-endpoints)
- [Writing Workspace Code](#writing-workspace-code)
- [Managing External Libraries](#managing-external-libraries)
- [Security Model](#security-model)
- [File Structure](#file-structure)
- [Development Guidelines](#development-guidelines)
- [Common Tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)
- [Key Documentation](#key-documentation)

---

## Project Overview

**restexec** is a REST API service that safely executes TypeScript code via HTTP requests using the Deno runtime. It provides a secure, sandboxed environment for running user-submitted TypeScript code with fine-grained permission control.

### Key Features

- **Secure Code Execution**: Uses Deno's strict permission system for security
- **REST API Interface**: Three main endpoints: `/execute`, `/lint`, `/workspace`
- **Code Management**: Save, lint, and execute TypeScript code dynamically
- **Resource Management**: Timeout-based execution limits and buffer controls
- **Shared Library System**: Workspace and tools directories for code organization
- **Comprehensive Error Handling**: Structured error types and detailed logging
- **External Library Support**: Pre-cached external libraries via `deps.ts`

### Target Use Cases

- Code education platforms for safe student code execution
- API automation and workflow execution
- Data processing with isolated computation tasks
- Testing environments for untrusted code
- Lightweight Function-as-a-Service for TypeScript
- LLM-powered code generation and execution

---

## Quick Start for Developers

### Essential Concepts to Understand First

1. **Execution Model**: Code in `/workspace/*.ts` is executed directly as scripts (not imported as modules)
2. **Output Format**: Results must be printed to stdout as JSON using `console.log(JSON.stringify(result))`
3. **Three Core APIs**:
   - `PUT /workspace` - Save code to workspace
   - `POST /lint` - Lint TypeScript code
   - `POST /execute` - Execute code and get results

### Typical Workflow

```
1. PUT /workspace     → Save TypeScript code
2. POST /lint        → Check code quality (optional)
3. POST /execute     → Run code and get results
```

### Your First Interaction with restexec

When a developer asks about the project, guide them through:

1. **Understanding the execution model** ([docs/workspace-code-guide.md](docs/workspace-code-guide.md))
2. **Reviewing API endpoints** ([specs/API.md](specs/API.md))
3. **Learning security constraints** ([specs/Security.md](specs/Security.md))
4. **Exploring example code** ([example/workspace/](example/workspace/))

### Common Developer Questions

**Q: How do I write code that runs in restexec?**
→ See [Writing Workspace Code](#writing-workspace-code) section below

**Q: How do I add external libraries?**
→ See [Managing External Libraries](#managing-external-libraries) section below

**Q: What security restrictions apply?**
→ See [Security Model](#security-model) section below

**Q: Why is my code not returning results?**
→ See [Troubleshooting](#troubleshooting) section below

---

## Architecture

### High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      REST API Client                         │
└─────────────┬───────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│                HTTP Server (Oak Framework)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐│
│  │  Router  │→ │Validator │→ │ Executor │→ │Result Parser││
│  └──────────┘  └──────────┘  └──────────┘  └─────────────┘│
└─────────────┬───────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│              Deno Child Processes (Isolated)                 │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │  /workspace/*.ts │  │  /tools/*.ts    │                  │
│  │  (User Code)    │  │  (Utilities)    │                  │
│  └─────────────────┘  └─────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

### Execution Flow

For detailed sequence diagrams, see [specs/Sequence.md](specs/Sequence.md).

```
1. Client sends POST /execute {codeId, timeout}
2. Validator checks request parameters
3. Executor spawns Deno child process with permissions
4. Child process runs /workspace/{codeId}.ts
5. stdout/stderr captured with buffer limits
6. Timeout enforced with SIGTERM → SIGKILL
7. JSON parsed from stdout
8. Response returned to client
```

### Core Components

1. **HTTP Server Layer** ([src/app.ts](src/app.ts), [src/index.ts](src/index.ts))
   - Built with Oak framework (Deno's web framework)
   - Request logging middleware
   - Global error handling
   - Signal handling for graceful shutdown (SIGINT, SIGTERM)

2. **Validation Layer** ([src/middleware/validation.ts](src/middleware/validation.ts))
   - Request parameter validation
   - codeId format checking (alphanumeric, hyphens, underscores only)
   - Path traversal prevention
   - Timeout range validation (1ms - 300000ms)

3. **Execution Engine** ([src/executor.ts](src/executor.ts))
   - Spawns Deno child processes with controlled permissions
   - Builds permission arguments dynamically from config
   - Streams stdout/stderr with buffer limits (10MB)
   - Timeout management with signal escalation (SIGTERM → SIGKILL)
   - JSON output parsing with fallback

4. **Lint Engine** ([src/linter.ts](src/linter.ts))
   - Executes Deno's built-in linter on TypeScript files
   - Runs `deno lint --json` in child processes
   - Parses structured lint diagnostics
   - Shares timeout and buffer management with executor

5. **Workspace Manager** ([src/routes/workspace.ts](src/routes/workspace.ts))
   - Saves TypeScript code to `/workspace` directory
   - Extracts code from markdown blocks (supports LLM-generated responses)
   - Validates codeId and file size
   - Atomic file writes

6. **Configuration System** ([src/config.ts](src/config.ts))
   - Environment variable-based configuration
   - Deno permission configuration
   - Array and boolean parsing utilities

7. **Type System** ([src/types/index.ts](src/types/index.ts))
   - TypeScript interfaces for requests/responses
   - Error type definitions
   - Execution and lint result types

---

## API Endpoints

### 1. PUT /workspace - Save Code

**Purpose**: Save TypeScript code to the workspace for execution.

**Request**:
```json
{
  "codeId": "my-script",
  "code": "console.log(JSON.stringify({ message: 'Hello' }));"
}
```

**Response**:
```json
{
  "success": true,
  "result": {
    "codeId": "my-script",
    "filePath": "/workspace/my-script.ts",
    "size": 56
  }
}
```

**Features**:
- Supports plain TypeScript code
- Automatically extracts code from markdown blocks (```typescript or ```ts)
- Validates codeId format
- Maximum file size: 10MB

**See**: [specs/WorkspaceSaveAPI.md](specs/WorkspaceSaveAPI.md)

### 2. POST /lint - Lint Code

**Purpose**: Run `deno lint` on a TypeScript file to check code quality.

**Request**:
```json
{
  "codeId": "my-script",
  "timeout": 5000
}
```

**Response**:
```json
{
  "success": true,
  "result": {
    "version": 1,
    "diagnostics": [
      {
        "code": "no-unused-vars",
        "message": "'unusedVar' is declared but never used",
        "range": {
          "start": { "line": 5, "col": 6 },
          "end": { "line": 5, "col": 15 }
        },
        "filename": "/workspace/my-script.ts",
        "hint": "Remove the unused variable"
      }
    ],
    "errors": [],
    "checkedFiles": ["/workspace/my-script.ts"]
  },
  "executionTime": 123
}
```

**See**: [specs/LintAPI.md](specs/LintAPI.md)

### 3. POST /execute - Execute Code

**Purpose**: Execute a TypeScript file and return the results.

**Request**:
```json
{
  "codeId": "my-script",
  "timeout": 5000
}
```

**Response**:
```json
{
  "success": true,
  "result": {
    "message": "Hello, World!",
    "timestamp": "2025-01-09T10:00:00.000Z"
  },
  "executionTime": 234
}
```

**Error Response**:
```json
{
  "success": false,
  "error": {
    "type": "TimeoutError",
    "message": "Execution timed out after 5000ms",
    "details": { "timeout": 5000 }
  },
  "executionTime": 5000
}
```

**See**: [specs/API.md](specs/API.md), [specs/CodeExecution.md](specs/CodeExecution.md)

### 4. GET /health - Health Check

**Purpose**: Check server health and status.

**Response**:
```json
{
  "status": "ok",
  "uptime": 12345.678,
  "activeProcesses": 2,
  "memoryUsage": {
    "rss": 50331648,
    "heapTotal": 16777216,
    "heapUsed": 8388608,
    "external": 1048576
  },
  "version": "1.0.0"
}
```

---

## Writing Workspace Code

### Essential Requirements

All code in `/workspace/*.ts` must follow these rules:

1. **Output results as JSON** using `console.log(JSON.stringify(result))`
2. **Call your main function** - don't just define it
3. **Handle errors** with `.catch()` and exit with `Deno.exit(1)` on error
4. **Exit successfully** with code 0 (automatic if no error)

### Template: Async Function (Recommended)

```typescript
/**
 * Description of what this code does
 */

async function main() {
  // Your logic here
  const result = {
    message: "Processing complete",
    data: { /* your data */ },
    status: "success"
  };

  // REQUIRED: Output as JSON
  console.log(JSON.stringify(result));
}

// REQUIRED: Execute the function with error handling
main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error.message,
  }));
  Deno.exit(1);
});
```

### Template: Sync Function

```typescript
function main() {
  // Your logic here
  const result = {
    message: "Processing complete",
    data: { /* your data */ },
    status: "success"
  };

  console.log(JSON.stringify(result));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    success: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  Deno.exit(1);
}
```

### Common Patterns

#### Using External Utilities

```typescript
import { add, multiply } from 'utils/math.ts';
import { capitalize } from 'utils/string.ts';

async function main() {
  const sum = add(10, 20);
  const text = capitalize('hello world');

  const result = {
    calculation: sum,
    text: text,
    status: 'success'
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
```

#### Async Operations

```typescript
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const startTime = Date.now();

  // Parallel execution
  const results = await Promise.all([
    delay(100).then(() => "Task 1"),
    delay(100).then(() => "Task 2"),
    delay(100).then(() => "Task 3"),
  ]);

  const endTime = Date.now();

  console.log(JSON.stringify({
    results,
    duration: endTime - startTime,
    status: 'success'
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error.message,
  }));
  Deno.exit(1);
});
```

### Common Mistakes to Avoid

❌ **Don't export default**
```typescript
// This DOES NOT WORK
export default function main() {
  return { message: "Hello" };
}
```

❌ **Don't just return values**
```typescript
// This DOES NOT WORK
async function main() {
  return { message: "Hello" };  // Not printed to stdout
}
main();
```

❌ **Don't forget JSON.stringify**
```typescript
// This DOES NOT WORK
console.log({ message: "Hello" });  // Outputs "[object Object]"
```

❌ **Don't use process.exit (Node.js API)**
```typescript
// This DOES NOT WORK in Deno
process.exit(1);  // Use Deno.exit(1) instead
```

❌ **Don't forget to call the function**
```typescript
// This DOES NOT WORK
async function main() {
  console.log(JSON.stringify({ message: "Hello" }));
}
// Forgot to call main()!
```

### Security Constraints

**Allowed by default:**
- ✅ Read files from `/workspace` and `/tools`
- ✅ Use TypeScript standard library
- ✅ Import from cached external libraries

**Forbidden by default:**
- ❌ Write files (no write permission)
- ❌ Network access (no net permission)
- ❌ Run subprocesses (no run permission)
- ❌ Access environment variables (limited access)
- ❌ Access files outside `/workspace` and `/tools`

**Resource limits:**
- Default timeout: 5 seconds (max 300 seconds)
- Buffer limit: 10MB for stdout/stderr
- File size limit: 10MB for saved files

### Complete Guide

For a comprehensive guide with more examples and best practices, see:
- [docs/workspace-code-guide.md](docs/workspace-code-guide.md)
- [example/workspace/](example/workspace/) - Working examples

---

## Managing External Libraries

### Overview

restexec uses a **pre-caching system** for external libraries. All external dependencies must be cached at container build time via `deps.ts`. Runtime downloads are blocked for security.

### How It Works

```typescript
// Execution uses --cached-only flag
const args = ['run', '--no-prompt', '--cached-only'];
```

- **--cached-only**: Only cached modules can be used (no new downloads)
- **--no-remote**: Blocks remote module imports entirely (security)
- **Build-time caching**: All libraries are downloaded during Docker build

### Adding a New Library

#### Step 1: Add to deps.ts

Edit the `deps.ts` file at the project root:

```typescript
// deps.ts

// es-toolkit: Modern utility library
export * from "https://esm.sh/es-toolkit@1.27.0";

// date-fns: Date manipulation library
export * from "https://esm.sh/date-fns@3.0.0";

// zod: TypeScript-first validation library
export * from "https://esm.sh/zod@3.22.4";
```

**Important**: Always specify exact versions (not `^1.0.0` or `latest`).

#### Step 2: Update import_map.json (Optional)

Add convenient aliases for imports:

```json
{
  "imports": {
    "@/": "/tools/",
    "utils/": "/tools/utils/",
    "es-toolkit": "https://esm.sh/es-toolkit@1.27.0",
    "date-fns": "https://esm.sh/date-fns@3.0.0",
    "zod": "https://esm.sh/zod@3.22.4"
  }
}
```

#### Step 3: Rebuild Docker Container

```bash
docker compose build
```

The Dockerfile automatically caches dependencies:

```dockerfile
COPY deps.ts ./
RUN deno cache deps.ts
```

#### Step 4: Restart Container

```bash
docker compose up -d
```

### Using Libraries in Workspace Code

```typescript
import { range, chunk } from "es-toolkit";
import { format, addDays } from "date-fns";
import { z } from "zod";

async function main() {
  // Use libraries
  const numbers = range(1, 101);
  const chunks = chunk(numbers, 10);
  const today = format(new Date(), 'yyyy-MM-dd');

  const result = {
    chunks: chunks.length,
    date: today,
    status: 'success'
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
```

### Recommended Libraries

| Category | Library | Version | URL |
|----------|---------|---------|-----|
| Utilities | es-toolkit | 1.27.0 | `https://esm.sh/es-toolkit@1.27.0` |
| Utilities | lodash-es | 4.17.21 | `https://esm.sh/lodash-es@4.17.21` |
| Date/Time | date-fns | 3.0.0 | `https://esm.sh/date-fns@3.0.0` |
| Date/Time | dayjs | 1.11.10 | `https://esm.sh/dayjs@1.11.10` |
| Validation | zod | 3.22.4 | `https://esm.sh/zod@3.22.4` |
| Data | papaparse | 5.4.1 | `https://esm.sh/papaparse@5.4.1` |
| Math | mathjs | 12.4.0 | `https://esm.sh/mathjs@12.4.0` |

### CDN Sources

- **esm.sh** (Recommended): NPM packages as ES modules with automatic TypeScript types
- **deno.land/x**: Deno-specific modules
- **cdn.jsdelivr.net**: Fast global CDN for NPM/GitHub
- **unpkg.com**: Simple NPM CDN

### Best Practices

1. **Pin versions**: Always use exact versions (e.g., `@1.27.0`, not `@^1.0.0`)
2. **Keep deps.ts organized**: Group by category with comments
3. **Sync URLs**: Ensure `deps.ts` and `import_map.json` URLs match exactly
4. **Minimize dependencies**: Only add what you need
5. **Document changes**: Update library list when adding new dependencies

### Complete Guide

For detailed instructions, examples, and troubleshooting, see:
- [specs/Libraries.md](specs/Libraries.md)

---

## Security Model

### Deno Permission System

restexec leverages Deno's strict permission model for security:

| Permission | Default | Configuration |
|------------|---------|---------------|
| **Read** | `/workspace`, `/tools` | `DENO_ALLOW_READ` |
| **Write** | Disabled | `DENO_ALLOW_WRITE` |
| **Network** | Disabled | `DENO_ALLOW_NET` |
| **Run** | Disabled | `DENO_ALLOW_RUN` |
| **Environment** | Limited | Hardcoded (PATH, DENO_DIR) |

### Security Layers

1. **Path Traversal Prevention**
   - codeId validation (alphanumeric, hyphens, underscores only)
   - No path separators (`/`, `\`) allowed
   - No parent directory references (`..`)

2. **Resource Limits**
   - Default timeout: 5 seconds (max: 300 seconds)
   - Buffer limits: 10MB for stdout/stderr
   - File size limit: 10MB for workspace files

3. **Process Isolation**
   - Each execution runs in isolated Deno child process
   - Limited environment variables (PATH, DENO_DIR only)
   - stdin closed (no user input)

4. **Network Security**
   - `--no-remote` flag blocks remote module imports
   - `--cached-only` allows only pre-cached dependencies
   - Network access disabled by default (can allowlist specific hosts)

5. **Input Validation**
   - All request parameters validated before processing
   - JSON parsing with error handling
   - File existence checks before execution

### Security Benefits vs. Node.js/tsx

| Threat | Mitigation |
|--------|------------|
| File system access | ✅ Limited to `/workspace` and `/tools` |
| Network attacks | ✅ Disabled by default, allowlist-based |
| Remote code injection | ✅ `--no-remote` blocks dynamic imports |
| Subprocess attacks | ✅ Subprocess execution disabled |
| Resource exhaustion | ⚠️ Timeout + container limits |

### Security Considerations for Development

When working on restexec:

- **Never bypass validation**: All user input must go through validation middleware
- **Maintain permission restrictions**: Changes to permissions require security review
- **Path handling**: Always use path resolution utilities
- **Error messages**: Avoid leaking system information
- **Timeout enforcement**: Ensure all executions are bounded by timeouts

### Complete Guide

For detailed security information, see:
- [specs/Security.md](specs/Security.md)

---

## File Structure

```
restexec/
├── src/                      # Source code
│   ├── app.ts               # Oak application setup
│   ├── index.ts             # Entry point
│   ├── config.ts            # Configuration management
│   ├── executor.ts          # Code execution engine
│   ├── linter.ts            # Lint execution engine
│   ├── logger.ts            # Logging utilities
│   ├── middleware/
│   │   ├── error-handler.ts # Global error handling
│   │   ├── logger.ts        # Request logging
│   │   └── validation.ts    # Request validation
│   ├── routes/
│   │   ├── execute.ts       # POST /execute endpoint
│   │   ├── lint.ts          # POST /lint endpoint
│   │   ├── workspace.ts     # PUT /workspace endpoint
│   │   └── health.ts        # GET /health endpoint
│   ├── utils/
│   │   └── codeExtractor.ts # Markdown code block extraction
│   └── types/
│       └── index.ts         # TypeScript type definitions
├── tests/                   # Test suites
│   ├── unit/
│   ├── integration/
│   └── security/
├── example/                 # Sample code and utilities
│   ├── tools/               # Shared utility libraries
│   │   └── utils/
│   │       ├── math.ts      # Math utilities
│   │       └── string.ts    # String utilities
│   └── workspace/           # Example executable scripts
│       ├── hello-world.ts
│       ├── with-import.ts
│       └── async-example.ts
├── docs/                    # Developer documentation
│   └── workspace-code-guide.md
├── specs/                   # Comprehensive specifications
│   ├── API.md               # API endpoint specs
│   ├── CodeExecution.md     # Code execution details
│   ├── Configuration.md     # Environment variables
│   ├── Deployment.md        # Deployment guide
│   ├── FileSystem.md        # File system structure
│   ├── Libraries.md         # External library management
│   ├── LintAPI.md           # Lint API specification
│   ├── Logging.md           # Logging configuration
│   ├── Performance.md       # Performance benchmarks
│   ├── Regulation.md        # Execution regulations
│   ├── Security.md          # Security considerations
│   ├── Sequence.md          # Execution flow diagrams
│   ├── SystemArchitecture.md# System architecture
│   ├── Test.md              # Testing strategy
│   └── WorkspaceSaveAPI.md  # Workspace save API
├── deps.ts                  # External library dependencies
├── deno.json               # Deno configuration
├── Dockerfile              # Container image
├── compose.yaml            # Docker Compose setup
├── README.md               # Project overview
├── DOCKER.md               # Docker documentation
└── CLAUDE.md               # This file
```

### Runtime Directories

- **/workspace**: User-submitted code files (*.ts)
  - Contains executable TypeScript files
  - Includes `import_map.json` for module resolution
  - Files are created via PUT /workspace API

- **/tools**: Shared utility libraries
  - Provides reusable utilities for workspace code
  - Example utilities: math, string operations
  - Can be imported from workspace code

---

## Development Guidelines

### Code Execution Contract

Code files in `/workspace` must follow these rules:

1. **Direct execution**: Files are executed as scripts (not imported as modules)
2. **JSON output**: Results captured from stdout via `console.log(JSON.stringify(...))`
3. **TypeScript strict mode**: Follow strict TypeScript conventions
4. **Async support**: Top-level await is supported
5. **Error handling**: Errors should be handled and reported via stderr with exit code 1

### Error Handling Pattern

Always use the defined error types from [src/types/index.ts](src/types/index.ts):

- `ValidationError`: Invalid request parameters (400)
- `FileNotFoundError`: Code file doesn't exist (404)
- `TimeoutError`: Execution exceeded timeout (408)
- `ExecutionError`: Runtime errors in user code (500)
- `InternalServerError`: Unexpected server errors (500)

Example:
```typescript
throw new ValidationError("Invalid codeId format");
```

### Adding New Endpoints

1. Create route handler in `src/routes/`
2. Add validation middleware if needed
3. Register route in [src/app.ts](src/app.ts)
4. Update API documentation in [specs/API.md](specs/API.md)
5. Add tests in `tests/`
6. Update this CLAUDE.md if needed

### Modifying Permissions

When changing permission configuration:

1. Update [src/config.ts](src/config.ts) with new environment variables
2. Modify [src/executor.ts](src/executor.ts) to use new permissions
3. Update [specs/Security.md](specs/Security.md) documentation
4. Review security implications thoroughly
5. Update `.env` and Docker configuration
6. Add tests for new permission behavior

### Testing Strategy

- **Unit Tests**: Test individual components in isolation
- **Integration Tests**: Test API endpoints end-to-end
- **Security Tests**: Verify permission restrictions and input validation
- **Performance Tests**: Ensure execution meets performance targets

See [specs/Test.md](specs/Test.md) for detailed testing strategy.

### Performance Characteristics

Target performance (single container):

- Simple calculations: <200ms
- File I/O operations: <500ms
- Complex processing: <2000ms
- Lint operations: <500ms
- Throughput: 10 req/sec

See [specs/Performance.md](specs/Performance.md) for detailed benchmarks.

---

## Common Tasks

### Adding a New Validation Rule

1. Update [src/middleware/validation.ts](src/middleware/validation.ts)
2. Add validation logic in appropriate validation function
3. Return appropriate `ValidationError` for invalid input
4. Add test cases in `tests/`
5. Update API documentation

### Extending Execution Engine

When modifying [src/executor.ts](src/executor.ts):

- Maintain timeout handling logic
- Preserve buffer limit checks
- Keep permission system intact
- Update error handling as needed
- Test signal handling (SIGTERM/SIGKILL)
- Update performance benchmarks if behavior changes

### Adding New Error Types

1. Define error class in [src/types/index.ts](src/types/index.ts)
2. Add HTTP status code mapping in [src/middleware/error-handler.ts](src/middleware/error-handler.ts)
3. Update API documentation in [specs/API.md](specs/API.md)
4. Add test cases for the new error type

### Adding a New External Library

1. Add library to `deps.ts` with exact version
2. Update `import_map.json` with convenient alias (optional)
3. Rebuild Docker container: `docker compose build`
4. Restart container: `docker compose up -d`
5. Update [specs/Libraries.md](specs/Libraries.md) with new library info
6. Add example usage in [example/workspace/](example/workspace/)

### Debugging Execution Issues

1. Check logs: `docker compose logs -f`
2. Review stdout/stderr from execution
3. Test with simplified code to isolate issue
4. Verify permissions are correctly configured
5. Check timeout settings
6. Use GET /health to verify server status

---

## Troubleshooting

### Problem: Code execution returns `null`

**Symptoms**: The `result` field is `null` despite code running

**Common causes**:
1. Missing `console.log(JSON.stringify(result))`
2. Function defined but not called
3. Using `return` instead of `console.log`
4. Exporting instead of executing

**Solution**: Ensure code follows the [Writing Workspace Code](#writing-workspace-code) template.

### Problem: "Module not found" error

**Symptoms**: Error when importing external library

**Common causes**:
1. Library not added to `deps.ts`
2. Container not rebuilt after adding library
3. Wrong import path or URL
4. Typo in `import_map.json`

**Solution**:
1. Add library to `deps.ts`
2. Run `docker compose build`
3. Run `docker compose up -d`
4. Verify URL in `deps.ts` matches `import_map.json`

### Problem: Timeout errors

**Symptoms**: `TimeoutError: Execution timed out after Xms`

**Common causes**:
1. Infinite loops
2. Long-running operations
3. Timeout set too low
4. Deadlocks or blocking operations

**Solution**:
1. Review code for infinite loops
2. Increase timeout in request: `{"timeout": 30000}`
3. Optimize code for better performance
4. Use async operations with proper timeouts

### Problem: Permission denied errors

**Symptoms**: Errors about missing permissions (read, write, net, etc.)

**Common causes**:
1. Code trying to access forbidden resources
2. Permissions not configured in environment variables
3. Path outside allowed directories

**Solution**:
1. Review [Security Model](#security-model) for allowed operations
2. Configure permissions via environment variables if needed
3. Ensure code only accesses `/workspace` and `/tools`
4. Use allowed operations only

### Problem: File not found (404)

**Symptoms**: `FileNotFoundError: Code file not found`

**Common causes**:
1. File not saved via PUT /workspace
2. Wrong codeId in execute request
3. File extension mismatch

**Solution**:
1. Save file first: `PUT /workspace {"codeId": "my-script", "code": "..."}`
2. Use exact same codeId in execute: `POST /execute {"codeId": "my-script"}`
3. Don't include `.ts` extension in codeId

### Problem: Invalid JSON output

**Symptoms**: Parsing errors or malformed result

**Common causes**:
1. Forgot `JSON.stringify()`
2. Multiple console.log statements
3. console.log with non-serializable data
4. Mixed stdout content

**Solution**:
1. Always use `console.log(JSON.stringify(result))`
2. Use only one `console.log` for the final result
3. Ensure all data is JSON-serializable
4. Use `console.error` for debugging output

### Problem: Container won't start

**Symptoms**: Docker container exits immediately or won't start

**Common causes**:
1. Port already in use
2. Invalid configuration
3. Build errors
4. Missing dependencies

**Solution**:
1. Check logs: `docker compose logs`
2. Verify port 8080 is available
3. Rebuild: `docker compose build --no-cache`
4. Check environment variables in `compose.yaml`

### Getting Help

If you encounter issues not covered here:

1. **Check logs**: `docker compose logs -f restexec`
2. **Review specifications**: Check relevant docs in `specs/`
3. **Inspect examples**: Look at working examples in `example/workspace/`
4. **Test with minimal code**: Isolate the problem with simple test case
5. **Ask Claude**: Describe the issue in detail with error messages

---

## Key Documentation

### Essential Reading

**For Quick Start**:
- [README.md](README.md) - Quick start guide and overview
- [DOCKER.md](DOCKER.md) - Docker setup and deployment

**For Development**:
- [docs/workspace-code-guide.md](docs/workspace-code-guide.md) - Writing workspace code
- [specs/API.md](specs/API.md) - API endpoint specifications
- [specs/Security.md](specs/Security.md) - Security model and considerations

**For Architecture**:
- [specs/SystemArchitecture.md](specs/SystemArchitecture.md) - System design
- [specs/Sequence.md](specs/Sequence.md) - Execution flow diagrams
- [specs/CodeExecution.md](specs/CodeExecution.md) - Execution details

**For Specific Features**:
- [specs/WorkspaceSaveAPI.md](specs/WorkspaceSaveAPI.md) - Save code API
- [specs/LintAPI.md](specs/LintAPI.md) - Lint API specification
- [specs/Libraries.md](specs/Libraries.md) - External library management
- [specs/Configuration.md](specs/Configuration.md) - Environment variables

**For Operations**:
- [specs/Deployment.md](specs/Deployment.md) - Deployment guide
- [specs/Performance.md](specs/Performance.md) - Performance benchmarks
- [specs/Test.md](specs/Test.md) - Testing strategy

### Working Examples

**Code Examples**:
- [example/workspace/hello-world.ts](example/workspace/hello-world.ts) - Simple example
- [example/workspace/with-import.ts](example/workspace/with-import.ts) - Import example
- [example/workspace/async-example.ts](example/workspace/async-example.ts) - Async example

**Utility Examples**:
- [example/tools/utils/math.ts](example/tools/utils/math.ts) - Math utilities
- [example/tools/utils/string.ts](example/tools/utils/string.ts) - String utilities

---

## Technology Stack

- **Runtime**: Deno 2.5.6
- **Language**: TypeScript (strict mode)
- **Web Framework**: Oak v17.1.6
- **Container**: Alpine Linux based Docker image
- **Testing**: Deno's built-in test runner
- **External Libraries**: Managed via deps.ts and esm.sh CDN

---

## Environment Variables

Key configuration environment variables (see [src/config.ts](src/config.ts) and [specs/Configuration.md](specs/Configuration.md)):

### Server Configuration
- `PORT`: HTTP server port (default: 3000)
- `LOG_LEVEL`: Logging level (default: info) - DEBUG, INFO, WARN, ERROR

### Execution Configuration
- `DEFAULT_TIMEOUT`: Default timeout in milliseconds (default: 5000)
- `MAX_TIMEOUT`: Maximum timeout in milliseconds (default: 300000)
- `WORKSPACE_DIR`: Code execution directory (default: /workspace)
- `TOOLS_DIR`: Shared tools directory (default: /tools)

### Deno Configuration
- `DENO_PATH`: Path to Deno executable (default: deno)
- `DENO_IMPORT_MAP`: Path to import map (default: /workspace/import_map.json)

### Deno Permissions
- `DENO_ALLOW_READ`: Read permissions (default: /workspace,/tools)
- `DENO_ALLOW_WRITE`: Write permissions (default: empty)
- `DENO_ALLOW_NET`: Network permissions (default: empty)
- `DENO_ALLOW_RUN`: Subprocess permissions (default: empty)

---

## Working with This Project

### Before Making Changes

1. Read relevant specs in `specs/` directory
2. Understand security implications
3. Check existing tests for patterns
4. Review error handling requirements
5. Consider performance impact

### When Adding Features

1. Update specifications in `specs/`
2. Implement with appropriate error handling
3. Add comprehensive tests
4. Update this CLAUDE.md if architecture changes
5. Update README.md if user-facing changes
6. Add examples if applicable

### When Fixing Bugs

1. Identify root cause in architecture
2. Add test case reproducing the bug
3. Implement fix with minimal scope
4. Verify all tests pass
5. Document if it reveals a design issue
6. Update troubleshooting section if needed

### Questions to Ask the User

If you're unsure about:

- **Security implications**: Refer to [specs/Security.md](specs/Security.md) or ask the user
- **Architecture decisions**: Check [specs/SystemArchitecture.md](specs/SystemArchitecture.md) or ask
- **API behavior**: Consult [specs/API.md](specs/API.md) or ask
- **Performance requirements**: See [specs/Performance.md](specs/Performance.md) or ask
- **New features**: Clarify requirements and expected behavior with the user

---

## Project Philosophy

- **Security First**: Deno's permission system is core to the design
- **Simplicity**: Simple REST API, file-based execution model
- **Isolation**: Each execution is isolated in its own process
- **Explicit Over Implicit**: All permissions and configs are explicit
- **TypeScript Strict Mode**: Type safety throughout
- **Developer Experience**: Easy onboarding and clear documentation
- **LLM-Friendly**: Designed to work well with AI assistants

---

## Onboarding Checklist for Developers

When helping a new developer get started:

- [ ] Explain the execution model (scripts, not modules)
- [ ] Show the workspace code template
- [ ] Demonstrate the PUT → LINT → EXECUTE workflow
- [ ] Explain security constraints and permissions
- [ ] Guide through the documentation structure
- [ ] Show working examples in `example/workspace/`
- [ ] Explain how to add external libraries
- [ ] Review common mistakes and troubleshooting
- [ ] Encourage reading `docs/workspace-code-guide.md`
- [ ] Point to relevant specs based on their needs

---

*This document helps Claude understand and work effectively with the restexec project. For user-facing documentation, see [README.md](README.md).*

*Last updated: 2025-11-12*
