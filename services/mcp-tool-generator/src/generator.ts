
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
}

function jsonSchemaToTsType(schema: any, indentLevel = 0): string {
  if (!schema) return 'any';

  const type = schema.type;
  
  if (type === 'string') return 'string';
  if (type === 'number' || type === 'integer') return 'number';
  if (type === 'boolean') return 'boolean';
  
  if (type === 'array') {
    const itemsType = jsonSchemaToTsType(schema.items, indentLevel);
    return `${itemsType}[]`;
  }

  if (type === 'object') {
    if (!schema.properties) return 'Record<string, unknown>';
    
    const props = Object.entries(schema.properties).map(([key, propSchema]: [string, any]) => {
      const isRequired = schema.required?.includes(key);
      const propType = jsonSchemaToTsType(propSchema, indentLevel + 1);
      const description = propSchema.description ? `  /** ${propSchema.description} */\n` : '';
      const indent = '  '.repeat(indentLevel + 1);
      return `${description}${indent}${key}${isRequired ? '' : '?'}: ${propType};`;
    });

    const indent = '  '.repeat(indentLevel);
    return `{\n${props.join('\n')}\n${indent}}`;
  }

  return 'any';
}

function toCamelCase(str: string): string {
  return str.replace(/([-_][a-z])/ig, ($1) => {
    return $1.toUpperCase()
      .replace('-', '')
      .replace('_', '');
  });
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function generateToolContent(tool: MCPTool): string {
  const camelToolName = toCamelCase(tool.name);
  const pascalToolName = capitalize(camelToolName);
  
  const inputInterfaceName = `${pascalToolName}Input`;
  const inputTypeDefinition = jsonSchemaToTsType(tool.inputSchema);

  // We assume the response is generic or unknown for now, as MCP tools don't strictly define output schema in the list endpoint yet.
  // But we can allow the user to override it or default to any.
  
  return `import { callMCPTool } from "../../client.ts";

export interface ${inputInterfaceName} ${inputTypeDefinition}

/**
 * ${tool.description || tool.name}
 */
export async function ${camelToolName}(input: ${inputInterfaceName}): Promise<any> {
  return callMCPTool('${tool.server}', '${tool.name}', input as unknown as Record<string, unknown>);
}
`;
}
