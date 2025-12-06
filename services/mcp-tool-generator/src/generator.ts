export interface MCPTool {
  name: string;
  description?: string;
  server: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
    [key: string]: any;
  };
  outputSchema?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
    [key: string]: any;
  };
}

function jsonSchemaToTsType(schema: any, indentLevel = 0): string {
  if (!schema) return "any";

  const type = schema.type;

  if (type === "string") return "string";
  if (type === "number" || type === "integer") return "number";
  if (type === "boolean") return "boolean";

  if (type === "array") {
    const itemsType = jsonSchemaToTsType(schema.items, indentLevel);
    return `${itemsType}[]`;
  }

  if (type === "object") {
    if (!schema.properties) return "Record<string, unknown>";

    const props = Object.entries(schema.properties).map(
      ([key, propSchema]: [string, any]) => {
        const isRequired = schema.required?.includes(key);
        const propType = jsonSchemaToTsType(propSchema, indentLevel + 1);
        const description = propSchema.description
          ? `  /** ${propSchema.description} */\n`
          : "";
        const indent = "  ".repeat(indentLevel + 1);
        return `${description}${indent}${key}${
          isRequired ? "" : "?"
        }: ${propType};`;
      },
    );

    const indent = "  ".repeat(indentLevel);
    return `{\n${props.join("\n")}\n${indent}}`;
  }

  return "any";
}

function toCamelCase(str: string): string {
  return str
    .replace(/^[-_]+/, "") // 先頭の記号を除去
    .replace(/[-_]+([a-zA-Z])/g, (_, letter) => letter.toUpperCase());
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function generateToolContent(tool: MCPTool): string {
  const camelToolName = toCamelCase(tool.name);
  const pascalToolName = capitalize(camelToolName);

  const inputInterfaceName = `${pascalToolName}Input`;
  const inputTypeDefinition = jsonSchemaToTsType(tool.inputSchema);

  let outputInterfaceName = "any";
  let outputTypeDefinition = "";

  if (tool.outputSchema) {
    outputInterfaceName = `${pascalToolName}Output`;
    outputTypeDefinition = `export interface ${outputInterfaceName} ${
      jsonSchemaToTsType(tool.outputSchema)
    }\n\n`;
  }

  return `import { callMCPTool } from "/tools/mcp/client.ts";

export interface ${inputInterfaceName} ${inputTypeDefinition}

${outputTypeDefinition}/**
 * ${tool.description || tool.name}
 */
export async function ${camelToolName}(input: ${inputInterfaceName}): Promise<${outputInterfaceName}> {
  return callMCPTool<${outputInterfaceName}>('${tool.server}', '${tool.name}', input as unknown as Record<string, unknown>);
}
`;
}
