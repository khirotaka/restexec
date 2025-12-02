const DEFAULT_GATEWAY_URL = Deno.env.get('MCP_GATEWAY_URL') ?? 'http://localhost:3001';

export interface MCPResponse<T> {
  success: boolean;
  result?: T;
  error?: string;
}

/**
 * Call an MCP tool via the Gateway.
 * 
 * @param server The name of the MCP server (e.g., "health-server")
 * @param toolName The name of the tool to call (e.g., "calculate-bmi")
 * @param input The input arguments for the tool
 * @returns The result of the tool execution
 */
export async function callMCPTool<T>(
  server: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<T> {
  const url = new URL('/mcp/call', DEFAULT_GATEWAY_URL);
  
  const body = {
    server,
    toolName,
    input,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`MCP Gateway error: ${response.status} ${response.statusText}`);
  }

  const data: MCPResponse<T> = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Unknown error from MCP Gateway');
  }

  // If result is undefined but success is true, we might return undefined or throw.
  // Assuming result is present on success for tools that return data.
  const rawResult = data.result as unknown;

  // Prefer structuredContent if present (handles double-encoded JSON responses).
  if (typeof rawResult === 'string') {
    try {
      const parsed = JSON.parse(rawResult) as { structuredContent?: unknown };
      if (parsed && typeof parsed === 'object' && 'structuredContent' in parsed) {
        return parsed.structuredContent as T;
      }
      return parsed as T;
    } catch {
      return rawResult as unknown as T;
    }
  }

  if (rawResult && typeof rawResult === 'object' && 'structuredContent' in (rawResult as Record<string, unknown>)) {
    return (rawResult as { structuredContent: unknown }).structuredContent as T;
  }

  return rawResult as T;
}
