# Contract Crown PWA

A Progressive Web App for the Contract Crown strategic card game, featuring real-time multiplayer gameplay, user authentication, and room management.

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

```
contract-crown-pwa/
├── src/                    # Frontend source code
│   ├── core/              # Core application modules
│   │   ├── auth.js        # Authentication manager
│   │   ├── RoomManager.js # Room management functionality
│   │   ├── SocketManager.js # WebSocket connection management with Socket.IO
│   │   └── websocket.js   # WebSocket utilities
│   ├── pages/             # Page-specific components
│   │   ├── dashboard.js   # Dashboard page functionality
│   │   ├── lobby.js       # Lobby page functionality
│   │   ├── login.js       # Login page functionality
│   │   └── register.js    # Registration page functionality
│   └── styles/            # CSS and styling
│       ├── theme.css      # Global theme variables
│       ├── dashboard.css  # Dashboard styling
│       ├── lobby.css      # Lobby page styling
│       ├── login.css      # Login page styling
│       └── register.css   # Registration styling
├── server/                # Backend Node.js server
│   ├── routes/            # API route handlers
│   ├── models/            # Database models
│   ├── middleware/        # Express middleware
│   │   └── socketAuth.js  # WebSocket authentication middleware
│   ├── database/          # Database configuration
│   ├── websocket/         # WebSocket server components
│   │   ├── socketManager.js      # Socket.IO connection and room management
│   │   └── connectionStatus.js   # Connection monitoring and status tracking
│   ├── examples/          # Example implementations and demos
│   │   └── websocket-client-example.js # Complete WebSocket client example
│   └── tests/             # Server-side tests
│       └── websocket.test.js      # WebSocket functionality tests
├── cypress/               # End-to-end testing
│   ├── e2e/              # E2E test specifications
│   │   └── auth.cy.js    # Authentication flow tests
│   ├── fixtures/         # Test data
│   └── support/          # Test utilities
├── docs/                  # Project documentation
├── test-websocket-fixes.html     # Interactive WebSocket testing tool
├── test-websocket-connection.html # Basic WebSocket connection test
├── test-websocket-connection-fixed.html # Complete WebSocket connection testing with authentication setup
├── test-auth-debug.html          # Authentication state debugging and token validation
├── test-dashboard-auth.html      # Dashboard-specific authentication testing
├── test-auth-simple.html         # Basic authentication testing and token management
├── validate-websocket-fixes.js   # WebSocket fixes validation script
├── diagnose-websocket.js         # Automated WebSocket diagnostic tool
├── QUICK_START_WEBSOCKET.md      # 3-step quick fix guide for WebSocket issues
├── fix-websocket-connection.md   # Comprehensive WebSocket troubleshooting guide
├── WEBSOCKET_FIXES_SUMMARY.md    # Detailed WebSocket fixes documentation
├── UX/                    # UI/UX design assets
│   ├── game_lobby.png    # Lobby interface design
│   └── multiplayer lobby*.jpg # Lobby design iterations
└── dist/                  # Production build output
```

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn package manager
- VS Code (recommended for development with included debugging configuration)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd contract-crown-pwa
```

2. Install frontend dependencies:
```bash
npm install
```

3. Install backend dependencies:
```bash
cd server
npm install
cd ..
```

4. Set up environment variables:
```bash
cp server/.env.example server/.env
# Edit server/.env with your configuration
```

### Development

Start both frontend and backend in development mode:
```bash
npm run dev
```

This runs:
- Frontend development server on `http://localhost:5173`
- Backend API server on `http://localhost:3030`

### Application Pages
- **Login**: `http://localhost:5173/login.html` - User authentication
- **Register**: `http://localhost:5173/register.html` - New user registration  
- **Dashboard**: `http://localhost:5173/dashboard.html` - Main game dashboard
- **Lobby**: `http://localhost:5173/lobby.html` - Waiting lobby for game preparation
- **Home**: `http://localhost:5173/` - Landing page

### Individual Services

Start only the frontend:
```bash
npm run dev:frontend
```

Start only the backend:
```bash
npm run dev:backend
```

### WebSocket Development and Testing

The project includes comprehensive WebSocket testing tools for development and debugging:

**Enhanced User Data Compatibility**: The WebSocket system now provides consistent handling of both `user_id` and `id` field names in user objects and JWT tokens, ensuring seamless compatibility across different authentication systems and user data structures. This includes proper current user identification in the lobby interface.

**Flexible User ID Handling**: The entire application now supports both `user_id` and `id` field names in user objects across all operations including host transfer, ready status handling, player management, current user identification, and room ownership validation, providing robust compatibility with different authentication backends and user data structures.

#### Quick Start WebSocket Fix
For immediate WebSocket connection resolution, see `QUICK_START_WEBSOCKET.md` for a **3-step fix**:

1. **Environment Setup** (30 seconds): Verify your `server/.env` configuration
2. **Test Connection** (1 minute): Run `node diagnose-websocket.js` for automated testing
3. **Verify in Browser** (1 minute): Use `test-websocket-connection-fixed.html` for interactive testing

#### Comprehensive Fix Guide
For detailed troubleshooting, follow the **Complete Fix Guide** in `fix-websocket-connection.md`:

1. **Set Environment Variables**: Configure `.env` with proper JWT settings
2. **Test Connection**: Use interactive test pages or diagnostic tools
3. **Common Issues**: Solutions for authentication, token, and connection problems
4. **Manual Token Creation**: Fallback token generation for testing
5. **Verification**: Confirm dashboard and lobby functionality

#### Interactive WebSocket Testing Tools
Access these browser-based testing interfaces during development:

- **`test-websocket-connection-fixed.html`**: Complete WebSocket connection testing with authentication setup
- **`test-websocket-fixes.html`**: Room management and ready status testing
- **`test-auth-debug.html`**: Authentication state debugging and token validation
- **`test-dashboard-auth.html`**: Dashboard-specific authentication testing
- **`test-auth-simple.html`**: Basic authentication testing and token management

These tools provide:
- **Real-time Connection Testing**: Test WebSocket connections with authentication
- **Room Management Testing**: Create, join, and leave rooms interactively
- **Ready Status Testing**: Toggle player ready status and observe real-time updates
- **Event Logging**: Comprehensive logging of all WebSocket events with timestamps
- **Connection Status Monitoring**: Visual connection status indicators
- **Error Handling Testing**: Test various error scenarios and edge cases
- **Token Generation**: Multiple methods for creating valid authentication tokens

#### Running the WebSocket Client Example
```bash
cd server
node examples/websocket-client-example.js
```

This command-line example demonstrates:
- **Multi-client Simulation**: Creates 4 simulated players to test multiplayer functionality
- **Complete Game Flow**: Simulates joining rooms, ready status, game start, trump declaration, and card play
- **Connection Management**: Tests authentication, reconnection, and error handling
- **Real-time Events**: Demonstrates all WebSocket events used in the game
- **Development Testing**: Perfect for automated testing of WebSocket functionality

#### WebSocket Client Usage
The example client can also be imported and used in other testing scenarios:

```javascript
import ContractCrownWebSocketClient from './server/examples/websocket-client-example.js';

const client = new ContractCrownWebSocketClient('http://localhost:3030');
await client.connect('user-123', 'TestPlayer', 'test@example.com');
client.joinGameRoom('game-456');
client.setReady('game-456', true);
```

#### WebSocket Diagnostic Tools
For comprehensive WebSocket troubleshooting and validation:

**Automated Diagnostic Tool**:
```bash
node diagnose-websocket.js
```

This diagnostic tool provides:
- **Environment Validation**: Checks JWT configuration and environment variables
- **Token Generation Testing**: Validates JWT token creation and verification
- **Connection Testing**: Tests WebSocket connection establishment and authentication
- **Room Operations Testing**: Validates room joining, ready status, and event handling
- **Comprehensive Reporting**: Generates detailed diagnostic reports with recommendations

**WebSocket Fixes Validation**:
```bash
node validate-websocket-fixes.js
```

This validation script checks:
- **Code Implementation**: Verifies that all required WebSocket fixes are present in the codebase
- **File Existence**: Ensures all necessary files and components are in place
- **Feature Completeness**: Validates that lobby functionality, ready status handling, and connection management are properly implemented
- **Documentation**: Confirms that test files and documentation are available

The script provides detailed feedback on:
- ✅ Successfully implemented features
- ❌ Missing or incomplete implementations
- 📋 Next steps for testing and validation

### Troubleshooting

#### Quick WebSocket Fix
If experiencing WebSocket connection issues, see the comprehensive troubleshooting guides:
```bash
# View the 3-step quick fix guide (fastest solution)
cat QUICK_START_WEBSOCKET.md

# View the detailed fix guide (comprehensive troubleshooting)
cat fix-websocket-connection.md

# Run automated diagnostics
node diagnose-websocket.js

# Validate all fixes are in place
node validate-websocket-fixes.js
```

#### Common Troubleshooting Commands

```bash
# Check if server is running (your server runs on port 3030)
curl http://localhost:3030/api/health

# Test JWT token generation
curl -X POST http://localhost:3030/api/auth/test-token \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser"}'

# Run full diagnostic
node diagnose-websocket.js

# Check server logs
npm start | grep -E "(WebSocket|Socket|Auth)"
```

#### Expected Behavior After Fix
✅ Dashboard shows "Connected" status (not "Disconnected")  
✅ Room creation works and auto-redirects to lobby  
✅ Lobby ready status syncs in real-time between users  
✅ No more "Authentication failed" popups  
✅ Real-time updates visible in both dashboard and lobby

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

### Rooms
- `GET /api/rooms` - Get available rooms
- `POST /api/rooms` - Create new room
- `GET /api/rooms/:id` - Get room details
- `POST /api/rooms/:id/join` - Join room
- `POST /api/rooms/:id/leave` - Leave room
- `DELETE /api/rooms/:id` - Delete room (owner only)
- `POST /api/rooms/:id/ready` - Set player ready status
- `POST /api/rooms/:id/form-teams` - Form teams (host only)
- `POST /api/rooms/:id/start` - Start game (host only)

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
NODE_ENV=development
PORT=3030
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=24h
ALLOW_TEST_TOKENS=true
DB_HOST=your-database-host
DB_PORT=3306
DB_NAME=your-database-name
DB_USER=your-database-user
DB_PASSWORD=your-database-password
BCRYPT_ROUNDS=12
```

**WebSocket Development Variables:**
- `ALLOW_TEST_TOKENS=true` - Enables test token support for development
- `JWT_SECRET` - Must match between client and server for WebSocket authentication
- `PORT` - Server port (default: 3030)
- `NODE_ENV` - Environment mode (development/production)

### PWA Configuration
The app includes a web manifest (`manifest.json`) and service worker (`sw.js`) for PWA functionality.

## Development Status

**Current Phase**: Waiting Lobby Implementation Complete (Tasks 5.1-5.5)  
**Overall Progress**: ~60% Complete (Tasks 1.1-5.5 finished, moving to Game Page Foundation)

### Completed Features ✅
- **Authentication System**: Complete JWT-based authentication with enhanced session management, intelligent token validation, and network-resilient authentication
- **Dashboard & Room Management**: Full room creation, joining, and management functionality with real-time updates and auto-redirect flows
- **Waiting Lobby**: Complete player management interface with ready status, team formation, and comprehensive WebSocket integration
- **Real-time Communication**: Production-ready WebSocket implementation with Socket.IO featuring authentication, room management, and connection health monitoring
- **Enhanced Session Management**: Robust authentication with graceful error handling, reduced false session expiry alerts, and intelligent fallback mechanisms
- **WebSocket Server Integration**: Complete Socket.IO server with authentication middleware, connection status monitoring, and comprehensive event handling
- **Testing Infrastructure**: Comprehensive test suite including WebSocket testing tools, authentication debugging utilities, and E2E tests
- **Backend Infrastructure**: Production-ready Node.js/Express server with MariaDB integration, security middleware, and optimized static file serving
- **PWA Foundation**: Service worker, manifest, and mobile-optimized design
- **Development Tools**: Interactive WebSocket testing interface, authentication debugging tools, automated diagnostic tools, and comprehensive logging

### Recent Updates 🔄
- **Enhanced User ID Field Compatibility**: Improved dashboard and lobby systems to support both `user_id` and `id` field names in user objects across all operations including host transfer, ready status handling, player management, current user identification, and room ownership validation, ensuring seamless compatibility across different authentication systems and user data structures
- **Enhanced Token Field Compatibility**: Improved WebSocket authentication middleware to consistently handle both `userId` and `id` fields in JWT tokens, ensuring seamless compatibility across production JWT tokens and development test tokens
- **Comprehensive WebSocket Troubleshooting**: Added complete troubleshooting guide (`fix-websocket-connection.md`) with step-by-step solutions for common WebSocket connection issues
- **Automated Diagnostic Tool**: New `diagnose-websocket.js` script provides comprehensive WebSocket connection testing with environment validation, token generation testing, and detailed reporting
- **Enhanced Testing Suite**: Multiple specialized test pages for different authentication and WebSocket scenarios with real-time debugging capabilities
- **Intelligent Token Management**: Support for both production JWT tokens and development test tokens with flexible authentication methods
- **Enhanced Ready Status Handling**: Improved WebSocket ready status updates with intelligent fallback to HTTP API and timeout handling (3-second fallback)
- **Connection-Aware Ready Status**: Ready status changes now properly consider only connected players, preventing game start issues with disconnected players
- **Robust User Data Handling**: WebSocket events now support flexible user identification from both socket authentication and request data
- **Automatic Room Rejoining**: Enhanced auto-rejoin functionality for players who lose WebSocket connection but attempt ready status changes
- **Improved Connection Status Logic**: Ready status validation now distinguishes between total players and connected players for accurate game start conditions
- **WebSocket State Validation**: Enhanced room joining state validation to ensure WebSocket events are only sent when properly connected to room
- **Connection Status Monitoring**: Real-time connection health monitoring with visual indicators and automatic room rejoining
- **Heartbeat Connection Management**: Added heartbeat functionality for maintaining stable WebSocket connections with automatic start/stop on connect/disconnect events
- **Enhanced Connection Security**: Added mandatory user information validation during WebSocket connection establishment to prevent unauthorized access
- **Improved Error Recovery**: Enhanced WebSocket error handling with specific responses for session expiration and authentication failures
- **Graceful Authentication Error Handling**: WebSocket authentication failures no longer force immediate page redirects, allowing applications to continue functioning with HTTP API fallback while maintaining user experience
- **Comprehensive Error Validation**: Enhanced WebSocket authentication middleware with better error handling and validation for all connection scenarios
- **Defensive Programming Improvements**: Added safety checks for optional authentication methods to prevent runtime errors and improve code reliability
- **Intelligent Token Validation**: Enhanced session validation with local JWT expiration checks before server calls, graceful handling of missing validation endpoints, and network-resilient authentication that doesn't clear sessions on temporary network errors

### Upcoming Features 📋
- **Game Page Foundation**: Card display, game table layout, and trump declaration interface (Tasks 6.1-6.4)
- **Game Logic Engine**: Core Contract Crown game mechanics, card dealing, and trick-taking rules (Tasks 7.1-7.5)
- **Real-time Game Communication**: Complete WebSocket integration for live gameplay (Tasks 8.1-8.4)
- **Complete Game Flow**: Full gameplay integration with scoring and Crown Rule implementation (Tasks 9.1-9.4)
- **PWA Enhancement**: Advanced mobile optimization, offline support, and installation features (Tasks 10.1-10.4)
- **Final Polish**: Performance optimization, theme customization, and production deployment (Tasks 11.1-11.4)

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
- **Socket.IO** - Real-time WebSocket communication with automatic reconnection
- **JWT** - Authentication tokens
- **bcrypt** - Password hashing
- **MariaDB/MySQL2** - Database integration

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