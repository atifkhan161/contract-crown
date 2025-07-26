# Implementation Plan

- [x] 1. Create new directory structure and move frontend files









  - Create client directory with proper subdirectories (public, src/assets, src/components, src/pages)
  - Move HTML files from root to client directory
  - Move src/ directory contents to client/src/
  - Move vite.config.js to client directory
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 2. Create client package.json and update frontend configuration
  - Extract frontend dependencies from root package.json to create client/package.json
  - Update client/vite.config.js to work with new directory structure
  - Update build output path to client/dist/
  - _Requirements: 1.6, 3.1, 3.2, 3.3_

- [ ] 3. Move static assets to client/public directory
  - Move manifest.json to client/public/
  - Move sw.js to client/public/
  - Move any favicon or icon files to client/public/
  - Update HTML files to reference assets from correct paths
  - _Requirements: 4.1, 4.2, 4.5_

- [ ] 4. Reorganize server directory structure
  - Create server/src/ directory with subdirectories (config, controllers, routes, middlewares, services, models, utils)
  - Move server.js to server/src/server.js
  - Move existing routes/ to server/src/routes/
  - Move existing middleware/ to server/src/middlewares/
  - Move existing models/ to server/src/models/
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 5. Create server app.js and update server entry point
  - Extract Express app setup from server.js into server/src/app.js
  - Update server/src/server.js to import and use app.js
  - Organize middleware setup and route registration in app.js
  - _Requirements: 2.5_

- [ ] 6. Update server static file serving configuration
  - Update Express static file serving to use client/dist/ as source
  - Configure proper cache headers for production static assets
  - Update fallback routing for client-side routing
  - _Requirements: 4.3, 4.4_

- [ ] 7. Update root package.json scripts for new structure
  - Update dev script to run both client and server from their directories
  - Update build script to build client from client directory
  - Update start script to run server from server directory
  - Add separate test scripts for client and server
  - _Requirements: 3.2, 5.3_

- [ ] 8. Update import paths throughout the codebase
  - Update all relative import paths in moved files
  - Update server imports to use new src/ structure
  - Update any hardcoded paths in configuration files
  - _Requirements: 3.4_

- [ ] 9. Update Cypress configuration for new structure
  - Update cypress.config.js to work with new client directory
  - Update any test files that reference old file paths
  - Verify e2e tests work with new structure
  - _Requirements: 5.1, 5.4_

- [ ] 10. Update development proxy configuration
  - Ensure Vite proxy configuration works from client directory
  - Update server development setup to serve from correct static path
  - Test hot module replacement functionality
  - _Requirements: 5.6_

- [ ] 11. Test and validate the restructured application
  - Run development servers to ensure they start correctly
  - Test frontend build process produces correct output
  - Verify WebSocket connections work with new structure
  - Test PWA functionality (service worker, manifest)
  - _Requirements: 5.2, 5.5_