# Multi-stage build for Raspberry Pi optimized Contract Crown
# Stage 1: Build the client
FROM node:18-alpine AS client-builder

WORKDIR /app/client

# Copy client package files
COPY client/package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy client source code
COPY client/ ./

# Build the client
RUN npm run build

# Stage 2: Production image
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S contractcrown -u 1001

# Copy server package files
COPY --chown=contractcrown:nodejs server/package*.json ./server/

# Install server dependencies (production only)
WORKDIR /app/server
RUN npm ci --only=production && npm cache clean --force

# Copy server source code
COPY --chown=contractcrown:nodejs server/ ./

# Create the expected client directory structure
RUN mkdir -p ../client

# Copy built client from builder stage to the expected location
# The server expects static files at ../client/dist relative to server directory
COPY --from=client-builder --chown=contractcrown:nodejs /app/client/dist ../client/dist

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