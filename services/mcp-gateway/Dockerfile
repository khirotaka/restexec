# Build stage
FROM golang:1.25-bookworm AS builder

WORKDIR /app

# Copy go.mod and go.sum first to leverage Docker cache
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the source code
COPY . .

# Build the application
# CGO_ENABLED=0 is required for the static binary to work in distroless
# -ldflags="-w -s" reduces binary size by stripping debug information
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/mcp-gateway ./cmd/mcp-gateway

# Final stage
# Use distroless/static for a minimal, secure image
# It includes ca-certificates by default, which is perfect for internet access
FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /

# Copy the binary from the builder stage
COPY --from=builder /app/mcp-gateway /mcp-gateway

# Run as non-root user (provided by the distroless:nonroot image)
USER nonroot:nonroot

# Entrypoint
ENTRYPOINT ["/mcp-gateway"]
