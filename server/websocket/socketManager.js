import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

/**
 * WebSocket Manager for Contract Crown game
 * Handles Socket.IO connections, room management, and authentication
 */
class SocketManager {
  constructor(io) {
    this.io = io;
    this.gameRooms = new Map(); // gameId -> room data
    this.userSockets = new Map(); // userId -> socket.id
    this.socketUsers = new Map(); // socket.id -> userId
    
    this.setupSocketIO();
  }

  /**
   * Set up Socket.IO connection handling and middleware
   */
  setupSocketIO() {
    // Authentication middleware
    this.io.use(this.authenticateSocket.bind(this));
    
    // Connection handler
    this.io.on('connection', this.handleConnection.bind(this));
    
    console.log('[WebSocket] Socket manager initialized');
  }

  /**
   * Authenticate socket connections using JWT
   */
  async authenticateSocket(socket, next) {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      
      // Attach user info to socket
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      
      console.log(`[WebSocket] User authenticated: ${socket.username} (${socket.userId})`);
      next();
    } catch (error) {
      console.error('[WebSocket] Authentication failed:', error.message);
      next(new Error('Invalid authentication token'));
    }
  }

  /**
   * Handle new socket connections
   */
  handleConnection(socket) {
    const { userId, username } = socket;
    
    console.log(`[WebSocket] Client connected: ${username} (${socket.id})`);
    
    // Store user-socket mapping
    this.userSockets.set(userId, socket.id);
    this.socketUsers.set(socket.id, userId);
    
    // Send connection confirmation
    socket.emit('connection-confirmed', {
      userId,
      username,
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });

    // Set up event handlers
    this.setupSocketEvents(socket);
    
    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });
  }

  /**
   * Set up all socket event handlers
   */
  setupSocketEvents(socket) {
    const { userId, username } = socket;

    // Room management events
    socket.on('join-game-room', (data) => {
      this.handleJoinGameRoom(socket, data);
    });

    socket.on('leave-game-room', (data) => {
      this.handleLeaveGameRoom(socket, data);
    });

    socket.on('player-ready', (data) => {
      this.handlePlayerReady(socket, data);
    });

    socket.on('start-game', (data) => {
      this.handleStartGame(socket, data);
    });

    // Game events
    socket.on('declare-trump', (data) => {
      this.handleDeclareTrump(socket, data);
    });

    socket.on('play-card', (data) => {
      this.handlePlayCard(socket, data);
    });

    // Connection status events
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    // Test event for debugging
    socket.on('test', (data) => {
      console.log(`[WebSocket] Test event from ${username}:`, data);
      socket.emit('test-response', { 
        message: 'Server received test event',
        from: username,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Handle joining a game room
   */
  handleJoinGameRoom(socket, data) {
    const { gameId } = data;
    const { userId, username } = socket;

    if (!gameId) {
      socket.emit('error', { message: 'Game ID is required' });
      return;
    }

    try {
      // Join the Socket.IO room
      socket.join(gameId);
      
      // Initialize room data if it doesn't exist
      if (!this.gameRooms.has(gameId)) {
        this.gameRooms.set(gameId, {
          gameId,
          players: new Map(),
          createdAt: new Date().toISOString(),
          status: 'waiting'
        });
      }

      const room = this.gameRooms.get(gameId);
      
      // Add player to room
      room.players.set(userId, {
        userId,
        username,
        socketId: socket.id,
        isReady: false,
        joinedAt: new Date().toISOString()
      });

      console.log(`[WebSocket] ${username} joined game room: ${gameId}`);

      // Notify all players in the room
      this.io.to(gameId).emit('player-joined', {
        gameId,
        player: {
          userId,
          username,
          isReady: false
        },
        players: Array.from(room.players.values()).map(p => ({
          userId: p.userId,
          username: p.username,
          isReady: p.isReady
        })),
        timestamp: new Date().toISOString()
      });

      // Send room info to the joining player
      socket.emit('room-joined', {
        gameId,
        players: Array.from(room.players.values()).map(p => ({
          userId: p.userId,
          username: p.username,
          isReady: p.isReady
        })),
        roomStatus: room.status,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[WebSocket] Error joining game room:', error);
      socket.emit('error', { message: 'Failed to join game room' });
    }
  }

  /**
   * Handle leaving a game room
   */
  handleLeaveGameRoom(socket, data) {
    const { gameId } = data;
    const { userId, username } = socket;

    if (!gameId) {
      socket.emit('error', { message: 'Game ID is required' });
      return;
    }

    try {
      // Leave the Socket.IO room
      socket.leave(gameId);

      const room = this.gameRooms.get(gameId);
      if (room && room.players.has(userId)) {
        // Remove player from room
        room.players.delete(userId);
        
        console.log(`[WebSocket] ${username} left game room: ${gameId}`);

        // Notify remaining players
        this.io.to(gameId).emit('player-left', {
          gameId,
          playerId: userId,
          playerName: username,
          players: Array.from(room.players.values()).map(p => ({
            userId: p.userId,
            username: p.username,
            isReady: p.isReady
          })),
          timestamp: new Date().toISOString()
        });

        // Clean up empty rooms
        if (room.players.size === 0) {
          this.gameRooms.delete(gameId);
          console.log(`[WebSocket] Cleaned up empty room: ${gameId}`);
        }
      }

      socket.emit('room-left', { gameId, timestamp: new Date().toISOString() });

    } catch (error) {
      console.error('[WebSocket] Error leaving game room:', error);
      socket.emit('error', { message: 'Failed to leave game room' });
    }
  }

  /**
   * Handle player ready status change
   */
  handlePlayerReady(socket, data) {
    const { gameId, isReady } = data;
    const { userId, username } = socket;

    if (!gameId || typeof isReady !== 'boolean') {
      socket.emit('error', { message: 'Game ID and ready status are required' });
      return;
    }

    try {
      const room = this.gameRooms.get(gameId);
      if (!room || !room.players.has(userId)) {
        socket.emit('error', { message: 'Player not in game room' });
        return;
      }

      // Update player ready status
      const player = room.players.get(userId);
      player.isReady = isReady;

      console.log(`[WebSocket] ${username} ready status: ${isReady} in room ${gameId}`);

      // Notify all players in the room
      this.io.to(gameId).emit('player-ready-changed', {
        gameId,
        playerId: userId,
        playerName: username,
        isReady,
        players: Array.from(room.players.values()).map(p => ({
          userId: p.userId,
          username: p.username,
          isReady: p.isReady
        })),
        allReady: Array.from(room.players.values()).every(p => p.isReady) && room.players.size === 4,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[WebSocket] Error updating ready status:', error);
      socket.emit('error', { message: 'Failed to update ready status' });
    }
  }

  /**
   * Handle game start request
   */
  handleStartGame(socket, data) {
    const { gameId } = data;
    const { userId, username } = socket;

    if (!gameId) {
      socket.emit('error', { message: 'Game ID is required' });
      return;
    }

    try {
      const room = this.gameRooms.get(gameId);
      if (!room || !room.players.has(userId)) {
        socket.emit('error', { message: 'Player not in game room' });
        return;
      }

      // Check if all players are ready and room is full
      const players = Array.from(room.players.values());
      if (players.length !== 4) {
        socket.emit('error', { message: 'Need 4 players to start game' });
        return;
      }

      if (!players.every(p => p.isReady)) {
        socket.emit('error', { message: 'All players must be ready to start game' });
        return;
      }

      // Update room status
      room.status = 'starting';
      room.startedAt = new Date().toISOString();

      console.log(`[WebSocket] Game starting in room ${gameId} by ${username}`);

      // Notify all players that game is starting
      this.io.to(gameId).emit('game-starting', {
        gameId,
        startedBy: username,
        players: players.map(p => ({
          userId: p.userId,
          username: p.username
        })),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[WebSocket] Error starting game:', error);
      socket.emit('error', { message: 'Failed to start game' });
    }
  }

  /**
   * Handle trump declaration
   */
  handleDeclareTrump(socket, data) {
    const { gameId, trumpSuit } = data;
    const { userId, username } = socket;

    console.log(`[WebSocket] Trump declared by ${username}: ${trumpSuit} in game ${gameId}`);

    // Broadcast trump declaration to all players in the game
    this.io.to(gameId).emit('trump-declared', {
      gameId,
      trumpSuit,
      declaredBy: userId,
      declaredByName: username,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle card play
   */
  handlePlayCard(socket, data) {
    const { gameId, card } = data;
    const { userId, username } = socket;

    console.log(`[WebSocket] Card played by ${username}:`, card, `in game ${gameId}`);

    // Broadcast card play to all players in the game
    this.io.to(gameId).emit('card-played', {
      gameId,
      card,
      playedBy: userId,
      playedByName: username,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle socket disconnection
   */
  handleDisconnection(socket, reason) {
    const { userId, username } = socket;
    
    console.log(`[WebSocket] Client disconnected: ${username} (${socket.id}), reason: ${reason}`);
    
    // Clean up user-socket mappings
    this.userSockets.delete(userId);
    this.socketUsers.delete(socket.id);
    
    // Find and update any game rooms the user was in
    for (const [gameId, room] of this.gameRooms.entries()) {
      if (room.players.has(userId)) {
        const player = room.players.get(userId);
        
        // Mark player as disconnected but keep in room for potential reconnection
        player.isConnected = false;
        player.disconnectedAt = new Date().toISOString();
        
        // Notify other players in the room
        this.io.to(gameId).emit('player-disconnected', {
          gameId,
          playerId: userId,
          playerName: username,
          timestamp: new Date().toISOString()
        });
        
        console.log(`[WebSocket] Player ${username} disconnected from game ${gameId}`);
      }
    }
  }

  /**
   * Get connection status for a user
   */
  isUserConnected(userId) {
    return this.userSockets.has(userId);
  }

  /**
   * Get socket ID for a user
   */
  getUserSocket(userId) {
    return this.userSockets.get(userId);
  }

  /**
   * Get room information
   */
  getRoomInfo(gameId) {
    return this.gameRooms.get(gameId);
  }

  /**
   * Broadcast message to specific game room
   */
  broadcastToRoom(gameId, event, data) {
    this.io.to(gameId).emit(event, data);
  }

  /**
   * Send message to specific user
   */
  sendToUser(userId, event, data) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.io.to(socketId).emit(event, data);
    }
  }

  /**
   * Get statistics about active connections and rooms
   */
  getStats() {
    return {
      connectedUsers: this.userSockets.size,
      activeRooms: this.gameRooms.size,
      totalPlayersInRooms: Array.from(this.gameRooms.values())
        .reduce((total, room) => total + room.players.size, 0)
    };
  }
}

export default SocketManager;