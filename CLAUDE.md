# CLAUDE.md - Project Guide for AI Assistants

This document provides essential context about the **restexec** project to help AI assistants (like Claude) understand the codebase and work effectively on it.

## Project Overview

**restexec** is a REST API service that safely executes TypeScript code via HTTP requests using the Deno runtime. It provides a secure, sandboxed environment for running user-submitted TypeScript code with fine-grained permission control.

### Key Features

- **Secure Code Execution**: Uses Deno's strict permission system for security
- **REST API Interface**: Simple HTTP endpoints for code execution and health checks
- **Resource Management**: Timeout-based execution limits and buffer controls
- **Shared Library System**: Workspace and tools directories for code organization
- **Comprehensive Error Handling**: Structured error types and detailed logging

### Target Use Cases

- Code education platforms for safe student code execution
- API automation and workflow execution
- Data processing with isolated computation tasks
- Testing environments for untrusted code
- Lightweight Function-as-a-Service for TypeScript

## Architecture

### High-Level Flow

```
Client Request → HTTP Server (Oak) → Validator → Executor → Deno Child Process
                      ↓                                            ↓
              Error Handler                          Workspace/Tools Files
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

4. **Configuration System** ([src/config.ts](src/config.ts))
   - Environment variable-based configuration
   - Deno permission configuration
   - Array and boolean parsing utilities

5. **Routes**
   - [src/routes/execute.ts](src/routes/execute.ts) - POST /execute endpoint
   - [src/routes/health.ts](src/routes/health.ts) - GET /health endpoint

6. **Type System** ([src/types/index.ts](src/types/index.ts))
   - TypeScript interfaces for requests/responses
   - Error type definitions
   - Execution result types

## Security Model

### Deno Permissions

restexec uses Deno's explicit permission system. By default:

- **Read**: Limited to `/workspace` and `/tools` directories
- **Write**: Disabled by default
- **Network**: Disabled by default (can be enabled via allowlist)
- **Subprocess**: Disabled by default
- **Environment**: Controlled access

Permissions are configured via environment variables (see [src/config.ts](src/config.ts#L11-L35)).

### Security Protections

1. **Path Traversal Prevention**: Validates codeId format and resolves paths safely
2. **Resource Limits**:
   - Default timeout: 5 seconds (configurable, max 300s)
   - Buffer limits: 10MB for stdout/stderr
3. **Process Isolation**: Each execution runs in a separate Deno child process
4. **Input Validation**: Strict validation of all request parameters
5. **Environment Isolation**: Limited environment variables passed to child processes

### Important Security Considerations

When working on this project:

- **Never bypass validation**: All user input must go through validation middleware
- **Maintain permission restrictions**: Changes to permission config require security review
- **Path handling**: Always use path resolution utilities to prevent traversal attacks
- **Error messages**: Avoid leaking system information in error responses
- **Timeout enforcement**: Ensure all executions are bounded by timeouts

## File Structure

```
restexec/
├── src/                      # Source code
│   ├── app.ts               # Oak application setup
│   ├── index.ts             # Entry point
│   ├── config.ts            # Configuration management
│   ├── executor.ts          # Code execution engine
│   ├── logger.ts            # Logging utilities
│   ├── middleware/
│   │   ├── error-handler.ts # Global error handling
│   │   ├── logger.ts        # Request logging
│   │   └── validation.ts    # Request validation
│   ├── routes/
│   │   ├── execute.ts       # Execution endpoint
│   │   └── health.ts        # Health check endpoint
│   └── types/
│       └── index.ts         # TypeScript type definitions
├── tests/                   # Test suites
├── example/                 # Sample code and utilities
│   ├── tools/               # Shared utility libraries
│   └── workspace/           # Example executable scripts
├── specs/                   # Comprehensive documentation
│   ├── API.md
│   ├── CodeExecutor.md
│   ├── Configuration.md
│   ├── Deployment.md
│   ├── FileSystem.md
│   ├── Logging.md
│   ├── Performance.md
│   ├── Regulation.md
│   ├── Security.md
│   ├── Sequencer.md
│   ├── SystemArchitecture.md
│   └── Test.md
├── deno.json               # Deno configuration
├── Dockerfile              # Container image
├── compose.yaml            # Docker Compose setup
├── README.md               # Project overview
└── DOCKER.md               # Docker documentation
```

### Runtime Directories

- **/workspace**: User-submitted code files (*.ts)
  - Contains executable TypeScript files
  - Includes `import_map.json` for module resolution

- **/tools**: Shared utility libraries
  - Provides reusable utilities for workspace code
  - Example utilities: math, string operations

## Development Guidelines

### Code Execution Contract

Code files in `/workspace` must:

1. Export a default function (sync or async)
2. Return JSON-serializable values
3. Follow TypeScript strict mode

Example:
```typescript
export default async function() {
  return { message: "Hello World", timestamp: Date.now() };
}
```

### Error Handling Pattern

Always use the defined error types from [src/types/index.ts](src/types/index.ts#L25-L31):

- `ValidationError`: Invalid request parameters
- `FileNotFoundError`: Code file doesn't exist
- `TimeoutError`: Execution exceeded timeout
- `ExecutionError`: Runtime errors in user code
- `InternalServerError`: Unexpected server errors

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

### Modifying Permissions

When changing permission configuration:

1. Update [src/config.ts](src/config.ts) with new environment variables
2. Modify [src/executor.ts](src/executor.ts) to use new permissions
3. Update [specs/Security.md](specs/Security.md) documentation
4. Review security implications
5. Update `.env` and Docker configuration

### Testing Strategy

- **Unit Tests**: Test individual components in isolation
- **Integration Tests**: Test API endpoints end-to-end
- **Security Tests**: Verify permission restrictions and input validation
- **Performance Tests**: Ensure execution meets performance targets

See [specs/Test.md](specs/Test.md) for detailed testing strategy.

## Common Tasks

### Adding a New Validation Rule

1. Update [src/middleware/validation.ts](src/middleware/validation.ts)
2. Add validation logic in `validateExecuteRequest` function
3. Return appropriate `ValidationError` for invalid input
4. Add test cases

### Extending Execution Engine

When modifying [src/executor.ts](src/executor.ts):

- Maintain timeout handling logic
- Preserve buffer limit checks
- Keep permission system intact
- Update error handling as needed
- Test signal handling (SIGTERM/SIGKILL)

### Adding New Error Types

1. Define error class in [src/types/index.ts](src/types/index.ts)
2. Add mapping in [src/middleware/error-handler.ts](src/middleware/error-handler.ts)
3. Update API documentation

## Performance Characteristics

Target performance (single container):

- Simple calculations: <200ms
- File I/O operations: <500ms
- Complex processing: <2000ms
- Throughput: 10 req/sec

See [specs/Performance.md](specs/Performance.md) for detailed benchmarks.

## Key Documentation

### Essential Reading

- [README.md](README.md) - Quick start guide
- [DOCKER.md](DOCKER.md) - Docker setup and deployment
- [specs/SystemArchitecture.md](specs/SystemArchitecture.md) - System architecture overview
- [specs/Security.md](specs/Security.md) - Security model and considerations

### Examples

- [example/workspace/](example/workspace/) - Sample executable scripts
- [example/tools/](example/tools/) - Sample utility libraries

## Technology Stack

- **Runtime**: Deno 2.5.6
- **Language**: TypeScript (strict mode)
- **Web Framework**: Oak v17.1.6
- **Container**: Alpine Linux based Docker image
- **Testing**: Deno's built-in test runner

## Environment Variables

Key configuration environment variables (see [src/config.ts](src/config.ts)):

- `PORT`: HTTP server port (default: 8080)
- `LOG_LEVEL`: Logging level (default: INFO)
- `DEFAULT_TIMEOUT_MS`: Default execution timeout (default: 5000)
- `DENO_PERMISSIONS_READ`: Read permissions (default: /workspace,/tools)
- `DENO_PERMISSIONS_WRITE`: Write permissions (default: empty)
- `DENO_PERMISSIONS_NET`: Network permissions (default: empty)
- `DENO_PERMISSIONS_RUN`: Subprocess permissions (default: empty)
- `DENO_PERMISSIONS_ENV`: Environment variable access (default: empty)

## Working with This Project

### Before Making Changes

1. Read relevant specs in `specs/` directory
2. Understand security implications
3. Check existing tests for patterns
4. Review error handling requirements

### When Adding Features

1. Update specifications in `specs/`
2. Implement with appropriate error handling
3. Add comprehensive tests
4. Update this CLAUDE.md if architecture changes
5. Update README.md if user-facing changes

### When Fixing Bugs

1. Identify root cause in architecture
2. Add test case reproducing the bug
3. Implement fix with minimal scope
4. Verify all tests pass
5. Document if it reveals a design issue

## Questions to Ask

If you're unsure about:

- **Security implications**: Refer to [specs/Security.md](specs/Security.md) or ask the user
- **Architecture decisions**: Check [specs/SystemArchitecture.md](specs/SystemArchitecture.md)
- **API behavior**: Consult [specs/API.md](specs/API.md)
- **Performance requirements**: See [specs/Performance.md](specs/Performance.md)

## Project Philosophy

- **Security First**: Deno's permission system is core to the design
- **Simplicity**: Simple REST API, file-based execution model
- **Isolation**: Each execution is isolated in its own process
- **Explicit Over Implicit**: All permissions and configs are explicit
- **TypeScript Strict Mode**: Type safety throughout

---

*This document helps Claude understand and work effectively with the restexec project. For user-facing documentation, see [README.md](README.md).*
