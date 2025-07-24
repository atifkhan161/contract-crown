# Contract Crown PWA

A Progressive Web App for the Contract Crown strategic card game, featuring real-time multiplayer gameplay, user authentication, and room management.

## Features

### Core Functionality
- **User Authentication**: Secure JWT-based login and registration system
- **Game Dashboard**: Centralized hub for room management and user statistics
- **Room Management**: Create, join, and manage game rooms with real-time updates
- **Waiting Lobby**: *(In Development)* Player status management and team formation interface
- **Real-time Communication**: Socket.io integration for live gameplay
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
- **Session Validation**: Real-time server validation of authentication tokens

### Game Dashboard
- **Room Management Interface**: Visual dashboard for creating and joining game rooms
- **Real-time Room Updates**: Live status updates for all available rooms
- **User Statistics Display**: Games played, games won, and win rate tracking
- **Connection Status Monitoring**: Real-time connection status with the game server
- **Room Creation Modal**: Easy-to-use interface for creating custom game rooms
- **Private/Public Room Options**: Support for both private (invite-only) and public rooms

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
- **Ready Status System**: Players can toggle ready/unready status with real-time synchronization across all clients
- **Team Formation Interface**: Visual representation of Team 1 (Blue) and Team 2 (Red) with automatic team assignment
- **Host Controls**: Room host can shuffle teams and start games when all players are ready
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


## Project Structure

```
contract-crown-pwa/
├── src/                    # Frontend source code
│   ├── core/              # Core application modules
│   │   ├── auth.js        # Authentication manager
│   │   ├── RoomManager.js # Room management functionality
│   │   ├── SocketManager.js # WebSocket connection management
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
│   ├── database/          # Database configuration
│   └── tests/             # Server-side tests
├── cypress/               # End-to-end testing
│   ├── e2e/              # E2E test specifications
│   │   └── auth.cy.js    # Authentication flow tests
│   ├── fixtures/         # Test data
│   └── support/          # Test utilities
├── docs/                  # Project documentation
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
- Backend API server on `http://localhost:3000`

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
The authentication tests cover:
- ✅ Form validation (client-side and server-side)
- ✅ Successful login/registration flows
- ✅ Error handling and user feedback
- ✅ Loading states and UI responsiveness
- ✅ Token management and persistence
- ✅ Session state across page reloads
- ✅ Accessibility and keyboard navigation
- ✅ Network error scenarios

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

## Configuration

### Environment Variables
Configure the following in `server/.env`:

```env
NODE_ENV=development
PORT=3000
JWT_SECRET=your-jwt-secret
JWT_REFRESH_SECRET=your-refresh-secret
DB_CONNECTION_STRING=your-database-url
```

### PWA Configuration
The app includes a web manifest (`manifest.json`) and service worker (`sw.js`) for PWA functionality.

## Development Status

### Completed Features ✅
- User authentication system with JWT tokens
- User registration and login pages
- Game dashboard with room management
- Room creation and joining functionality
- Waiting lobby with player management and ready status system
- Team formation interface with host controls
- Real-time WebSocket communication foundation
- Comprehensive E2E testing suite
- PWA foundation with service worker

### In Progress 🚧
- **WebSocket Server Integration**: Socket.IO server setup for real-time communication
- **Real-time Lobby Synchronization**: Complete WebSocket event handling for lobby updates
- **Lobby Testing Suite**: Comprehensive Cypress tests for ready status and team formation

### Upcoming Features 📋
- Game page with card display and table layout
- Core game logic engine for Contract Crown
- Complete trick-taking gameplay
- Scoring system and Crown Rule implementation
- Mobile optimization and PWA enhancements

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

## Technologies Used

### Frontend
- **Vite** - Build tool and development server
- **Vanilla JavaScript** - Core application logic
- **Socket.io Client** - Real-time communication
- **CSS3** - Styling and responsive design
- **Service Worker** - PWA functionality

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Socket.io** - Real-time communication
- **JWT** - Authentication tokens
- **bcrypt** - Password hashing

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