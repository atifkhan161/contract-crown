# Development Proxy Configuration Guide

This document explains how the development proxy configuration works in the Contract Crown PWA after the folder structure refactor.

## Overview

The development setup uses a dual-server approach:
- **Vite Dev Server** (port 5173): Serves frontend assets with hot module replacement
- **Express Server** (port 3030): Serves API endpoints and WebSocket connections

## Proxy Configuration

### Client-Side Proxy (Vite → Express)

The Vite dev server proxies API and WebSocket requests to the Express server:

```javascript
// client/vite.config.js
proxy: {
  '/api': {
    target: 'http://localhost:3030',
    changeOrigin: true,
    secure: false
  },
  '/socket.io': {
    target: 'http://localhost:3030',
    changeOrigin: true,
    ws: true
  },
  '/health': {
    target: 'http://localhost:3030',
    changeOrigin: true,
    secure: false
  }
}
```

### Server-Side Proxy (Express → Vite)

The Express server proxies frontend requests to the Vite dev server:

```javascript
// server/src/app.js
if (process.env.NODE_ENV === 'development' && process.env.VITE_DEV_SERVER_URL) {
  app.use('/', createProxyMiddleware({
    target: process.env.VITE_DEV_SERVER_URL, // http://localhost:5173
    changeOrigin: true,
    ws: true, // Enable WebSocket proxying for HMR
    pathFilter: (pathname) => {
      // Don't proxy API routes, health check, or socket.io
      return !pathname.startsWith('/api') && 
             !pathname.startsWith('/health') && 
             !pathname.startsWith('/socket.io');
    }
  }));
}
```

## Configuration Files

### Environment Variables

Set in `server/.env`:
```env
NODE_ENV=development
VITE_DEV_SERVER_URL=http://localhost:5173
```

### Port Configuration

- **Client (Vite)**: Port 5173 (configured in `client/vite.config.js`)
- **Server (Express)**: Port 3030 (configured in `server/.env`)

## Development Workflow

### Starting Development Servers

```bash
# Start both servers concurrently
npm run dev

# Or start individually
npm run dev:client  # Starts Vite dev server
npm run dev:server  # Starts Express server
```

### Hot Module Replacement (HMR)

HMR works through WebSocket connections:
1. Vite dev server handles HMR WebSocket connections
2. Express server proxies HMR WebSocket traffic to Vite
3. Frontend changes trigger automatic browser updates

### API Development

1. Frontend makes requests to `/api/*` endpoints
2. Vite dev server proxies these to Express server
3. Express server handles API logic and returns responses
4. Responses are proxied back to frontend

## Troubleshooting

### Port Conflicts

If port 5173 is in use:
1. Stop the conflicting process
2. Or update `VITE_DEV_SERVER_URL` in `server/.env` to match the new port

### Proxy Errors

Common issues:
- **ECONNREFUSED**: Target server not running
- **404 errors**: Incorrect proxy path configuration
- **WebSocket errors**: HMR proxy not working

### Testing Proxy Configuration

Run the development setup test:
```bash
node test-development-setup.js
```

## Best Practices

1. **Always start servers in order**: Server first, then client
2. **Use consistent ports**: Keep Vite on 5173 for predictable proxy behavior
3. **Check environment variables**: Ensure `VITE_DEV_SERVER_URL` matches client port
4. **Monitor logs**: Both servers log proxy activity for debugging

## Production vs Development

- **Development**: Uses proxy configuration for seamless development experience
- **Production**: Express serves built static files from `client/dist/`

The proxy configuration only applies in development mode and is automatically disabled in production.