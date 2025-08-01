import Room from '../models/Room.js';

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
                // Remove player from room
                room.players.delete(userId);

                // Remove player from teams if assigned
                room.teams.team1 = room.teams.team1.filter(id => id !== userId);
                room.teams.team2 = room.teams.team2.filter(id => id !== userId);

                // Transfer host if the leaving player was the host
                let newHostId = room.hostId;
                if (String(room.hostId) === String(userId) && room.players.size > 0) {
                    newHostId = String(Array.from(room.players.keys())[0]);
                    room.hostId = newHostId;
                }

                console.log(`[WaitingRoom] ${username} left room: ${roomId}`);

                // Update database
                try {
                    const dbRoom = await Room.findById(roomId);
                    if (dbRoom) {
                        await dbRoom.removePlayer(userId);
                    }
                } catch (dbError) {
                    console.error('[WaitingRoom] Database update failed on leave:', dbError);
                }

                // Broadcast player left to remaining players
                this.broadcastPlayerLeft(roomId, userId, username, room, newHostId);

                // Clean up empty rooms
                if (room.players.size === 0) {
                    this.socketManager.gameRooms.delete(roomId);
                    console.log(`[WaitingRoom] Cleaned up empty room: ${roomId}`);
                }
            }

            socket.emit('waiting-room-left', { roomId, timestamp: new Date().toISOString() });

        } catch (error) {
            console.error('[WaitingRoom] Error leaving waiting room:', error);
            socket.emit('waiting-room-error', { message: 'Failed to leave waiting room' });
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

            // Form teams if we have connected players and teams aren't formed yet
            let teams = null;
            const connectedPlayers = Array.from(room.players.values()).filter(p => p.isConnected);
            
            if (connectedPlayers.length >= 2) {
                const hasTeamAssignments = connectedPlayers.every(p => p.teamAssignment !== null);
                if (!hasTeamAssignments) {
                    teams = await this.formTeams(roomId);
                } else {
                    teams = this.getExistingTeams(room);
                }
            }

            // Update database
            let dbUpdateSuccess = false;
            try {
                const dbRoom = await Room.findById(roomId);
                if (dbRoom) {
                    await dbRoom.updateStatus('playing');
                    dbUpdateSuccess = true;
                }
            } catch (dbError) {
                console.error('[WaitingRoom] Database update failed on game start:', dbError);
                // Continue with game start even if database update fails
            }

            console.log(`[WaitingRoom] Game starting in room ${roomId} by ${username} (DB: ${dbUpdateSuccess})`);

            // Broadcast game start to all players
            this.broadcastGameStarting(roomId, userId, username, teams, room, dbUpdateSuccess);

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
                player.isConnected = false;
                player.disconnectedAt = new Date().toISOString();

                // Broadcast disconnection to other players
                this.broadcastPlayerDisconnected(roomId, disconnectedUserId, player.username, room);
            }
        } catch (error) {
            console.error('[WaitingRoom] Error handling player disconnection:', error);
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

            console.log(`[WaitingRoom] Teams formed for room ${roomId}`);
            return teams;
        } catch (error) {
            console.error('[WaitingRoom] Error forming teams:', error);
            throw error;
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
        } else if (connectedPlayers.length === 4) {
            // For 4-player games, teams will be formed automatically on start
            canStartGame = true;
            reason = 'Ready to start!';
        } else {
            canStartGame = true;
            reason = 'Ready to start!';
        }

        return {
            canStartGame,
            reason,
            readyCount,
            totalConnected: connectedPlayers.length,
            allReady: allConnectedReady
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

    broadcastPlayerLeft(roomId, playerId, playerName, room, newHostId) {
        const roomPlayers = this.getRoomPlayersArray(room);

        this.io.to(roomId).emit('waiting-room-player-left', {
            roomId,
            playerId,
            playerName,
            players: roomPlayers,
            teams: this.getTeamsForBroadcast(room),
            newHostId,
            playerCount: room.players.size,
            timestamp: new Date().toISOString()
        });
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

    broadcastGameStarting(roomId, startedBy, startedByName, teams, room, dbSynced = false) {
        const roomPlayers = this.getRoomPlayersArray(room);

        this.io.to(roomId).emit('waiting-room-game-starting', {
            roomId,
            startedBy,
            startedByName,
            players: roomPlayers,
            teams,
            redirectUrl: `/game.html?roomId=${roomId}`,
            dbSynced,
            roomStatus: room.status,
            timestamp: new Date().toISOString()
        });
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