const DEFAULT_GATEWAY_URL = Deno.env.get('MCP_GATEWAY_URL') ?? 'http://localhost:3001';

export interface MCPResponse<T> {
  success: boolean;
  result?: T;
  error?: string;
}

export async function callMCPTool<T>(
  server: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<T> {
  const url = new URL('/mcp/call', DEFAULT_GATEWAY_URL);
  const body = { server, toolName, input };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`MCP Gateway error: ${response.status} ${response.statusText}`);
  }

  const data: MCPResponse<T> = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Unknown error from MCP Gateway');
  }

  const rawResult = data.result as unknown;

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

  if (
    rawResult &&
    typeof rawResult === 'object' &&
    'structuredContent' in (rawResult as Record<string, unknown>)
  ) {
    return (rawResult as { structuredContent: unknown }).structuredContent as T;
  }

  return rawResult as T;
}
