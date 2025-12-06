#!/bin/sh
set -e

# MCP Server Plugin Deploy Script
# This script copies MCP Server binaries and client code to shared volumes

MCP_BINARIES_DIR="${MCP_BINARIES_DIR:-/mnt/mcp-binaries}"
CLIENT_CODE_DIR="${CLIENT_CODE_DIR:-/mnt/client}"

echo "MCP Server Plugin: Starting deployment..."
echo "  MCP_BINARIES_DIR: ${MCP_BINARIES_DIR}"
echo "  CLIENT_CODE_DIR: ${CLIENT_CODE_DIR}"

# Create target directories if they don't exist
mkdir -p "${MCP_BINARIES_DIR}"
mkdir -p "${CLIENT_CODE_DIR}"

# Copy MCP Server binaries
if [ -d "/mcp-binaries" ] && [ "$(ls -A /mcp-binaries 2>/dev/null)" ]; then
    echo "Copying MCP Server binaries..."
    cp -rL /mcp-binaries/* "${MCP_BINARIES_DIR}/"
    echo "  Copied: $(ls -1 /mcp-binaries | tr '\n' ' ')"
else
    echo "  No MCP Server binaries found in /mcp-binaries"
fi

# Copy client.ts
if [ -f "/client/client.ts" ]; then
    echo "Copying client.ts..."
    cp /client/client.ts "${CLIENT_CODE_DIR}/client.ts"
    echo "  Copied: client.ts"
else
    echo "  Warning: /client/client.ts not found"
fi

echo "MCP Server Plugin: Deployment complete!"
