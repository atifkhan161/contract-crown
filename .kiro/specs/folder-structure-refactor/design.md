# Design Document

## Overview

This design outlines the restructuring of the Contract Crown PWA from its current mixed structure to a clean client-server separation following modern full-stack development practices. The restructuring will transform the current root-level frontend files and existing server directory into a well-organized monorepo structure with dedicated `client/` and `server/` directories.

The current structure has frontend files (HTML, Vite config, src/) at the root level alongside server files, which creates confusion and makes deployment more complex. The new structure will provide clear separation of concerns, improve maintainability, and align with the recommended Express + Vite deployment pattern outlined in the fullstack-express-deploy.md document.

## Architecture

### Current Structure Analysis
- Frontend files scattered at root level (index.html, login.html, dashboard.html, register.html)
- Vite configuration and src/ directory at root
- Server code in dedicated server/ directory but not following recommended internal structure
- Mixed dependencies in root package.json
- Build output goes to root-level dist/ directory

### Target Structure
```
contract-crown-pwa/
├── client/                    # Frontend application
│   ├── public/               # Static assets (favicon, manifest.json, etc.)
│   ├── src/
│   │   ├── assets/           # Images, fonts, etc.
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # Page-specific code
│   │   ├── core/             # Core application logic
│   │   └── main.js           # Application entry point
│   ├── index.html            # Main HTML template
│   ├── login.html            # Login page
│   ├── register.html         # Registration page
│   ├── dashboard.html        # Dashboard page
│   ├── vite.config.js        # Vite configuration
│   └── package.json          # Frontend dependencies
├── server/                   # Backend application
│   ├── src/
│   │   ├── config/           # Configuration files
│   │   ├── controllers/      # Request handlers
│   │   ├── routes/           # API route definitions
│   │   ├── middlewares/      # Express middlewares
│   │   ├── services/         # Business logic
│   │   ├── models/           # Data models
│   │   ├── utils/            # Utility functions
│   │   ├── app.js            # Express app setup
│   │   └── server.js         # HTTP server entry
│   ├── database/             # Database related files
│   ├── websocket/            # WebSocket handling
│   ├── tests/                # Server tests
│   └── package.json          # Backend dependencies
├── shared/                   # Shared utilities (if needed)
├── docs/                     # Documentation
├── cypress/                  # E2E tests
├── package.json              # Root workspace configuration
└── README.md
```

## Components and Interfaces

### Client Directory Structure

**client/public/**
- Static assets that don't need processing by Vite
- manifest.json for PWA configuration
- Service worker files
- Favicon and other icons
- robots.txt and other meta files

**client/src/**
- **assets/**: Images, fonts, and other media files processed by Vite
- **components/**: Reusable UI components and widgets
- **pages/**: Page-specific JavaScript modules
- **core/**: Core application logic (GameApp.js, etc.)
- **main.js**: Application entry point

**client/ root files:**
- HTML files (index.html, login.html, register.html, dashboard.html)
- vite.config.js with updated paths
- package.json with frontend-specific dependencies

### Server Directory Structure

**server/src/ organization:**
- **config/**: Environment configuration, database config, third-party service configs
- **controllers/**: Request handling logic, separated by feature area
- **routes/**: Express route definitions, organized by API endpoints
- **middlewares/**: Authentication, error handling, logging, validation middlewares
- **services/**: Business logic layer, game logic, user management
- **models/**: Data models and database schemas
- **utils/**: Helper functions and utilities
- **app.js**: Express application setup and middleware configuration
- **server.js**: HTTP server initialization and startup logic

**server/ other directories:**
- **database/**: Migration files, connection setup, initialization scripts
- **websocket/**: Socket.IO related code and real-time communication
- **tests/**: Server-side unit and integration tests

### Build and Deployment Integration

**Development Mode:**
- Client runs on Vite dev server (port 5173)
- Server runs on Express (port 3030)
- Proxy configuration handles API calls from client to server
- Hot module replacement works for frontend changes

**Production Mode:**
- Client builds to `client/dist/`
- Build artifacts copied to server's static serving directory
- Single server serves both API and static files
- Express serves frontend from static directory

## Data Models

### File Movement Mapping

**Frontend Files Migration:**
```
Current Location → New Location
index.html → client/index.html
login.html → client/login.html
register.html → client/register.html
dashboard.html → client/dashboard.html
manifest.json → client/public/manifest.json
sw.js → client/public/sw.js
src/ → client/src/
vite.config.js → client/vite.config.js
```

**Server Files Reorganization:**
```
Current Location → New Location
server/server.js → server/src/server.js
server/routes/ → server/src/routes/
server/middleware/ → server/src/middlewares/
server/models/ → server/src/models/
server/database/ → server/database/ (stays)
server/websocket/ → server/websocket/ (stays)
server/tests/ → server/tests/ (stays)
```

**New Directories to Create:**
- client/public/
- client/src/assets/
- client/src/components/
- client/src/pages/
- server/src/config/
- server/src/controllers/
- server/src/services/
- server/src/utils/

### Configuration Updates

**Root package.json scripts:**
```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:client\" \"npm run dev:server\"",
    "dev:client": "cd client && npm run dev",
    "dev:server": "cd server && npm run dev",
    "build": "cd client && npm run build",
    "start": "cd server && npm start",
    "test": "npm run test:client && npm run test:server",
    "test:client": "cd client && npm test",
    "test:server": "cd server && npm test"
  }
}
```

**Client package.json:**
- Move frontend-specific dependencies from root
- Update build scripts to output to client/dist/
- Configure Vite for new structure

**Server package.json:**
- Keep existing server dependencies
- Update start script to use new server.js location
- Maintain existing test configuration

## Error Handling

### Migration Risk Mitigation

**File Movement Safety:**
- Create backup of current structure before migration
- Use git to track all file movements
- Verify file integrity after each move operation
- Test build process after each major change

**Import Path Updates:**
- Systematically update all relative import paths
- Update Vite configuration for new asset locations
- Update server static file serving paths
- Verify all module imports resolve correctly

**Configuration Validation:**
- Test development server startup after changes
- Verify production build process works
- Ensure proxy configuration still functions
- Validate WebSocket connections work with new structure

### Rollback Strategy

**Git-based Rollback:**
- Commit current working state before starting
- Create feature branch for restructuring work
- Maintain ability to revert to previous structure
- Document any manual steps needed for rollback

**Incremental Migration:**
- Move files in logical groups (frontend first, then server)
- Test functionality after each group migration
- Fix issues before proceeding to next group
- Maintain working state throughout process

## Testing Strategy

### Pre-Migration Testing
- Run full test suite to establish baseline
- Document current functionality that must be preserved
- Test both development and production builds
- Verify WebSocket functionality and API endpoints

### During Migration Testing
- Test after moving each group of files
- Verify imports and module resolution
- Check that development servers start correctly
- Validate build processes produce expected output

### Post-Migration Validation
- Run complete test suite to ensure no regressions
- Test development workflow (hot reload, proxy, etc.)
- Build and test production deployment
- Verify PWA functionality (service worker, manifest)
- Test WebSocket connections and real-time features
- Validate static asset serving and caching

### Automated Testing Integration
- Update Cypress configuration for new structure
- Ensure unit tests continue to work
- Update any hardcoded paths in test files
- Verify CI/CD pipeline compatibility

### Performance Validation
- Compare build times before and after restructuring
- Verify static asset optimization still works
- Test caching behavior with new file locations
- Ensure no performance regressions in development mode