# WebSocket Server Implementation

This directory contains the WebSocket server implementation for the Contract Crown PWA, built with Socket.IO and featuring authentication, room management, and real-time game communication.

## Features

### ✅ Authentication & Authorization
- JWT token-based authentication for WebSocket connections
- Middleware for token verification and user identification
- Role-based authorization support
- Rate limiting for socket events

### ✅ Room Management
- Game room creation and joining
- Player ready status tracking
- Real-time player list updates
- Automatic room cleanup when empty

### ✅ Real-time Game Events
- Trump declaration broadcasting
- Card play synchronization
- Game state updates
- Turn management

### ✅ Connection Management
- Connection status monitoring
- Automatic reconnection handling
- Ping/pong health checks
- Graceful disconnection handling

## Architecture

```
websocket/
├── socketManager.js      # Main WebSocket manager
├── connectionStatus.js   # Connection monitoring
└── README.md            # This file

middleware/
└── socketAuth.js        # Authentication middleware

examples/
└── websocket-client-example.js  # Client usage example

tests/
└── websocket.test.js    # Comprehensive test suite
```

## Core Components

### SocketManager (`socketManager.js`)

The main WebSocket manager that handles:
- Socket.IO server setup and configuration
- User authentication and session management
- Game room management and player tracking
- Event routing and broadcasting
- Connection lifecycle management

**Key Methods:**
- `authenticateSocket()` - JWT authentication middleware
- `handleConnection()` - New connection setup
- `handleJoinGameRoom()` - Room joining logic
- `handlePlayerReady()` - Ready status management
- `broadcastToRoom()` - Room-specific broadcasting

### Connection Status Manager (`connectionStatus.js`)

Monitors and reports connection health:
- Real-time connection statistics
- Server performance metrics
- Connection health checks
- Status broadcasting to clients

### Authentication Middleware (`socketAuth.js`)

Provides security layers:
- JWT token verification
- Role-based access control
- Rate limiting protection
- Game room access validation

## Usage

### Server Setup

```javascript
import { Server } from 'socket.io';
import SocketManager from './websocket/socketManager.js';

const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  }
});

const socketManager = new SocketManager(io);
```

### Client Connection

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3030', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Join a game room
socket.emit('join-game-room', { gameId: 'game-123' });

// Set ready status
socket.emit('player-ready', { gameId: 'game-123', isReady: true });

// Declare trump
socket.emit('declare-trump', { gameId: 'game-123', trumpSuit: 'Hearts' });

// Play a card
socket.emit('play-card', { 
  gameId: 'game-123', 
  card: { suit: 'Hearts', rank: 'A' } 
});
```

## Events

### Client → Server Events

| Event | Data | Description |
|-------|------|-------------|
| `join-game-room` | `{ gameId }` | Join a game room |
| `leave-game-room` | `{ gameId }` | Leave a game room |
| `player-ready` | `{ gameId, isReady }` | Set ready status |
| `start-game` | `{ gameId }` | Start game (host only) |
| `declare-trump` | `{ gameId, trumpSuit }` | Declare trump suit |
| `play-card` | `{ gameId, card }` | Play a card |
| `ping` | - | Connection health check |

### Server → Client Events

| Event | Data | Description |
|-------|------|-------------|
| `connection-confirmed` | `{ userId, username, socketId }` | Connection established |
| `room-joined` | `{ gameId, players, roomStatus }` | Successfully joined room |
| `player-joined` | `{ gameId, player, players }` | Another player joined |
| `player-left` | `{ gameId, playerId, players }` | Player left room |
| `player-ready-changed` | `{ gameId, playerId, isReady, allReady }` | Ready status changed |
| `game-starting` | `{ gameId, players }` | Game is starting |
| `trump-declared` | `{ gameId, trumpSuit, declaredBy }` | Trump suit declared |
| `card-played` | `{ gameId, card, playedBy }` | Card was played |
| `pong` | `{ timestamp }` | Ping response |
| `error` | `{ message }` | Error occurred |

## Authentication

WebSocket connections require JWT authentication with enhanced support for both production and development environments:

```javascript
// Production JWT token should contain:
{
  userId: 'unique-user-id',
  username: 'player-name',
  email: 'user@example.com',
  exp: 1234567890  // Expiration timestamp
}

// Development test tokens are also supported for easier testing
```

### Token Verification

The authentication system provides flexible token verification:

- **Production JWT Tokens**: Verified using the `JWT_SECRET` environment variable with full cryptographic validation
- **Development Test Tokens**: Supported in development mode (`NODE_ENV=development`) or when `ALLOW_TEST_TOKENS=true`
- **Multi-source Token Extraction**: Tokens can be provided via:
  - `auth.token` object (preferred method)
  - `Authorization: Bearer <token>` header
  - `token` query parameter (fallback)
- **Comprehensive Error Handling**: Invalid or expired tokens result in connection rejection with detailed error codes
- **Graceful Fallback**: Authentication failures don't crash the application, allowing HTTP API fallback

## Room Management

### Room Lifecycle

1. **Creation**: Rooms are created automatically when first player joins
2. **Joining**: Players join using unique game IDs
3. **Ready Status**: Players mark themselves ready for game start
4. **Game Start**: Host can start when all 4 players are ready
5. **Cleanup**: Empty rooms are automatically removed

### Room Data Structure

```javascript
{
  gameId: 'unique-game-id',
  players: Map<userId, playerData>,
  status: 'waiting|starting|in_progress|completed',
  createdAt: '2024-01-01T00:00:00.000Z',
  startedAt: '2024-01-01T00:05:00.000Z'
}
```

## Error Handling

The WebSocket server implements comprehensive error handling:

- **Authentication Errors**: Invalid/missing tokens
- **Validation Errors**: Missing required parameters
- **Game Logic Errors**: Invalid moves or states
- **Connection Errors**: Network issues and disconnections

All errors are logged server-side and appropriate error messages are sent to clients.

## Testing

Run the comprehensive test suite:

```bash
npm test -- websocket.test.js
```

Tests cover:
- Authentication scenarios
- Room management operations
- Game event handling
- Error conditions
- Connection utilities

## Monitoring

### Connection Statistics

Access real-time statistics via REST endpoints:

- `GET /api/websocket/status` - Public connection stats
- `GET /api/websocket/detailed-status` - Detailed admin stats

### Health Checks

The server provides built-in health monitoring:
- Ping/pong latency measurement
- Connection count tracking
- Room activity monitoring
- Memory usage reporting

## Security Features

- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: Prevents spam and abuse
- **Input Validation**: All events validate required parameters
- **CORS Configuration**: Proper cross-origin request handling
- **Error Sanitization**: No sensitive data in error messages

## Performance Considerations

- **Connection Pooling**: Efficient socket management
- **Room Optimization**: Automatic cleanup of empty rooms
- **Event Batching**: Efficient broadcasting to multiple clients
- **Memory Management**: Proper cleanup of disconnected users
- **Scalability**: Designed for horizontal scaling with Redis adapter (future)

## Environment Variables

```bash
JWT_SECRET=your-secret-key          # JWT signing secret
PORT=3030                          # Server port
NODE_ENV=development|production    # Environment mode
```

## Future Enhancements

- [ ] Redis adapter for multi-server scaling
- [ ] Persistent game state storage
- [ ] Advanced reconnection handling
- [ ] Game replay functionality
- [ ] Spectator mode support
- [ ] Admin dashboard integration