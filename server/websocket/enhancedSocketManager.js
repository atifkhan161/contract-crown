/**
 * Enhanced Socket Manager with State Reconciliation
 * Integrates StateReconciliationEngine for consistent state management
 */

import StateReconciliationEngine from '../src/services/StateReconciliationEngine.js';

class EnhancedSocketManager {
    constructor(socketManager) {
        this.socketManager = socketManager;
        this.stateReconciliationEngine = new StateReconciliationEngine();
        this.reconciliationIntervals = new Map(); // gameId -> intervalId
        this.reconciliationEnabled = true;
        
        // Get reference to enhanced connection status manager
        this.enhancedConnectionStatusManager = socketManager.enhancedConnectionStatusManager;
        
        // Wrap original methods with reconciliation
        this.wrapSocketManagerMethods();
    }

    /**
     * Wrap original socket manager methods with state reconciliation
     */
    wrapSocketManagerMethods() {
        const originalHandlePlayerReady = this.socketManager.handlePlayerReady.bind(this.socketManager);
        const originalHandleFormTeams = this.socketManager.handleFormTeams.bind(this.socketManager);
        const originalHandleJoinGameRoom = this.socketManager.handleJoinGameRoom.bind(this.socketManager);
        const originalHandleStartGame = this.socketManager.handleStartGame.bind(this.socketManager);

        // Wrap handlePlayerReady with reconciliation
        this.socketManager.handlePlayerReady = async (socket, data) => {
            try {
                // Execute original method
                await originalHandlePlayerReady(socket, data);
                
                // Perform state reconciliation after ready status change
                if (this.reconciliationEnabled && data.gameId) {
                    await this.reconcileAndBroadcast(data.gameId, 'player_ready');
                }
            } catch (error) {
                console.error('[EnhancedSocketManager] Error in handlePlayerReady:', error);
                socket.emit('error', { message: 'Failed to update ready status' });
            }
        };

        // Wrap handleFormTeams with reconciliation
        this.socketManager.handleFormTeams = async (socket, data) => {
            try {
                // Execute original method
                await originalHandleFormTeams(socket, data);
                
                // Perform state reconciliation after team formation
                if (this.reconciliationEnabled && data.gameId) {
                    await this.reconcileAndBroadcast(data.gameId, 'form_teams');
                }
            } catch (error) {
                console.error('[EnhancedSocketManager] Error in handleFormTeams:', error);
                socket.emit('error', { message: 'Failed to form teams' });
            }
        };

        // Wrap handleJoinGameRoom with reconciliation
        this.socketManager.handleJoinGameRoom = async (socket, data) => {
            try {
                // Execute original method
                await originalHandleJoinGameRoom(socket, data);
                
                // Perform state reconciliation after player joins
                if (this.reconciliationEnabled && data.gameId) {
                    await this.reconcileAndBroadcast(data.gameId, 'player_join');
                    
                    // Start periodic reconciliation for this room if not already started
                    this.startPeriodicReconciliation(data.gameId);
                }
            } catch (error) {
                console.error('[EnhancedSocketManager] Error in handleJoinGameRoom:', error);
                socket.emit('error', { message: 'Failed to join game room' });
            }
        };

        // Wrap handleStartGame with reconciliation
        this.socketManager.handleStartGame = async (socket, data) => {
            try {
                // Perform pre-start reconciliation to ensure consistent state
                if (this.reconciliationEnabled && data.gameId) {
                    const reconciledState = await this.reconcileAndBroadcast(data.gameId, 'pre_game_start');
                    
                    // Validate game can start with reconciled state
                    if (!this.canStartGameWithReconciledState(reconciledState)) {
                        socket.emit('error', { message: 'Game cannot start due to state inconsistencies' });
                        return;
                    }
                }

                // Execute original method
                await originalHandleStartGame(socket, data);
                
                // Stop periodic reconciliation when game starts
                this.stopPeriodicReconciliation(data.gameId);
                
            } catch (error) {
                console.error('[EnhancedSocketManager] Error in handleStartGame:', error);
                socket.emit('error', { message: 'Failed to start game' });
            }
        };
    }

    /**
     * Reconcile state and broadcast updates
     * @param {string} gameId - Game ID
     * @param {string} trigger - What triggered the reconciliation
     * @returns {Promise<Object>} Reconciled state
     */
    async reconcileAndBroadcast(gameId, trigger) {
        try {
            console.log(`[EnhancedSocketManager] Reconciling state for room ${gameId} (trigger: ${trigger})`);

            // Get current websocket state
            const websocketState = this.getWebsocketRoomState(gameId);
            
            // Perform reconciliation
            const reconciledState = await this.stateReconciliationEngine.reconcileRoomState(gameId, websocketState);
            
            if (!reconciledState) {
                console.log(`[EnhancedSocketManager] No reconciliation needed for room ${gameId}`);
                return null;
            }

            // Update websocket state with reconciled data
            await this.updateWebsocketState(gameId, reconciledState);
            
            // Broadcast reconciled state to all players
            this.broadcastReconciledState(gameId, reconciledState, trigger);
            
            console.log(`[EnhancedSocketManager] State reconciliation completed for room ${gameId}`);
            return reconciledState;

        } catch (error) {
            console.error(`[EnhancedSocketManager] State reconciliation failed for room ${gameId}:`, error);
            return null;
        }
    }

    /**
     * Get current websocket room state
     * @param {string} gameId - Game ID
     * @returns {Object} Current websocket state
     */
    getWebsocketRoomState(gameId) {
        const room = this.socketManager.gameRooms.get(gameId);
        if (!room) {
            return null;
        }

        return {
            gameId,
            hostId: room.hostId,
            status: room.status,
            players: room.players,
            teams: room.teams,
            createdAt: room.createdAt,
            lastUpdate: new Date().toISOString()
        };
    }

    /**
     * Update websocket state with reconciled data
     * @param {string} gameId - Game ID
     * @param {Object} reconciledState - Reconciled state from database
     */
    async updateWebsocketState(gameId, reconciledState) {
        const room = this.socketManager.gameRooms.get(gameId);
        if (!room) {
            console.warn(`[EnhancedSocketManager] Room ${gameId} not found in websocket state`);
            return;
        }

        // Update room properties
        room.hostId = reconciledState.owner_id;
        room.status = reconciledState.status;

        // Update players map with reconciled data
        room.players.clear();
        for (const dbPlayer of reconciledState.players) {
            const existingWsPlayer = Array.from(room.players.values())
                .find(p => p.userId === dbPlayer.id);

            room.players.set(dbPlayer.id, {
                userId: dbPlayer.id,
                username: dbPlayer.username,
                socketId: existingWsPlayer?.socketId || null,
                isReady: dbPlayer.isReady,
                teamAssignment: dbPlayer.teamAssignment,
                joinedAt: dbPlayer.joinedAt,
                isConnected: existingWsPlayer?.isConnected || false
            });
        }

        // Update teams based on player team assignments
        room.teams.team1 = [];
        room.teams.team2 = [];
        
        for (const [playerId, player] of room.players) {
            if (player.teamAssignment === 1) {
                room.teams.team1.push(playerId);
            } else if (player.teamAssignment === 2) {
                room.teams.team2.push(playerId);
            }
        }

        console.log(`[EnhancedSocketManager] Updated websocket state for room ${gameId}`);
    }

    /**
     * Broadcast reconciled state to all players
     * @param {string} gameId - Game ID
     * @param {Object} reconciledState - Reconciled state
     * @param {string} trigger - What triggered the reconciliation
     */
    broadcastReconciledState(gameId, reconciledState, trigger) {
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

        // Broadcast state synchronization event
        this.socketManager.io.to(gameId).emit('state-synchronized', {
            gameId,
            trigger,
            players,
            teams,
            hostId: room.hostId,
            status: room.status,
            playerCount: room.players.size,
            timestamp: new Date().toISOString()
        });

        console.log(`[EnhancedSocketManager] Broadcasted reconciled state for room ${gameId} (trigger: ${trigger})`);
    }

    /**
     * Check if game can start with reconciled state
     * @param {Object} reconciledState - Reconciled state
     * @returns {boolean} Whether game can start
     */
    canStartGameWithReconciledState(reconciledState) {
        if (!reconciledState || !reconciledState.players) {
            return false;
        }

        const connectedPlayers = reconciledState.players.filter(p => p.isConnected !== false);
        const readyConnectedPlayers = connectedPlayers.filter(p => p.isReady);

        // Need at least 2 connected players, all connected players must be ready
        return connectedPlayers.length >= 2 && readyConnectedPlayers.length === connectedPlayers.length;
    }

    /**
     * Start periodic reconciliation for a room
     * @param {string} gameId - Game ID
     */
    startPeriodicReconciliation(gameId) {
        // Don't start if already running
        if (this.reconciliationIntervals.has(gameId)) {
            return;
        }

        const intervalId = this.stateReconciliationEngine.schedulePeriodicReconciliation(gameId, 30000); // Every 30 seconds
        this.reconciliationIntervals.set(gameId, intervalId);
        
        console.log(`[EnhancedSocketManager] Started periodic reconciliation for room ${gameId}`);
    }

    /**
     * Stop periodic reconciliation for a room
     * @param {string} gameId - Game ID
     */
    stopPeriodicReconciliation(gameId) {
        const intervalId = this.reconciliationIntervals.get(gameId);
        if (intervalId) {
            clearInterval(intervalId);
            this.reconciliationIntervals.delete(gameId);
            console.log(`[EnhancedSocketManager] Stopped periodic reconciliation for room ${gameId}`);
        }
    }

    /**
     * Force immediate reconciliation for a room
     * @param {string} gameId - Game ID
     * @returns {Promise<Object>} Reconciled state
     */
    async forceReconciliation(gameId) {
        return await this.reconcileAndBroadcast(gameId, 'manual_force');
    }

    /**
     * Perform atomic state update
     * @param {string} gameId - Game ID
     * @param {Object} stateUpdates - State updates
     * @returns {Promise<Object>} Updated state
     */
    async atomicStateUpdate(gameId, stateUpdates) {
        try {
            const updatedState = await this.stateReconciliationEngine.atomicStateUpdate(gameId, stateUpdates);
            
            // Update websocket state with atomic changes
            if (updatedState) {
                await this.updateWebsocketState(gameId, updatedState);
                this.broadcastReconciledState(gameId, updatedState, 'atomic_update');
            }
            
            return updatedState;
        } catch (error) {
            console.error(`[EnhancedSocketManager] Atomic state update failed for room ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get reconciliation statistics
     * @returns {Object} Statistics
     */
    getReconciliationStats() {
        return {
            ...this.stateReconciliationEngine.getReconciliationStats(),
            activePeriodicReconciliations: this.reconciliationIntervals.size,
            reconciliationEnabled: this.reconciliationEnabled
        };
    }

    /**
     * Enable or disable reconciliation
     * @param {boolean} enabled - Whether to enable reconciliation
     */
    setReconciliationEnabled(enabled) {
        this.reconciliationEnabled = enabled;
        console.log(`[EnhancedSocketManager] Reconciliation ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Clean up resources for a room
     * @param {string} gameId - Game ID
     */
    cleanupRoom(gameId) {
        this.stopPeriodicReconciliation(gameId);
        this.stateReconciliationEngine.clearReconciliationHistory(gameId);
        console.log(`[EnhancedSocketManager] Cleaned up resources for room ${gameId}`);
    }

    /**
     * Handle player disconnection with state preservation
     * @param {string} gameId - Game ID
     * @param {string} playerId - Player ID
     */
    async handlePlayerDisconnection(gameId, playerId) {
        try {
            // The enhanced connection status manager handles the actual disconnection
            // We just need to trigger reconciliation to ensure consistent state
            await this.reconcileAndBroadcast(gameId, 'player_disconnect');
            
        } catch (error) {
            console.error(`[EnhancedSocketManager] Error handling disconnection for ${playerId} in room ${gameId}:`, error);
        }
    }

    /**
     * Handle player reconnection with state restoration
     * @param {string} gameId - Game ID
     * @param {string} playerId - Player ID
     */
    async handlePlayerReconnection(gameId, playerId) {
        try {
            // The enhanced connection status manager handles the actual reconnection
            // We just need to trigger reconciliation to restore consistent state
            const reconciledState = await this.reconcileAndBroadcast(gameId, 'player_reconnect');
            
            // Send full state to reconnected player
            if (reconciledState) {
                const socket = this.socketManager.io.sockets.sockets.get(
                    this.socketManager.userSockets.get(playerId)
                );
                
                if (socket) {
                    socket.emit('state-restored', {
                        gameId,
                        reconciledState,
                        isReconnection: true,
                        timestamp: new Date().toISOString()
                    });
                }
            }
            
        } catch (error) {
            console.error(`[EnhancedSocketManager] Error handling reconnection for ${playerId} in room ${gameId}:`, error);
        }
    }
}

export default EnhancedSocketManager;