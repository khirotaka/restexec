import { ensureDir } from "@std/fs";
import { join, resolve } from "@std/path";
import { generateToolContent, type MCPTool } from "./src/generator.ts";

const GATEWAY_URL = Deno.env.get("MCP_GATEWAY_URL") ?? "http://localhost:3001";
const toolsDir = Deno.env.get("TOOLS_DIR");

if (!toolsDir) {
  throw new Error("TOOLS_DIR environment variable is not set");
}

const TARGET_DIR = resolve(toolsDir, "mcp");
const TIMEOUT = 30_000;

// client.ts source path - provided by mcp-server-plugin init container
const CLIENT_SOURCE_PATH = Deno.env.get("CLIENT_SOURCE_PATH") ??
  "/client/client.ts";

async function loadClientSource(): Promise<string> {
  try {
    return await Deno.readTextFile(CLIENT_SOURCE_PATH);
  } catch (error) {
    throw new Error(
      `Failed to read client.ts from ${CLIENT_SOURCE_PATH}: ${error}`,
    );
  }
}

function sanitizeFileName(name: string): string {
  // パストラバーサルを防ぐため、パス区切り文字を除去
  const sanitizedName = name.replace(/[\/\\:]/g, "_");

  // 先頭がドットで始まる隠しファイルを防ぐ
  return sanitizedName.startsWith(".") ? "_" + sanitizedName : sanitizedName;
}

async function main() {
  console.log(`Fetching tools from ${GATEWAY_URL}...`);

  try {
    await ensureDir(TARGET_DIR);

    // Copy client.ts from external source
    const clientSource = await loadClientSource();
    await Deno.writeTextFile(join(TARGET_DIR, "client.ts"), clientSource);
    console.log(
      `client.ts copied from ${CLIENT_SOURCE_PATH} to ${
        join(TARGET_DIR, "client.ts")
      }`,
    );

    const response = await fetch(`${GATEWAY_URL}/mcp/tools`, {
      signal: AbortSignal.timeout(TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch tools: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.success || !Array.isArray(data.tools)) {
      throw new Error("Invalid response format from MCP Gateway");
    }

    const tools: MCPTool[] = data.tools;
    const toolsByServer: Record<string, MCPTool[]> = {};

    // Group tools by server
    for (const tool of tools) {
      if (!toolsByServer[tool.server]) {
        toolsByServer[tool.server] = [];
      }
      toolsByServer[tool.server].push(tool);
    }

    console.log(
      `Found ${tools.length} tools across ${
        Object.keys(toolsByServer).length
      } servers.`,
    );

    // Generate code for each server
    for (const [serverName, serverTools] of Object.entries(toolsByServer)) {
      const serverDir = join(TARGET_DIR, serverName);
      await ensureDir(serverDir);
      console.log(`Processing server: ${serverName}`);

      const exportStatements: string[] = [];

      for (const tool of serverTools) {
        const fileName = `${sanitizeFileName(tool.name)}.ts`;
        const filePath = join(serverDir, fileName);
        const content = generateToolContent(tool);

        await Deno.writeTextFile(filePath, content);
        console.log(`  Generated ${fileName}`);

        exportStatements.push(`export * from "./${fileName.replace(/\.ts$/, '')}";`);
      }

      // Generate index.ts
      const indexContent = exportStatements.join("\n") + "\n";
      await Deno.writeTextFile(join(serverDir, "index.ts"), indexContent);
    }

    console.log("Generation complete!");
  } catch (error) {
    console.error("Error:", error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
