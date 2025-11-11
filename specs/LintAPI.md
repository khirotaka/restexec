# Lint API Specification

## Overview

The Lint API provides a REST endpoint to execute `deno lint` on TypeScript files within the `/workspace` directory. This endpoint enables static code analysis to identify potential issues and code quality problems.

## API Endpoint

### POST /lint

Executes Deno's linter on a specified TypeScript file in the workspace directory.

## Request

### Method
`POST`

### Headers
- `Content-Type: application/json`

### Request Body

```json
{
  "codeId": "string",
  "timeout": "number (optional)"
}
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `codeId` | string | Yes | Identifier for the code file to lint. Must be alphanumeric with hyphens and underscores only. No path separators allowed. |
| `timeout` | number | No | Maximum execution time in milliseconds. Default: 5000ms. Range: 1-300000ms. |

### Validation Rules

The request must satisfy the following validation rules (similar to `/execute` endpoint):

1. **codeId**:
   - Must be provided and non-empty
   - Must be a string
   - Must contain only alphanumeric characters, hyphens (-), and underscores (_)
   - Must not contain path separators (`/`, `\`)
   - Must not contain parent directory references (`..`)

2. **timeout** (optional):
   - Must be an integer
   - Must be between 1 and 300000 (5 minutes)

## Response

### Success Response (200 OK)

```json
{
  "success": true,
  "result": {
    "version": 1,
    "diagnostics": [
      {
        "code": "string",
        "message": "string",
        "range": {
          "start": { "line": "number", "col": "number" },
          "end": { "line": "number", "col": "number" }
        },
        "filename": "string",
        "hint": "string (optional)"
      }
    ],
    "errors": [],
    "checkedFiles": [
      "/workspace/example.ts"
    ]
  },
  "executionTime": "number"
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always `true` for successful requests |
| `result.version` | number | Deno lint output format version |
| `result.diagnostics` | array | Array of lint diagnostic objects |
| `result.errors` | array | Array of errors encountered during linting |
| `result.checkedFiles` | array | Array of file paths that were checked |
| `executionTime` | number | Time taken to execute lint in milliseconds |

#### Diagnostic Object

| Field | Type | Description |
|-------|------|-------------|
| `code` | string | Lint rule code (e.g., "no-unused-vars") |
| `message` | string | Description of the lint issue |
| `range.start` | object | Start position of the issue (line and column) |
| `range.end` | object | End position of the issue (line and column) |
| `filename` | string | File path where the issue was found |
| `hint` | string | Optional suggestion for fixing the issue |

### Error Responses

#### ValidationError (400 Bad Request)

Returned when request validation fails.

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "codeId must contain only alphanumeric characters, hyphens, and underscores",
    "details": {
      "field": "codeId",
      "value": "../invalid"
    }
  }
}
```

#### FileNotFoundError (404 Not Found)

Returned when the specified code file does not exist.

```json
{
  "success": false,
  "error": {
    "type": "FileNotFoundError",
    "message": "Code file not found: example",
    "details": {
      "codeId": "example"
    }
  }
}
```

#### TimeoutError (408 Request Timeout)

Returned when lint execution exceeds the specified timeout.

```json
{
  "success": false,
  "error": {
    "type": "TimeoutError",
    "message": "Execution timed out after 5000ms",
    "details": {
      "timeout": 5000
    }
  },
  "executionTime": 5000
}
```

#### ExecutionError (500 Internal Server Error)

Returned when lint execution fails unexpectedly.

```json
{
  "success": false,
  "error": {
    "type": "ExecutionError",
    "message": "Failed to execute lint process",
    "details": {
      "stderr": "error details..."
    }
  },
  "executionTime": "number"
}
```

#### InternalError (500 Internal Server Error)

Returned for unexpected server errors.

```json
{
  "success": false,
  "error": {
    "type": "InternalError",
    "message": "An unexpected error occurred",
    "details": {}
  }
}
```

## Implementation Details

### Execution Process

1. **Validation**: Request body is validated using the same validation middleware as `/execute` endpoint
2. **File Resolution**: The file path is constructed as `/workspace/${codeId}.ts`
3. **File Existence Check**: Verify the file exists before attempting to lint
4. **Process Spawn**: Execute `deno lint --json ${filePath}` in a child process
5. **Output Capture**: Capture stdout with JSON output from Deno lint
6. **Timeout Management**: Kill process with SIGTERM/SIGKILL if timeout is exceeded
7. **JSON Parsing**: Parse the JSON output from Deno lint
8. **Response**: Return diagnostics array and metadata

### Command Execution

```bash
deno lint --json /workspace/${codeId}.ts
```

### Security Considerations

1. **Path Traversal Prevention**: Same validation as `/execute` endpoint prevents path traversal attacks
2. **Resource Limits**:
   - Default timeout: 5000ms (lint operations should be fast)
   - Maximum timeout: 300000ms (5 minutes)
   - Buffer limits: 10MB for stdout/stderr
3. **Process Isolation**: Each lint operation runs in an isolated child process
4. **Minimal Permissions**: Lint process only needs read access to the target file

### Performance Expectations

Lint operations are typically faster than code execution:

- Simple files: <100ms
- Medium complexity files: <500ms
- Large files: <2000ms

### Differences from /execute Endpoint

| Aspect | /execute | /lint |
|--------|----------|-------|
| Command | `deno run` with permissions | `deno lint --json` |
| Permissions | Configurable (read, write, net, etc.) | Read-only (implicit for lint) |
| Output parsing | JSON from stdout with fallback | Strict JSON parsing of lint output |
| Default timeout | 5000ms | 5000ms (same) |
| Expected speed | Variable (depends on code) | Fast (typically <500ms) |

## Example Usage

### Request Example 1: Lint a clean file

```bash
curl -X POST http://localhost:8080/lint \
  -H "Content-Type: application/json" \
  -d '{"codeId": "example-clean"}'
```

Response:
```json
{
  "success": true,
  "result": {
    "version": 1,
    "diagnostics": [],
    "errors": [],
    "checkedFiles": [
      "/workspace/example-clean.ts"
    ]
  },
  "executionTime": 123
}
```

### Request Example 2: Lint a file with issues

```bash
curl -X POST http://localhost:8080/lint \
  -H "Content-Type: application/json" \
  -d '{"codeId": "example-issues", "timeout": 10000}'
```

Response:
```json
{
  "success": true,
  "result": {
    "version": 1,
    "diagnostics": [
      {
        "code": "no-unused-vars",
        "message": "'unusedVariable' is declared but never used",
        "range": {
          "start": { "line": 5, "col": 6 },
          "end": { "line": 5, "col": 20 }
        },
        "filename": "/workspace/example-issues.ts",
        "hint": "Remove the unused variable or prefix it with an underscore"
      }
    ],
    "errors": [],
    "checkedFiles": [
      "/workspace/example-issues.ts"
    ]
  },
  "executionTime": 234
}
```

### Request Example 3: File not found

```bash
curl -X POST http://localhost:8080/lint \
  -H "Content-Type: application/json" \
  -d '{"codeId": "nonexistent"}'
```

Response:
```json
{
  "success": false,
  "error": {
    "type": "FileNotFoundError",
    "message": "Code file not found: nonexistent",
    "details": {
      "codeId": "nonexistent"
    }
  }
}
```

## Testing Requirements

The following test scenarios should be covered:

1. **Successful Lint (Clean File)**:
   - Verify diagnostics array is empty
   - Verify checkedFiles contains the correct path
   - Verify executionTime is reasonable

2. **Successful Lint (File with Issues)**:
   - Verify diagnostics array contains expected issues
   - Verify diagnostic structure is correct
   - Verify line/column information is accurate

3. **File Not Found**:
   - Verify 404 response with FileNotFoundError
   - Verify error message includes codeId

4. **Invalid CodeId**:
   - Test path traversal attempts (`../`, `./`)
   - Test invalid characters (`@`, `#`, `/`)
   - Test empty codeId

5. **Timeout**:
   - Verify timeout is enforced
   - Verify TimeoutError response

6. **Invalid JSON**:
   - Verify ValidationError for malformed JSON
   - Verify ValidationError for missing codeId

7. **Timeout Parameter**:
   - Verify custom timeout is respected
   - Verify timeout out of range is rejected

## Integration with Existing Architecture

### New Files to Create

1. **src/routes/lint.ts**: Router for `/lint` endpoint
2. **src/linter.ts**: Lint execution engine (similar to `executor.ts`)

### Files to Modify

1. **src/types/index.ts**: Add `LintRequest` and `LintResult` types
2. **src/middleware/validation.ts**: Add `validateLintRequest` middleware (can reuse most logic)
3. **src/app.ts**: Register lint router

### Reusable Components

- Validation logic for `codeId` (reuse from `validateExecuteRequest`)
- File existence check pattern
- Process timeout management
- Error handling patterns
- Buffer limit handling

## Future Enhancements

Potential future improvements (out of scope for initial implementation):

1. **Configuration Options**: Allow passing lint configuration or rules
2. **Multiple Files**: Support linting multiple files in one request
3. **Fix Mode**: Support `deno lint --fix` for auto-fixing issues
4. **Caching**: Cache lint results for unchanged files
5. **Custom Rules**: Support custom lint rules or configurations
