# Workspace Save API Specification

## Overview

The Workspace Save API provides a REST endpoint to save TypeScript code files to the `/workspace` directory. This endpoint enables dynamic code deployment for execution via the `/execute` endpoint. This is designed for LLM agents to programmatically save generated code for execution.

## API Endpoint

### PUT /workspace

Saves a TypeScript code file to the workspace directory with the specified codeId.

## Request

### Method
`PUT`

### Headers
- `Content-Type: application/json`

### Request Body

```json
{
  "codeId": "string",
  "code": "string"
}
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `codeId` | string | Yes | Identifier for the code file. Will be saved as `{codeId}.ts` in `/workspace`. Must be alphanumeric with hyphens and underscores only. No path separators allowed. |
| `code` | string | Yes | TypeScript code content to save. Must be valid TypeScript source code. |

### Validation Rules

The request must satisfy the following validation rules:

1. **codeId**:
   - Must be provided and non-empty
   - Must be a string
   - Must contain only alphanumeric characters, hyphens (-), and underscores (_)
   - Must not contain path separators (`/`, `\`)
   - Must not contain parent directory references (`..`)
   - Maximum length: 255 characters

2. **code**:
   - Must be provided and non-empty
   - Must be a string
   - Maximum size: 10MB (10,485,760 bytes)
   - Should be valid TypeScript code (syntax validation is optional)

### Security Considerations

- Path traversal prevention: `codeId` is validated to prevent directory traversal attacks
- File size limit: Code is limited to 10MB to prevent resource exhaustion
- Write permissions: Only `/workspace` directory is writable
- Overwrite behavior: If a file with the same `codeId` exists, it will be overwritten

## Response

### Success Response (200 OK)

```json
{
  "success": true,
  "result": {
    "codeId": "example-code",
    "filePath": "/workspace/example-code.ts",
    "size": 1234
  }
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always `true` for successful responses |
| `result.codeId` | string | The codeId provided in the request |
| `result.filePath` | string | Absolute path where the file was saved |
| `result.size` | number | Size of the saved file in bytes |

### Error Responses

#### 400 Bad Request - Validation Error

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "Invalid codeId format",
    "details": {
      "field": "codeId",
      "value": "../malicious",
      "reason": "codeId must not contain path separators"
    }
  }
}
```

#### 413 Payload Too Large - File Size Exceeded

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "Code size exceeds maximum allowed size",
    "details": {
      "maxSize": 10485760,
      "actualSize": 20971520
    }
  }
}
```

#### 500 Internal Server Error

```json
{
  "success": false,
  "error": {
    "type": "InternalError",
    "message": "Failed to save file",
    "details": {
      "reason": "Permission denied or disk full"
    }
  }
}
```

### Error Types

| Error Type | HTTP Status | Description |
|------------|-------------|-------------|
| `ValidationError` | 400 | Invalid request parameters (codeId format, code empty, size limit) |
| `InternalError` | 500 | File system error or server internal error |

## Usage Example

### Request

```bash
curl -X PUT http://localhost:8080/workspace \
  -H "Content-Type: application/json" \
  -d '{
    "codeId": "hello-world",
    "code": "const message = \"Hello, World!\";\nconsole.log(JSON.stringify({ message }));"
  }'
```

### Response

```json
{
  "success": true,
  "result": {
    "codeId": "hello-world",
    "filePath": "/workspace/hello-world.ts",
    "size": 78
  }
}
```

### Subsequent Execution

After saving the code, it can be executed via the `/execute` endpoint:

```bash
curl -X POST http://localhost:8080/execute \
  -H "Content-Type: application/json" \
  -d '{
    "codeId": "hello-world",
    "timeout": 5000
  }'
```

## Implementation Notes

### Phase 1: Basic TypeScript Code Support

The initial implementation supports plain TypeScript code in the `code` field. The code is saved directly to the file system without any preprocessing.

**Example:**
```json
{
  "codeId": "example",
  "code": "console.log(JSON.stringify({ result: 42 }));"
}
```

### Phase 2: Markdown Code Block Support (Future)

Future versions will support extracting TypeScript code from markdown code blocks. This is useful for LLM-generated responses that wrap code in markdown formatting.

**Example:**
```json
{
  "codeId": "example",
  "code": "```typescript\nconsole.log(JSON.stringify({ result: 42 }));\n```"
}
```

The implementation will:
1. Detect markdown code blocks (` ```typescript` or ` ```ts`)
2. Extract the code content between the fence markers
3. Save only the extracted code to the file

This phase will be implemented after the basic functionality is tested and committed.

## File System Behavior

### Directory Structure

```
/workspace/
├── {codeId}.ts       # Saved code files
├── import_map.json   # Import map configuration
└── ...               # Other workspace files
```

### File Permissions

- Files are created with standard read/write permissions
- Files are owned by the process user
- Existing files with the same name are overwritten

### Atomicity

File writes should be atomic to prevent partial writes:
1. Write to temporary file (e.g., `{codeId}.ts.tmp`)
2. Rename to final filename (atomic operation on most file systems)

This ensures that concurrent reads always see either the old complete file or the new complete file, never a partially written file.

## Rate Limiting Considerations

While not implemented in the initial version, consider adding rate limiting for production use:

- Per-IP rate limiting: 100 requests per minute
- Per-codeId rate limiting: 10 writes per minute
- Global rate limiting: 1000 requests per minute

## Integration with Other Endpoints

### With /execute

After saving a file via `/workspace`, the code can be executed via `/execute`:

```
PUT /workspace → saves file → POST /execute → runs code
```

### With /lint

Saved files can be linted before execution:

```
PUT /workspace → saves file → POST /lint → checks code → POST /execute
```

## Testing Considerations

### Unit Tests

1. Valid codeId and code
2. Invalid codeId (path traversal, special characters)
3. Empty code
4. Code size limits
5. Overwrite existing file

### Integration Tests

1. Save and execute workflow
2. Save and lint workflow
3. Concurrent writes to same codeId
4. Save multiple files in sequence

### Security Tests

1. Path traversal attempts (`../etc/passwd`)
2. Absolute paths (`/etc/passwd`)
3. Hidden files (`.bashrc`)
4. Large file attacks (>10MB)

## Monitoring and Logging

Log the following events:

- File save requests (codeId, size)
- Validation errors (reason, codeId)
- File system errors (reason, path)
- Overwrite operations (codeId, previous size, new size)

Example log format:
```
[INFO] Workspace save: codeId=example-code size=1234 path=/workspace/example-code.ts
[WARN] Workspace overwrite: codeId=example-code oldSize=1000 newSize=1234
[ERROR] Workspace validation failed: reason="invalid codeId" value="../malicious"
```

## Future Enhancements

1. **Code Block Extraction**: Support for markdown-wrapped code blocks
2. **Versioning**: Keep history of code changes per codeId
3. **Validation**: Optional TypeScript syntax validation before saving
4. **Compression**: Compress code before saving to reduce disk usage
5. **Metadata**: Store additional metadata (timestamp, author, description)
6. **Batch Operations**: Support saving multiple files in one request
