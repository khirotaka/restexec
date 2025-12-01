
import { ensureDir } from "jsr:@std/fs";
import { join, resolve } from "jsr:@std/path";
import { generateToolContent, type MCPTool } from "./src/generator.ts";

const GATEWAY_URL = Deno.env.get("MCP_GATEWAY_URL") ?? "http://localhost:3001";
const TARGET_DIR = resolve(Deno.cwd(), "../restexec/tools/mcp");

async function main() {
  console.log(`Fetching tools from ${GATEWAY_URL}...`);
  
  try {
    const response = await fetch(`${GATEWAY_URL}/mcp/tools`);
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

    console.log(`Found ${tools.length} tools across ${Object.keys(toolsByServer).length} servers.`);

    // Generate code for each server
    for (const [serverName, serverTools] of Object.entries(toolsByServer)) {
      const serverDir = join(TARGET_DIR, serverName);
      await ensureDir(serverDir);
      console.log(`Processing server: ${serverName}`);

      const exportStatements: string[] = [];

      for (const tool of serverTools) {
        const fileName = `${tool.name}.ts`;
        const filePath = join(serverDir, fileName);
        const content = generateToolContent(tool);
        
        await Deno.writeTextFile(filePath, content);
        console.log(`  Generated ${fileName}`);
        
        exportStatements.push(`export * from "./${tool.name}.ts";`);
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
