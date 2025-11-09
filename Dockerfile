# Use Deno official image
FROM denoland/deno:alpine-2.5.6

# Set working directory
WORKDIR /app

# Copy application files
COPY deno.json ./
COPY import_map.json ./workspace/
COPY src ./src

# Cache dependencies
RUN deno cache src/index.ts

# Create workspace and tools directories
RUN mkdir -p /workspace /tools

# Switch to deno user
RUN chown -R deno:deno /workspace /tools
USER deno

# Environment variables
ENV PORT=3000
ENV WORKSPACE_DIR=/workspace
ENV TOOLS_DIR=/tools
ENV DEFAULT_TIMEOUT=5000
ENV MAX_TIMEOUT=300000
ENV LOG_LEVEL=info
ENV DENO_PATH=deno
ENV DENO_IMPORT_MAP=/workspace/import_map.json

# Expose port
EXPOSE 3000

# Run the application
CMD ["deno", "run", "--allow-read", "--allow-write", "--allow-net", "--allow-env", "--allow-run", "src/index.ts"]
