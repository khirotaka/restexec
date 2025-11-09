# システムアーキテクチャ

```mermaid
graph TB
    subgraph "restexec Container"
        subgraph "Main Process (PID 1)"
            HTTPServer["HTTP Server<br/>Oak Framework<br/>Port: 8080"]
            Router["Request Router"]
            Validator["Request Validator"]
        end
        
        subgraph "Core Components"
            Executor["Code Executor"]
            ProcessMgr["Process Manager"]
            ResultParser["Result Parser"]
        end
        
        subgraph "Child Processes"
            Deno1["Deno Process 1<br/>/workspace/exec-123.ts"]
            Deno2["Deno Process 2<br/>/workspace/exec-124.ts"]
        end
        
        subgraph "File System"
            Workspace["/workspace<br/>(Code Files)"]
            Tools["/tools<br/>(Dependencies)"]
        end
    end
    
    Client["REST API Client"] -->|POST /execute| HTTPServer
    HTTPServer --> Router
    Router --> Validator
    Validator --> Executor
    
    Executor -->|spawn deno| ProcessMgr
    ProcessMgr -->|Create| Deno1
    ProcessMgr -->|Create| Deno2

    Deno1 -->|Read| Workspace
    Deno1 -->|Import| Tools
    Deno2 -->|Read| Workspace
    Deno2 -->|Import| Tools

    Deno1 -->|stdout/stderr| ProcessMgr
    Deno2 -->|stdout/stderr| ProcessMgr
    ProcessMgr --> ResultParser
    ResultParser --> HTTPServer
    HTTPServer -->|JSON Response| Client
    
    style HTTPServer fill:#2196F3,color:#fff
    style Executor fill:#FF9800,color:#fff
    style Deno1 fill:#4CAF50,color:#fff
    style Deno2 fill:#4CAF50,color:#fff
    style Workspace fill:#f0f0f0
    style Tools fill:#f0f0f0
```