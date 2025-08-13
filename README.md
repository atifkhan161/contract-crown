# Trump Crown PWA

A Progressive Web App for the Trump Crown strategic card game, featuring real-time multiplayer gameplay, user authentication, and room management with RxDB database integration.

## Features

### Core Functionality
- **User Authentication**: Secure JWT-based login and registration system
- **Game Dashboard**: Centralized hub for room management and user statistics
- **Room Management**: Create, join, and manage game rooms with real-time updates
- **Waiting Lobby**: Complete player status management and team formation interface with real-time updates
- **Real-time Communication**: Complete Socket.IO integration with WebSocket server for live gameplay and lobby updates
- **Progressive Web App**: Offline capabilities and mobile-friendly design
- **Responsive Design**: Works seamlessly across desktop and mobile devices

### Authentication System
- **JWT Token Security**: Production-ready JWT token validation with proper server-side validation
- **Refresh Token Support**: Automatic token refresh to maintain user sessions
- **Secure Session Management**: Cross-tab session synchronization and automatic cleanup
- **Remember Me Functionality**: Persistent/session storage options for user convenience
- **Role-based Access Control**: User permissions and role management
- **Profile Management**: User profile updates and password change capabilities
- **Security Features**: XSS prevention, rate limiting protection, and secure token storage
- **Intelligent Session Validation**: Enhanced token validation with local expiration checks and graceful fallback handling
- **Network-Resilient Authentication**: Robust authentication that handles network errors and missing validation endpoints gracefully
- **Optimized Session Monitoring**: Reduced frequency of session validation checks to prevent false session expiry alerts
- **Enhanced Error Handling**: Better handling of network errors during validation with more robust token expiry checking

### Game Dashboard
- **Room Management Interface**: Visual dashboard for creating and joining game rooms
- **Real-time Room Updates**: Live status updates for all available rooms
- **User Statistics Display**: Games played, games won, and win rate tracking
- **Connection Status Monitoring**: Real-time connection status with the game server
- **Room Creation Modal**: Easy-to-use interface for creating custom game rooms
- **Private/Public Room Options**: Support for both private (invite-only) and public rooms
- **Seamless Room Creation Flow**: Immediate UI updates and automatic lobby redirection for room creators

### Room Management
- Create private or public game rooms with customizable settings
- Join existing rooms with real-time availability updates and automatic lobby redirection
- Automatic room rejoining for users already in a room (prevents duplicate join errors)
- Room owner controls (delete, manage players)
- Support for 2-6 players per room
- Real-time room status and player count updates
- Seamless navigation flow from dashboard to waiting lobby

### Waiting Lobby
- **Complete Player Management**: Real-time display of connected players with 4-slot layout and status indicators
- **Ready Status System**: Players can toggle ready/unready status with real-time synchronization across all clients, intelligent HTTP API fallback, and connection-aware validation
- **Team Formation Interface**: Visual representation of Team 1 (Blue) and Team 2 (Red) with automatic team assignment
- **Host Controls**: Room host can shuffle teams and start games when all connected players are ready
- **Connection Monitoring**: Visual indicators for player connection status and WebSocket health
- **Game Code Sharing**: Easy-to-copy game codes for inviting other players
- **Real-time Updates**: Live synchronization of player joins, leaves, and status changes
- **Session Management**: Automatic room data refresh when returning to the page and proper cleanup on page exit
- **Reconnection Handling**: Seamless reconnection to rooms when network connectivity is restored
- **Loading State Management**: Smooth loading indicators during room data fetching and state transitions
- **Enhanced Error Handling**: Comprehensive error handling with fallback mechanisms and detailed logging
- **Robust Initialization**: Step-by-step initialization process with error recovery and user feedback
- **Debug Logging**: Detailed console logging for development and troubleshooting support
- **Team Formation Algorithm**: Automatic random team assignment for 4 players with shuffle functionality
- **Ready Status Validation**: Game start validation ensuring all players are ready before proceeding
- **Dynamic UI Updates**: Real-time visual feedback for team assignments and player status changes
- **Intelligent Fallback System**: Automatic HTTP API fallback for WebSocket failures with 3-second timeout protection
- **Connection-Aware Game Logic**: Game start validation ensures all players are ready before proceeding, considering only connected players
- **Enhanced Disconnect Handling**: Improved WebSocket disconnection management with proper heartbeat cleanup and connection state reset
- **Session Expiration Recovery**: Automatic page refresh when WebSocket authentication fails due to expired sessions
- **Robust Authentication Error Handling**: Enhanced WebSocket authentication with comprehensive error validation and automatic recovery mechanisms
- **User Information Validation**: Mandatory user data validation during WebSocket connections to prevent unauthorized access and session issues

### Real-time WebSocket Communication
- **Socket.IO Integration**: Complete client-server WebSocket communication with automatic fallback to polling
- **Enhanced Authentication**: JWT-based WebSocket authentication with automatic token validation, user information verification, and comprehensive error handling
- **Flexible User ID Handling**: Robust authentication system that supports both `userId` and `id` fields in JWT tokens for maximum compatibility with different authentication systems, including consistent handling across both production JWT tokens and development test tokens
- **Development Token Support**: Flexible authentication system supporting both production JWT tokens and development test tokens for easier testing
- **Multi-source Token Extraction**: Token extraction from auth object, Authorization header, or query parameters for maximum compatibility
- **Connection Management**: Automatic reconnection with exponential backoff and connection status monitoring
- **Room-based Events**: Real-time events for player joining/leaving, ready status changes, and team formation
- **Event Broadcasting**: Server-side event broadcasting to all players in a room
- **Error Handling**: Comprehensive WebSocket error handling with graceful degradation, connection validation, and automatic recovery mechanisms
- **Graceful Authentication Failures**: WebSocket authentication errors are handled gracefully without forcing immediate redirects, allowing pages to continue functioning with HTTP API fallback
- **Development Proxy**: Vite development server proxy configuration for WebSocket connections
- **Client Example**: Complete WebSocket client example with multiplayer simulation and testing utilities
- **Connection Health Monitoring**: Real-time connection status tracking with heartbeat functionality and ping/pong support
- **Multi-layer Security Validation**: Enhanced connection security with mandatory user information validation at both middleware and socket manager levels, plus role-based authorization support


## Project Structure

**Note**: The project is currently undergoing a folder structure refactoring to follow modern full-stack development practices. The current structure is a hybrid state with some components moved to the new structure.

### Current Structure
```
trump-crown/
├── client/                # Frontend application
│   ├── public/           # Static assets
│   │   ├── icons/        # PWA icons
│   │   ├── favicon.ico   # Site favicon
│   │   ├── manifest.json # PWA manifest
│   │   └── sw.js         # Service worker
│   ├── src/              # Frontend source code
│   │   ├── components/   # Reusable UI components
│   │   │   ├── CardManager.js    # Card handling
│   │   │   ├── ThemeSelector.js  # Theme switching
│   │   │   ├── TrickManager.js   # Trick management
│   │   │   ├── TrumpManager.js   # Trump suit handling
│   │   │   └── UIManager.js      # UI utilities
│   │   ├── core/         # Core application modules
│   │   │   ├── auth.js           # Authentication manager
│   │   │   ├── ConnectionManager.js # Connection handling
│   │   │   ├── GameManager.js    # Game logic
│   │   │   ├── GameState.js      # Game state management
│   │   │   ├── RoomManager.js    # Room management
│   │   │   ├── SocketManager.js  # WebSocket management
│   │   │   └── ErrorHandler.js   # Error handling
│   │   ├── pages/        # Page-specific components
│   │   │   ├── dashboard.js      # Dashboard functionality
│   │   │   ├── game.js           # Game page functionality
│   │   │   ├── login.js          # Login page
│   │   │   ├── register.js       # Registration page
│   │   │   └── waiting-room.js   # Waiting room functionality
│   │   ├── styles/       # CSS styling (organized by page)
│   │   │   ├── dashboard/        # Dashboard styles
│   │   │   ├── game/             # Game page styles
│   │   │   ├── login/            # Login styles
│   │   │   ├── register/         # Registration styles
│   │   │   ├── waiting-room/     # Waiting room styles
│   │   │   └── theme.css         # Global theme
│   │   └── ui/           # UI components
│   │       └── WaitingRoomUI.js  # Waiting room UI
│   ├── test/             # Frontend tests
│   ├── *.html            # HTML pages
│   ├── package.json      # Frontend dependencies
│   └── vite.config.js    # Vite configuration
├── server/               # Backend Node.js server
│   ├── data/             # RxDB data storage
│   │   ├── backups/      # Database backups
│   │   └── rxdb/         # RxDB database files
│   ├── database/         # Database configuration
│   │   ├── rxdb-connection.js # RxDB connection
│   │   └── rxdb-init.js       # Database initialization
│   ├── src/              # Server source code
│   │   ├── database/     # Database schemas and validation
│   │   ├── middleware/   # Express middleware
│   │   ├── models/       # RxDB data models
│   │   ├── routes/       # API route handlers
│   │   ├── services/     # Business logic services
│   │   ├── utils/        # Utility functions
│   │   ├── websocket/    # WebSocket handlers
│   │   ├── app.js        # Express app setup
│   │   └── server.js     # Server entry point
│   ├── scripts/          # Database management scripts
│   ├── test/             # Server tests
│   ├── tests/            # Additional test files
│   ├── websocket/        # WebSocket management
│   ├── examples/         # Example implementations
│   ├── .env              # Environment configuration
│   └── package.json      # Backend dependencies
├── cypress/              # End-to-end testing
│   ├── e2e/             # E2E test specifications
│   ├── fixtures/        # Test data
│   └── support/         # Test utilities
├── docs/                 # Project documentation
├── UX/                   # UI/UX design assets
├── .kiro/                # Kiro project specifications
├── docker-scripts/       # Docker build scripts
├── Dockerfile           # Docker configuration
├── cypress.config.js    # Cypress configuration
└── package.json         # Root workspace configuration
```

### Database Architecture
The project uses **RxDB** (Reactive Database) for real-time data synchronization:

- **Local-first Architecture**: RxDB provides offline-first capabilities with automatic synchronization
- **Reactive Queries**: Real-time updates across all connected clients
- **Schema Validation**: Comprehensive data validation with AJV
- **Backup System**: Automated backup and restore functionality
- **Migration Support**: Database schema migration with rollback capabilities
- **Performance Monitoring**: Built-in performance tracking and optimization

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm package manager
- VS Code (recommended for development)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd contract-crown-pwa
```

2. Install dependencies:
```bash
npm install
cd client && npm install
cd ../server && npm install
```

3. Set up environment variables:
```bash
cp server/.env.example server/.env
# Edit server/.env with your configuration
```

4. Initialize RxDB database:
```bash
cd server
npm run rxdb:init
```

### Development

Start both frontend and backend in development mode:
```bash
npm run dev
```

This runs:
- Frontend development server on `http://localhost:5173` (served from client/ directory)
- Backend API server on `http://localhost:3030`

### Application Pages
- **Home**: `http://localhost:5173/` - Landing page
- **Login**: `http://localhost:5173/login.html` - User authentication
- **Register**: `http://localhost:5173/register.html` - New user registration  
- **Dashboard**: `http://localhost:5173/dashboard.html` - Main game dashboard
- **Waiting Room**: `http://localhost:5173/waiting-room.html` - Game preparation lobby
- **Game**: `http://localhost:5173/game.html` - Main game interface

### Individual Services

Start only the frontend:
```bash
npm run dev:client-only
```

Start only the backend:
```bash
npm run dev:server-only
```

### Database Management

The project uses RxDB for reactive, real-time data management:

#### Database Commands
```bash
# Initialize database
npm run rxdb:init

# Reset database (clears all data)
npm run rxdb:reset

# Check database status
npm run rxdb:status

# Validate database setup
npm run rxdb:check
```

#### Backup Management
```bash
# Create backup
npm run backup:create

# List available backups
npm run backup:list

# Restore from backup
npm run backup:restore

# Validate backup integrity
npm run backup:validate

# Cleanup old backups
npm run backup:cleanup
```

### WebSocket Development

The project includes comprehensive WebSocket testing and development tools:

#### WebSocket Client Example
```bash
cd server
node examples/websocket-client-example.js
```

#### State Reconciliation Demo
```bash
cd server
node examples/stateReconciliationDemo.js
```

#### WebSocket Reliability Testing
```bash
cd server
node examples/websocketReliabilityDemo.js
```

### Troubleshooting

#### Common Issues

**Database Connection Issues:**
```bash
# Check RxDB status
npm run rxdb:status

# Reinitialize database
npm run rxdb:reset && npm run rxdb:init
```

**WebSocket Connection Issues:**
```bash
# Check server health
curl http://localhost:3030/health

# Test WebSocket connection
node server/examples/websocket-client-example.js
```

**Build Issues:**
```bash
# Clean install
rm -rf node_modules client/node_modules server/node_modules
npm install && cd client && npm install && cd ../server && npm install
```

### Development Environment

The project includes VS Code configuration for an optimal development experience:

#### Debugging
- **Server Debugging**: Use F5 or the "Launch Program" configuration to debug the backend server
- **Breakpoint Support**: Set breakpoints in server-side code for step-through debugging
- **Configuration**: Located in `.vscode/launch.json` - targets `server/server.js`

#### Recommended VS Code Extensions
For the best development experience, consider installing:
- ES6 String HTML for template literals
- REST Client for API testing
- GitLens for enhanced Git integration
- Prettier for code formatting
- ESLint for code linting

## Testing

### Unit Tests
Run frontend unit tests:
```bash
npm test
```

Run tests with UI:
```bash
npm run test:ui
```

Run backend tests:
```bash
npm run test:server
```

### End-to-End Testing

The project includes comprehensive E2E tests using Cypress, covering:

#### Authentication Flow Tests
- Login form validation and functionality
- Registration form validation and user creation
- Error handling for invalid credentials
- Network error handling
- Loading states and user feedback
- Token persistence and session management
- Password strength validation
- Terms acceptance validation
- Cross-page navigation
- Accessibility compliance

Run E2E tests in interactive mode:
```bash
npm run cypress:open
```

Run E2E tests in headless mode:
```bash
npm run test:e2e
```

### Test Coverage
The comprehensive test suite covers:

#### Authentication Tests
- ✅ Form validation (client-side and server-side)
- ✅ Successful login/registration flows
- ✅ Error handling and user feedback
- ✅ Loading states and UI responsiveness
- ✅ Token management and persistence
- ✅ Session state across page reloads
- ✅ Accessibility and keyboard navigation
- ✅ Network error scenarios

#### WebSocket Tests
- ✅ Connection establishment and authentication
- ✅ Room management (create, join, leave)
- ✅ Real-time player status updates
- ✅ Ready status synchronization
- ✅ Team formation and broadcasting
- ✅ Connection health monitoring
- ✅ Error handling and recovery
- ✅ Multi-client simulation testing

#### Lobby Functionality Tests
- ✅ Player joining and leaving lobby
- ✅ Ready status changes and synchronization
- ✅ Team formation and host controls
- ✅ WebSocket connection and real-time updates
- ✅ Complete Cypress E2E test coverage for lobby functionality

#### Interactive Testing Tools
- ✅ Browser-based WebSocket testing interface
- ✅ Authentication state debugging tools
- ✅ Dashboard-specific authentication testing
- ✅ Connection status monitoring
- ✅ Event logging and debugging utilities
- ✅ Automated diagnostic tool with comprehensive reporting
- ✅ Quick fix guide for common WebSocket issues
- ✅ Multiple authentication token generation methods

## Building for Production

Build the application:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

Start the production server:
```bash
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh JWT token
- `POST /api/auth/validate` - Validate current session
- `PUT /api/auth/profile` - Update user profile
- `POST /api/auth/change-password` - Change password

#### Development & Testing Endpoints (Non-Production Only)
- `POST /api/auth/test-token` - Generate test JWT token for development and testing

### Rooms & Waiting Rooms
- `GET /api/rooms` - Get available rooms
- `POST /api/rooms` - Create new room
- `GET /api/rooms/:id` - Get room details
- `POST /api/rooms/:id/join` - Join room
- `POST /api/rooms/:id/leave` - Leave room
- `DELETE /api/rooms/:id` - Delete room (owner only)
- `GET /api/waiting-rooms/:id` - Get waiting room details
- `POST /api/waiting-rooms/:id/ready` - Set player ready status
- `POST /api/waiting-rooms/:id/start` - Start game (host only)

### Games
- `GET /api/games/:id` - Get game state
- `POST /api/games/:id/play-card` - Play a card
- `POST /api/games/:id/declare-trump` - Declare trump suit
- `GET /api/games/:id/statistics` - Get game statistics

### Statistics
- `GET /api/statistics/user/:id` - Get user statistics
- `GET /api/statistics/game/:id` - Get game statistics

### Users
- `GET /api/users/stats` - Get user statistics

### WebSocket Events

#### Client to Server Events
- `join-game-room` - Join a game room
- `leave-game-room` - Leave a game room
- `player-ready` - Set player ready status
- `start-game` - Start game (host only)
- `declare-trump` - Declare trump suit
- `play-card` - Play a card
- `ping` - Connection health check
- `test` - Test event for debugging

#### Server to Client Events
- `connection-confirmed` - Connection authentication confirmed
- `room-joined` - Successfully joined a room
- `player-joined` - Another player joined the room
- `player-left` - Player left the room
- `player-ready-changed` - Player ready status changed
- `game-starting` - Game is starting
- `trump-declared` - Trump suit declared
- `card-played` - Card was played
- `pong` - Response to ping
- `error` - Error message
- `test-response` - Response to test event

## Configuration

### Environment Variables
Configure the following in `server/.env`:

```env
# Server Configuration
PORT=3030
NODE_ENV=development
VITE_DEV_SERVER_URL=http://localhost:5173

# RxDB Configuration
RXDB_PATH=./data/rxdb
RXDB_NAME=trump_crown_rxdb

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=24h

# Security
BCRYPT_ROUNDS=12
```

**Key Configuration Notes:**
- `RXDB_PATH` - Path to RxDB database files
- `RXDB_NAME` - Database name for RxDB
- `JWT_SECRET` - Must be secure for production
- `VITE_DEV_SERVER_URL` - Frontend development server URL

### PWA Configuration
The app includes a web manifest (`manifest.json`) and service worker (`sw.js`) for PWA functionality.

## Development Status

**Current Phase**: Game Implementation & RxDB Integration ✅  
**Overall Progress**: ~75% Complete

### Completed Features ✅
- **RxDB Database Integration**: Complete migration from MariaDB to RxDB with reactive queries, backup system, and schema validation
- **Authentication System**: JWT-based authentication with session management and security middleware
- **Dashboard & Room Management**: Full room creation, joining, and management with real-time updates
- **Waiting Room**: Complete player management with ready status, team formation, and WebSocket integration
- **Game Interface**: Card display, game table layout, trump declaration, and trick management
- **Real-time Communication**: Production-ready WebSocket implementation with Socket.IO
- **Bot AI System**: Intelligent bot players with strategic decision-making
- **State Management**: Comprehensive game state synchronization and conflict resolution
- **Testing Infrastructure**: Extensive test suite with Cypress E2E tests and unit tests
- **PWA Features**: Service worker, manifest, offline capabilities, and mobile optimization
- **Development Tools**: Comprehensive debugging tools, state monitoring, and diagnostic utilities

### Recent Updates 🔄
- **RxDB Migration Complete**: Successfully migrated from MariaDB to RxDB with full data preservation and enhanced real-time capabilities
- **Game Interface Implementation**: Complete game page with card display, trump declaration, and trick management
- **Bot AI Integration**: Intelligent bot players with strategic decision-making and realistic gameplay
- **State Synchronization**: Advanced state reconciliation engine for handling conflicts and ensuring data consistency
- **Performance Optimization**: Enhanced database queries, connection pooling, and real-time update efficiency
- **Backup System**: Automated backup and restore functionality with scheduled backups and integrity validation
- **Error Handling Enhancement**: Comprehensive error monitoring and recovery mechanisms
- **Testing Expansion**: Extended test coverage including game logic, bot behavior, and state synchronization
- **UI/UX Improvements**: Enhanced responsive design, theme system, and user feedback mechanisms
- **Development Tools**: Advanced debugging utilities, performance monitoring, and diagnostic tools

### Upcoming Features 📋
- **Advanced Game Features**: Tournament mode, spectator support, and advanced statistics
- **Social Features**: Friend system, chat functionality, and player profiles
- **Mobile Optimization**: Enhanced mobile UI, touch controls, and offline gameplay
- **Performance Enhancements**: Advanced caching, lazy loading, and optimization
- **Analytics Integration**: Player behavior tracking, game analytics, and performance metrics
- **Production Deployment**: Docker containerization, CI/CD pipeline, and cloud deployment

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Write tests for new features
- Follow the existing code style
- Update documentation for API changes
- Ensure all tests pass before submitting PR
- Use the WebSocket client example for testing real-time functionality
- Test WebSocket events with multiple simulated clients

## Technologies Used

### Frontend
- **Vite** - Build tool and development server
- **Vanilla JavaScript** - Core application logic
- **Socket.IO Client** - Real-time WebSocket communication with automatic reconnection
- **CSS3** - Styling and responsive design
- **Service Worker** - PWA functionality

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **RxDB** - Reactive database with real-time synchronization
- **Socket.IO** - Real-time WebSocket communication
- **JWT** - Authentication tokens
- **bcrypt** - Password hashing
- **LokiJS** - In-memory database adapter for RxDB

### Testing
- **Vitest** - Unit testing framework
- **Cypress** - End-to-end testing
- **Testing Library** - Testing utilities

### Development Tools
- **Concurrently** - Run multiple commands
- **ESLint** - Code linting
- **Prettier** - Code formatting

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions, please open an issue in the GitHub repository.