FROM denoland/deno:alpine-2.5.6

WORKDIR /app

COPY deno.json deno.lock ./
COPY src ./src
COPY main.ts ./main.ts

# Cache dependencies ahead of time to speed up startup
RUN deno cache main.ts

ENV MCP_GATEWAY_URL=http://mcp-gateway:3001
ENV TOOLS_DIR=/tools

ENTRYPOINT ["deno", "run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "/app/main.ts"]
