# Requirements Document

## Introduction

This feature will configure the Contract Crown PWA to run both the frontend and backend services on a single port, simplifying development workflow and deployment. The backend Express server will serve the built frontend assets while also handling API routes and WebSocket connections.

## Requirements

### Requirement 1

**User Story:** As a developer, I want to run both frontend and backend on the same port, so that I can simplify my development setup and avoid CORS issues.

#### Acceptance Criteria

1. WHEN the server starts THEN the Express server SHALL serve both API routes and static frontend files on the same port
2. WHEN a request is made to `/api/*` THEN the server SHALL handle it as an API request
3. WHEN a request is made to any other path THEN the server SHALL serve the appropriate frontend asset or fallback to index.html for client-side routing
4. WHEN the application is built for production THEN the frontend assets SHALL be automatically served by the Express server

### Requirement 2

**User Story:** As a developer, I want the development workflow to remain efficient, so that I can continue to have hot reloading and fast development cycles.

#### Acceptance Criteria

1. WHEN running in development mode THEN the server SHALL proxy frontend requests to Vite dev server OR serve built assets with file watching
2. WHEN frontend files change in development THEN the changes SHALL be reflected without manual server restart
3. WHEN backend files change in development THEN the server SHALL restart automatically using nodemon or similar

### Requirement 3

**User Story:** As a developer, I want simplified npm scripts, so that I can start the entire application with a single command.

#### Acceptance Criteria

1. WHEN running `npm run dev` THEN both frontend and backend SHALL start on the same port
2. WHEN running `npm run build` THEN the frontend SHALL be built and the backend SHALL be configured to serve it
3. WHEN running `npm start` THEN the production server SHALL serve both frontend and backend on the same port

### Requirement 4

**User Story:** As a developer, I want WebSocket connections to work seamlessly, so that real-time game features function properly.

#### Acceptance Criteria

1. WHEN a WebSocket connection is established THEN it SHALL work on the same port as the HTTP server
2. WHEN serving static files THEN WebSocket upgrade requests SHALL still be handled correctly
3. WHEN the frontend connects to Socket.IO THEN it SHALL connect to the same origin without specifying a different port