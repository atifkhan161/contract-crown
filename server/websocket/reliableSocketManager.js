/**
 * Reliable Socket Manager
 * Integrates WebsocketReliabilityLayer with the existing SocketManager
 * to provide reliable event delivery with retry mechanisms and HTTP fallback
 */

import WebsocketReliabilityLayer from '../src/services/WebsocketReliabilityLayer.js';

class ReliableSocketManager {
    constructor(socketManager) {
        this.socketManager = socketManager;
        this.reliabilityLayer = new WebsocketReliabilityLayer(socketManager.io, socketManager);
        
        // Track original emit methods
        this.originalEmit = socketManager.io.emit.bind(socketManager.io);
        this.originalToEmit = null;
        
        // Wrap socket manager methods with reliability layer
        this.wrapSocketManagerMethods();
        this.setupEventConfirmationHandlers();
        
        console.log('[ReliableSocketManager] Initialized with reliability layer');
    }

    /**
     * Wrap socket manager methods to use reliable event delivery
     */
    wrapSocketManagerMethods() {
        // Wrap handlePlayerReady with enhanced reliability
        const originalHandlePlayerReady = this.socketManager.handlePlayerReady.bind(this.socketManager);
        this.socketManager.handlePlayerReady = async (socket, data) => {
            try {
                // Execute original method (which now includes fallback handling)
                await originalHandlePlayerReady(socket, data);
                
                // The original method now handles its own broadcasting and fallback
                // This wrapper just adds additional reliability monitoring
                console.log(`[ReliableSocketManager] Ready status update completed for ${data.userId || socket.userId}`);
                
            } catch (error) {
                console.error('[ReliableSocketManager] Error in handlePlayerReady:', error);
                
                // Try to provide fallback through HTTP API notification
                try {
                    socket.emit('ready-status-fallback-required', {
                        gameId: data.gameId,
                        userId: data.userId || socket.userId,
                        isReady: data.isReady,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    });
                } catch (fallbackError) {
                    console.error('[ReliableSocketManager] Fallback notification failed:', fallbackError);
                }
                
                socket.emit('error', { 
                    message: 'Failed to update ready status',
                    fallbackAvailable: true,
                    details: error.message 
                });
            }
        };

        // Wrap handleFormTeams
        const originalHandleFormTeams = this.socketManager.handleFormTeams.bind(this.socketManager);
        this.socketManager.handleFormTeams = async (socket, data) => {
            try {
                // Execute original method
                await originalHandleFormTeams(socket, data);
                
                // Use reliable delivery for the response
                const room = this.socketManager.gameRooms.get(data.gameId);
                if (room) {
                    const players = Array.from(room.players.values());
                    const teamFormationData = {
                        gameId: data.gameId,
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
                        players: players.map(p => ({
                            userId: p.userId,
                            username: p.username,
                            isReady: p.isReady,
                            teamAssignment: p.teamAssignment,
                            isConnected: p.isConnected
                        })),
                        formedBy: socket.username,
                        timestamp: new Date().toISOString()
                    };
                    
                    // Send both event names for backward compatibility
                    await Promise.all([
                        this.reliabilityLayer.emitWithRetry(data.gameId, 'teams-formed', teamFormationData),
                        this.reliabilityLayer.emitWithRetry(data.gameId, 'teamsFormed', teamFormationData)
                    ]);
                }
            } catch (error) {
                console.error('[ReliableSocketManager] Error in handleFormTeams:', error);
                socket.emit('error', { message: 'Failed to form teams' });
            }
        };

        // Wrap handleJoinGameRoom
        const originalHandleJoinGameRoom = this.socketManager.handleJoinGameRoom.bind(this.socketManager);
        this.socketManager.handleJoinGameRoom = async (socket, data) => {
            try {
                // Execute original method
                await originalHandleJoinGameRoom(socket, data);
                
                // Use reliable delivery for broadcasting player joined
                const room = this.socketManager.gameRooms.get(data.gameId);
                if (room) {
                    const effectiveUserId = String(data.userId || socket.userId || '');
                    const effectiveUsername = data.username || socket.username;
                    
                    // Only broadcast if this is a new player (not a reconnection)
                    const player = room.players.get(effectiveUserId);
                    if (player && !player.reconnectedAt) {
                        await this.reliabilityLayer.emitWithRetry(
                            data.gameId,
                            'player-joined',
                            {
                                gameId: data.gameId,
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
                            }
                        );
                    }
                }
            } catch (error) {
                console.error('[ReliableSocketManager] Error in handleJoinGameRoom:', error);
                socket.emit('error', { message: 'Failed to join game room' });
            }
        };

        // Wrap handleStartGame
        const originalHandleStartGame = this.socketManager.handleStartGame.bind(this.socketManager);
        this.socketManager.handleStartGame = async (socket, data) => {
            try {
                // Execute original method
                await originalHandleStartGame(socket, data);
                
                // Use reliable delivery for game starting event
                const room = this.socketManager.gameRooms.get(data.gameId);
                if (room) {
                    const players = Array.from(room.players.values());
                    
                    await this.reliabilityLayer.emitWithRetry(
                        data.gameId,
                        'game-starting',
                        {
                            gameId: data.gameId,
                            startedBy: socket.username,
                            startedById: socket.userId,
                            players: players.map(p => ({
                                userId: p.userId,
                                username: p.username,
                                teamAssignment: p.teamAssignment
                            })),
                            teams: room.teams,
                            playerCount: players.length,
                            timestamp: new Date().toISOString()
                        }
                    );
                }
            } catch (error) {
                console.error('[ReliableSocketManager] Error in handleStartGame:', error);
                socket.emit('error', { message: 'Failed to start game' });
            }
        };

        // Wrap handleLeaveGameRoom
        const originalHandleLeaveGameRoom = this.socketManager.handleLeaveGameRoom.bind(this.socketManager);
        this.socketManager.handleLeaveGameRoom = async (socket, data) => {
            try {
                const room = this.socketManager.gameRooms.get(data.gameId);
                const playerName = socket.username;
                const playerId = socket.userId;
                
                // Execute original method
                await originalHandleLeaveGameRoom(socket, data);
                
                // Use reliable delivery for player left event
                if (room) {
                    await this.reliabilityLayer.emitWithRetry(
                        data.gameId,
                        'player-left',
                        {
                            gameId: data.gameId,
                            playerId: playerId,
                            playerName: playerName,
                            players: Array.from(room.players.values()).map(p => ({
                                userId: p.userId,
                                username: p.username,
                                isReady: p.isReady,
                                teamAssignment: p.teamAssignment,
                                isConnected: p.isConnected
                            })),
                            teams: room.teams,
                            newHostId: room.hostId,
                            playerCount: room.players.size,
                            timestamp: new Date().toISOString()
                        }
                    );
                }
            } catch (error) {
                console.error('[ReliableSocketManager] Error in handleLeaveGameRoom:', error);
                socket.emit('error', { message: 'Failed to leave game room' });
            }
        };
    }

    /**
     * Set up event confirmation handlers
     */
    setupEventConfirmationHandlers() {
        // Add event confirmation handler to all new socket connections
        const originalHandleConnection = this.socketManager.handleConnection.bind(this.socketManager);
        this.socketManager.handleConnection = (socket) => {
            // Execute original connection handler
            originalHandleConnection(socket);
            
            // Add event confirmation handler
            socket.on('event-confirmation', (data) => {
                if (data.eventId) {
                    this.reliabilityLayer.confirmEventDelivery(data.eventId);
                }
            });

            // Add fallback request handler
            socket.on('request-fallback', async (data) => {
                console.log(`[ReliableSocketManager] Fallback requested for ${data.eventType} by ${socket.username}`);
                
                if (data.gameId) {
                    // Trigger state refresh
                    socket.emit('state-refresh-required', {
                        gameId: data.gameId,
                        reason: 'client_fallback_request',
                        timestamp: new Date().toISOString()
                    });
                }
            });

            // Add connection health check handler
            socket.on('connection-health-check', () => {
                socket.emit('connection-health-response', {
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    reliabilityEnabled: true
                });
            });
        };
    }

    /**
     * Emit event with reliability layer
     * @param {string} target - Target (room ID or socket ID)
     * @param {string} eventType - Event type
     * @param {Object} eventData - Event data
     * @param {Object} options - Options
     * @returns {Promise<boolean>} Success status
     */
    async emitReliable(target, eventType, eventData, options = {}) {
        return await this.reliabilityLayer.emitWithRetry(target, eventType, eventData, options);
    }

    /**
     * Broadcast state synchronization event
     * @param {string} gameId - Game ID
     * @param {Object} reconciledState - Reconciled state
     * @param {string} trigger - What triggered the sync
     */
    async broadcastStateSynchronization(gameId, reconciledState, trigger) {
        const room = this.socketManager.gameRooms.get(gameId);
        if (!room) {
            return;
        }

        const players = Array.from(room.players.values()).map(p => ({
            userId: p.userId,
            username: p.username,
            isReady: p.isReady,
            teamAssignment: p.teamAssignment,
            isConnected: p.isConnected
        }));

        const teams = {
            team1: room.teams.team1.map(playerId => {
                const player = room.players.get(playerId);
                return { userId: playerId, username: player?.username };
            }),
            team2: room.teams.team2.map(playerId => {
                const player = room.players.get(playerId);
                return { userId: playerId, username: player?.username };
            })
        };

        await this.reliabilityLayer.emitWithRetry(
            gameId,
            'state-synchronized',
            {
                gameId,
                trigger,
                players,
                teams,
                hostId: room.hostId,
                status: room.status,
                playerCount: room.players.size,
                timestamp: new Date().toISOString()
            }
        );
    }

    /**
     * Handle connection failures with automatic recovery
     * @param {string} gameId - Game ID
     * @param {string} playerId - Player ID
     */
    async handleConnectionFailure(gameId, playerId) {
        console.log(`[ReliableSocketManager] Handling connection failure for ${playerId} in room ${gameId}`);
        
        // Attempt to restore connection state
        const room = this.socketManager.gameRooms.get(gameId);
        if (room && room.players.has(playerId)) {
            const player = room.players.get(playerId);
            player.isConnected = false;
            player.disconnectedAt = new Date().toISOString();
            
            // Broadcast disconnection with reliability
            await this.reliabilityLayer.emitWithRetry(
                gameId,
                'player-disconnected',
                {
                    gameId,
                    playerId,
                    playerName: player.username,
                    players: Array.from(room.players.values()).map(p => ({
                        userId: p.userId,
                        username: p.username,
                        isReady: p.isReady,
                        teamAssignment: p.teamAssignment,
                        isConnected: p.isConnected
                    })),
                    timestamp: new Date().toISOString()
                }
            );
        }
    }

    /**
     * Handle connection recovery
     * @param {string} gameId - Game ID
     * @param {string} playerId - Player ID
     */
    async handleConnectionRecovery(gameId, playerId) {
        console.log(`[ReliableSocketManager] Handling connection recovery for ${playerId} in room ${gameId}`);
        
        const room = this.socketManager.gameRooms.get(gameId);
        if (room && room.players.has(playerId)) {
            const player = room.players.get(playerId);
            player.isConnected = true;
            player.reconnectedAt = new Date().toISOString();
            
            // Broadcast reconnection with reliability
            await this.reliabilityLayer.emitWithRetry(
                gameId,
                'player-reconnected',
                {
                    gameId,
                    playerId,
                    playerName: player.username,
                    players: Array.from(room.players.values()).map(p => ({
                        userId: p.userId,
                        username: p.username,
                        isReady: p.isReady,
                        teamAssignment: p.teamAssignment,
                        isConnected: p.isConnected
                    })),
                    timestamp: new Date().toISOString()
                }
            );
        }
    }

    /**
     * Get reliability statistics
     * @returns {Object} Statistics
     */
    getReliabilityStats() {
        return this.reliabilityLayer.getDeliveryStats();
    }

    /**
     * Enable or disable reliability monitoring
     * @param {boolean} enabled - Whether to enable monitoring
     */
    setReliabilityMonitoring(enabled) {
        this.reliabilityLayer.setMonitoringEnabled(enabled);
    }

    /**
     * Add critical event type
     * @param {string} eventType - Event type
     */
    addCriticalEvent(eventType) {
        this.reliabilityLayer.addCriticalEvent(eventType);
    }

    /**
     * Remove critical event type
     * @param {string} eventType - Event type
     */
    removeCriticalEvent(eventType) {
        this.reliabilityLayer.removeCriticalEvent(eventType);
    }

    /**
     * Force event delivery for testing
     * @param {string} target - Target
     * @param {string} eventType - Event type
     * @param {Object} eventData - Event data
     */
    async forceEventDelivery(target, eventType, eventData) {
        return await this.reliabilityLayer.emitWithRetry(target, eventType, eventData, {
            maxRetries: 0 // Force immediate delivery without retries
        });
    }

    /**
     * Validate and synchronize ready status across all clients in a room
     * @param {string} gameId - Game ID
     * @returns {Promise<Object>} Synchronization result
     */
    async validateAndSyncReadyStatus(gameId) {
        try {
            const room = this.socketManager.gameRooms.get(gameId);
            if (!room) {
                throw new Error(`Room ${gameId} not found`);
            }

            // Get current room state
            const players = Array.from(room.players.values());
            const connectedPlayers = players.filter(p => p.isConnected);
            const readyCount = connectedPlayers.filter(p => p.isReady).length;
            const allConnectedReady = connectedPlayers.every(p => p.isReady) && connectedPlayers.length >= 2;
            
            // Enhanced game start validation
            let canStartGame = false;
            let gameStartReason = '';
            
            if (connectedPlayers.length < 2) {
                gameStartReason = 'Need at least 2 connected players';
            } else if (!allConnectedReady) {
                gameStartReason = `${readyCount}/${connectedPlayers.length} players ready`;
            } else if (connectedPlayers.length === 4) {
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

            const syncData = {
                gameId,
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
                syncType: 'validation',
                timestamp: new Date().toISOString()
            };

            // Broadcast synchronized state to all clients
            await this.reliabilityLayer.emitWithRetry(
                gameId,
                'ready-status-synchronized',
                syncData
            );

            console.log(`[ReliableSocketManager] Ready status synchronized for room ${gameId}`);
            return syncData;

        } catch (error) {
            console.error(`[ReliableSocketManager] Ready status sync failed for room ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Handle ready status conflict resolution
     * @param {string} gameId - Game ID
     * @param {string} playerId - Player ID
     * @param {boolean} clientReady - Client's ready state
     * @param {boolean} serverReady - Server's ready state
     */
    async resolveReadyStatusConflict(gameId, playerId, clientReady, serverReady) {
        try {
            console.log(`[ReliableSocketManager] Resolving ready status conflict for ${playerId} in room ${gameId}: client=${clientReady}, server=${serverReady}`);
            
            const room = this.socketManager.gameRooms.get(gameId);
            if (!room || !room.players.has(playerId)) {
                throw new Error(`Player ${playerId} not found in room ${gameId}`);
            }

            // Use server state as source of truth
            const player = room.players.get(playerId);
            player.isReady = serverReady;
            player.lastReadyUpdate = new Date().toISOString();

            // Notify the specific client about the resolution
            const playerSocketId = this.socketManager.userSockets.get(playerId);
            if (playerSocketId && this.socketManager.io.sockets.sockets.has(playerSocketId)) {
                const playerSocket = this.socketManager.io.sockets.sockets.get(playerSocketId);
                playerSocket.emit('ready-status-conflict-resolved', {
                    gameId,
                    playerId,
                    resolvedReady: serverReady,
                    reason: 'server_state_authority',
                    timestamp: new Date().toISOString()
                });
            }

            // Trigger full room synchronization
            await this.validateAndSyncReadyStatus(gameId);

        } catch (error) {
            console.error(`[ReliableSocketManager] Ready status conflict resolution failed:`, error);
            throw error;
        }
    }

    /**
     * Shutdown and cleanup
     */
    shutdown() {
        console.log('[ReliableSocketManager] Shutting down...');
        this.reliabilityLayer.shutdown();
    }
}

export default ReliableSocketManager;