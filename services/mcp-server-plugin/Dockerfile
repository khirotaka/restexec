# Build stage for MCP servers
FROM golang:1.25-bookworm AS builder

WORKDIR /build

# Copy sample-mcp-server source code
COPY servers/sample-mcp-server/ ./sample-mcp-server/

# Build sample-mcp-server
RUN cd sample-mcp-server && \
    go mod download && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /sample-mcp-server .

# -----------------------------------------------------------------------------
# Alternative: Using pre-built binaries
# -----------------------------------------------------------------------------
# If you prefer to use pre-built binaries instead of building from source,
# replace the builder stage above with the following:
#
# FROM alpine:3.20 AS builder
# # Copy your pre-built binaries to /binaries
# COPY binaries/sample-mcp-server /sample-mcp-server
# RUN chmod +x /sample-mcp-server
# -----------------------------------------------------------------------------

# Final stage - Alpine for shell access in init container
FROM alpine:3.20

WORKDIR /

# Copy built binaries to /mcp-binaries
COPY --from=builder /sample-mcp-server /mcp-binaries/sample-mcp-server

# Copy client.ts
COPY client/client.ts /client/client.ts

# Deploy script
COPY deploy.sh /deploy.sh
RUN chmod +x /deploy.sh

# Default environment variables
ENV MCP_BINARIES_DIR=/mnt/mcp-binaries
ENV CLIENT_CODE_DIR=/mnt/client

ENTRYPOINT ["/deploy.sh"]
