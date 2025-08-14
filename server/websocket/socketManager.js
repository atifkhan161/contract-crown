import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import GameStateManager from './gameStateManager.js';
import ConnectionStatusManager from './connectionStatus.js';
import EnhancedConnectionStatusManager from './enhancedConnectionStatusManager.js';
import ConnectionDiagnostics from './connectionDiagnostics.js';
import WaitingRoomSocketHandler from '../src/websocket/WaitingRoomSocketHandler.js';
// Room model will be imported dynamically to avoid initialization issues
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

    // Initialize enhanced connection status manager
    this.enhancedConnectionStatusManager = new EnhancedConnectionStatusManager(this);

    // Initialize connection diagnostics
    this.connectionDiagnostics = new ConnectionDiagnostics(this, this.connectionStatusManager);

    // Initialize waiting room handler
    this.waitingRoomHandler = new WaitingRoomSocketHandler(this);

    // Note: ReactiveQueryManager removed during LokiJS migration

    // Note: ConflictResolutionService removed during LokiJS migration

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

    // Check if this is a reconnection
    const isReconnection = this.enhancedConnectionStatusManager.playerConnections.has(userId);

    if (isReconnection) {
      // Handle reconnection with state restoration
      this.enhancedConnectionStatusManager.handlePlayerReconnection(userId, socket);
    }

    // Send connection confirmation
    socket.emit('connection-confirmed', {
      userId,
      username,
      socketId: socket.id,
      isReconnection,
      timestamp: new Date().toISOString()
    });

    // Set up event handlers
    this.setupSocketEvents(socket);

    // Set up waiting room specific event handlers
    this.waitingRoomHandler.setupWaitingRoomEvents(socket);

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
      console.log(`[WebSocket] Received declare-trump event:`, data);
      this.handleDeclareTrump(socket, data);
    });

    socket.on('play-card', (data) => {
      this.handlePlayCard(socket, data);
    });

    socket.on('game:play_card', (data) => {
      this.handlePlayCard(socket, data);
    });

    // New game state events
    socket.on('request-game-state', (data) => {
      this.handleGameStateRequest(socket, data);
    });

    socket.on('trick-complete', (data) => {
      this.handleTrickComplete(socket, data);
    });

    // Note: round-complete is now handled server-side automatically

    socket.on('start-next-round', (data) => {
      this.handleStartNextRound(socket, data);
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

    // Manual game initialization for testing
    socket.on('manual-init-game', async (data) => {
      const { gameId } = data;
      console.log(`[WebSocket] Manual game initialization requested by ${username} for game ${gameId}`);

      const room = this.gameRooms.get(gameId);
      if (room) {
        try {
          await this.checkAndInitializeGame(gameId, room);
          socket.emit('manual-init-response', {
            success: true,
            message: 'Game initialization attempted',
            gameId
          });
        } catch (error) {
          console.error(`[WebSocket] Manual initialization error:`, error);
          socket.emit('manual-init-response', {
            success: false,
            message: error.message,
            gameId
          });
        }
      } else {
        socket.emit('manual-init-response', {
          success: false,
          message: 'Game room not found',
          gameId
        });
      }
    });

    // Note: Reactive subscription events removed during LokiJS migration
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
          const Room = (await import('../src/models/Room.js')).default;
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

        // Restore team assignment from database on reconnection
        try {
          const { default: RoomPlayer } = await import('../src/models/RoomPlayer.js');
          const roomPlayerModel = new RoomPlayer();
          const roomPlayer = await roomPlayerModel.findOne({
            room_id: gameId,
            user_id: effectiveUserId
          });

          if (roomPlayer && roomPlayer.team_assignment !== null) {
            const dbTeamAssignment = roomPlayer.team_assignment;
            existingPlayer.teamAssignment = dbTeamAssignment;

            // Update room teams structure
            if (dbTeamAssignment === 1 && !room.teams.team1.includes(effectiveUserId)) {
              room.teams.team1.push(effectiveUserId);
              // Remove from team2 if present
              room.teams.team2 = room.teams.team2.filter(id => id !== effectiveUserId);
            } else if (dbTeamAssignment === 2 && !room.teams.team2.includes(effectiveUserId)) {
              room.teams.team2.push(effectiveUserId);
              // Remove from team1 if present
              room.teams.team1 = room.teams.team1.filter(id => id !== effectiveUserId);
            }

            console.log(`[WebSocket] Restored team assignment ${dbTeamAssignment} for ${effectiveUsername} on reconnection`);
          }
        } catch (dbError) {
          console.error(`[WebSocket] Failed to restore team assignment for ${effectiveUsername}:`, dbError);
        }

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
            teams: {
              team1: room.teams.team1.map(playerId => {
                const player = room.players.get(playerId);
                return { userId: playerId, username: player ? player.username : 'Unknown' };
              }),
              team2: room.teams.team2.map(playerId => {
                const player = room.players.get(playerId);
                return { userId: playerId, username: player ? player.username : 'Unknown' };
              })
            },
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

      // Check if all players have joined and initialize game if needed
      try {
        await this.checkAndInitializeGame(gameId, room);
      } catch (initError) {
        console.error(`[WebSocket] Error in checkAndInitializeGame for ${gameId}:`, initError);
      }

    } catch (error) {
      console.error('[WebSocket] Error joining game room:', error);
      socket.emit('error', { message: 'Failed to join game room' });
    }
  }

  /**
   * Check if all players have joined and initialize game if needed
   */
  async checkAndInitializeGame(gameId, room) {
    try {
      const gameState = this.gameStateManager.getGameState(gameId);

      console.log(`[WebSocket] Checking game initialization for ${gameId}. Current state:`, {
        phase: gameState?.phase,
        status: gameState?.status,
        hasPlayers: !!gameState?.players
      });

      // Only initialize if game is in lobby phase and not already initialized
      if (!gameState || gameState.phase !== 'lobby' || (gameState.status !== 'waiting' && gameState.status !== 'in_progress')) {
        console.log(`[WebSocket] Game ${gameId} not ready for initialization. Phase: ${gameState?.phase}, Status: ${gameState?.status}`);
        return;
      }

      // Check if game is already being initialized or has been initialized
      if (gameState.currentRound || gameState.phase !== 'lobby') {
        console.log(`[WebSocket] Game ${gameId} already initialized. Current round: ${gameState.currentRound}, Phase: ${gameState.phase}`);
        return;
      }

      // Check if all expected players have joined
      const connectedPlayers = Array.from(room.players.values()).filter(p => p.isConnected);
      const totalPlayers = Array.from(room.players.values());

      console.log(`[WebSocket] Connected players for game ${gameId}: ${connectedPlayers.length}`, connectedPlayers.map(p => p.username));
      console.log(`[WebSocket] Total players for game ${gameId}: ${totalPlayers.length}`);

      // Only initialize when we have 2+ connected players and no more than 4 total players
      if (connectedPlayers.length >= 2 && totalPlayers.length <= 4) {
        // Prevent concurrent initialization attempts
        if (this.initializingGames?.has(gameId)) {
          console.log(`[WebSocket] Game ${gameId} is already being initialized`);
          return;
        }

        // Track initialization in progress
        if (!this.initializingGames) {
          this.initializingGames = new Set();
        }
        this.initializingGames.add(gameId);

        console.log(`[WebSocket] Initializing game ${gameId} with ${connectedPlayers.length} connected players`);

        // Check total players (including disconnected ones) to avoid adding too many bots
        const totalPlayers = Array.from(room.players.values());
        const humanPlayers = totalPlayers.filter(p => !p.isBot);
        const botPlayers = totalPlayers.filter(p => p.isBot);
        
        console.log(`[WebSocket] Current player distribution - Humans: ${humanPlayers.length}, Bots: ${botPlayers.length}, Total: ${totalPlayers.length}`);

        // If we have more than 4 players, remove excess bots first
        if (totalPlayers.length > 4) {
          const excessCount = totalPlayers.length - 4;
          console.log(`[WebSocket] Removing ${excessCount} excess bots from game ${gameId}`);
          
          // Remove excess bots (prioritize removing bots over humans)
          const botsToRemove = botPlayers.slice(0, excessCount);
          for (const bot of botsToRemove) {
            room.players.delete(bot.userId);
            console.log(`[WebSocket] Removed excess bot ${bot.username} (${bot.userId}) from game ${gameId}`);
          }
        }

        // Recalculate after cleanup
        const updatedTotalPlayers = Array.from(room.players.values());
        
        // Add bots only if we have fewer than 4 total players
        if (updatedTotalPlayers.length < 4) {
          const botsNeeded = 4 - updatedTotalPlayers.length;
          console.log(`[WebSocket] Adding ${botsNeeded} bots to game ${gameId}`);

          try {
            const { default: botManager } = await import('../src/services/BotManager.js');

            // Create bots for the game
            const bots = botManager.createBotsForGame(gameId, botsNeeded);

            // Store bots in database
            await botManager.storeBotPlayersInDatabase(gameId);

            // Assign bots to teams to balance the teams
            // Get current human players and their team assignments
            const humanPlayers = Array.from(room.players.values()).filter(p => !p.isBot);
            const team1Count = humanPlayers.filter(p => p.teamAssignment === 1).length;
            const team2Count = humanPlayers.filter(p => p.teamAssignment === 2).length;

            console.log(`[WebSocket] Current team distribution - Team 1: ${team1Count}, Team 2: ${team2Count}`);

            // Add bots to the room players with proper team assignments
            bots.forEach((bot, index) => {
              // Assign bots to balance teams (alternate assignment or fill the smaller team)
              let botTeamAssignment;
              if (team1Count < team2Count) {
                botTeamAssignment = 1;
              } else if (team2Count < team1Count) {
                botTeamAssignment = 2;
              } else {
                // Teams are equal, alternate bot assignments
                botTeamAssignment = (index % 2) + 1;
              }

              const botPlayer = {
                userId: bot.id,
                username: bot.name,
                socketId: null, // Bots don't have socket connections
                isReady: true, // Bots are always ready
                teamAssignment: botTeamAssignment,
                joinedAt: new Date().toISOString(),
                isConnected: true,
                isBot: true
              };
              room.players.set(bot.id, botPlayer);

              // Also add to room teams structure
              if (botTeamAssignment === 1) {
                room.teams.team1.push(bot.id);
              } else {
                room.teams.team2.push(bot.id);
              }

              console.log(`[WebSocket] Added bot ${bot.name} (${bot.id}) to team ${botTeamAssignment} in game ${gameId}`);
            });

            // Update game state with bot players
            const botGameStateUpdates = {};
            bots.forEach(bot => {
              const botRoomPlayer = room.players.get(bot.id);
              botGameStateUpdates[bot.id] = {
                username: bot.name,
                teamAssignment: botRoomPlayer.teamAssignment,
                hand: [],
                handSize: 0,
                tricksWon: 0,
                isBot: true
              };
            });

            this.gameStateManager.updateGameState(gameId, {
              players: botGameStateUpdates
            }, 'server');

            // Broadcast bot additions to all players
            this.io.to(gameId).emit('bots-added', {
              gameId,
              bots: bots.map(bot => {
                const botRoomPlayer = room.players.get(bot.id);
                return {
                  userId: bot.id,
                  username: bot.name,
                  isReady: true,
                  teamAssignment: botRoomPlayer.teamAssignment,
                  isConnected: true,
                  isBot: true
                };
              }),
              totalPlayers: room.players.size,
              timestamp: new Date().toISOString()
            });

          } catch (botError) {
            console.error(`[WebSocket] Failed to add bots to game ${gameId}:`, botError);
            // Continue without bots if there's an error
          }
        }

        // Create Game record if it doesn't exist
        console.log(`[WebSocket] Creating Game record for game ${gameId}`);
        try {
          const { default: Game } = await import('../src/models/Game.js');
          const gameModel = new Game();
          
          const existingGame = await gameModel.findOne({ game_id: gameId });
          if (!existingGame) {
            // Generate a unique game code
            const gameCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            
            await gameModel.create({
              game_id: gameId,
              game_code: gameCode,
              status: 'in_progress',
              host_id: room.hostId,
              created_at: new Date().toISOString(),
              started_at: new Date().toISOString(),
              target_score: 52,
              is_demo_mode: false
            });
            
            console.log(`[WebSocket] Created Game record for ${gameId} with code ${gameCode}`);
          }
        } catch (gameError) {
          console.error(`[WebSocket] Failed to create Game record for game ${gameId}:`, gameError);
          throw gameError;
        }

        // Create GamePlayer records for all players (human and bots) - but only once
        console.log(`[WebSocket] Creating GamePlayer records for game ${gameId}`);
        try {
          const { default: GamePlayer } = await import('../src/models/GamePlayer.js');
          const gamePlayerModel = new GamePlayer();
          
          // Check existing GamePlayer records to avoid duplicates
          const existingGamePlayers = await gamePlayerModel.find({ game_id: gameId });
          const existingUserIds = new Set(existingGamePlayers.map(gp => gp.user_id));
          
          console.log(`[WebSocket] Found ${existingGamePlayers.length} existing GamePlayer records for game ${gameId}`);
          
          // Clean up GamePlayer records for players no longer in the room
          const currentPlayerIds = new Set(Array.from(room.players.keys()));
          const gamePlayersToRemove = existingGamePlayers.filter(gp => !currentPlayerIds.has(gp.user_id));
          
          for (const gamePlayerToRemove of gamePlayersToRemove) {
            await gamePlayerModel.deleteOne({ game_player_id: gamePlayerToRemove.game_player_id });
            console.log(`[WebSocket] Removed GamePlayer record for user ${gamePlayerToRemove.user_id} no longer in room`);
          }
          
          // Fix any duplicate seat positions in existing GamePlayers
          const seatPositionCounts = {};
          existingGamePlayers.forEach(gp => {
            seatPositionCounts[gp.seat_position] = (seatPositionCounts[gp.seat_position] || 0) + 1;
          });
          
          // If there are duplicates, reassign seat positions
          const hasDuplicates = Object.values(seatPositionCounts).some(count => count > 1);
          if (hasDuplicates) {
            console.log(`[WebSocket] Found duplicate seat positions for game ${gameId}, reassigning...`);
            let reassignSeat = 1;
            for (const gamePlayer of existingGamePlayers) {
              await gamePlayerModel.updateOne(
                { game_player_id: gamePlayer.game_player_id },
                { seat_position: reassignSeat }
              );
              console.log(`[WebSocket] Reassigned seat ${reassignSeat} to player ${gamePlayer.user_id}`);
              reassignSeat++;
            }
            // Refresh the existing game players after reassignment
            existingGamePlayers = await gamePlayerModel.find({ game_id: gameId });
          }
          
          // Get existing seat positions to avoid duplicates
          const existingSeatPositions = new Set(existingGamePlayers.map(gp => gp.seat_position));
          let nextAvailableSeat = 1;
          
          // Find the next available seat position
          const findNextSeat = () => {
            while (existingSeatPositions.has(nextAvailableSeat)) {
              nextAvailableSeat++;
            }
            return nextAvailableSeat;
          };
          
          for (const [userId, player] of room.players.entries()) {
            // Create GamePlayer record for all players (connected or not) if it doesn't exist
            if (!existingUserIds.has(userId)) {
              // Import uuidv4 for generating proper game_player_id
              const { v4: uuidv4 } = await import('uuid');
              
              const seatPosition = findNextSeat();
              existingSeatPositions.add(seatPosition);
              nextAvailableSeat = seatPosition + 1;
              
              await gamePlayerModel.create({
                game_player_id: uuidv4(), // Generate proper UUID
                game_id: gameId,
                user_id: userId,
                team_id: null, // Will be set later when teams are formed
                seat_position: seatPosition,
                is_ready: player.isReady || false,
                is_host: player.userId === room.hostId,
                current_hand: null,
                tricks_won_current_round: 0,
                joined_at: player.joinedAt || new Date().toISOString()
              });
              
              console.log(`[WebSocket] Created GamePlayer record for ${player.username} (${userId}) at seat ${seatPosition}`);
            } else {
              console.log(`[WebSocket] GamePlayer record already exists for ${player.username} (${userId})`);
            }
          }
        } catch (gamePlayerError) {
          console.error(`[WebSocket] Failed to create GamePlayer records for game ${gameId}:`, gamePlayerError);
          throw gamePlayerError;
        }

        // Initialize the actual game with GameEngine
        const { default: GameEngine } = await import('../src/services/GameEngine.js');
        const gameEngine = new GameEngine();

        // Deal initial 4 cards to each player
        console.log(`[WebSocket] Dealing initial cards for game ${gameId}`);
        
        // Debug: Check if GamePlayer records were created
        try {
          const { default: GamePlayer } = await import('../src/models/GamePlayer.js');
          const debugGamePlayerModel = new GamePlayer();
          const debugGamePlayers = await debugGamePlayerModel.find({ game_id: gameId });
          console.log(`[WebSocket] Debug: Found ${debugGamePlayers.length} GamePlayer records for game ${gameId}`);
          debugGamePlayers.forEach((gp, index) => {
            console.log(`[WebSocket] Debug: GamePlayer ${index + 1}: ${gp.user_id} (seat: ${gp.seat_position})`);
          });
        } catch (debugError) {
          console.error(`[WebSocket] Debug: Error checking GamePlayer records:`, debugError.message);
        }
        
        const dealResult = await gameEngine.dealInitialCards(gameId);

        // Create the first round
        const roundId = await gameEngine.createGameRound(
          gameId,
          1, // Round number
          dealResult.dealerUserId,
          dealResult.firstPlayerUserId
        );

        // Update game state with initial cards and round info
        const gameStateUpdate = {
          status: 'in_progress',
          phase: 'trump_declaration',
          currentRound: 1,
          roundId: roundId,
          dealerUserId: dealResult.dealerUserId,
          trumpDeclarer: dealResult.firstPlayerUserId,
          remainingDeck: dealResult.remainingDeck,
          players: {}
        };

        // Add player hands to the game state
        for (const [playerId, hand] of Object.entries(dealResult.playerHands)) {
          gameStateUpdate.players[playerId] = {
            hand: hand,
            handSize: hand.length,
            tricksWon: 0
          };
        }

        // Update game state manager
        this.gameStateManager.updateGameState(gameId, gameStateUpdate, 'server');

        console.log(`[WebSocket] Game ${gameId} initialized with trump declaration phase. Trump declarer: ${dealResult.firstPlayerUserId}`);

        // Check if trump declarer is a bot and process immediately
        const trumpDeclarerPlayer = room.players.get(dealResult.firstPlayerUserId);
        console.log(`[WebSocket] Trump declarer info:`, {
          playerId: dealResult.firstPlayerUserId,
          playerName: trumpDeclarerPlayer?.username,
          isBot: trumpDeclarerPlayer?.isBot
        });

        // Broadcast updated game state to all players
        const updatedGameState = this.gameStateManager.getGameState(gameId);
        this.gameStateManager.broadcastStateUpdate(gameId, updatedGameState, 'server');

        // Broadcast game initialization
        this.io.to(gameId).emit('game-initialized', {
          gameId,
          phase: 'trump_declaration',
          currentRound: 1,
          trumpDeclarer: dealResult.firstPlayerUserId,
          dealerUserId: dealResult.dealerUserId,
          timestamp: new Date().toISOString()
        });

        // Check if trump declarer is a bot and process trump declaration immediately
        setTimeout(async () => {
          try {
            console.log(`[WebSocket] Checking for bot trump declaration after game initialization`);
            await this.processBotTurnsIfNeeded(gameId);
          } catch (botError) {
            console.error(`[WebSocket] Error processing bot trump declaration after initialization:`, botError);
          }
        }, 2000);

        // Remove from initialization tracking
        this.initializingGames?.delete(gameId);
      } else if (totalPlayers.length > 4) {
        console.log(`[WebSocket] Too many players for game ${gameId}: ${totalPlayers.length} > 4. Game supports maximum 4 players.`);
      } else {
        console.log(`[WebSocket] Not enough connected players for game ${gameId}: ${connectedPlayers.length} < 2`);
      }

    } catch (error) {
      console.error(`[WebSocket] Error initializing game ${gameId}:`, error);
      // Remove from initialization tracking on error
      this.initializingGames?.delete(gameId);
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
   * Handle player ready status change with immediate database sync and HTTP fallback
   */
  async handlePlayerReady(socket, data) {
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

    let dbUpdateSuccess = false;
    let wsUpdateSuccess = false;

    try {
      const room = this.gameRooms.get(gameId);
      if (!room) {
        console.log(`[WebSocket] Room not found: ${gameId}. Available rooms:`, Array.from(this.gameRooms.keys()));
        // Try to auto-rejoin the player to the room
        console.log(`[WebSocket] Attempting to auto-rejoin player ${effectiveUsername} to room ${gameId}`);
        await this.handleJoinGameRoom(socket, { gameId, userId: effectiveUserId, username: effectiveUsername });

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
        await this.handleJoinGameRoom(socket, { gameId, userId: effectiveUserId, username: effectiveUsername });

        // Retry the ready status update after a brief delay
        setTimeout(() => {
          this.handlePlayerReady(socket, { ...data, userId: effectiveUserId, username: effectiveUsername });
        }, 500);
        return;
      }

      // Get the player and previous status
      const player = room.players.get(effectiveUserId);
      const previousReadyStatus = player.isReady;

      // First, update the database to ensure persistence
      try {
        const { default: Room } = await import('../src/models/Room.js');
        const roomModel = await Room.findById(gameId);
        if (roomModel) {
          await roomModel.setPlayerReady(effectiveUserId, isReady);
          dbUpdateSuccess = true;
          console.log(`[WebSocket] Database updated: ${effectiveUsername} ready status set to ${isReady} in room ${gameId}`);
        }
      } catch (dbError) {
        console.error(`[WebSocket] Database update failed for ready status:`, dbError);
        // Emit error but continue with websocket update
        socket.emit('warning', {
          message: 'Ready status updated locally but database sync failed. Changes may not persist.',
          fallbackAvailable: true
        });
      }

      // Update websocket state
      player.isReady = isReady;
      player.lastReadyUpdate = new Date().toISOString();
      console.log(`[WebSocket] ${effectiveUsername} ready status changed from ${previousReadyStatus} to ${isReady} in room ${gameId}`);

      // Update game state manager
      this.gameStateManager.updateGameState(gameId, {
        players: {
          [effectiveUserId]: {
            ...player,
            isReady
          }
        }
      }, effectiveUserId);

      // Calculate ready status and game start eligibility with enhanced validation
      const players = Array.from(room.players.values());
      const connectedPlayers = players.filter(p => p.isConnected);
      const readyPlayers = connectedPlayers.filter(p => p.isReady);
      const readyCount = readyPlayers.length;
      const allConnectedReady = connectedPlayers.every(p => p.isReady) && connectedPlayers.length >= 2;

      // Enhanced game start validation
      let canStartGame = false;
      let gameStartReason = '';

      if (connectedPlayers.length < 2) {
        gameStartReason = 'Need at least 2 connected players';
      } else if (!allConnectedReady) {
        gameStartReason = `${readyCount}/${connectedPlayers.length} players ready`;
      } else if (connectedPlayers.length === 4) {
        // Check if teams are formed for 4-player games
        const hasTeamAssignments = connectedPlayers.every(p => p.teamAssignment !== null);
        if (!hasTeamAssignments) {
          gameStartReason = 'Teams must be formed for 4-player games';
        } else {
          canStartGame = true;
          gameStartReason = 'Ready to start!';
        }
      } else {
        canStartGame = true;
        gameStartReason = 'Ready to start!';
      }

      // Prepare broadcast data
      const broadcastData = {
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
        canStartGame,
        gameStartReason,
        dbSynced: dbUpdateSuccess,
        timestamp: new Date().toISOString()
      };

      // Try to broadcast via websocket with error handling
      try {
        this.io.to(gameId).emit('player-ready-changed', broadcastData);
        wsUpdateSuccess = true;
        console.log(`[WebSocket] Successfully broadcasted ready status change for ${effectiveUsername}`);
      } catch (wsError) {
        console.error(`[WebSocket] Failed to broadcast ready status change:`, wsError);
        wsUpdateSuccess = false;

        // Trigger HTTP API fallback
        await this.triggerHttpFallbackForReadyStatus(gameId, effectiveUserId, isReady, broadcastData);
      }

      // Send confirmation back to the requesting player
      socket.emit('ready-status-confirmed', {
        gameId,
        isReady,
        success: wsUpdateSuccess,
        dbSynced: dbUpdateSuccess,
        fallbackTriggered: !wsUpdateSuccess,
        timestamp: new Date().toISOString()
      });

      // If websocket failed but database succeeded, schedule a retry
      if (!wsUpdateSuccess && dbUpdateSuccess) {
        setTimeout(() => {
          console.log(`[WebSocket] Retrying websocket broadcast for ${effectiveUsername} ready status`);
          try {
            this.io.to(gameId).emit('player-ready-changed', broadcastData);
          } catch (retryError) {
            console.error(`[WebSocket] Retry failed for ready status broadcast:`, retryError);
          }
        }, 2000);
      }

    } catch (error) {
      console.error('[WebSocket] Error updating ready status:', error);

      // Try HTTP API fallback as last resort
      if (dbUpdateSuccess) {
        await this.triggerHttpFallbackForReadyStatus(gameId, effectiveUserId, isReady, null);
      }

      socket.emit('error', {
        message: 'Failed to update ready status',
        details: error.message,
        fallbackAvailable: true
      });
    }
  }

  /**
   * Trigger HTTP API fallback for ready status updates
   */
  async triggerHttpFallbackForReadyStatus(gameId, userId, isReady, broadcastData) {
    try {
      console.log(`[WebSocket] Triggering HTTP fallback for ready status - gameId: ${gameId}, userId: ${userId}, isReady: ${isReady}`);

      // Emit fallback notification to all clients in the room
      this.io.to(gameId).emit('websocket-fallback-active', {
        type: 'ready-status',
        gameId,
        playerId: userId,
        isReady,
        message: 'Using HTTP fallback for ready status update',
        timestamp: new Date().toISOString()
      });

      // If we have broadcast data, try to send it via HTTP API simulation
      if (broadcastData) {
        // Simulate HTTP API response by emitting to individual sockets
        const room = this.gameRooms.get(gameId);
        if (room) {
          for (const [playerId, player] of room.players.entries()) {
            const playerSocketId = this.userSockets.get(playerId);
            if (playerSocketId && this.io.sockets.sockets.has(playerSocketId)) {
              const playerSocket = this.io.sockets.sockets.get(playerSocketId);
              try {
                playerSocket.emit('player-ready-changed-fallback', broadcastData);
              } catch (fallbackError) {
                console.error(`[WebSocket] Fallback failed for player ${playerId}:`, fallbackError);
              }
            }
          }
        }
      }

    } catch (fallbackError) {
      console.error(`[WebSocket] HTTP fallback failed for ready status:`, fallbackError);
    }
  }

  /**
   * Trigger HTTP API fallback for game start events
   */
  async triggerHttpFallbackForGameStart(gameId, userId, gameStartData) {
    try {
      console.log(`[WebSocket] Triggering HTTP fallback for game start - gameId: ${gameId}, userId: ${userId}`);

      // Emit fallback notification to all clients in the room
      this.io.to(gameId).emit('websocket-fallback-active', {
        type: 'game-start',
        gameId,
        startedBy: userId,
        message: 'Using HTTP fallback for game start event',
        timestamp: new Date().toISOString()
      });

      // If we have game start data, try to send it via HTTP API simulation
      if (gameStartData) {
        // Simulate HTTP API response by emitting to individual sockets
        const room = this.gameRooms.get(gameId);
        if (room) {
          for (const [playerId, player] of room.players.entries()) {
            const playerSocketId = this.userSockets.get(playerId);
            if (playerSocketId && this.io.sockets.sockets.has(playerSocketId)) {
              const playerSocket = this.io.sockets.sockets.get(playerSocketId);
              try {
                playerSocket.emit('game-starting-fallback', gameStartData);
              } catch (fallbackError) {
                console.error(`[WebSocket] Game start fallback failed for player ${playerId}:`, fallbackError);
              }
            }
          }
        }
      }

    } catch (fallbackError) {
      console.error(`[WebSocket] HTTP fallback failed for game start:`, fallbackError);
    }
  }

  /**
   * Handle team formation request
   */
  async handleFormTeams(socket, data) {
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

      // Assign players to teams and update database using RxDB
      const RoomPlayer = (await import('../src/models/RoomPlayer.js')).default;

      try {
        // Update team assignments using RxDB
        for (let i = 0; i < shuffledPlayers.length; i++) {
          const player = shuffledPlayers[i];
          const teamAssignment = i < team1Size ? 1 : 2;

          // Update websocket state
          player.teamAssignment = teamAssignment;
          if (teamAssignment === 1) {
            room.teams.team1.push(player.userId);
          } else {
            room.teams.team2.push(player.userId);
          }

          // Update database using RxDB RoomPlayer model
          try {
            const roomPlayer = await RoomPlayer.findByRoomAndUser(gameId, player.userId);
            if (roomPlayer) {
              await roomPlayer.updateTeamAssignment(teamAssignment);
            } else {
              console.warn(`[WebSocket] Room player not found for room ${gameId} and user ${player.userId}`);
            }
          } catch (updateError) {
            console.error(`[WebSocket] Error updating team assignment for player ${player.userId}:`, updateError);
            throw updateError;
          }
        }

        console.log(`[WebSocket] Teams formed and persisted to RxDB in room ${gameId} by ${username}`);

      } catch (dbError) {
        console.error('[WebSocket] RxDB error during team formation:', dbError);

        // Revert websocket state changes
        room.teams.team1 = [];
        room.teams.team2 = [];
        players.forEach(player => {
          player.teamAssignment = null;
        });

        socket.emit('error', { message: 'Failed to persist team assignments to database' });
        return;
      }

      // Broadcast team formation to all players including the host
      const teamFormationData = {
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
      };

      // Use reliable broadcast to ensure all players receive the update
      this.io.in(gameId).emit('teams-formed', teamFormationData);

      // Also emit the legacy event name for backward compatibility
      this.io.in(gameId).emit('teamsFormed', teamFormationData);

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
   * Handle game start request with enhanced validation and database sync
   */
  async handleStartGame(socket, data) {
    const { gameId, userId: dataUserId, username: dataUsername } = data;
    const { userId, username } = socket;

    // Use data from request if provided, otherwise use socket auth data
    // Normalize user IDs to strings for consistent comparisons
    const effectiveUserId = String(dataUserId || userId || '');
    const effectiveUsername = dataUsername || username;

    console.log(`[WebSocket] Start game request from ${effectiveUsername} (${effectiveUserId}) for game ${gameId}`);

    if (!gameId) {
      socket.emit('error', { message: 'Game ID is required' });
      return;
    }

    if (!effectiveUserId || !effectiveUsername) {
      console.error(`[WebSocket] Missing user info for game start - effectiveUserId: ${effectiveUserId}, effectiveUsername: ${effectiveUsername}`);
      socket.emit('error', { message: 'User information is required. Please refresh the page and try again.' });
      return;
    }

    let dbUpdateSuccess = false;
    let wsUpdateSuccess = false;

    try {
      const room = this.gameRooms.get(gameId);
      if (!room || !room.players.has(effectiveUserId)) {
        console.log(`[WebSocket] Player ${effectiveUsername} (${effectiveUserId}) not found in room ${gameId}`);
        console.log(`[WebSocket] Room exists: ${!!room}, Player in room: ${room ? room.players.has(effectiveUserId) : false}`);
        if (room) {
          console.log(`[WebSocket] Room players: ${Array.from(room.players.keys())}`);
        }
        socket.emit('error', { message: 'Player not in game room' });
        return;
      }

      console.log(`[WebSocket] Room hostId: ${room.hostId}, requesting userId: ${effectiveUserId}`);
      console.log(`[WebSocket] Room ${gameId} has ${room.players.size} total players:`);
      for (const [playerId, player] of room.players.entries()) {
        console.log(`[WebSocket]   - ${player.username} (${playerId}): connected=${player.isConnected}, ready=${player.isReady}, team=${player.teamAssignment}`);
      }

      // Check if user is the host (normalize both to strings for comparison)
      const normalizedHostId = String(room.hostId || '');
      const normalizedUserId = String(effectiveUserId || '');

      console.log(`[WebSocket] Start game host check - room.hostId: "${normalizedHostId}", userId: "${normalizedUserId}"`);

      if (normalizedHostId !== normalizedUserId) {
        console.log(`[WebSocket] Host check failed - room.hostId: ${normalizedHostId}, userId: ${normalizedUserId}`);
        socket.emit('error', { message: 'Only the host can start the game' });
        return;
      }

      // Refresh player connection status before checking
      this.refreshPlayerConnectionStatus(room);

      // Enhanced game start validation with connected player checks
      const players = Array.from(room.players.values());
      const connectedPlayers = players.filter(p => p.isConnected !== false);
      const readyConnectedPlayers = connectedPlayers.filter(p => p.isReady);

      console.log(`[WebSocket] Start game validation - Total players: ${players.length}, Connected players: ${connectedPlayers.length}, Ready connected players: ${readyConnectedPlayers.length}`);
      console.log(`[WebSocket] Players data:`, players.map(p => ({
        userId: p.userId,
        username: p.username,
        isConnected: p.isConnected,
        isReady: p.isReady,
        teamAssignment: p.teamAssignment
      })));

      // Validation: Need at least 2 connected players
      if (connectedPlayers.length < 2) {
        console.log(`[WebSocket] Not enough connected players: ${connectedPlayers.length} < 2`);
        socket.emit('error', {
          message: 'Need at least 2 connected players to start game',
          details: {
            connectedPlayers: connectedPlayers.length,
            requiredPlayers: 2
          }
        });
        return;
      }

      // Validation: All connected players must be ready
      if (readyConnectedPlayers.length !== connectedPlayers.length) {
        const notReadyPlayers = connectedPlayers.filter(p => !p.isReady).map(p => p.username);
        console.log(`[WebSocket] Not all connected players are ready. Not ready: ${notReadyPlayers.join(', ')}`);
        socket.emit('error', {
          message: 'All connected players must be ready to start game',
          details: {
            readyPlayers: readyConnectedPlayers.length,
            connectedPlayers: connectedPlayers.length,
            notReadyPlayers
          }
        });
        return;
      }

      // Validation: For 4-player games, teams must be formed
      if (connectedPlayers.length === 4) {
        const playersWithTeams = connectedPlayers.filter(p => p.teamAssignment !== null);
        if (playersWithTeams.length !== 4) {
          console.log(`[WebSocket] Teams not formed for 4-player game. Players with teams: ${playersWithTeams.length}/4`);
          socket.emit('error', {
            message: 'Teams must be formed before starting a 4-player game',
            details: {
              playersWithTeams: playersWithTeams.length,
              totalPlayers: connectedPlayers.length
            }
          });
          return;
        }

        // Validate team balance
        const team1Players = connectedPlayers.filter(p => p.teamAssignment === 1);
        const team2Players = connectedPlayers.filter(p => p.teamAssignment === 2);
        if (team1Players.length !== 2 || team2Players.length !== 2) {
          console.log(`[WebSocket] Unbalanced teams. Team 1: ${team1Players.length}, Team 2: ${team2Players.length}`);
          socket.emit('error', {
            message: 'Teams must be balanced (2 players each) to start the game',
            details: {
              team1Size: team1Players.length,
              team2Size: team2Players.length
            }
          });
          return;
        }
      }

      // For 2-player games, ensure no team assignments are required
      if (connectedPlayers.length === 2) {
        console.log(`[WebSocket] Starting 2-player game - team formation not required`);
      }

      // First, update the database to ensure persistence
      try {
        const { default: Room } = await import('../src/models/Room.js');
        const roomModel = await Room.findById(gameId);
        if (roomModel) {
          await roomModel.updateStatus('playing');
          dbUpdateSuccess = true;
          console.log(`[WebSocket] Database updated: Room ${gameId} status set to 'playing'`);
        } else {
          console.warn(`[WebSocket] Room ${gameId} not found in database during game start`);
        }
      } catch (dbError) {
        console.error(`[WebSocket] Database update failed for game start:`, dbError);
        // Continue with websocket update but warn user
        socket.emit('warning', {
          message: 'Game started locally but database sync failed. Game state may not persist.',
          fallbackAvailable: true
        });
      }

      // Update websocket room status
      room.status = 'playing';
      room.startedAt = new Date().toISOString();
      room.startedBy = effectiveUserId;

      // Update game state manager
      this.gameStateManager.updateGameState(gameId, {
        status: 'playing',
        phase: 'game_starting',
        startedAt: room.startedAt,
        startedBy: effectiveUserId
      }, effectiveUserId);

      console.log(`[WebSocket] Game starting in room ${gameId} by ${effectiveUsername}`);

      // Prepare broadcast data with enhanced information
      const gameStartData = {
        gameId,
        startedBy: effectiveUsername,
        startedById: effectiveUserId,
        players: connectedPlayers.map(p => ({
          userId: p.userId,
          username: p.username,
          teamAssignment: p.teamAssignment,
          isConnected: p.isConnected,
          isReady: p.isReady
        })),
        teams: {
          team1: room.teams.team1.map(playerId => {
            const player = room.players.get(playerId);
            return player ? { userId: playerId, username: player.username } : null;
          }).filter(Boolean),
          team2: room.teams.team2.map(playerId => {
            const player = room.players.get(playerId);
            return player ? { userId: playerId, username: player.username } : null;
          }).filter(Boolean)
        },
        playerCount: connectedPlayers.length,
        gameMode: connectedPlayers.length === 2 ? '2-player' : '4-player',
        roomStatus: 'playing',
        dbSynced: dbUpdateSuccess,
        timestamp: new Date().toISOString()
      };

      // Initialize the actual game with GameEngine
      try {
        const { default: GameEngine } = await import('../src/services/GameEngine.js');
        const gameEngine = new GameEngine();

        // Deal initial 4 cards to each player
        console.log(`[WebSocket] Dealing initial cards for game ${gameId}`);
        const dealResult = await gameEngine.dealInitialCards(gameId);

        // Create the first round
        const roundId = await gameEngine.createGameRound(
          gameId,
          1, // Round number
          dealResult.dealerUserId,
          dealResult.firstPlayerUserId
        );

        // Update game state with initial cards and round info
        const gameStateUpdate = {
          status: 'in_progress',
          phase: 'trump_declaration',
          currentRound: 1,
          roundId: roundId,
          dealerUserId: dealResult.dealerUserId,
          trumpDeclarer: dealResult.firstPlayerUserId,
          remainingDeck: dealResult.remainingDeck,
          players: {}
        };

        // Add player hands to the game state
        for (const [playerId, hand] of Object.entries(dealResult.playerHands)) {
          gameStateUpdate.players[playerId] = {
            hand: hand,
            handSize: hand.length,
            tricksWon: 0
          };
        }

        // Update game state manager
        this.gameStateManager.updateGameState(gameId, gameStateUpdate, 'server');

        console.log(`[WebSocket] Game initialized with initial cards dealt. Trump declarer: ${dealResult.firstPlayerUserId}`);

        // Enhanced game start data with initial game state
        gameStartData.phase = 'trump_declaration';
        gameStartData.currentRound = 1;
        gameStartData.trumpDeclarer = dealResult.firstPlayerUserId;
        gameStartData.dealerUserId = dealResult.dealerUserId;

      } catch (gameInitError) {
        console.error(`[WebSocket] Failed to initialize game with GameEngine:`, gameInitError);
        socket.emit('error', {
          message: 'Failed to initialize game',
          details: gameInitError.message
        });
        return;
      }

      // Try to broadcast via websocket with error handling and retry
      try {
        this.io.to(gameId).emit('game-starting', gameStartData);
        wsUpdateSuccess = true;
        console.log(`[WebSocket] Successfully broadcasted game start for room ${gameId}`);
      } catch (wsError) {
        console.error(`[WebSocket] Failed to broadcast game start:`, wsError);
        wsUpdateSuccess = false;

        // Trigger HTTP API fallback
        await this.triggerHttpFallbackForGameStart(gameId, effectiveUserId, gameStartData);
      }

      // Send confirmation back to the requesting player
      socket.emit('game-start-confirmed', {
        gameId,
        success: wsUpdateSuccess,
        dbSynced: dbUpdateSuccess,
        fallbackTriggered: !wsUpdateSuccess,
        gameMode: gameStartData.gameMode,
        timestamp: new Date().toISOString()
      });

      // If websocket failed but database succeeded, schedule a retry
      if (!wsUpdateSuccess && dbUpdateSuccess) {
        setTimeout(() => {
          console.log(`[WebSocket] Retrying websocket broadcast for game start in room ${gameId}`);
          try {
            this.io.to(gameId).emit('game-starting', gameStartData);
          } catch (retryError) {
            console.error(`[WebSocket] Retry failed for game start broadcast:`, retryError);
          }
        }, 2000);
      }

    } catch (error) {
      console.error('[WebSocket] Error starting game:', error);

      // Try HTTP API fallback as last resort
      if (dbUpdateSuccess) {
        await this.triggerHttpFallbackForGameStart(gameId, effectiveUserId, null);
      }

      socket.emit('error', {
        message: 'Failed to start game',
        details: error.message,
        fallbackAvailable: true
      });
    }
  }

  /**
   * Handle trump declaration with GameEngine integration
   */
  async handleDeclareTrump(socket, data) {
    const { gameId, trumpSuit } = data;
    const { userId, username } = socket;

    console.log(`[WebSocket] Trump declaration attempt by ${username}: ${trumpSuit} in game ${gameId}`);

    try {
      // Import GameEngine if not already available
      if (!this.gameEngine) {
        const { default: GameEngine } = await import('../src/services/GameEngine.js');
        this.gameEngine = new GameEngine();
      }

      // Get current game state to find the round ID
      const gameState = this.gameStateManager.getGameState(gameId);
      if (!gameState || !gameState.roundId) {
        socket.emit('error', { message: 'Game round not found' });
        return;
      }

      // Validate trump declaration through game engine
      const trumpResult = await this.gameEngine.declareTrump(gameId, gameState.roundId, userId, trumpSuit);

      // Deal final 4 cards to each player
      const finalHands = await this.gameEngine.dealFinalCards(gameId, gameState.remainingDeck);

      console.log(`[WebSocket] Final hands dealt:`, {
        gameId,
        finalHandsKeys: Object.keys(finalHands),
        handSizes: Object.fromEntries(Object.entries(finalHands).map(([id, hand]) => [id, hand.length]))
      });

      // Determine who starts the first trick (trump declarer)
      const firstTrickPlayer = userId; // Trump declarer starts the first trick

      // Update game state with trump declaration and final hands
      const gameStateUpdate = {
        phase: 'playing',
        gamePhase: 'playing', // Add both property names for consistency
        trumpSuit: trumpResult.trumpSuit,
        declaringTeamId: trumpResult.declaringTeamId,
        challengingTeamId: trumpResult.challengingTeamId,
        declaringTeam: trumpResult.declaringTeam,
        challengingTeam: trumpResult.challengingTeam,
        currentTurnPlayer: firstTrickPlayer, // Set the current turn player
        currentTrick: {
          trickNumber: 1,
          cardsPlayed: [],
          leadSuit: null,
          currentPlayer: firstTrickPlayer // First player of declaring team starts
        },
        players: {}
      };

      // Update player hands with final 8 cards
      for (const [playerId, hand] of Object.entries(finalHands)) {
        gameStateUpdate.players[playerId] = {
          hand: hand,
          handSize: hand.length,
          tricksWon: 0
        };
        console.log(`[WebSocket] Updated player ${playerId} with ${hand.length} cards`);
      }

      // Update game state manager
      this.gameStateManager.updateGameState(gameId, gameStateUpdate, 'server');

      console.log(`[WebSocket] Trump declared successfully: ${trumpSuit} by ${username}. Game phase: playing`);

      // Emit trump declaration events
      this.io.to(gameId).emit('player:declare_trump', {
        gameId,
        playerId: userId,
        playerName: username,
        trumpSuit,
        timestamp: new Date().toISOString()
      });

      this.io.to(gameId).emit('game:trump_declared', {
        gameId,
        trumpSuit: trumpResult.trumpSuit,
        declaredBy: userId,
        declaredByName: username,
        declaringTeam: trumpResult.declaringTeam,
        challengingTeam: trumpResult.challengingTeam,
        phase: 'playing',
        currentTurnPlayer: firstTrickPlayer,
        currentTrick: gameStateUpdate.currentTrick,
        timestamp: new Date().toISOString()
      });

      // Legacy event for backward compatibility
      this.io.to(gameId).emit('trump-declared', {
        gameId,
        trumpSuit: trumpResult.trumpSuit,
        declaredBy: userId,
        declaredByName: username,
        declaringTeam: trumpResult.declaringTeam,
        challengingTeam: trumpResult.challengingTeam,
        timestamp: new Date().toISOString()
      });

      // After trump declaration, check if any bots need to play
      // (This handles the case where the trump declarer is a bot or the first player is a bot)
      setTimeout(async () => {
        try {
          console.log(`[WebSocket] Checking for bot turns after trump declaration. First player: ${firstTrickPlayer}`);
          await this.processBotTurnsIfNeeded(gameId);
        } catch (botError) {
          console.error(`[WebSocket] Error processing bot turns after trump declaration:`, botError);
        }
      }, 3000); // Give time for UI to update and cards to be dealt

    } catch (error) {
      console.error(`[WebSocket] Trump declaration error:`, error);
      socket.emit('error', {
        message: 'Failed to declare trump',
        details: error.message
      });
    }
  }

  /**
   * Handle card play with game engine integration
   */
  async handlePlayCard(socket, data) {
    const { gameId, card, trickId, roundId, playerId } = data;
    const { userId, username } = socket;

    // Use playerId from data if provided, otherwise use socket userId
    const effectiveUserId = playerId || userId;

    console.log(`[WebSocket] Card play attempt by ${username}:`, card, `in game ${gameId}`);

    try {
      // Get current game state to extract missing IDs if needed
      const gameState = this.gameStateManager.getGameState(gameId);
      if (!gameState) {
        throw new Error('Game state not found');
      }

      // Extract roundId and trickId from game state if not provided
      const effectiveRoundId = roundId || gameState.roundId || gameState.currentRound;
      const effectiveTrickId = trickId || gameState.currentTrick?.trickId || 1;

      console.log(`[WebSocket] Using IDs - roundId: ${effectiveRoundId}, trickId: ${effectiveTrickId}, userId: ${effectiveUserId}`);

      // For now, let's handle card play without GameEngine to get basic functionality working
      // We'll broadcast the card play and let the client handle the logic

      // Remove card from player's hand and update turn
      if (gameState.players && gameState.players[effectiveUserId] && gameState.players[effectiveUserId].hand) {
        const playerHand = gameState.players[effectiveUserId].hand;
        const cardIndex = playerHand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
        if (cardIndex !== -1) {
          // Create a new array without the played card instead of modifying the existing one
          const newPlayerHand = playerHand.filter((c, index) => index !== cardIndex);

          // Determine next player in turn order
          const room = this.gameRooms.get(gameId);
          const playerIds = Array.from(room.players.keys());
          const currentPlayerIndex = playerIds.indexOf(effectiveUserId);
          const nextPlayerIndex = (currentPlayerIndex + 1) % playerIds.length;
          const nextPlayerId = playerIds[nextPlayerIndex];

          console.log(`[WebSocket] Turn update: ${effectiveUserId} -> ${nextPlayerId}`);

          // Add card to current trick
          const currentTrick = gameState.currentTrick || { cardsPlayed: [], trickNumber: 1 };
          const cardPlay = {
            playerId: effectiveUserId,
            playerName: username,
            card: card
          };

          // Add to trick if not already present
          const existingCardIndex = currentTrick.cardsPlayed.findIndex(play =>
            play.playerId === effectiveUserId
          );

          if (existingCardIndex === -1) {
            currentTrick.cardsPlayed.push(cardPlay);
          }

          // Set lead suit if this is the first card
          if (currentTrick.cardsPlayed.length === 1) {
            currentTrick.leadSuit = card.suit;
          }

          console.log(`[WebSocket] Trick progress: ${currentTrick.cardsPlayed.length}/4 cards played`);

          // Update game state with new hand, turn, and trick
          this.gameStateManager.updateGameState(gameId, {
            currentTurnPlayer: nextPlayerId,
            phase: gameState.phase || 'playing', // Preserve phase
            gamePhase: gameState.gamePhase || gameState.phase || 'playing', // Ensure both properties
            currentTrick: currentTrick,
            players: {
              [effectiveUserId]: {
                ...gameState.players[effectiveUserId],
                hand: newPlayerHand, // Use the new hand array
                handSize: newPlayerHand.length // Use the new hand array length
              }
            }
          }, effectiveUserId);
        }
      }

      // Get the updated game state to get the next player
      const updatedGameState = this.gameStateManager.getGameState(gameId);
      const nextPlayerId = updatedGameState.currentTurnPlayer;

      // Get updated game state to check trick completion
      const finalGameState = this.gameStateManager.getGameState(gameId);
      const finalTrick = finalGameState.currentTrick;
      const trickComplete = finalTrick && finalTrick.cardsPlayed.length === 4;

      // Broadcast card played event
      this.io.to(gameId).emit('game:card_played', {
        gameId,
        card: card,
        playedBy: effectiveUserId,
        playedByName: username,
        trickId: effectiveTrickId,
        roundId: effectiveRoundId,
        cardsInTrick: finalTrick?.cardsPlayed || [],
        nextPlayerId: trickComplete ? null : nextPlayerId, // No next player if trick is complete
        trickComplete: trickComplete,
        leadSuit: finalTrick?.leadSuit || null,
        timestamp: new Date().toISOString()
      });

      console.log(`[WebSocket] Card play broadcasted for ${username} in game ${gameId}. Trick complete: ${trickComplete}`);

      if (trickComplete) {
        // Evaluate trick after a short delay
        setTimeout(async () => {
          try {
            await this.evaluateTrick(gameId, finalTrick);
          } catch (trickError) {
            console.error(`[WebSocket] Error evaluating trick:`, trickError);
          }
        }, 2000);
      } else {
        // After a human player plays, check if any bots need to play
        setTimeout(async () => {
          try {
            console.log(`[WebSocket] Checking for bot turns after ${username} played ${card.rank} of ${card.suit}`);
            await this.processBotTurnsIfNeeded(gameId);
          } catch (botError) {
            console.error(`[WebSocket] Error processing bot turns after card play:`, botError);
          }
        }, 1000); // Small delay to let the UI update
      }

      /* 
      // TODO: Re-enable GameEngine integration once we have proper game state setup
      // Import GameEngine if not already available
      if (!this.gameEngine) {
        const { default: GameEngine } = await import('../src/services/GameEngine.js');
        this.gameEngine = new GameEngine();
      }
      */

      // Note: Old GameEngine integration removed - using simplified server-side logic

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
        trickId: trickId || null,
        roundId: roundId || null
      };

      socket.emit('game:error', errorResponse);
    }
  }

  /**
   * Process bot turns if needed
   * @param {string} gameId - Game ID
   */
  async processBotTurnsIfNeeded(gameId) {
        try {
          const gameState = this.gameStateManager.getGameState(gameId);
          console.log(`[WebSocket] processBotTurnsIfNeeded - gameState:`, {
            hasGameState: !!gameState,
            currentTurnPlayer: gameState?.currentTurnPlayer,
            trumpDeclarer: gameState?.trumpDeclarer,
            gamePhase: gameState?.gamePhase,
            phase: gameState?.phase,
            trumpSuit: gameState?.trumpSuit
          });

          // Fix phase consistency if needed
          if (gameState && gameState.trumpSuit && !gameState.gamePhase && !gameState.phase) {
            console.log(`[WebSocket] Fixing missing game phase - trump is declared so should be playing`);
            this.gameStateManager.updateGameState(gameId, {
              phase: 'playing',
              gamePhase: 'playing'
            }, 'server');
            // Get updated state
            const updatedGameState = this.gameStateManager.getGameState(gameId);
            Object.assign(gameState, updatedGameState);
          }

          if (!gameState) {
            console.log(`[WebSocket] No game state for game ${gameId}`);
            return;
          }

          const room = this.gameRooms.get(gameId);
          if (!room) {
            console.log(`[WebSocket] No room found for game ${gameId}`);
            return;
          }

          // For trump declaration phase, check trump declarer instead of currentTurnPlayer
          let playerToCheck = gameState.currentTurnPlayer;
          if (gameState.gamePhase === 'trump_declaration' && gameState.trumpDeclarer) {
            playerToCheck = gameState.trumpDeclarer;
            console.log(`[WebSocket] Trump declaration phase - checking trump declarer: ${playerToCheck}`);
          }

          if (!playerToCheck) {
            console.log(`[WebSocket] No player to check for bot processing in game ${gameId}`);
            return;
          }

          // Check if the player is a bot
          const currentPlayer = room.players.get(playerToCheck);
          console.log(`[WebSocket] Player to check: ${playerToCheck}, Player data:`, {
            exists: !!currentPlayer,
            username: currentPlayer?.username,
            isBot: currentPlayer?.isBot
          });

          if (!currentPlayer || !currentPlayer.isBot) {
            console.log(`[WebSocket] Player is not a bot or not found. IsBot: ${currentPlayer?.isBot}, Player: ${currentPlayer?.username}`);
            return;
          }

          console.log(`[WebSocket] Processing bot turn for ${currentPlayer.username} in game ${gameId}`);

          // For now, use a simple bot card play system
          // TODO: Replace with full BotTurnProcessor integration later
          const botResult = await this.processSimpleBotTurn(gameId, playerToCheck, currentPlayer);

          if (botResult) {
            console.log(`[WebSocket] Bot ${currentPlayer.username} completed action: ${botResult.actionType}`);

            // If bot played a card, broadcast it
            if (botResult.actionType === 'play_card' && botResult.card) {
              // Update bot's hand in game state (remove the played card)
              const updatedGameState = this.gameStateManager.getGameState(gameId);
              if (updatedGameState.players && updatedGameState.players[gameState.currentTurnPlayer]) {
                const botPlayer = updatedGameState.players[gameState.currentTurnPlayer];
                if (botPlayer.hand) {
                  const cardIndex = botPlayer.hand.findIndex(c =>
                    c.suit === botResult.card.suit && c.rank === botResult.card.rank
                  );
                  if (cardIndex !== -1) {
                    // Create a new array without the played card instead of modifying the existing one
                    const newBotHand = botPlayer.hand.filter((c, index) => index !== cardIndex);
                    botPlayer.hand = newBotHand;
                    botPlayer.handSize = newBotHand.length;
                  }
                }
              }

              // Determine next player in turn order
              const room = this.gameRooms.get(gameId);
              const playerIds = Array.from(room.players.keys());
              const currentPlayerIndex = playerIds.indexOf(gameState.currentTurnPlayer);
              const nextPlayerIndex = (currentPlayerIndex + 1) % playerIds.length;
              const nextPlayerId = playerIds[nextPlayerIndex];

              // Update game state with next turn player
              this.gameStateManager.updateGameState(gameId, {
                currentTurnPlayer: nextPlayerId,
                players: updatedGameState.players
              }, 'server');

              // Broadcast bot card play
              this.io.to(gameId).emit('game:card_played', {
                gameId,
                card: botResult.card,
                playedBy: gameState.currentTurnPlayer,
                playedByName: currentPlayer.username,
                trickId: gameState.currentTrick?.trickId || 1,
                roundId: gameState.roundId || gameState.currentRound,
                cardsInTrick: [],
                nextPlayerId: nextPlayerId,
                trickComplete: false,
                leadSuit: null,
                timestamp: new Date().toISOString()
              });

              console.log(`[WebSocket] Bot ${currentPlayer.username} played ${botResult.card.rank} of ${botResult.card.suit}. Next player: ${nextPlayerId}`);

              // Continue processing if there are more bots to play
              setTimeout(() => {
                this.processBotTurnsIfNeeded(gameId);
              }, 2000);
            }

            // If bot declared trump, handle it like a human trump declaration
            if (botResult.actionType === 'declare_trump' && botResult.trumpSuit) {
              console.log(`[WebSocket] Bot ${currentPlayer.username} declared trump: ${botResult.trumpSuit}`);

              // Simulate trump declaration by calling the trump handler
              const fakeSocket = {
                userId: gameState.currentTurnPlayer,
                username: currentPlayer.username
              };

              const trumpData = {
                gameId: gameId,
                trumpSuit: botResult.trumpSuit
              };

              // Call the trump declaration handler
              await this.handleDeclareTrump(fakeSocket, trumpData);
            }
          }

        } catch (error) {
          console.error(`[WebSocket] Error processing bot turns for game ${gameId}:`, error);
        }
      }

  /**
   * Process a simple bot turn (simplified version)
   * @param {string} gameId - Game ID
   * @param {string} botPlayerId - Bot player ID
   * @param {Object} botPlayer - Bot player data
   * @returns {Object} Bot action result
   */
  async processSimpleBotTurn(gameId, botPlayerId, botPlayer) {
        try {
          const gameState = this.gameStateManager.getGameState(gameId);

          // Use phase or gamePhase (different parts of the code use different property names)
          const currentPhase = gameState.gamePhase || gameState.phase;

          console.log(`[WebSocket] Processing simple bot turn for ${botPlayer.username}:`, {
            gamePhase: gameState.gamePhase,
            phase: gameState.phase,
            currentPhase: currentPhase,
            trumpSuit: gameState.trumpSuit,
            trumpDeclarer: gameState.trumpDeclarer,
            botPlayerId,
            isTrumpDeclarer: gameState.trumpDeclarer === botPlayerId
          });

          // Check if bot needs to declare trump
          if (currentPhase === 'trump_declaration' && gameState.trumpDeclarer === botPlayerId) {
            // Simple trump declaration - choose a random suit
            const trumpSuits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
            const chosenTrump = trumpSuits[Math.floor(Math.random() * trumpSuits.length)];

            console.log(`[WebSocket] Bot ${botPlayer.username} declaring trump: ${chosenTrump}`);

            return {
              actionType: 'declare_trump',
              trumpSuit: chosenTrump,
              playerName: botPlayer.username
            };
          }

          // Check if bot needs to play a card
          if (currentPhase === 'playing' || (!currentPhase && gameState.trumpSuit)) {
            // Get bot's hand from game state
            const botHand = gameState.players?.[botPlayerId]?.hand || [];

            console.log(`[WebSocket] Bot ${botPlayer.username} hand:`, {
              handSize: botHand.length,
              cards: botHand.map(c => `${c.rank} of ${c.suit}`)
            });

            if (botHand.length === 0) {
              console.log(`[WebSocket] Bot ${botPlayer.username} has no cards to play`);
              return null;
            }

            // Simple card selection - play the first valid card
            const chosenCard = botHand[0];

            console.log(`[WebSocket] Bot ${botPlayer.username} playing card: ${chosenCard.rank} of ${chosenCard.suit}`);

            return {
              actionType: 'play_card',
              card: chosenCard,
              playerName: botPlayer.username
            };
          }

          // If we get here, the bot doesn't know what to do
          console.log(`[WebSocket] Bot ${botPlayer.username} - no action determined:`, {
            currentPhase,
            trumpSuit: gameState.trumpSuit,
            isTrumpDeclarer: gameState.trumpDeclarer === botPlayerId,
            hasHand: !!(gameState.players?.[botPlayerId]?.hand),
            handSize: gameState.players?.[botPlayerId]?.hand?.length || 0
          });

          return null;

        } catch (error) {
          console.error(`[WebSocket] Error in simple bot turn processing:`, error);
          return null;
        }
      }

  /**
   * Evaluate trick to determine winner
   * @param {string} gameId - Game ID
   * @param {Object} trick - Trick data with cards played
   */
  async evaluateTrick(gameId, trick) {
        try {
          console.log(`[WebSocket] Evaluating trick for game ${gameId}:`, trick);

          const gameState = this.gameStateManager.getGameState(gameId);
          if (!gameState || !trick || !trick.cardsPlayed || trick.cardsPlayed.length !== 4) {
            console.error(`[WebSocket] Invalid trick data for evaluation`);
            return;
          }

          // Determine trick winner using simple logic
          const winner = this.determineTrickWinner(trick.cardsPlayed, trick.leadSuit, gameState.trumpSuit);

          if (!winner) {
            console.error(`[WebSocket] Could not determine trick winner`);
            return;
          }

          console.log(`[WebSocket] Trick winner: ${winner.playerName} with ${winner.card.rank} of ${winner.card.suit}`);

          // Update scores (simple: 1 point per trick)
          const currentScores = gameState.scores || { team1: 0, team2: 0 };
          const winnerTeam = this.getPlayerTeam(gameId, winner.playerId);
          const teamKey = `team${winnerTeam}`;
          currentScores[teamKey] += 1;

          // Broadcast trick won event
          this.io.to(gameId).emit('game:trick_won', {
            gameId,
            winnerId: winner.playerId,
            winnerName: winner.playerName,
            winningCard: winner.card,
            cardsPlayed: trick.cardsPlayed,
            scores: currentScores,
            timestamp: new Date().toISOString()
          });

          // Clear trick and set up next trick after delay
          setTimeout(async () => {
            await this.startNextTrick(gameId, winner.playerId, currentScores);
          }, 3000);

        } catch (error) {
          console.error(`[WebSocket] Error evaluating trick:`, error);
        }
      }

      /**
       * Determine trick winner
       * @param {Array} cardsPlayed - Cards played in trick
       * @param {string} leadSuit - Lead suit
       * @param {string} trumpSuit - Trump suit
       * @returns {Object} Winner info
       */
      determineTrickWinner(cardsPlayed, leadSuit, trumpSuit) {
        if (!cardsPlayed || cardsPlayed.length === 0) return null;

        let winningPlay = cardsPlayed[0];
        const rankValues = {
          '7': 1, '8': 2, '9': 3, '10': 4,
          'J': 5, 'Q': 6, 'K': 7, 'A': 8
        };

        for (const play of cardsPlayed) {
          const currentCard = play.card;
          const winningCard = winningPlay.card;

          // Trump cards beat non-trump cards
          const isCurrentTrump = currentCard.suit === trumpSuit;
          const isWinningTrump = winningCard.suit === trumpSuit;

          if (isCurrentTrump && !isWinningTrump) {
            winningPlay = play;
          } else if (!isCurrentTrump && isWinningTrump) {
            // Winning card remains trump
            continue;
          } else if (isCurrentTrump && isWinningTrump) {
            // Both trump - higher rank wins
            if (rankValues[currentCard.rank] > rankValues[winningCard.rank]) {
              winningPlay = play;
            }
          } else {
            // Neither trump - must follow lead suit
            const isCurrentLeadSuit = currentCard.suit === leadSuit;
            const isWinningLeadSuit = winningCard.suit === leadSuit;

            if (isCurrentLeadSuit && !isWinningLeadSuit) {
              winningPlay = play;
            } else if (isCurrentLeadSuit && isWinningLeadSuit) {
              // Both lead suit - higher rank wins
              if (rankValues[currentCard.rank] > rankValues[winningCard.rank]) {
                winningPlay = play;
              }
            }
          }
        }

        return {
          playerId: winningPlay.playerId,
          playerName: winningPlay.playerName,
          card: winningPlay.card
        };
      }

  /**
   * Start next trick
   * @param {string} gameId - Game ID
   * @param {string} leaderId - Player who leads next trick
   * @param {Object} scores - Updated scores
   */
  async startNextTrick(gameId, leaderId, scores) {
        try {
          const gameState = this.gameStateManager.getGameState(gameId);
          const currentTrickNumber = (gameState.currentTrick?.trickNumber || 1) + 1;

          // Check if round is complete (8 tricks played)
          if (currentTrickNumber > 8) {
            console.log(`[WebSocket] Round complete for game ${gameId}. Final scores:`, scores);
            await this.handleRoundComplete(gameId, scores);
            return;
          }

          // Update game state for next trick
          this.gameStateManager.updateGameState(gameId, {
            currentTurnPlayer: leaderId,
            currentTrick: {
              trickNumber: currentTrickNumber,
              cardsPlayed: [],
              leadSuit: null
            },
            scores: scores
          }, 'server');

          console.log(`[WebSocket] Starting trick ${currentTrickNumber}, leader: ${leaderId}`);

          // Broadcast next trick start
          this.io.to(gameId).emit('game:next_trick', {
            gameId,
            trickNumber: currentTrickNumber,
            leaderId: leaderId,
            leaderName: this.getPlayerName(gameId, leaderId),
            scores: scores,
            timestamp: new Date().toISOString()
          });

          // Check if leader is a bot and process their turn
          setTimeout(async () => {
            await this.processBotTurnsIfNeeded(gameId);
          }, 1000);

        } catch (error) {
          console.error(`[WebSocket] Error starting next trick:`, error);
        }
      }

  /**
   * Handle round completion
   * @param {string} gameId - Game ID
   * @param {Object} scores - Final trick scores
   */
  async handleRoundComplete(gameId, scores) {
        try {
          const gameState = this.gameStateManager.getGameState(gameId);

          // Determine round winner based on trump declaring team rules
          const roundWinner = this.determineRoundWinner(gameId, scores, gameState.trumpDeclarer);

          if (!roundWinner) {
            console.error(`[WebSocket] Could not determine round winner`);
            return;
          }

          console.log(`[WebSocket] Round winner: ${roundWinner.teamName} (${roundWinner.reason})`);

          // Update round scores (accumulate tricks won by winning team)
          const currentRoundScores = gameState.roundScores || { team1: 0, team2: 0 };
          const tricksWon = scores[roundWinner.teamKey];
          currentRoundScores[roundWinner.teamKey] += tricksWon;

          // Update game state with round completion
          this.gameStateManager.updateGameState(gameId, {
            roundScores: currentRoundScores,
            lastRoundWinner: roundWinner
          }, 'server');

          // Broadcast round completion
          this.io.to(gameId).emit('game:round_complete', {
            gameId,
            roundWinner: roundWinner,
            trickScores: scores,
            roundScores: currentRoundScores,
            tricksWon: tricksWon,
            currentRound: gameState.currentRound || 1,
            timestamp: new Date().toISOString()
          });

          console.log(`[WebSocket] Round complete broadcasted. Updated round scores:`, currentRoundScores);

        } catch (error) {
          console.error(`[WebSocket] Error handling round completion:`, error);
        }
      }

      /**
       * Determine round winner based on trump declaring team rules
       * @param {string} gameId - Game ID
       * @param {Object} scores - Trick scores
       * @param {string} trumpDeclarer - Player who declared trump
       * @returns {Object} Round winner information
       */
      determineRoundWinner(gameId, scores, trumpDeclarer) {
        // Determine which team declared trump
        const trumpDeclaringTeam = this.getPlayerTeam(gameId, trumpDeclarer);
        const nonDeclaringTeam = trumpDeclaringTeam === 1 ? 2 : 1;

        const declaringTeamKey = `team${trumpDeclaringTeam}`;
        const nonDeclaringTeamKey = `team${nonDeclaringTeam}`;

        const declaringTeamScore = scores[declaringTeamKey];
        const nonDeclaringTeamScore = scores[nonDeclaringTeamKey];

        // Trump declaring team needs more than 4 tricks (5 or more) to win
        // Non-declaring team needs 4 or more tricks to win
        if (declaringTeamScore >= 5) {
          return {
            teamKey: declaringTeamKey,
            teamName: `Team ${trumpDeclaringTeam}`,
            reason: `Trump declaring team won ${declaringTeamScore} tricks (needed 5+)`
          };
        } else if (nonDeclaringTeamScore >= 4) {
          return {
            teamKey: nonDeclaringTeamKey,
            teamName: `Team ${nonDeclaringTeam}`,
            reason: `Non-declaring team won ${nonDeclaringTeamScore} tricks (needed 4+)`
          };
        }

        // Fallback (shouldn't happen in an 8-trick game)
        return {
          teamKey: declaringTeamScore > nonDeclaringTeamScore ? declaringTeamKey : nonDeclaringTeamKey,
          teamName: declaringTeamScore > nonDeclaringTeamScore ? `Team ${trumpDeclaringTeam}` : `Team ${nonDeclaringTeam}`,
          reason: 'Won by having more tricks'
        };
      }

  /**
   * Handle start next round request
   * @param {Object} socket - Socket connection
   * @param {Object} data - Next round data
   */
  async handleStartNextRound(socket, data) {
        const { gameId, previousRoundWinner } = data;
        const { userId, username } = socket;

        console.log(`[WebSocket] Starting next round for game ${gameId} requested by ${username}`);

        try {
          const gameState = this.gameStateManager.getGameState(gameId);
          if (!gameState) {
            socket.emit('error', { message: 'Game state not found' });
            return;
          }

          // Check if game is complete (first to 52 points wins)
          const roundScores = gameState.roundScores || { team1: 0, team2: 0 };
          const pointsToWin = 52;

          if (roundScores.team1 >= pointsToWin || roundScores.team2 >= pointsToWin) {
            console.log(`[WebSocket] Game complete! Final scores:`, roundScores);
            await this.handleGameComplete(gameId, roundScores);
            return;
          }

          // Determine next trump declarer
          let nextTrumpDeclarer;
          if (previousRoundWinner) {
            // If the trump declaring team won, they declare again
            // If they lost, next player in clockwise order declares
            const room = this.gameRooms.get(gameId);
            const playerIds = Array.from(room.players.keys());
            const currentDeclarerIndex = playerIds.indexOf(gameState.trumpDeclarer);

            const currentDeclarerTeam = this.getPlayerTeam(gameId, gameState.trumpDeclarer);
            const winnerTeamNumber = parseInt(previousRoundWinner.teamKey.replace('team', ''));

            if (winnerTeamNumber === currentDeclarerTeam) {
              // Same team won, same player declares trump again
              nextTrumpDeclarer = gameState.trumpDeclarer;
            } else {
              // Other team won, next player in clockwise order declares
              const nextDeclarerIndex = (currentDeclarerIndex + 1) % playerIds.length;
              nextTrumpDeclarer = playerIds[nextDeclarerIndex];
            }
          } else {
            // Fallback to next player in order
            const room = this.gameRooms.get(gameId);
            const playerIds = Array.from(room.players.keys());
            const currentDeclarerIndex = playerIds.indexOf(gameState.trumpDeclarer);
            const nextDeclarerIndex = (currentDeclarerIndex + 1) % playerIds.length;
            nextTrumpDeclarer = playerIds[nextDeclarerIndex];
          }

          console.log(`[WebSocket] Next trump declarer: ${nextTrumpDeclarer}`);

          // Deal new cards for the new round
          const { default: GameEngine } = await import('../src/services/GameEngine.js');
          const gameEngine = new GameEngine();
          const dealResult = await gameEngine.dealInitialCards(gameId);

          // Create new round
          const nextRoundNumber = (gameState.currentRound || 1) + 1;
          const roundId = await gameEngine.createGameRound(
            gameId,
            nextRoundNumber,
            dealResult.dealerUserId,
            nextTrumpDeclarer
          );

          // Reset game state for new round
          const gameStateUpdate = {
            currentRound: nextRoundNumber,
            roundId: roundId,
            phase: 'trump_declaration',
            gamePhase: 'trump_declaration',
            trumpSuit: null,
            trumpDeclarer: nextTrumpDeclarer,
            dealerUserId: dealResult.dealerUserId,
            scores: { team1: 0, team2: 0 }, // Reset trick scores
            currentTrick: {
              trickNumber: 1,
              cardsPlayed: [],
              leadSuit: null
            },
            currentTurnPlayer: null,
            players: {}
          };

          // Update player hands with new cards
          for (const [playerId, hand] of Object.entries(dealResult.playerHands)) {
            gameStateUpdate.players[playerId] = {
              ...gameState.players[playerId],
              hand: hand,
              handSize: hand.length,
              tricksWon: 0
            };
          }

          // Update game state
          this.gameStateManager.updateGameState(gameId, gameStateUpdate, 'server');

          console.log(`[WebSocket] Round ${nextRoundNumber} started. Trump declarer: ${nextTrumpDeclarer}`);

          // Broadcast new round start
          this.io.to(gameId).emit('game:new_round', {
            gameId,
            roundNumber: nextRoundNumber,
            trumpDeclarer: nextTrumpDeclarer,
            trumpDeclarerName: this.getPlayerName(gameId, nextTrumpDeclarer),
            dealerUserId: dealResult.dealerUserId,
            timestamp: new Date().toISOString()
          });

          // Broadcast updated game state
          const updatedGameState = this.gameStateManager.getGameState(gameId);
          this.gameStateManager.broadcastStateUpdate(gameId, updatedGameState, 'server');

          // Check if trump declarer is a bot and process immediately
          setTimeout(async () => {
            await this.processBotTurnsIfNeeded(gameId);
          }, 2000);

        } catch (error) {
          console.error(`[WebSocket] Error starting next round:`, error);
          socket.emit('error', {
            message: 'Failed to start next round',
            details: error.message
          });
        }
      }

  /**
   * Handle game completion
   * @param {string} gameId - Game ID
   * @param {Object} finalScores - Final game scores
   */
  async handleGameComplete(gameId, finalScores) {
        try {
          const winner = finalScores.team1 > finalScores.team2 ? 'Team 1' : 'Team 2';
          const finalScore = `${finalScores.team1} - ${finalScores.team2}`;

          console.log(`[WebSocket] Game ${gameId} complete! ${winner} wins with ${finalScore} points`);

          // Broadcast game completion
          this.io.to(gameId).emit('game:complete', {
            gameId,
            winner: winner,
            finalScores: finalScores,
            finalScore: finalScore,
            timestamp: new Date().toISOString()
          });

        } catch (error) {
          console.error(`[WebSocket] Error handling game completion:`, error);
        }
      }

      /**
       * Get player team
       * @param {string} gameId - Game ID
       * @param {string} playerId - Player ID
       * @returns {number} Team number (1 or 2)
       */
      getPlayerTeam(gameId, playerId) {
        const room = this.gameRooms.get(gameId);
        if (room && room.players.has(playerId)) {
          return room.players.get(playerId).teamAssignment || 1;
        }
        return 1; // Default to team 1
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
  async handleGameStateRequest(socket, data) {
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

        // Check if we need to initialize the game
        const room = this.gameRooms.get(gameId);
        if (room) {
          try {
            await this.checkAndInitializeGame(gameId, room);
          } catch (initError) {
            console.error(`[WebSocket] Error in checkAndInitializeGame from state request:`, initError);
          }
        }
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

  // Note: Old handleRoundComplete method removed - using server-side round completion

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
        if (!socket) {
          console.warn('[WebSocket] Attempted to handle disconnection for null socket');
          return;
        }

        const { userId, username } = socket;

        console.log(`[WebSocket] Client disconnected: ${username} (${socket.id}), reason: ${reason}`);

        // Clean up user-socket mappings
        this.userSockets.delete(userId);
        this.socketUsers.delete(socket.id);

        // Note: Reactive subscriptions cleanup removed during LokiJS migration

        // Handle disconnection through enhanced connection status manager
        // This will update connection status and broadcast to all rooms
        this.enhancedConnectionStatusManager.handlePlayerDisconnection(userId, reason);

        // Find and update any game rooms the user was in
        for (const [gameId, room] of this.gameRooms.entries()) {
          if (room.players.has(userId)) {
            const player = room.players.get(userId);

            // Mark player as disconnected but keep in room for potential reconnection
            player.isConnected = false;
            player.disconnectedAt = new Date().toISOString();

            // Handle waiting room disconnections differently from game disconnections
            if (room.status === 'waiting') {
              // Notify waiting room handler about disconnection
              this.waitingRoomHandler.handlePlayerDisconnected(socket, {
                roomId: gameId,
                userId: userId
              });
            } else {
              // Update game state for disconnection in active games
              this.gameStateManager.handlePlayerDisconnection(gameId, userId);

              // Set up cleanup timer for disconnected players (remove after 5 minutes for games)
              setTimeout(() => {
                if (room.players.has(userId) && !room.players.get(userId).isConnected) {
                  this.handlePlayerTimeout(gameId, userId, username);
                }
              }, 5 * 60 * 1000); // 5 minutes for games
            }

            console.log(`[WebSocket] Player ${username} disconnected from ${room.status === 'waiting' ? 'waiting room' : 'game'} ${gameId}`);
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

  // Note: Reactive subscription methods removed during LokiJS migration

  // Note: Conflict resolution methods removed during LokiJS migration
    }

export default SocketManager;