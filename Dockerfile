# Raspberry Pi optimized Docker container for Contract Crown
# Single container with Express server serving both API and static files

FROM node:18-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S contractcrown -u 1001

# Copy package files first for better caching
COPY --chown=contractcrown:nodejs server/package*.json ./server/
COPY --chown=contractcrown:nodejs client/package*.json ./client/

# Install server dependencies
WORKDIR /app/server
RUN npm ci --only=production && npm cache clean --force

# Install client dependencies and build
WORKDIR /app/client
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY --chown=contractcrown:nodejs server/ /app/server/
COPY --chown=contractcrown:nodejs client/ /app/client/

# Build the client
RUN npm run build

# Move built client to server's public directory
RUN mkdir -p /app/server/public && \
    cp -r /app/client/dist/* /app/server/public/ && \
    cp -r /app/client/*.html /app/server/public/ 2>/dev/null || true && \
    cp -r /app/client/src /app/server/public/ 2>/dev/null || true && \
    cp -r /app/client/manifest.json /app/server/public/ 2>/dev/null || true && \
    cp -r /app/client/favicon.webp /app/server/public/ 2>/dev/null || true

# Set working directory to server
WORKDIR /app/server

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port
EXPOSE 3000

# Switch to non-root user
USER contractcrown

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node src/health-check.js || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["npm", "start"]