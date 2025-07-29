import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import GameStateManager from './gameStateManager.js';
import ConnectionStatusManager from './connectionStatus.js';
import ConnectionDiagnostics from './connectionDiagnostics.js';
import Room from '../src/models/Room.js';
import { authenticateSocket } from '../src/middlewares/socketAuth.js';

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

    // Initialize game state manager
    this.gameStateManager = new GameStateManager(this);

    // Initialize connection status manager
    this.connectionStatusManager = new ConnectionStatusManager(this);

    // Initialize connection diagnostics
    this.connectionDiagnostics = new ConnectionDiagnostics(this, this.connectionStatusManager);

    this.setupSocketIO();

    // Start connection diagnostics monitoring
    this.connectionDiagnostics.startMonitoring(30000); // Monitor every 30 seconds
  }

  /**
   * Set up Socket.IO connection handling and middleware
   */
  setupSocketIO() {
    // Use enhanced authentication middleware
    this.io.use(authenticateSocket);

    // Connection handler
    this.io.on('connection', this.handleConnection.bind(this));

    console.log('[WebSocket] Socket manager initialized with enhanced authentication');
  }



  /**
   * Handle new socket connections
   */
  handleConnection(socket) {
    const { userId, username } = socket;

    if (!userId || !username) {
      console.error('[WebSocket] Connection rejected - missing user information');
      socket.emit('auth_error', { message: 'User information is required' });
      socket.disconnect();
      return;
    }

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

    socket.on('form-teams', (data) => {
      this.handleFormTeams(socket, data);
    });

    // Game events
    socket.on('declare-trump', (data) => {
      this.handleDeclareTrump(socket, data);
    });

    socket.on('play-card', (data) => {
      this.handlePlayCard(socket, data);
    });

    // New game state events
    socket.on('request-game-state', (data) => {
      this.handleGameStateRequest(socket, data);
    });

    socket.on('trick-complete', (data) => {
      this.handleTrickComplete(socket, data);
    });

    socket.on('round-complete', (data) => {
      this.handleRoundComplete(socket, data);
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
  async handleJoinGameRoom(socket, data) {
    const { gameId, userId: dataUserId, username: dataUsername } = data;
    const { userId, username } = socket;

    // Use data from request if provided, otherwise use socket auth data
    // Normalize all user IDs to strings for consistent comparisons
    const effectiveUserId = String(dataUserId || userId || '');
    const effectiveUsername = dataUsername || username;

    console.log(`[WebSocket] Join room request - gameId: ${gameId}, socketUserId: ${userId}, socketUsername: ${username}, dataUserId: ${dataUserId}, dataUsername: ${dataUsername}`);
    console.log(`[WebSocket] Effective user - effectiveUserId: ${effectiveUserId}, effectiveUsername: ${effectiveUsername}`);

    if (!gameId) {
      socket.emit('error', { message: 'Game ID is required' });
      return;
    }

    if (!effectiveUserId || !effectiveUsername) {
      console.error(`[WebSocket] Missing user info - effectiveUserId: ${effectiveUserId}, effectiveUsername: ${effectiveUsername}`);
      socket.emit('error', { message: 'User information is required. Please refresh the page and try again.' });
      return;
    }

    try {
      // Join the Socket.IO room
      socket.join(gameId);

      // Initialize room data if it doesn't exist
      if (!this.gameRooms.has(gameId)) {
        // Try to load room from database first to get the correct owner
        let dbRoom = null;
        try {
          dbRoom = await Room.findById(gameId);
          if (dbRoom) {
            console.log(`[WebSocket] Loaded room from database - owner_id: ${dbRoom.owner_id}, players: ${dbRoom.players.length}`);
          } else {
            console.log(`[WebSocket] Room ${gameId} not found in database`);
          }
        } catch (error) {
          console.log(`[WebSocket] Could not load room from database: ${error.message}`);
        }

        // Normalize host ID to string for consistent comparisons
        const hostId = String(dbRoom ? dbRoom.owner_id : effectiveUserId);
        console.log(`[WebSocket] Setting room hostId: "${hostId}" (type: ${typeof hostId}) from ${dbRoom ? 'database' : 'effectiveUserId'}`);

        const roomData = {
          gameId,
          players: new Map(),
          teams: { team1: [], team2: [] },
          createdAt: new Date().toISOString(),
          status: 'waiting',
          hostId: hostId
        };
        this.gameRooms.set(gameId, roomData);

        // Initialize game state
        this.gameStateManager.initializeGameState(gameId, {
          status: 'waiting',
          phase: 'lobby',
          hostId: String(dbRoom ? dbRoom.owner_id : effectiveUserId),
          players: {},
          teams: { team1: [], team2: [] }
        });

        console.log(`[WebSocket] Created new room: ${gameId} with host: ${effectiveUsername} (hostId: ${roomData.hostId})`);
      }

      const room = this.gameRooms.get(gameId);

      // Check if player is already in the room (reconnection case)
      if (room.players.has(effectiveUserId)) {
        console.log(`[WebSocket] Player ${effectiveUsername} rejoining existing room: ${gameId}`);
        // Update existing player's connection info
        const existingPlayer = room.players.get(effectiveUserId);
        console.log(`[WebSocket] Player ${effectiveUsername} was previously connected: ${existingPlayer.isConnected}`);
        const wasDisconnected = !existingPlayer.isConnected;
        existingPlayer.socketId = socket.id;
        existingPlayer.isConnected = true;
        existingPlayer.reconnectedAt = new Date().toISOString();
        console.log(`[WebSocket] Player ${effectiveUsername} now marked as connected: ${existingPlayer.isConnected}`);

        // If player was disconnected and is now reconnecting, broadcast the reconnection
        if (wasDisconnected) {
          console.log(`[WebSocket] Broadcasting reconnection for ${effectiveUsername} in room ${gameId}`);
          this.io.to(gameId).emit('player-reconnected', {
            gameId,
            playerId: effectiveUserId,
            playerName: effectiveUsername,
            players: Array.from(room.players.values()).map(p => ({
              userId: p.userId,
              username: p.username,
              isReady: p.isReady,
              teamAssignment: p.teamAssignment,
              isConnected: p.isConnected
            })),
            timestamp: new Date().toISOString()
          });
        }

        // Update socket mapping
        this.userSockets.set(effectiveUserId, socket.id);
        this.socketUsers.set(socket.id, effectiveUserId);

        // Handle reconnection in game state
        this.gameStateManager.handlePlayerReconnection(gameId, effectiveUserId);
      } else {
        // Check if room is full for new players
        if (room.players.size >= 4) {
          socket.emit('error', { message: 'Room is full' });
          return;
        }

        // Add new player to room
        const playerData = {
          userId: effectiveUserId,
          username: effectiveUsername,
          socketId: socket.id,
          isReady: false,
          teamAssignment: null,
          joinedAt: new Date().toISOString(),
          isConnected: true
        };
        room.players.set(effectiveUserId, playerData);
        console.log(`[WebSocket] Added new player ${effectiveUsername} to room ${gameId}. Room now has ${room.players.size} players.`);

        // Update game state
        this.gameStateManager.updateGameState(gameId, {
          players: {
            [effectiveUserId]: {
              ...playerData,
              hand: [],
              tricksWon: 0
            }
          }
        }, 'server');

        console.log(`[WebSocket] ${effectiveUsername} (${effectiveUserId}) joined game room: ${gameId}. Room now has ${room.players.size} players.`);

        // Broadcast player joined to all OTHER players in the room (not the joining player)
        socket.to(gameId).emit('player-joined', {
          gameId,
          player: {
            userId: effectiveUserId,
            username: effectiveUsername,
            isReady: false,
            teamAssignment: null
          },
          players: Array.from(room.players.values()).map(p => ({
            userId: p.userId,
            username: p.username,
            isReady: p.isReady,
            teamAssignment: p.teamAssignment,
            isConnected: p.isConnected
          })),
          playerCount: room.players.size,
          timestamp: new Date().toISOString()
        });
      }

      // Send room info to the joining/rejoining player
      const roomPlayers = Array.from(room.players.values()).map(p => ({
        userId: p.userId,
        username: p.username,
        isReady: p.isReady,
        teamAssignment: p.teamAssignment,
        isConnected: p.isConnected
      }));

      console.log(`[WebSocket] Sending room-joined event to ${effectiveUsername}. Room players:`, roomPlayers.map(p => `${p.username}(connected:${p.isConnected})`));

      socket.emit('room-joined', {
        gameId,
        players: roomPlayers,
        teams: room.teams,
        roomStatus: room.status,
        hostId: room.hostId,
        playerCount: room.players.size,
        maxPlayers: 4,
        timestamp: new Date().toISOString()
      });

      // Send initial game state to the joining player
      const gameState = this.gameStateManager.getGameState(gameId);
      if (gameState) {
        const playerState = this.gameStateManager.filterStateForPlayer(gameState, effectiveUserId);
        socket.emit('game:state_update', {
          ...playerState,
          gameId,
          joinedRoom: true,
          timestamp: new Date().toISOString()
        });
      }

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

        // Remove player from teams if assigned
        if (room.teams.team1.includes(userId)) {
          room.teams.team1 = room.teams.team1.filter(id => id !== userId);
        }
        if (room.teams.team2.includes(userId)) {
          room.teams.team2 = room.teams.team2.filter(id => id !== userId);
        }

        // Transfer host if the leaving player was the host
        let newHostId = room.hostId;
        if (String(room.hostId) === String(userId) && room.players.size > 0) {
          newHostId = String(Array.from(room.players.keys())[0]);
          room.hostId = newHostId;
        }

        console.log(`[WebSocket] ${username} left game room: ${gameId}`);

        // Broadcast player left to remaining players
        this.io.to(gameId).emit('player-left', {
          gameId,
          playerId: userId,
          playerName: username,
          players: Array.from(room.players.values()).map(p => ({
            userId: p.userId,
            username: p.username,
            isReady: p.isReady,
            teamAssignment: p.teamAssignment,
            isConnected: p.isConnected
          })),
          teams: room.teams,
          newHostId: newHostId,
          playerCount: room.players.size,
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
    const { gameId, isReady, userId: dataUserId, username: dataUsername } = data;
    const { userId, username } = socket;

    // Use data from request if provided, otherwise use socket auth data
    // Normalize user IDs to strings for consistent comparisons
    const effectiveUserId = String(dataUserId || userId || '');
    const effectiveUsername = dataUsername || username;

    console.log(`[WebSocket] Player ready request - gameId: ${gameId}, isReady: ${isReady}, socketUserId: ${userId}, socketUsername: ${username}, dataUserId: ${dataUserId}, dataUsername: ${dataUsername}`);

    if (!gameId || typeof isReady !== 'boolean') {
      socket.emit('error', { message: 'Game ID and ready status are required' });
      return;
    }

    if (!effectiveUserId || !effectiveUsername) {
      console.error(`[WebSocket] Missing user info for ready status - effectiveUserId: ${effectiveUserId}, effectiveUsername: ${effectiveUsername}`);
      socket.emit('error', { message: 'User information is required. Please refresh the page and try again.' });
      return;
    }

    try {
      const room = this.gameRooms.get(gameId);
      if (!room) {
        console.log(`[WebSocket] Room not found: ${gameId}. Available rooms:`, Array.from(this.gameRooms.keys()));
        // Try to auto-rejoin the player to the room
        console.log(`[WebSocket] Attempting to auto-rejoin player ${effectiveUsername} to room ${gameId}`);
        this.handleJoinGameRoom(socket, { gameId, userId: effectiveUserId, username: effectiveUsername });

        // Retry the ready status update after a brief delay
        setTimeout(() => {
          this.handlePlayerReady(socket, { ...data, userId: effectiveUserId, username: effectiveUsername });
        }, 500);
        return;
      }

      if (!room.players.has(effectiveUserId)) {
        console.log(`[WebSocket] Player ${effectiveUsername} (${effectiveUserId}) not found in room ${gameId}. Room players:`, Array.from(room.players.keys()));
        // Try to auto-rejoin the player to the room
        console.log(`[WebSocket] Attempting to auto-rejoin player ${effectiveUsername} to room ${gameId}`);
        this.handleJoinGameRoom(socket, { gameId, userId: effectiveUserId, username: effectiveUsername });

        // Retry the ready status update after a brief delay
        setTimeout(() => {
          this.handlePlayerReady(socket, { ...data, userId: effectiveUserId, username: effectiveUsername });
        }, 500);
        return;
      }

      // Update player ready status
      const player = room.players.get(effectiveUserId);
      const previousReadyStatus = player.isReady;
      player.isReady = isReady;

      console.log(`[WebSocket] ${effectiveUsername} ready status changed from ${previousReadyStatus} to ${isReady} in room ${gameId}`);

      // Update game state
      this.gameStateManager.updateGameState(gameId, {
        players: {
          [effectiveUserId]: {
            ...player,
            isReady
          }
        }
      }, effectiveUserId);

      const players = Array.from(room.players.values());
      const connectedPlayers = players.filter(p => p.isConnected);
      const readyCount = connectedPlayers.filter(p => p.isReady).length;
      const allConnectedReady = connectedPlayers.every(p => p.isReady) && connectedPlayers.length >= 2;

      // Broadcast ready status change to all players in the room
      this.io.to(gameId).emit('player-ready-changed', {
        gameId,
        playerId: effectiveUserId,
        playerName: effectiveUsername,
        isReady,
        players: players.map(p => ({
          userId: p.userId,
          username: p.username,
          isReady: p.isReady,
          teamAssignment: p.teamAssignment,
          isConnected: p.isConnected
        })),
        readyCount,
        totalPlayers: room.players.size,
        connectedPlayers: connectedPlayers.length,
        allReady: allConnectedReady,
        canStartGame: allConnectedReady && connectedPlayers.length >= 2,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[WebSocket] Error updating ready status:', error);
      socket.emit('error', { message: 'Failed to update ready status' });
    }
  }

  /**
   * Handle team formation request
   */
  handleFormTeams(socket, data) {
    const { gameId } = data;
    const { userId, username } = socket;

    console.log(`[WebSocket] Form teams request from ${username} (${userId}) for game ${gameId}`);
    console.log(`[WebSocket] Socket userId type: ${typeof userId}, value: "${userId}"`);

    if (!gameId) {
      socket.emit('error', { message: 'Game ID is required' });
      return;
    }

    try {
      const room = this.gameRooms.get(gameId);
      if (!room || !room.players.has(userId)) {
        console.log(`[WebSocket] Room check - room exists: ${!!room}, player in room: ${room ? room.players.has(userId) : false}`);
        if (room) {
          console.log(`[WebSocket] Room players: ${Array.from(room.players.keys())}`);
          console.log(`[WebSocket] Looking for userId: "${userId}"`);
        }
        socket.emit('error', { message: 'Player not in game room' });
        return;
      }

      // Check if user is the host (normalize both to strings for comparison)
      const normalizedHostId = String(room.hostId || '');
      const normalizedUserId = String(userId || '');

      console.log(`[WebSocket] Form teams host check - room.hostId: "${normalizedHostId}", userId: "${normalizedUserId}"`);

      if (normalizedHostId !== normalizedUserId) {
        console.log(`[WebSocket] Host check failed - room.hostId: ${normalizedHostId}, userId: ${normalizedUserId}`);
        socket.emit('error', { message: 'Only the host can form teams' });
        return;
      }

      const players = Array.from(room.players.values());
      if (players.length < 2) {
        socket.emit('error', { message: 'Need at least 2 players to form teams' });
        return;
      }

      // Shuffle players and assign to teams
      const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
      const team1Size = Math.ceil(shuffledPlayers.length / 2);

      // Clear existing team assignments
      room.teams.team1 = [];
      room.teams.team2 = [];

      // Assign players to teams
      shuffledPlayers.forEach((player, index) => {
        if (index < team1Size) {
          room.teams.team1.push(player.userId);
          player.teamAssignment = 1;
        } else {
          room.teams.team2.push(player.userId);
          player.teamAssignment = 2;
        }
      });

      console.log(`[WebSocket] Teams formed in room ${gameId} by ${username}`);

      // Broadcast team formation to all players including the host
      this.io.in(gameId).emit('teams-formed', {
        gameId,
        teams: {
          team1: room.teams.team1.map(playerId => {
            const player = room.players.get(playerId);
            return { userId: playerId, username: player.username };
          }),
          team2: room.teams.team2.map(playerId => {
            const player = room.players.get(playerId);
            return { userId: playerId, username: player.username };
          })
        },
        players: players.map(p => ({
          userId: p.userId,
          username: p.username,
          isReady: p.isReady,
          teamAssignment: p.teamAssignment,
          isConnected: p.isConnected
        })),
        formedBy: username,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[WebSocket] Error forming teams:', error);
      socket.emit('error', { message: 'Failed to form teams' });
    }
  }

  /**
   * Refresh player connection status based on active sockets
   */
  refreshPlayerConnectionStatus(room) {
    for (const [userId, player] of room.players.entries()) {
      const socketId = this.userSockets.get(userId);
      const isSocketConnected = socketId && this.io.sockets.sockets.has(socketId);

      if (player.isConnected !== isSocketConnected) {
        console.log(`[WebSocket] Updating connection status for ${player.username}: ${player.isConnected} -> ${isSocketConnected}`);
        player.isConnected = isSocketConnected;
      }
    }
  }

  /**
   * Handle game start request
   */
  handleStartGame(socket, data) {
    const { gameId } = data;
    const { userId, username } = socket;

    console.log(`[WebSocket] Start game request from ${username} (${userId}) for game ${gameId}`);

    if (!gameId) {
      socket.emit('error', { message: 'Game ID is required' });
      return;
    }

    try {
      const room = this.gameRooms.get(gameId);
      if (!room || !room.players.has(userId)) {
        console.log(`[WebSocket] Player ${username} (${userId}) not found in room ${gameId}`);
        console.log(`[WebSocket] Room exists: ${!!room}, Player in room: ${room ? room.players.has(userId) : false}`);
        if (room) {
          console.log(`[WebSocket] Room players: ${Array.from(room.players.keys())}`);
        }
        socket.emit('error', { message: 'Player not in game room' });
        return;
      }

      console.log(`[WebSocket] Room hostId: ${room.hostId}, requesting userId: ${userId}`);
      console.log(`[WebSocket] Room ${gameId} has ${room.players.size} total players:`);
      for (const [playerId, player] of room.players.entries()) {
        console.log(`[WebSocket]   - ${player.username} (${playerId}): connected=${player.isConnected}, ready=${player.isReady}`);
      }

      // Check if user is the host (normalize both to strings for comparison)
      const normalizedHostId = String(room.hostId || '');
      const normalizedUserId = String(userId || '');

      console.log(`[WebSocket] Start game host check - room.hostId: "${normalizedHostId}", userId: "${normalizedUserId}"`);

      if (normalizedHostId !== normalizedUserId) {
        console.log(`[WebSocket] Host check failed - room.hostId: ${normalizedHostId}, userId: ${normalizedUserId}`);
        socket.emit('error', { message: 'Only the host can start the game' });
        return;
      }

      // Refresh player connection status before checking
      this.refreshPlayerConnectionStatus(room);

      // Check if all connected players are ready and minimum players present
      const players = Array.from(room.players.values());
      const connectedPlayers = players.filter(p => p.isConnected !== false);

      console.log(`[WebSocket] Start game check - Total players: ${players.length}, Connected players: ${connectedPlayers.length}`);
      console.log(`[WebSocket] Players data:`, players.map(p => ({
        userId: p.userId,
        username: p.username,
        isConnected: p.isConnected,
        isReady: p.isReady
      })));

      if (connectedPlayers.length < 2) {
        console.log(`[WebSocket] Not enough connected players: ${connectedPlayers.length} < 2`);
        socket.emit('error', { message: 'Need at least 2 connected players to start game' });
        return;
      }

      if (!connectedPlayers.every(p => p.isReady)) {
        socket.emit('error', { message: 'All connected players must be ready to start game' });
        return;
      }

      // Ensure teams are formed for 4-player games
      if (players.length === 4 && (room.teams.team1.length === 0 || room.teams.team2.length === 0)) {
        socket.emit('error', { message: 'Teams must be formed before starting a 4-player game' });
        return;
      }

      // Update room status
      room.status = 'starting';
      room.startedAt = new Date().toISOString();

      console.log(`[WebSocket] Game starting in room ${gameId} by ${username}`);

      // Broadcast game starting to all players
      this.io.to(gameId).emit('game-starting', {
        gameId,
        startedBy: username,
        startedById: userId,
        players: players.map(p => ({
          userId: p.userId,
          username: p.username,
          teamAssignment: p.teamAssignment
        })),
        teams: room.teams,
        playerCount: players.length,
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

    // Emit player:declare_trump event first
    this.io.to(gameId).emit('player:declare_trump', {
      gameId,
      playerId: userId,
      playerName: username,
      trumpSuit,
      timestamp: new Date().toISOString()
    });

    // Then emit game:trump_declared event with full game state
    this.io.to(gameId).emit('game:trump_declared', {
      gameId,
      trumpSuit,
      declaredBy: userId,
      declaredByName: username,
      declaringTeam: null, // Will be populated by game engine
      challengingTeam: null, // Will be populated by game engine
      phase: 'final_dealing',
      timestamp: new Date().toISOString()
    });

    // Legacy event for backward compatibility
    this.io.to(gameId).emit('trump-declared', {
      gameId,
      trumpSuit,
      declaredBy: userId,
      declaredByName: username,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle card play with game engine integration
   */
  async handlePlayCard(socket, data) {
    const { gameId, card, trickId, roundId } = data;
    const { userId, username } = socket;

    console.log(`[WebSocket] Card play attempt by ${username}:`, card, `in game ${gameId}`);

    try {
      // Import GameEngine if not already available
      if (!this.gameEngine) {
        const { default: GameEngine } = await import('../src/services/GameEngine.js');
        this.gameEngine = new GameEngine();
      }

      // Validate and process card play through game engine
      const playResult = await this.gameEngine.playCard(gameId, roundId, trickId, userId, card);

      // Emit player action event first
      this.io.to(gameId).emit('player:play_card', {
        gameId,
        playerId: userId,
        playerName: username,
        card,
        trickId,
        roundId,
        timestamp: new Date().toISOString()
      });

      // Emit game state update with play result
      this.io.to(gameId).emit('game:card_played', {
        gameId,
        card: playResult.cardPlayed,
        playedBy: userId,
        playedByName: username,
        trickId: playResult.trickId,
        roundId,
        cardsInTrick: playResult.cardsInTrick,
        nextPlayerId: playResult.nextPlayerId,
        trickComplete: playResult.trickComplete,
        leadSuit: playResult.leadSuit,
        timestamp: new Date().toISOString()
      });

      // If trick is complete, handle trick completion
      if (playResult.trickComplete) {
        this.handleTrickComplete(socket, {
          gameId,
          trickId: playResult.trickId,
          winnerId: playResult.winner,
          winnerName: this.getPlayerName(gameId, playResult.winner),
          winningCard: playResult.winningCard,
          cardsPlayed: playResult.cardsPlayed,
          nextLeaderId: playResult.nextLeaderId,
          roundComplete: playResult.roundComplete
        });

        // If round is complete, handle round completion
        if (playResult.roundComplete) {
          this.handleRoundComplete(socket, {
            gameId,
            roundId: playResult.roundId,
            roundNumber: playResult.roundNumber,
            scores: playResult.scores,
            declaringTeamTricks: playResult.declaringTeamTricks,
            challengingTeamTricks: playResult.challengingTeamTricks,
            gameComplete: playResult.gameComplete,
            winningTeam: playResult.winningTeam
          });
        }
      }

      // Update game state
      this.gameStateManager.updateGameState(gameId, {
        currentPlayer: playResult.nextPlayerId,
        currentTrick: {
          trickId: playResult.trickId,
          cardsPlayed: playResult.cardsInTrick,
          leadSuit: playResult.leadSuit,
          complete: playResult.trickComplete
        }
      }, userId);

      console.log(`[WebSocket] Card play successful for ${username} in game ${gameId}`);

    } catch (error) {
      console.error(`[WebSocket] Card play error for ${username}:`, error);

      // Send structured error to the player
      const errorResponse = {
        type: error.type || 'card_play_error',
        message: error.message || 'Invalid card play',
        code: error.code || 'UNKNOWN_ERROR',
        gameId,
        card,
        trickId,
        roundId
      };

      // Send error to the specific player
      socket.emit('game:error', errorResponse);

      // Also emit to game room for debugging (optional)
      socket.to(gameId).emit('game:player_error', {
        playerId: userId,
        playerName: username,
        error: errorResponse,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get player name from game room
   * @param {string} gameId - Game ID
   * @param {string} playerId - Player ID
   * @returns {string} Player name
   */
  getPlayerName(gameId, playerId) {
    const room = this.gameRooms.get(gameId);
    if (room && room.players.has(playerId)) {
      return room.players.get(playerId).username;
    }
    return `Player ${playerId}`;
  }

  /**
   * Get socket ID for a user
   * @param {string} userId - User ID
   * @returns {string|null} Socket ID
   */
  getUserSocket(userId) {
    return this.userSockets.get(userId) || null;
  }

  /**
   * Handle game state request
   */
  handleGameStateRequest(socket, data) {
    const { gameId } = data;
    const { userId, username } = socket;

    console.log(`[WebSocket] Game state requested by ${username} for game ${gameId}`);

    // Get current game state
    const gameState = this.gameStateManager.getGameState(gameId);
    if (!gameState) {
      socket.emit('error', { message: 'Game state not found' });
      return;
    }

    // Send player-specific game state
    const playerState = this.gameStateManager.filterStateForPlayer(gameState, userId);
    socket.emit('game:state_update', {
      ...playerState,
      requestedBy: userId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle trick completion
   */
  handleTrickComplete(socket, data) {
    const { gameId, trickId, winnerId, winnerName, winningCard, cardsPlayed, nextLeaderId } = data;
    const { userId, username } = socket;

    console.log(`[WebSocket] Trick completed in game ${gameId}, won by ${winnerName}`);

    // Broadcast trick completion to all players
    this.io.to(gameId).emit('game:trick_won', {
      gameId,
      trickId,
      winnerId,
      winnerName,
      winningCard,
      cardsPlayed,
      nextLeaderId,
      reportedBy: userId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle round completion and scoring
   */
  async handleRoundComplete(socket, data) {
    const { gameId, roundId, roundNumber, scores, declaringTeamTricks, challengingTeamTricks, gameComplete, winningTeam } = data;
    const { userId, username } = socket;

    console.log(`[WebSocket] Round ${roundNumber} completed in game ${gameId}`);

    // Broadcast round scores to all players
    this.io.to(gameId).emit('game:round_scores', {
      gameId,
      roundId,
      roundNumber,
      scores,
      declaringTeamTricks,
      challengingTeamTricks,
      gameComplete,
      winningTeam,
      reportedBy: userId,
      timestamp: new Date().toISOString()
    });

    // If game is complete, handle game completion
    if (gameComplete) {
      await this.handleGameCompletion(gameId, {
        winningTeam,
        finalScores: scores,
        totalRounds: roundNumber
      });
    }
  }

  /**
   * Handle game completion and statistics update
   */
  async handleGameCompletion(gameId, completionData) {
    try {
      // Import StatisticsService if not already available
      if (!this.statisticsService) {
        const { default: StatisticsService } = await import('../src/services/StatisticsService.js');
        this.statisticsService = new StatisticsService();
      }

      // Update game statistics
      const gameStats = await this.statisticsService.updateGameStatistics(gameId);

      // Broadcast game completion with statistics
      this.io.to(gameId).emit('game:complete', {
        gameId,
        ...completionData,
        statistics: gameStats,
        timestamp: new Date().toISOString()
      });

      // Clean up game room
      this.cleanupGameRoom(gameId);

      console.log(`[WebSocket] Game ${gameId} completed and statistics updated`);
    } catch (error) {
      console.error(`[WebSocket] Error handling game completion for ${gameId}:`, error);

      // Still broadcast completion even if statistics fail
      this.io.to(gameId).emit('game:complete', {
        gameId,
        ...completionData,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Clean up game room after completion
   */
  cleanupGameRoom(gameId) {
    try {
      const room = this.gameRooms.get(gameId);
      if (room) {
        // Mark room as completed
        room.status = 'completed';
        room.completedAt = new Date().toISOString();

        // Clean up game state
        this.gameStateManager.cleanupGameState(gameId);

        // Remove room after delay to allow final messages
        setTimeout(() => {
          this.gameRooms.delete(gameId);
          console.log(`[WebSocket] Cleaned up completed game room ${gameId}`);
        }, 30000); // 30 seconds delay
      }
    } catch (error) {
      console.error(`[WebSocket] Error cleaning up game room ${gameId}:`, error);
    }
  }

  /**
   * Broadcast full game state update to all players in a room
   */
  broadcastGameStateUpdate(gameId, gameState) {
    console.log(`[WebSocket] Broadcasting game state update for game ${gameId}`);

    this.io.to(gameId).emit('game:state_update', {
      gameId,
      ...gameState,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Send player-specific game state (filtered for hand visibility)
   */
  sendPlayerGameState(gameId, playerId, gameState) {
    const socketId = this.userSockets.get(playerId);
    if (socketId) {
      console.log(`[WebSocket] Sending player-specific game state to ${playerId}`);

      this.io.to(socketId).emit('game:state_update', {
        gameId,
        ...gameState,
        isPlayerSpecific: true,
        playerId,
        timestamp: new Date().toISOString()
      });
    }
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

        // Update game state for disconnection
        this.gameStateManager.handlePlayerDisconnection(gameId, userId);

        // Broadcast player disconnection to other players in the room
        this.io.to(gameId).emit('player-disconnected', {
          gameId,
          playerId: userId,
          playerName: username,
          players: Array.from(room.players.values()).map(p => ({
            userId: p.userId,
            username: p.username,
            isReady: p.isReady,
            teamAssignment: p.teamAssignment,
            isConnected: p.isConnected
          })),
          playerCount: room.players.size,
          connectedCount: Array.from(room.players.values()).filter(p => p.isConnected).length,
          timestamp: new Date().toISOString()
        });

        console.log(`[WebSocket] Player ${username} disconnected from game ${gameId}`);

        // Set up cleanup timer for disconnected players (remove after 5 minutes)
        setTimeout(() => {
          if (room.players.has(userId) && !room.players.get(userId).isConnected) {
            this.handlePlayerTimeout(gameId, userId, username);
          }
        }, 5 * 60 * 1000); // 5 minutes
      }
    }
  }

  /**
   * Handle player timeout (remove disconnected player after timeout)
   */
  handlePlayerTimeout(gameId, userId, username) {
    const room = this.gameRooms.get(gameId);
    if (!room || !room.players.has(userId)) {
      return;
    }

    console.log(`[WebSocket] Removing timed out player ${username} from room ${gameId}`);

    // Remove player from room
    room.players.delete(userId);

    // Remove from teams if assigned
    if (room.teams.team1.includes(userId)) {
      room.teams.team1 = room.teams.team1.filter(id => id !== userId);
    }
    if (room.teams.team2.includes(userId)) {
      room.teams.team2 = room.teams.team2.filter(id => id !== userId);
    }

    // Transfer host if needed
    let newHostId = room.hostId;
    if (String(room.hostId) === String(userId) && room.players.size > 0) {
      newHostId = String(Array.from(room.players.keys())[0]);
      room.hostId = newHostId;
    }

    // Broadcast player removal
    this.io.to(gameId).emit('player-removed', {
      gameId,
      playerId: userId,
      playerName: username,
      reason: 'timeout',
      players: Array.from(room.players.values()).map(p => ({
        userId: p.userId,
        username: p.username,
        isReady: p.isReady,
        teamAssignment: p.teamAssignment,
        isConnected: p.isConnected
      })),
      teams: room.teams,
      newHostId: newHostId,
      playerCount: room.players.size,
      timestamp: new Date().toISOString()
    });

    // Clean up empty rooms
    if (room.players.size === 0) {
      this.gameRooms.delete(gameId);
      console.log(`[WebSocket] Cleaned up empty room after timeout: ${gameId}`);
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