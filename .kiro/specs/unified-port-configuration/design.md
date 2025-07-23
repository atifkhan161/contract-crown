# Design Document

## Overview

The unified port configuration will modify the existing Express server to serve both API routes and frontend static assets on a single port. This design leverages Express's static file serving capabilities while maintaining the existing API structure and WebSocket functionality.

## Architecture

### Current Architecture
- Frontend: Vite dev server on port 5173
- Backend: Express server on port 3000
- CORS configuration needed for cross-origin requests

### New Architecture
- Single Express server on configurable port (default 3030)
- Express serves static files from built frontend
- API routes prefixed with `/api/`
- WebSocket connections on same port
- Development mode: Either proxy to Vite or serve built assets with file watching

## Components and Interfaces

### 1. Express Server Configuration
- **Static File Middleware**: Serve built frontend assets from `dist/` directory
- **API Route Handling**: Maintain existing `/api/*` routes with higher priority
- **Fallback Routing**: Serve `index.html` for client-side routing (SPA support)
- **WebSocket Integration**: Maintain existing Socket.IO setup on same HTTP server

### 2. Build Process Integration
- **Frontend Build**: Vite builds to `dist/` directory
- **Asset Serving**: Express serves from `dist/` with proper MIME types
- **Production Optimization**: Serve compressed assets, set cache headers

### 3. Development Workflow
- **Option A - Proxy Approach**: Express proxies non-API requests to Vite dev server
- **Option B - Build Watch**: Watch frontend files and rebuild, serve from `dist/`
- **Recommended**: Option A for better development experience

### 4. Environment Configuration
- **PORT**: Single environment variable for server port
- **NODE_ENV**: Determines development vs production behavior
- **CLIENT_URL**: Remove or set to same origin

## Data Models

No new data models required. Existing models remain unchanged.

## Error Handling

### Static File Serving Errors
- **404 for Assets**: Return 404 for missing static assets
- **SPA Fallback**: Serve `index.html` for non-API routes that don't match static files
- **Build Missing**: Graceful error if `dist/` directory doesn't exist in production

### Development Mode Errors
- **Vite Proxy Errors**: Log and return 502 if Vite dev server is unreachable
- **Build Watch Errors**: Log build failures but continue serving last successful build

## Testing Strategy

### Unit Tests
- Test static file serving middleware
- Test API route precedence over static files
- Test SPA fallback routing

### Integration Tests
- Test complete request flow for API endpoints
- Test static asset serving
- Test WebSocket connections on unified port
- Test development proxy functionality

### End-to-End Tests
- Test full application functionality on single port
- Test client-side routing with server fallback
- Test real-time features (WebSocket) integration

## Implementation Approach

### Phase 1: Basic Static Serving
1. Modify Express server to serve static files from `dist/`
2. Implement SPA fallback routing
3. Update build scripts to output to correct directory

### Phase 2: Development Integration
1. Add development proxy to Vite dev server
2. Configure conditional middleware based on NODE_ENV
3. Update npm scripts for unified development workflow

### Phase 3: Production Optimization
1. Add compression middleware for static assets
2. Configure cache headers for static files
3. Optimize build process for production deployment

### Configuration Changes Required
- Update `server.js` to include static file middleware
- Modify `package.json` scripts for unified workflow
- Update environment variables and CORS configuration
- Remove hardcoded port references in frontend code