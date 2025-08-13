// Models will be imported dynamically to avoid initialization issues
import BotManager from '../services/BotManager.js';
// Legacy MariaDB connection removed - now using LokiJS
// import dbConnection from '../../database/connection.js';

// Temporary compatibility layer - this needs to be replaced with LokiJS queries
const dbConnection = {
    query: () => {
        throw new Error('dbConnection is not defined - WaitingRoomSocketHandler needs to be migrated to LokiJS');
    }
};

/**
 * Waiting Room WebSocket Handler
 * Handles WebSocket events specific to the waiting room functionality
 * Integrates with the main SocketManager for room management
 */
class WaitingRoomSocketHandler {
    constructor(socketManager) {
        this.socketManager = socketManager;
        this.io = socketManager.io;
    }

    /**
     * Set up waiting room specific event handlers for a socket
     */
    setupWaitingRoomEvents(socket) {
        const { userId, username } = socket;

        // Waiting room specific events
        socket.on('join-waiting-room', (data) => {
            this.handleJoinWaitingRoom(socket, data);
        });

        socket.on('leave-waiting-room', (data) => {
            this.handleLeaveWaitingRoom(socket, data);
        });

        socket.on('toggle-ready-status', (data) => {
            this.handleToggleReadyStatus(socket, data);
        });

        socket.on('start-game-request', (data) => {
            this.handleStartGameRequest(socket, data);
        });

        socket.on('player-disconnected', (data) => {
            this.handlePlayerDisconnected(socket, data);
        });

        console.log(`[WaitingRoom] Event handlers set up for ${username} (${userId})`);
    }

    /**
     * Handle joining a waiting room
     */
    async handleJoinWaitingRoom(socket, data) {
        const { roomId, userId: dataUserId, username: dataUsername } = data;
        const { userId, username } = socket;

        // Use data from request if provided, otherwise use socket auth data
        const effectiveUserId = String(dataUserId || userId || '');
        const effectiveUsername = dataUsername || username;

        console.log(`[WaitingRoom] Join request - roomId: ${roomId}, userId: ${effectiveUserId}, username: ${effectiveUsername}`);

        if (!roomId) {
            socket.emit('waiting-room-error', { message: 'Room ID is required' });
            return;
        }

        if (!effectiveUserId || !effectiveUsername) {
            socket.emit('waiting-room-error', { message: 'User information is required' });
            return;
        }

        try {
            // Join the Socket.IO room
            socket.join(roomId);

            // Initialize or get existing room data
            if (!this.socketManager.gameRooms.has(roomId)) {
                // Load room from database
                const Room = (await import('../models/Room.js')).default;
                const dbRoom = await Room.findById(roomId);
                if (!dbRoom) {
                    socket.emit('waiting-room-error', { message: 'Room not found' });
                    return;
                }

                // Initialize room data in socket manager
                const roomData = {
                    gameId: roomId,
                    players: new Map(),
                    teams: { team1: [], team2: [] },
                    createdAt: new Date().toISOString(),
                    status: 'waiting',
                    hostId: String(dbRoom.owner_id)
                };
                this.socketManager.gameRooms.set(roomId, roomData);

                console.log(`[WaitingRoom] Initialized room: ${roomId} with host: ${dbRoom.owner_id}`);
            }

            const room = this.socketManager.gameRooms.get(roomId);

            // Check if player is already in the room (reconnection case)
            if (room.players.has(effectiveUserId)) {
                console.log(`[WaitingRoom] Player ${effectiveUsername} rejoining room: ${roomId}`);
                const existingPlayer = room.players.get(effectiveUserId);
                const wasDisconnected = !existingPlayer.isConnected;

                existingPlayer.socketId = socket.id;
                existingPlayer.isConnected = true;
                existingPlayer.reconnectedAt = new Date().toISOString();

                // Update socket mapping
                this.socketManager.userSockets.set(effectiveUserId, socket.id);
                this.socketManager.socketUsers.set(socket.id, effectiveUserId);

                // Broadcast reconnection if player was previously disconnected
                if (wasDisconnected) {
                    this.broadcastPlayerReconnected(roomId, effectiveUserId, effectiveUsername, room);
                }
            } else {
                // Check if room is full for new players
                if (room.players.size >= 4) {
                    socket.emit('waiting-room-error', { message: 'Room is full' });
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

                console.log(`[WaitingRoom] Added new player ${effectiveUsername} to room ${roomId}`);

                // Broadcast player joined to other players
                this.broadcastPlayerJoined(roomId, playerData, room);
            }

            // Send room state to the joining/rejoining player
            this.sendRoomState(socket, roomId, room);

        } catch (error) {
            console.error('[WaitingRoom] Error joining waiting room:', error);
            socket.emit('waiting-room-error', { message: 'Failed to join waiting room' });
        }
    }

    /**
     * Handle leaving a waiting room
     */
    async handleLeaveWaitingRoom(socket, data) {
        const { roomId } = data;
        const { userId, username } = socket;

        console.log(`[WaitingRoom] Leave request - roomId: ${roomId}, userId: ${userId}`);

        if (!roomId) {
            socket.emit('waiting-room-error', { message: 'Room ID is required' });
            return;
        }

        try {
            // Leave the Socket.IO room
            socket.leave(roomId);

            const room = this.socketManager.gameRooms.get(roomId);
            if (room && room.players.has(userId)) {
                const leavingPlayer = room.players.get(userId);
                const wasHost = String(room.hostId) === String(userId);

                // Remove player from room
                room.players.delete(userId);

                // Remove player from teams if assigned
                room.teams.team1 = room.teams.team1.filter(id => id !== userId);
                room.teams.team2 = room.teams.team2.filter(id => id !== userId);

                // Enhanced host transfer logic
                let newHostId = room.hostId;
                let hostTransferred = false;

                if (wasHost && room.players.size > 0) {
                    // Prioritize connected players for host transfer
                    const connectedPlayers = Array.from(room.players.values()).filter(p => p.isConnected);
                    const readyPlayers = connectedPlayers.filter(p => p.isReady);

                    // Prefer ready players, then connected players, then any player
                    let newHost = null;
                    if (readyPlayers.length > 0) {
                        newHost = readyPlayers[0];
                    } else if (connectedPlayers.length > 0) {
                        newHost = connectedPlayers[0];
                    } else {
                        newHost = Array.from(room.players.values())[0];
                    }

                    if (newHost) {
                        newHostId = String(newHost.userId);
                        room.hostId = newHostId;
                        hostTransferred = true;
                        console.log(`[WaitingRoom] Host transferred from ${userId} to ${newHostId} in room ${roomId}`);
                    }
                }

                console.log(`[WaitingRoom] ${username} left room: ${roomId} (was host: ${wasHost}, host transferred: ${hostTransferred})`);

                // Update database with enhanced error handling
                let dbUpdateSuccess = false;
                try {
                    const Room = (await import('../models/Room.js')).default;
                    const dbRoom = await Room.findById(roomId);
                    if (dbRoom) {
                        await dbRoom.removePlayer(userId);
                        dbUpdateSuccess = true;

                        // Update host in database if transferred
                        if (hostTransferred && newHostId !== room.hostId) {
                            try {
                                await dbRoom.updateWithVersionControl({ owner_id: newHostId });
                                console.log(`[WaitingRoom] Database host updated to ${newHostId} for room ${roomId}`);
                            } catch (hostUpdateError) {
                                console.error('[WaitingRoom] Failed to update host in database:', hostUpdateError);
                            }
                        }
                    }
                } catch (dbError) {
                    if (dbError.message.includes('concurrent update detected')) {
                        console.warn('[WaitingRoom] Concurrent update detected on player leave - this is normal during game transitions');
                    } else {
                        console.error('[WaitingRoom] Database update failed on leave:', dbError);
                    }
                }

                // Clean up socket mappings
                this.socketManager.userSockets.delete(userId);
                this.socketManager.socketUsers.delete(socket.id);

                // Broadcast player left to remaining players with enhanced data
                this.broadcastPlayerLeft(roomId, userId, username, room, newHostId, {
                    wasHost,
                    hostTransferred,
                    dbUpdateSuccess,
                    remainingPlayers: room.players.size
                });

                // Clean up empty rooms
                if (room.players.size === 0) {
                    this.socketManager.gameRooms.delete(roomId);
                    console.log(`[WaitingRoom] Cleaned up empty room: ${roomId}`);

                    // Optionally clean up database room if empty
                    try {
                        const Room = (await import('../models/Room.js')).default;
                        const dbRoom = await Room.findById(roomId);
                        if (dbRoom && dbRoom.players.length === 0) {
                            await dbRoom.delete();
                            console.log(`[WaitingRoom] Deleted empty room from database: ${roomId}`);
                        }
                    } catch (cleanupError) {
                        console.error('[WaitingRoom] Failed to cleanup empty room from database:', cleanupError);
                    }
                }
            }

            // Send confirmation to leaving player
            socket.emit('waiting-room-left', {
                roomId,
                success: true,
                message: 'Successfully left the room',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('[WaitingRoom] Error leaving waiting room:', error);
            socket.emit('waiting-room-error', {
                message: 'Failed to leave waiting room',
                code: 'LEAVE_ROOM_ERROR',
                details: error.message
            });
        }
    }

    /**
     * Handle ready status toggle
     */
    async handleToggleReadyStatus(socket, data) {
        const { roomId, isReady, userId: dataUserId, username: dataUsername } = data;
        const { userId, username } = socket;

        const effectiveUserId = String(dataUserId || userId || '');
        const effectiveUsername = dataUsername || username;

        console.log(`[WaitingRoom] Ready status toggle - roomId: ${roomId}, userId: ${effectiveUserId}, isReady: ${isReady}`);

        // Enhanced validation
        if (!roomId || typeof isReady !== 'boolean') {
            socket.emit('ready-toggle-error', { message: 'Room ID and ready status are required' });
            return;
        }

        if (!effectiveUserId || !effectiveUsername) {
            socket.emit('ready-toggle-error', { message: 'User information is required' });
            return;
        }

        try {
            const room = this.socketManager.gameRooms.get(roomId);
            if (!room) {
                socket.emit('ready-toggle-error', { message: 'Room not found' });
                return;
            }

            if (!room.players.has(effectiveUserId)) {
                socket.emit('ready-toggle-error', { message: 'Player not in room' });
                return;
            }

            const player = room.players.get(effectiveUserId);

            // Validate player connection status
            if (!player.isConnected) {
                socket.emit('ready-toggle-error', { message: 'Cannot change ready status while disconnected' });
                return;
            }

            // Validate room status
            if (room.status !== 'waiting') {
                socket.emit('ready-toggle-error', { message: 'Cannot change ready status - room is not waiting for players' });
                return;
            }

            // Check if ready status is actually changing
            if (player.isReady === isReady) {
                console.log(`[WaitingRoom] Ready status unchanged for ${effectiveUsername}: ${isReady}`);
                socket.emit('ready-status-confirmed', {
                    roomId,
                    isReady,
                    success: true,
                    dbSynced: true,
                    unchanged: true,
                    timestamp: new Date().toISOString()
                });
                return;
            }

            // Update database first
            let dbUpdateSuccess = false;
            try {
                const Room = (await import('../models/Room.js')).default;
                const dbRoom = await Room.findById(roomId);
                if (dbRoom) {
                    await dbRoom.setPlayerReady(effectiveUserId, isReady);
                    dbUpdateSuccess = true;
                }
            } catch (dbError) {
                console.error('[WaitingRoom] Database update failed for ready status:', dbError);
                // Continue with WebSocket update even if database fails
            }

            // Update websocket state
            player.isReady = isReady;
            player.lastReadyUpdate = new Date().toISOString();

            console.log(`[WaitingRoom] ${effectiveUsername} ready status set to ${isReady} (DB: ${dbUpdateSuccess})`);

            // Calculate game start eligibility
            const gameStartInfo = this.calculateGameStartEligibility(room);

            // Broadcast ready status change
            this.broadcastReadyStatusChanged(roomId, effectiveUserId, effectiveUsername, isReady, room, gameStartInfo, dbUpdateSuccess);

            // Send confirmation to requesting player
            socket.emit('ready-status-confirmed', {
                roomId,
                isReady,
                success: true,
                dbSynced: dbUpdateSuccess,
                gameStartInfo,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('[WaitingRoom] Error toggling ready status:', error);
            socket.emit('ready-toggle-error', {
                message: error.message || 'Failed to update ready status',
                code: 'READY_TOGGLE_ERROR'
            });
        }
    }

    /**
     * Handle game start request
     */
    async handleStartGameRequest(socket, data) {
        const { roomId } = data;
        const { userId, username } = socket;

        console.log(`[WaitingRoom] Game start request - roomId: ${roomId}, userId: ${userId}`);

        // Enhanced validation
        if (!roomId) {
            socket.emit('game-start-error', { message: 'Room ID is required' });
            return;
        }

        if (!userId || !username) {
            socket.emit('game-start-error', { message: 'User information is required' });
            return;
        }

        try {
            const room = this.socketManager.gameRooms.get(roomId);
            if (!room) {
                socket.emit('game-start-error', { message: 'Room not found' });
                return;
            }

            if (!room.players.has(userId)) {
                socket.emit('game-start-error', { message: 'Player not in room' });
                return;
            }

            // Check if user is the host
            if (String(room.hostId) !== String(userId)) {
                socket.emit('game-start-error', { message: 'Only the host can start the game' });
                return;
            }

            // Check if room is in correct status
            if (room.status !== 'waiting') {
                socket.emit('game-start-error', { message: 'Room is not in waiting status' });
                return;
            }

            // Validate game start conditions with detailed feedback
            const gameStartInfo = this.calculateGameStartEligibility(room);
            if (!gameStartInfo.canStartGame) {
                socket.emit('game-start-error', {
                    message: gameStartInfo.reason,
                    details: {
                        connectedPlayers: gameStartInfo.totalConnected,
                        readyPlayers: gameStartInfo.readyCount,
                        requiredReady: gameStartInfo.totalConnected
                    }
                });
                return;
            }

            // Prevent double game starts
            if (room.status === 'starting') {
                socket.emit('game-start-error', { message: 'Game is already starting' });
                return;
            }

            // Update room status immediately to prevent race conditions
            room.status = 'starting';
            room.gameStartedBy = userId;
            room.gameStartedAt = new Date().toISOString();

            console.log(`[WaitingRoom] Game start validated for room ${roomId} by ${username}`);

            // Add bots if needed to reach 4 players
            const connectedPlayers = Array.from(room.players.values()).filter(p => p.isConnected);
            const botsNeeded = 4 - connectedPlayers.length;

            if (botsNeeded > 0) {
                console.log(`[WaitingRoom] Adding ${botsNeeded} bots to room ${roomId}`);
                await this.addBotsToRoom(room, roomId, botsNeeded);
            }

            // Create game with team formation and database entries
            let game = null;
            let teams = null;
            let dbUpdateSuccess = false;

            try {
                const Room = (await import('../models/Room.js')).default;
                const dbRoom = await Room.findById(roomId);
                if (dbRoom) {
                    // Create game (this will form teams and create database entries)
                    game = await dbRoom.createGame();
                    teams = {
                        team1: game.teams.find(t => t.team_number === 1)?.players || [],
                        team2: game.teams.find(t => t.team_number === 2)?.players || []
                    };

                    // Update WebSocket room state with team assignments
                    this.updateWebSocketTeamAssignments(room, teams);

                    // Initialize WebSocket room for the new game
                    await this.initializeGameWebSocketRoom(game.game_id, room, game);
                    
                    dbUpdateSuccess = true;
                    console.log(`[WaitingRoom] Game ${game.game_code} created successfully from room ${roomId}`);
                }
            } catch (dbError) {
                console.error('[WaitingRoom] Game creation failed:', dbError);

                // Fallback: form teams in WebSocket only
                const allPlayers = Array.from(room.players.values()).filter(p => p.isConnected);
                if (allPlayers.length >= 2) {
                    const hasTeamAssignments = allPlayers.every(p => p.teamAssignment !== null);
                    if (!hasTeamAssignments) {
                        teams = await this.formTeamsWebSocketOnly(room);
                    } else {
                        teams = this.getExistingTeams(room);
                    }
                }
            }

            console.log(`[WaitingRoom] Game starting in room ${roomId} by ${username} (DB: ${dbUpdateSuccess})`);

            // Broadcast game start to all players with game information
            this.broadcastGameStarting(roomId, userId, username, teams, room, game, dbUpdateSuccess);

        } catch (error) {
            console.error('[WaitingRoom] Error starting game:', error);

            // Reset room status on error
            const room = this.socketManager.gameRooms.get(roomId);
            if (room && room.status === 'starting') {
                room.status = 'waiting';
            }

            socket.emit('game-start-error', {
                message: error.message || 'Failed to start game',
                code: 'GAME_START_ERROR'
            });
        }
    }

    /**
     * Handle player disconnection
     */
    handlePlayerDisconnected(socket, data) {
        const { roomId, userId: disconnectedUserId } = data;
        const { userId, username } = socket;

        console.log(`[WaitingRoom] Player disconnected - roomId: ${roomId}, disconnectedUserId: ${disconnectedUserId}`);

        try {
            const room = this.socketManager.gameRooms.get(roomId);
            if (room && room.players.has(disconnectedUserId)) {
                const player = room.players.get(disconnectedUserId);
                const wasHost = String(room.hostId) === String(disconnectedUserId);

                player.isConnected = false;
                player.disconnectedAt = new Date().toISOString();

                // Broadcast disconnection to other players
                this.broadcastPlayerDisconnected(roomId, disconnectedUserId, player.username, room);

                // Set up cleanup timer for disconnected players (remove after 2 minutes in waiting room)
                setTimeout(() => {
                    this.handleDisconnectedPlayerCleanup(roomId, disconnectedUserId, player.username, wasHost);
                }, 2 * 60 * 1000); // 2 minutes timeout for waiting room
            }
        } catch (error) {
            console.error('[WaitingRoom] Error handling player disconnection:', error);
        }
    }

    /**
     * Handle cleanup of disconnected players after timeout
     */
    async handleDisconnectedPlayerCleanup(roomId, userId, username, wasHost) {
        try {
            const room = this.socketManager.gameRooms.get(roomId);
            if (!room || !room.players.has(userId)) {
                return; // Player already removed or room doesn't exist
            }

            const player = room.players.get(userId);
            if (player.isConnected) {
                return; // Player reconnected, no cleanup needed
            }

            console.log(`[WaitingRoom] Cleaning up disconnected player ${username} from room ${roomId} after timeout`);

            // Remove player from room
            room.players.delete(userId);

            // Remove player from teams if assigned
            room.teams.team1 = room.teams.team1.filter(id => id !== userId);
            room.teams.team2 = room.teams.team2.filter(id => id !== userId);

            // Enhanced host transfer logic if the disconnected player was host
            let newHostId = room.hostId;
            let hostTransferred = false;

            if (wasHost && room.players.size > 0) {
                // Prioritize connected players for host transfer
                const connectedPlayers = Array.from(room.players.values()).filter(p => p.isConnected);
                const readyPlayers = connectedPlayers.filter(p => p.isReady);

                // Prefer ready players, then connected players, then any player
                let newHost = null;
                if (readyPlayers.length > 0) {
                    newHost = readyPlayers[0];
                } else if (connectedPlayers.length > 0) {
                    newHost = connectedPlayers[0];
                } else {
                    newHost = Array.from(room.players.values())[0];
                }

                if (newHost) {
                    newHostId = String(newHost.userId);
                    room.hostId = newHostId;
                    hostTransferred = true;
                    console.log(`[WaitingRoom] Host transferred from disconnected ${userId} to ${newHostId} in room ${roomId}`);
                }
            }

            // Update database
            let dbUpdateSuccess = false;
            try {
                const dbRoom = await Room.findById(roomId);
                if (dbRoom) {
                    await dbRoom.removePlayer(userId);
                    dbUpdateSuccess = true;

                    // Update host in database if transferred
                    if (hostTransferred && newHostId !== room.hostId) {
                        try {
                            await dbRoom.updateWithVersionControl({ owner_id: newHostId });
                            console.log(`[WaitingRoom] Database host updated to ${newHostId} for room ${roomId} after cleanup`);
                        } catch (hostUpdateError) {
                            console.error('[WaitingRoom] Failed to update host in database during cleanup:', hostUpdateError);
                        }
                    }
                }
            } catch (dbError) {
                console.error('[WaitingRoom] Database update failed during cleanup:', dbError);
            }

            // Clean up socket mappings
            this.socketManager.userSockets.delete(userId);

            // Broadcast player removal to remaining players
            this.broadcastPlayerLeft(roomId, userId, username, room, newHostId, {
                wasHost,
                hostTransferred,
                dbUpdateSuccess,
                remainingPlayers: room.players.size,
                reason: 'disconnection_timeout'
            });

            // Clean up empty rooms
            if (room.players.size === 0) {
                this.socketManager.gameRooms.delete(roomId);
                console.log(`[WaitingRoom] Cleaned up empty room after disconnection timeout: ${roomId}`);

                // Clean up database room if empty
                try {
                    const dbRoom = await Room.findById(roomId);
                    if (dbRoom && dbRoom.players.length === 0) {
                        await dbRoom.delete();
                        console.log(`[WaitingRoom] Deleted empty room from database after cleanup: ${roomId}`);
                    }
                } catch (cleanupError) {
                    console.error('[WaitingRoom] Failed to cleanup empty room from database:', cleanupError);
                }
            }

        } catch (error) {
            console.error('[WaitingRoom] Error during disconnected player cleanup:', error);
        }
    }

    /**
     * Form teams automatically (2 teams of 2 players each)
     */
    async formTeams(roomId) {
        try {
            const dbRoom = await Room.findById(roomId);
            if (!dbRoom) {
                throw new Error('Room not found in database');
            }

            const teams = await dbRoom.formTeams();

            // Update websocket room state
            const room = this.socketManager.gameRooms.get(roomId);
            if (room) {
                this.updateWebSocketTeamAssignments(room, teams);
            }

            console.log(`[WaitingRoom] Teams formed for room ${roomId}`);
            return teams;
        } catch (error) {
            console.error('[WaitingRoom] Error forming teams:', error);
            throw error;
        }
    }

    /**
     * Form teams in WebSocket only (fallback when database fails)
     */
    async formTeamsWebSocketOnly(room) {
        try {
            const connectedPlayers = Array.from(room.players.values()).filter(p => p.isConnected);

            if (connectedPlayers.length < 2) {
                throw new Error('Need at least 2 connected players for team formation');
            }

            // Shuffle players for random team assignment
            const shuffledPlayers = [...connectedPlayers];
            for (let i = shuffledPlayers.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffledPlayers[i], shuffledPlayers[j]] = [shuffledPlayers[j], shuffledPlayers[i]];
            }

            let team1Players, team2Players;

            if (connectedPlayers.length === 4) {
                team1Players = shuffledPlayers.slice(0, 2);
                team2Players = shuffledPlayers.slice(2, 4);
            } else if (connectedPlayers.length === 3) {
                team1Players = shuffledPlayers.slice(0, 2);
                team2Players = shuffledPlayers.slice(2, 3);
            } else {
                team1Players = [shuffledPlayers[0]];
                team2Players = [shuffledPlayers[1]];
            }

            // Update WebSocket room state
            room.teams.team1 = team1Players.map(p => p.userId);
            room.teams.team2 = team2Players.map(p => p.userId);

            // Update player team assignments
            for (const player of team1Players) {
                if (room.players.has(player.userId)) {
                    room.players.get(player.userId).teamAssignment = 1;
                }
            }
            for (const player of team2Players) {
                if (room.players.has(player.userId)) {
                    room.players.get(player.userId).teamAssignment = 2;
                }
            }

            const teams = {
                team1: team1Players.map(p => ({ id: p.userId, username: p.username })),
                team2: team2Players.map(p => ({ id: p.userId, username: p.username }))
            };

            console.log(`[WaitingRoom] Teams formed in WebSocket only for room ${room.gameId}`);
            return teams;
        } catch (error) {
            console.error('[WaitingRoom] Error forming teams in WebSocket:', error);
            throw error;
        }
    }

    /**
     * Add bots to room to fill empty slots
     */
    async addBotsToRoom(room, roomId, botsNeeded) {
        try {
            // Create bots for this game
            const bots = BotManager.createBotsForGame(roomId, botsNeeded, {
                difficulty: 'medium',
                names: ['Bot Alpha', 'Bot Beta', 'Bot Gamma'].slice(0, botsNeeded)
            });

            // Add bots to WebSocket room state first
            for (const bot of bots) {
                const botPlayerData = {
                    userId: bot.id,
                    username: bot.name,
                    isReady: true, // Bots are always ready
                    isConnected: true,
                    teamAssignment: null,
                    isBot: true
                };

                room.players.set(bot.id, botPlayerData);
            }

            // Store bots in database - first create users, then add to room
            let botsStoredInDatabase = false;
            try {
                // Step 1: Create bot users with unique identifiers
                for (const bot of bots) {
                    const botData = bot.toDatabaseFormat();
                    const uniqueUsername = `${botData.username}_${botData.user_id.slice(-8)}`;
                    const uniqueEmail = `${botData.user_id}@bot.local`;
                    
                    await dbConnection.query(`
                        INSERT INTO users (user_id, username, email, password_hash, created_at)
                        VALUES (?, ?, ?, ?, NOW())
                        ON DUPLICATE KEY UPDATE
                        username = VALUES(username),
                        email = VALUES(email)
                    `, [
                        botData.user_id,
                        uniqueUsername,
                        uniqueEmail,
                        'BOT_NO_PASSWORD'
                    ]);
                    
                    console.log(`[WaitingRoom] Created bot user ${uniqueUsername} (${botData.user_id})`);
                }
                
                // Step 2: Add bots to room_players
                const dbRoom = await Room.findById(roomId);
                if (dbRoom) {
                    for (const bot of bots) {
                        await dbRoom.addPlayer(bot.id, bot.name, true); // true indicates bot
                    }
                    console.log(`[WaitingRoom] Added ${bots.length} bots to database room ${roomId}`);
                }
                
                botsStoredInDatabase = true;
                
            } catch (dbError) {
                console.error('[WaitingRoom] Failed to store bots in database:', dbError);
                console.warn('[WaitingRoom] Bots will work in WebSocket-only mode');
                // Continue with WebSocket-only bots
            }

            console.log(`[WaitingRoom] Added ${bots.length} bots to room ${roomId}`);

            // Broadcast bot additions to all players
            this.broadcastBotsAdded(roomId, bots);

        } catch (error) {
            console.error('[WaitingRoom] Error adding bots to room:', error);
            console.error('[WaitingRoom] Failed to add bots to database room:', error);
            throw new Error(`Failed to add bots to room: ${error.message}`);
        }
    }

    /**
     * Broadcast bot additions to all players in room
     */
    broadcastBotsAdded(roomId, bots) {
        const botData = bots.map(bot => ({
            userId: bot.id,
            username: bot.name,
            isReady: true,
            isConnected: true,
            isBot: true
        }));

        this.io.to(roomId).emit('bots-added', {
            roomId,
            bots: botData,
            message: `${bots.length} bot${bots.length > 1 ? 's' : ''} joined the game`,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Update WebSocket room state with team assignments
     */
    updateWebSocketTeamAssignments(room, teams) {
        room.teams.team1 = teams.team1.map(p => p.id);
        room.teams.team2 = teams.team2.map(p => p.id);

        // Update player team assignments in websocket state
        for (const player of teams.team1) {
            if (room.players.has(player.id)) {
                room.players.get(player.id).teamAssignment = 1;
            }
        }
        for (const player of teams.team2) {
            if (room.players.has(player.id)) {
                room.players.get(player.id).teamAssignment = 2;
            }
        }
    }

    /**
     * Get existing teams from room state
     */
    getExistingTeams(room) {
        const team1Players = [];
        const team2Players = [];

        for (const [playerId, player] of room.players.entries()) {
            if (player.teamAssignment === 1) {
                team1Players.push({ id: playerId, username: player.username });
            } else if (player.teamAssignment === 2) {
                team2Players.push({ id: playerId, username: player.username });
            }
        }

        return {
            team1: team1Players,
            team2: team2Players
        };
    }

    /**
     * Calculate if game can be started
     */
    calculateGameStartEligibility(room) {
        const players = Array.from(room.players.values());
        const connectedPlayers = players.filter(p => p.isConnected);
        const readyPlayers = connectedPlayers.filter(p => p.isReady);
        const readyCount = readyPlayers.length;
        const allConnectedReady = connectedPlayers.every(p => p.isReady) && connectedPlayers.length >= 2;

        let canStartGame = false;
        let reason = '';

        if (connectedPlayers.length < 2) {
            reason = 'Need at least 2 connected players';
        } else if (!allConnectedReady) {
            reason = `${readyCount}/${connectedPlayers.length} players ready`;
        } else {
            // Game can start with 2+ ready players, bots will fill remaining slots
            canStartGame = true;
            const botsNeeded = 4 - connectedPlayers.length;
            if (botsNeeded > 0) {
                reason = `Ready to start with ${connectedPlayers.length} players + ${botsNeeded} bots!`;
            } else {
                reason = 'Ready to start!';
            }
        }

        return {
            canStartGame,
            reason,
            readyCount,
            totalConnected: connectedPlayers.length,
            allReady: allConnectedReady,
            botsNeeded: Math.max(0, 4 - connectedPlayers.length)
        };
    }

    // Broadcasting methods
    broadcastPlayerJoined(roomId, playerData, room) {
        const roomPlayers = this.getRoomPlayersArray(room);

        this.io.to(roomId).emit('waiting-room-player-joined', {
            roomId,
            player: {
                userId: playerData.userId,
                username: playerData.username,
                isReady: playerData.isReady,
                teamAssignment: playerData.teamAssignment,
                isConnected: playerData.isConnected
            },
            players: roomPlayers,
            playerCount: room.players.size,
            timestamp: new Date().toISOString()
        });
    }

    broadcastPlayerLeft(roomId, playerId, playerName, room, newHostId, metadata = {}) {
        const roomPlayers = this.getRoomPlayersArray(room);
        const gameStartInfo = this.calculateGameStartEligibility(room);

        this.io.to(roomId).emit('waiting-room-player-left', {
            roomId,
            playerId,
            playerName,
            players: roomPlayers,
            teams: this.getTeamsForBroadcast(room),
            newHostId,
            playerCount: room.players.size,
            connectedPlayers: gameStartInfo.totalConnected,
            readyCount: gameStartInfo.readyCount,
            canStartGame: gameStartInfo.canStartGame,
            gameStartReason: gameStartInfo.reason,
            hostTransferred: metadata.hostTransferred || false,
            wasHost: metadata.wasHost || false,
            dbUpdateSuccess: metadata.dbUpdateSuccess || false,
            remainingPlayers: metadata.remainingPlayers || room.players.size,
            timestamp: new Date().toISOString()
        });

        // Send specific host transfer notification if applicable
        if (metadata.hostTransferred && newHostId) {
            const newHost = room.players.get(newHostId);
            if (newHost) {
                this.io.to(roomId).emit('waiting-room-host-transferred', {
                    roomId,
                    previousHostId: playerId,
                    previousHostName: playerName,
                    newHostId,
                    newHostName: newHost.username,
                    reason: 'previous_host_left',
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    broadcastPlayerReconnected(roomId, playerId, playerName, room) {
        const roomPlayers = this.getRoomPlayersArray(room);

        this.io.to(roomId).emit('waiting-room-player-reconnected', {
            roomId,
            playerId,
            playerName,
            players: roomPlayers,
            teams: this.getTeamsForBroadcast(room),
            timestamp: new Date().toISOString()
        });
    }

    broadcastPlayerDisconnected(roomId, playerId, playerName, room) {
        const roomPlayers = this.getRoomPlayersArray(room);

        this.io.to(roomId).emit('waiting-room-player-disconnected', {
            roomId,
            playerId,
            playerName,
            players: roomPlayers,
            timestamp: new Date().toISOString()
        });
    }

    broadcastReadyStatusChanged(roomId, playerId, playerName, isReady, room, gameStartInfo, dbSynced) {
        const roomPlayers = this.getRoomPlayersArray(room);

        this.io.to(roomId).emit('waiting-room-ready-changed', {
            roomId,
            playerId,
            playerName,
            isReady,
            players: roomPlayers,
            readyCount: gameStartInfo.readyCount,
            totalPlayers: room.players.size,
            connectedPlayers: gameStartInfo.totalConnected,
            allReady: gameStartInfo.allReady,
            canStartGame: gameStartInfo.canStartGame,
            gameStartReason: gameStartInfo.reason,
            dbSynced,
            timestamp: new Date().toISOString()
        });
    }

    broadcastGameStarting(roomId, startedBy, startedByName, teams, room, game = null, dbSynced = false) {
        const roomPlayers = this.getRoomPlayersArray(room);

        // Prepare game information
        const gameInfo = game ? {
            gameId: game.game_id,
            gameCode: game.game_code,
            status: game.status,
            targetScore: game.target_score
        } : null;

        // Determine redirect URL - use game ID if available, otherwise room parameter
        const redirectUrl = game ? `/game.html?gameId=${game.game_id}` : `/game.html?room=${roomId}`;

        this.io.to(roomId).emit('waiting-room-game-starting', {
            roomId,
            startedBy,
            startedByName,
            players: roomPlayers,
            teams,
            game: gameInfo,
            redirectUrl,
            dbSynced,
            roomStatus: room.status,
            timestamp: new Date().toISOString()
        });

        // Send individual navigation commands to ensure all players redirect
        setTimeout(() => {
            this.sendNavigationCommands(roomId, redirectUrl);
        }, 1500); // Give players time to see the "game starting" message
    }

    /**
     * Send navigation commands to all players in the room
     */
    sendNavigationCommands(roomId, redirectUrl) {
        this.io.to(roomId).emit('navigate-to-game', {
            roomId,
            redirectUrl,
            timestamp: new Date().toISOString()
        });

        console.log(`[WaitingRoom] Navigation commands sent to room ${roomId}: ${redirectUrl}`);
    }

    /**
     * Initialize WebSocket room for a newly created game
     */
    async initializeGameWebSocketRoom(gameId, waitingRoom, game) {
        try {
            // Create game room data structure
            const gameRoomData = {
                gameId: gameId,
                players: new Map(),
                teams: { team1: [], team2: [] },
                createdAt: new Date().toISOString(),
                status: 'in_progress',
                hostId: waitingRoom.hostId
            };

            // Copy players from waiting room to game room
            for (const [playerId, playerData] of waitingRoom.players.entries()) {
                gameRoomData.players.set(playerId, {
                    ...playerData,
                    gameId: gameId
                });
                
                // Add to appropriate team
                if (playerData.teamAssignment === 1) {
                    gameRoomData.teams.team1.push(playerId);
                } else if (playerData.teamAssignment === 2) {
                    gameRoomData.teams.team2.push(playerId);
                }
            }

            // Set the game room in the socket manager
            this.socketManager.gameRooms.set(gameId, gameRoomData);

            // Initialize game state
            this.socketManager.gameStateManager.initializeGameState(gameId, {
                status: 'in_progress',
                phase: 'lobby',
                hostId: waitingRoom.hostId,
                players: Object.fromEntries(gameRoomData.players),
                teams: gameRoomData.teams
            });

            console.log(`[WaitingRoom] Initialized WebSocket room for game ${gameId} with ${gameRoomData.players.size} players`);

        } catch (error) {
            console.error(`[WaitingRoom] Failed to initialize WebSocket room for game ${gameId}:`, error);
            throw error;
        }
    }

    // Helper methods
    sendRoomState(socket, roomId, room) {
        const roomPlayers = this.getRoomPlayersArray(room);
        const gameStartInfo = this.calculateGameStartEligibility(room);

        socket.emit('waiting-room-joined', {
            roomId,
            players: roomPlayers,
            teams: this.getTeamsForBroadcast(room),
            roomStatus: room.status,
            hostId: room.hostId,
            playerCount: room.players.size,
            maxPlayers: 4,
            canStartGame: gameStartInfo.canStartGame,
            gameStartReason: gameStartInfo.reason,
            timestamp: new Date().toISOString()
        });
    }

    getRoomPlayersArray(room) {
        return Array.from(room.players.values()).map(p => ({
            userId: p.userId,
            username: p.username,
            isReady: p.isReady,
            teamAssignment: p.teamAssignment,
            isConnected: p.isConnected
        }));
    }

    getTeamsForBroadcast(room) {
        return {
            team1: room.teams.team1.map(playerId => {
                const player = room.players.get(playerId);
                return { userId: playerId, username: player ? player.username : 'Unknown' };
            }),
            team2: room.teams.team2.map(playerId => {
                const player = room.players.get(playerId);
                return { userId: playerId, username: player ? player.username : 'Unknown' };
            })
        };
    }
}

export default WaitingRoomSocketHandler;
