# Implementation Plan

- [x] 1. Configure Express server to serve static files






  - Modify server.js to add static file middleware before API routes
  - Add SPA fallback routing to serve index.html for non-API routes
  - Update route ordering to prioritize API routes over static files
  - _Requirements: 1.1, 1.3_

- [x] 2. Update build configuration and output directory






  - Modify vite.config.js to ensure build output goes to dist/ directory
  - Update .gitignore to include dist/ directory
  - Verify build process creates proper directory structure
  - _Requirements: 1.4_

- [x] 3. Implement development mode proxy functionality






  - Add conditional middleware to proxy non-API requests to Vite dev server in development
  - Install and configure http-proxy-middleware for development proxy
  - Add environment detection logic for development vs production static serving
  - _Requirements: 2.1, 2.2_

- [x] 4. Update npm scripts for unified workflow






  - Modify package.json scripts to support unified development workflow
  - Create script to build frontend and start backend server
  - Add concurrent script to run both frontend build watch and backend in development
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 5. Remove CORS configuration and update client URLs






  - Remove or simplify CORS configuration since frontend and backend are on same origin
  - Update any hardcoded client URLs in server configuration
  - Update Socket.IO client configuration to connect to same origin
  - _Requirements: 1.1, 4.3_

- [x] 6. Add production optimizations for static file serving






  - Add compression middleware for static assets
  - Configure cache headers for static files
  - Add error handling for missing dist directory in production
  - _Requirements: 1.4_

- [x] 7. Update environment configuration






  - Modify server to use single PORT environment variable
  - Remove CLIENT_URL references or set to same origin
  - Update .env.example with new configuration
  - _Requirements: 1.1, 3.3_

- [ ] 8. Write tests for unified port functionality
  - Create tests for static file serving middleware
  - Test API route precedence over static files
  - Test SPA fallback routing behavior
  - Test WebSocket functionality on unified port
  - _Requirements: 4.1, 4.2_

- [x] 9. Update frontend Socket.IO client configuration






  - Modify WebSocket client code to connect to same origin
  - Remove hardcoded port references in frontend code
  - Test WebSocket connection establishment
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 10. Create integration tests for complete workflow
  - Test full application functionality on single port
  - Test development proxy functionality
  - Test production static file serving
  - Verify all existing functionality works with unified port
  - _Requirements: 1.1, 1.2, 1.3, 1.4_