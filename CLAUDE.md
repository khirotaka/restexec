# CLAUDE.md - AI Assistant Guide

This document helps AI assistants (like Claude) navigate the **restexec** project efficiently.

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

## 📖 Purpose of This Document

**This is a navigation guide and quick reference.**

For complete specifications, always refer to the detailed documentation in `docs/` and `specs/`. This document provides:

- **Quick summaries** of core concepts
- **Minimal templates** for common tasks
- **Pointers** to detailed documentation
- **Troubleshooting** for common issues

When you need detailed information, read the linked documentation files.

---

## 🎯 Project Overview

**restexec** is a REST API service that safely executes TypeScript code via HTTP using Deno's sandboxed runtime.

### Three Core Concepts

1. **Execution Model**: Code files in `/workspace/*.ts` are executed as **scripts** (not modules)
   - Results must be printed to stdout: `console.log(JSON.stringify(result))`
   - Each execution runs in an isolated Deno child process

2. **Three API Endpoints**:
   - `PUT /workspace` - Save TypeScript code
   - `POST /lint` - Check code quality with `deno lint`
   - `POST /execute` - Execute code and return results

3. **Security-First Design**: Deno's explicit permission system
   - Read: `/workspace`, `/tools` only
   - Write/Network/Subprocess: Disabled by default
   - Timeout: 5 seconds (max 300 seconds)

### Key Features

- **Secure sandboxing** with Deno's permission system
- **External library support** via pre-cached dependencies (`deps.ts`)
- **Markdown code extraction** for LLM-generated responses
- **Resource limits** (timeout, buffer size, file size)

### Target Use Cases

- Code education platforms
- API automation and workflows
- Data processing with isolation
- Testing untrusted code
- LLM-powered code generation/execution

**Full details**: [README.md](README.md), [specs/SystemArchitecture.md](specs/SystemArchitecture.md)

---

## 🚀 Quick Reference by Task

### Task: Write Workspace Code

**Minimal Template** (async function):

```typescript
async function main() {
  const result = {
    message: "Processing complete",
    status: "success"
  };

  // REQUIRED: Output as JSON
  console.log(JSON.stringify(result));
}

// REQUIRED: Execute with error handling
main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error.message,
  }));
  Deno.exit(1);
});
```

**Critical Requirements**:
1. ✅ Output with `console.log(JSON.stringify(result))`
2. ✅ Call the main function (don't just define it)
3. ✅ Handle errors with `.catch()` and `Deno.exit(1)`
4. ❌ Don't use `export default` or `return` values
5. ❌ Don't use `process.exit()` (Node.js API)

**Using External Utilities**:

```typescript
import { add } from 'utils/math.ts';
import { capitalize } from 'utils/string.ts';

async function main() {
  const result = {
    sum: add(10, 20),
    text: capitalize('hello'),
    status: 'success'
  };
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error.message }));
  Deno.exit(1);
});
```

**Using Environment Variables**:

```typescript
async function main() {
  // Get environment variables
  const apiKey = Deno.env.get('API_KEY');
  const debugMode = Deno.env.get('DEBUG_MODE');

  const result = {
    apiKey: apiKey,
    debugEnabled: debugMode === 'true',
    status: 'success'
  };
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error.message }));
  Deno.exit(1);
});
```

**API Request with Environment Variables**:
```bash
curl -X POST http://localhost:8080/execute \
  -H "Content-Type: application/json" \
  -d '{
    "codeId":"my-script",
    "env": {
      "API_KEY": "secret-123",
      "DEBUG_MODE": "true"
    }
  }'
```

**Environment Variable Constraints**:
- **Key format**: Uppercase letters, numbers, underscores only (`/^[A-Z0-9_]+$/`)
- **Max count**: 50 variables
- **Max size**: 10KB total (all keys and values)
- **Forbidden keys**: `PATH`, `DENO_DIR`, `HOME`, `USER`, `PWD`, `SHELL`, `DENO_*`

**Security Constraints**:
- ✅ Read from `/workspace` and `/tools`
- ❌ No write, network, or subprocess access (by default)
- ⏱️ Default timeout: 5 seconds
- 🔐 Environment variables are process-isolated and temporary

**Complete guide**: [docs/workspace-code-guide.md](docs/workspace-code-guide.md)

---

### Task: Add External Libraries

**4-Step Process**:

1. **Add to `deps.ts`** with exact version:
   ```typescript
   // deps.ts
   export * from "https://esm.sh/es-toolkit@1.27.0";
   export * from "https://esm.sh/date-fns@3.0.0";
   ```

2. **Update `import_map.json`** (optional, for convenience):
   ```json
   {
     "imports": {
       "es-toolkit": "https://esm.sh/es-toolkit@1.27.0",
       "date-fns": "https://esm.sh/date-fns@3.0.0"
     }
   }
   ```

3. **Rebuild container**:
   ```bash
   docker compose build
   ```

4. **Restart container**:
   ```bash
   docker compose up -d
   ```

**Why**: Execution uses `--cached-only` flag. All libraries must be cached at build time.

**Recommended libraries**: es-toolkit, date-fns, zod, lodash-es, mathjs

**Complete guide**: [specs/Libraries.md](specs/Libraries.md)

---

### Task: Understand the API

**PUT /workspace** - Save code:
```json
// Request
{"codeId": "my-script", "code": "console.log(JSON.stringify({msg: 'hi'}));"}

// Response
{"success": true, "result": {"codeId": "my-script", "filePath": "/workspace/my-script.ts", "size": 56}}
```

**POST /lint** - Check code quality:
```json
// Request
{"codeId": "my-script", "timeout": 5000}

// Response
{"success": true, "result": {"diagnostics": [...], "errors": [], "checkedFiles": [...]}}
```

**POST /execute** - Run code:
```json
// Request
{"codeId": "my-script", "timeout": 5000}

// Response
{"success": true, "result": {/* your code's output */}, "executionTime": 234}
```

**GET /health** - Server status:
```json
{"status": "ok", "uptime": 12345, "memoryUsage": {...}}
```

**Typical workflow**:
```
PUT /workspace → (POST /lint) → POST /execute
```

**Complete specs**: [specs/API.md](specs/API.md), [specs/LintAPI.md](specs/LintAPI.md), [specs/WorkspaceSaveAPI.md](specs/WorkspaceSaveAPI.md)

---

### Task: Run Tests

**Basic command**:
```bash
deno task test
```

**⚠️ Important for local development**:

Tests write to `/workspace` directory. If this fails:

**Solution 1**: Create `/workspace` with proper permissions:
```bash
sudo mkdir -p /workspace
sudo chmod 777 /workspace
deno task test
```

**Solution 2**: Use a temporary directory (recommended for local dev):
```bash
mkdir -p /tmp/restexec-workspace
WORKSPACE_DIR=/tmp/restexec-workspace deno task test
```

**Why this happens**:
- Integration tests save files to `config.workspaceDir` (defaults to `/workspace`)
- Local machines may not have `/workspace` or lack write permissions
- Docker container has this directory pre-configured

**Run specific test file**:
```bash
deno test --allow-read --allow-write --allow-net --allow-env --allow-run tests/integration/workspace.test.ts
```

**Complete guide**: [specs/Test.md](specs/Test.md)

---

## 🔧 Troubleshooting

### Problem: Code execution returns `null`

**Symptoms**: `result` field is `null` despite code running

**Common causes**:
1. Missing `console.log(JSON.stringify(result))`
2. Function defined but not called
3. Using `return` instead of `console.log`

**Solution**: Use the template from [Write Workspace Code](#task-write-workspace-code) above.

---

### Problem: "Module not found" error

**Symptoms**: Error importing external library

**Common causes**:
1. Library not in `deps.ts`
2. Container not rebuilt
3. Wrong import path

**Solution**:
```bash
# 1. Add to deps.ts
# 2. Rebuild
docker compose build
# 3. Restart
docker compose up -d
```

---

### Problem: Timeout errors

**Symptoms**: `TimeoutError: Execution timed out after Xms`

**Common causes**: Infinite loops, long operations, timeout too low

**Solution**:
1. Review code for infinite loops
2. Increase timeout: `{"timeout": 30000}`
3. Optimize async operations

---

### Problem: Permission denied errors

**Symptoms**: Errors about missing permissions (read/write/net)

**Common causes**: Code accessing forbidden resources

**Solution**:
1. Check [Security Model](#-project-overview) above
2. Ensure code only accesses `/workspace` and `/tools`
3. Configure permissions via environment variables if needed

**Details**: [specs/Security.md](specs/Security.md)

---

### Problem: File not found (404)

**Symptoms**: `FileNotFoundError: Code file not found`

**Common causes**: File not saved, wrong codeId

**Solution**:
```bash
# 1. Save first
curl -X PUT http://localhost:8080/workspace \
  -H "Content-Type: application/json" \
  -d '{"codeId":"my-script","code":"..."}'

# 2. Then execute (use same codeId, no .ts extension)
curl -X POST http://localhost:8080/execute \
  -H "Content-Type: application/json" \
  -d '{"codeId":"my-script"}'
```

---

### Problem: `deno task test` fails

**Symptoms**: Test errors like "Permission denied" or "No such file or directory" when running tests

**Common causes**:
- `/workspace` directory doesn't exist
- No write permissions to `/workspace`
- Running tests on local machine (not in Docker)

**Solution** (choose one):

**Option 1** - Create `/workspace` directory:
```bash
sudo mkdir -p /workspace
sudo chmod 777 /workspace
deno task test
```

**Option 2** - Use temporary directory (recommended):
```bash
# Set WORKSPACE_DIR to a writable location
mkdir -p /tmp/restexec-workspace
WORKSPACE_DIR=/tmp/restexec-workspace deno task test
```

**Option 3** - Use Docker for tests:
```bash
docker compose run --rm restexec deno task test
```

**Why this happens**:
- Integration tests (e.g., `tests/integration/workspace.test.ts`) write files to `config.workspaceDir`
- Default is `/workspace` (configured for Docker)
- Local machines may not have this directory or permissions

**Environment variables**:
```bash
# Override workspace directory for tests
export WORKSPACE_DIR=/tmp/restexec-workspace
export TOOLS_DIR=/tmp/restexec-tools

# Then run tests
deno task test
```

**See**: Line 78-87 in [tests/integration/workspace.test.ts](tests/integration/workspace.test.ts)

---

### Problem: Container won't start

**Symptoms**: Docker container exits or won't start

**Common causes**: Port in use, build errors, config issues

**Solution**:
```bash
# 1. Check logs
docker compose logs

# 2. Verify port 8080 available
lsof -i :8080

# 3. Rebuild from scratch
docker compose build --no-cache

# 4. Check environment variables
cat compose.yaml
```

---

## 📚 Documentation Map

### Essential Documentation

**For Development**:
- [docs/workspace-code-guide.md](docs/workspace-code-guide.md) - Complete guide to writing workspace code
- [specs/Security.md](specs/Security.md) - Security model and permissions
- [specs/Libraries.md](specs/Libraries.md) - External library management

**API Specifications**:
- [specs/API.md](specs/API.md) - POST /execute endpoint
- [specs/LintAPI.md](specs/LintAPI.md) - POST /lint endpoint
- [specs/WorkspaceSaveAPI.md](specs/WorkspaceSaveAPI.md) - PUT /workspace endpoint

**Architecture**:
- [specs/SystemArchitecture.md](specs/SystemArchitecture.md) - System design
- [specs/Sequence.md](specs/Sequence.md) - Execution flow diagrams
- [specs/CodeExecution.md](specs/CodeExecution.md) - Execution details

**Operations**:
- [README.md](README.md) - Quick start guide
- [DOCKER.md](DOCKER.md) - Docker setup
- [specs/Deployment.md](specs/Deployment.md) - Deployment guide
- [specs/Configuration.md](specs/Configuration.md) - Environment variables
- [specs/Test.md](specs/Test.md) - Testing strategy

**Other Specs**:
- [specs/FileSystem.md](specs/FileSystem.md) - File system structure
- [specs/Logging.md](specs/Logging.md) - Logging configuration
- [specs/Performance.md](specs/Performance.md) - Performance benchmarks
- [specs/Regulation.md](specs/Regulation.md) - Execution regulations

### Working Examples

**Code Examples**:
- [example/workspace/hello-world.ts](example/workspace/hello-world.ts) - Simple example
- [example/workspace/with-import.ts](example/workspace/with-import.ts) - Import example
- [example/workspace/async-example.ts](example/workspace/async-example.ts) - Async example

**Utility Examples**:
- [example/tools/utils/math.ts](example/tools/utils/math.ts) - Math utilities
- [example/tools/utils/string.ts](example/tools/utils/string.ts) - String utilities

---

## 🔑 Key Points for AI Assistants

### When Writing Workspace Code

1. **Always use the template** from this document
2. **Always output with** `console.log(JSON.stringify(result))`
3. **Always call the function** (don't just define it)
4. **Never use** `export default` or Node.js APIs

### When User Asks About...

- **"How do I write code?"** → Use template + link to [docs/workspace-code-guide.md](docs/workspace-code-guide.md)
- **"How do I add a library?"** → 4-step process + link to [specs/Libraries.md](specs/Libraries.md)
- **"What APIs are available?"** → Quick reference + link to [specs/API.md](specs/API.md)
- **"Why is my code not working?"** → Check [Troubleshooting](#-troubleshooting) section
- **"How do I run tests?"** → See [Task: Run Tests](#task-run-tests) section

### Architecture Questions

For detailed architecture questions, read:
1. [specs/SystemArchitecture.md](specs/SystemArchitecture.md) - High-level design
2. [specs/Sequence.md](specs/Sequence.md) - Execution flow
3. [specs/Security.md](specs/Security.md) - Security model
4. Relevant source files in `src/`

---

## 🤖 Claude Code Sub-Agents

This project includes specialized sub-agents that proactively assist with specific tasks. These agents are automatically invoked when relevant changes are detected or can be manually called.

### Available Sub-Agents

#### 1. **doc-sync-checker** - Documentation Synchronization Checker

**Purpose**: Detects specification documentation update gaps when code changes.

**Automatic Triggers**:
- API changes in `routes/`
- Parameter additions in `middleware/validation.ts`
- Core logic modifications in `src/utils/`

**Manual Invocation**:
```
doc-sync-checker エージェントで最近の変更を確認して
```

**What it does**:
- Analyzes `git diff` to identify changed files
- Maps changes to relevant spec files (specs/API.md, specs/Security.md, etc.)
- Detects discrepancies between code and documentation
- Provides concrete update proposals with line numbers
- Prioritizes updates (Critical/Medium/Low)

**Example Use Cases**:
- After adding a new API parameter
- After modifying response formats
- Before creating a pull request
- When updating execution logic

---

#### 2. **security-auditor** - Security Audit Agent

**Purpose**: Monitors Deno permission settings and detects security risks proactively.

**Automatic Triggers**:
- Dockerfile or compose.yaml changes
- Execution logic modifications in `src/utils/executor.ts`
- Dependency additions/updates in `deps.ts`
- Configuration changes in `src/config.ts`

**Manual Invocation**:
```
security-auditor エージェントでセキュリティ監査をして
```

**What it does**:
- Monitors `--allow-*` flag changes and validates necessity
- Scans for OWASP Top 10 vulnerabilities (injection, XSS, path traversal, etc.)
- Checks dependency security (version pinning, trusted CDNs)
- Validates execution limits (timeout, buffer size, file size)
- Ensures consistency with specs/Security.md
- Provides CVSS-based risk scores

**Example Use Cases**:
- Before adding new Deno permissions
- After updating dependencies
- When modifying input validation logic
- Regular security audits before releases

---

### How Sub-Agents Work

**Automatic Invocation**:
- Claude Code automatically selects the appropriate agent based on your task and file changes
- Agents with `PROACTIVELY` in their description are called without explicit request
- No manual intervention needed for routine checks

**Manual Invocation**:
- Use the agent name in your request to Claude Code
- Example: "security-auditor エージェントを実行して"
- Useful for targeted checks or when automatic triggering doesn't occur

**Agent Capabilities**:
- Each agent has access to specific tools: Read, Grep, Glob, Bash
- Agents use Sonnet model for balanced performance
- Independent context windows prevent interference
- Detailed reports with actionable recommendations

### Best Practices

1. **After Making Changes**: Wait for agents to run automatically and review their reports
2. **Before Commits**: Manually invoke doc-sync-checker to ensure documentation is updated
3. **Before Releases**: Run security-auditor for comprehensive security review

### Agent Configuration

Sub-agents are defined in `.claude/agents/` directory:
- `.claude/agents/doc-sync-checker.md`
- `.claude/agents/security-auditor.md`

To modify agent behavior, edit these Markdown files (YAML frontmatter + system prompt).

---

## 🛠️ Technology Stack

- **Runtime**: Deno 2.5.6
- **Language**: TypeScript (strict mode)
- **Web Framework**: Oak v17.1.6
- **Container**: Alpine Linux + Docker
- **Testing**: Deno's built-in test runner
- **External Libraries**: Managed via `deps.ts` + esm.sh CDN
- **AI Assistance**: Claude Code Sub-Agents (2 specialized agents)

---

## 📋 Development Workflow

### Before Committing

Run these checks before committing any changes:
```bash
# Lint code
deno lint src/ tests/

# Check formatting
deno fmt --check src/ tests/

# Run all tests
deno task test
```

All checks must pass without errors or warnings.

**Auto-fix formatting issues**:
```bash
deno fmt src/ tests/
```

### For New Features

1. Read relevant specs in `specs/`
2. Update specifications if needed
3. Implement with error handling
4. Add comprehensive tests
5. Update this CLAUDE.md if it affects quick reference
6. Update README.md if user-facing

### For Bug Fixes

1. Identify root cause
2. Add test reproducing the bug
3. Implement minimal fix
4. Verify all tests pass
5. Update troubleshooting section if broadly applicable

---

*This is a navigation guide. For complete information, see the linked documentation files.*

*Last updated: 2025-11-14*
