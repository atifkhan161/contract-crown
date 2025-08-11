/**
 * Game State Manager
 * Handles real-time game state synchronization and broadcasting
 */

class GameStateManager {
    constructor(socketManager) {
        this.socketManager = socketManager;
        this.gameStates = new Map(); // gameId -> game state
        this.stateUpdateQueue = new Map(); // gameId -> array of pending updates
        this.maxQueueSize = 50;
        this.conflictResolutionEnabled = true;
    }

    /**
     * Initialize game state for a new game
     * @param {string} gameId - Game ID
     * @param {Object} initialState - Initial game state
     */
    initializeGameState(gameId, initialState) {
        const gameState = {
            gameId,
            status: 'waiting',
            phase: 'lobby',
            players: {},
            teams: { team1: [], team2: [] },
            currentRound: null,
            currentTrick: null,
            scores: { team1: 0, team2: 0 },
            trumpSuit: null,
            declaringTeam: null,
            challengingTeam: null,
            currentPlayer: null,
            lastUpdate: new Date().toISOString(),
            version: 1,
            ...initialState
        };

        this.gameStates.set(gameId, gameState);
        this.stateUpdateQueue.set(gameId, []);

        console.log(`[GameStateManager] Initialized game state for ${gameId}`);
        return gameState;
    }

    /**
     * Get current game state
     * @param {string} gameId - Game ID
     * @returns {Object} Current game state
     */
    getGameState(gameId) {
        return this.gameStates.get(gameId);
    }

    /**
     * Update game state with conflict resolution
     * @param {string} gameId - Game ID
     * @param {Object} updates - State updates to apply
     * @param {string} updateSource - Source of the update (playerId or 'server')
     * @returns {Object} Updated game state
     */
    updateGameState(gameId, updates, updateSource = 'server') {
        const currentState = this.gameStates.get(gameId);
        if (!currentState) {
            throw new Error(`Game state not found for game ${gameId}`);
        }

        // Create update record
        const updateRecord = {
            updates,
            source: updateSource,
            timestamp: new Date().toISOString(),
            version: currentState.version + 1
        };

        // Queue update for conflict resolution
        this.queueStateUpdate(gameId, updateRecord);

        // Apply updates with conflict resolution
        const newState = this.applyStateUpdates(gameId);

        // Broadcast state update to all players
        this.broadcastStateUpdate(gameId, newState, updateSource);

        return newState;
    }

    /**
     * Queue state update for processing
     * @param {string} gameId - Game ID
     * @param {Object} updateRecord - Update record
     */
    queueStateUpdate(gameId, updateRecord) {
        const queue = this.stateUpdateQueue.get(gameId) || [];
        
        // Add to queue
        queue.push(updateRecord);
        
        // Limit queue size
        if (queue.length > this.maxQueueSize) {
            queue.shift(); // Remove oldest update
        }
        
        this.stateUpdateQueue.set(gameId, queue);
    }

    /**
     * Apply queued state updates with conflict resolution
     * @param {string} gameId - Game ID
     * @returns {Object} Updated game state
     */
    applyStateUpdates(gameId) {
        const currentState = this.gameStates.get(gameId);
        const queue = this.stateUpdateQueue.get(gameId) || [];

        if (queue.length === 0) {
            return currentState;
        }

        let newState = { ...currentState };

        // Process all queued updates
        for (const updateRecord of queue) {
            newState = this.mergeStateUpdate(newState, updateRecord);
        }

        // Clear processed updates
        this.stateUpdateQueue.set(gameId, []);

        // Update stored state
        this.gameStates.set(gameId, newState);

        return newState;
    }

    /**
     * Merge state update with conflict resolution
     * @param {Object} currentState - Current game state
     * @param {Object} updateRecord - Update record to merge
     * @returns {Object} Merged state
     */
    mergeStateUpdate(currentState, updateRecord) {
        const { updates, source, timestamp, version } = updateRecord;
        
        // Create new state object
        const newState = {
            ...currentState,
            lastUpdate: timestamp,
            version: version,
            lastUpdateSource: source
        };

        // Apply updates with conflict resolution
        for (const [key, value] of Object.entries(updates)) {
            if (this.conflictResolutionEnabled) {
                newState[key] = this.resolveConflict(currentState[key], value, key, source);
            } else {
                newState[key] = value;
            }
        }

        return newState;
    }

    /**
     * Resolve conflicts between current and new values
     * @param {*} currentValue - Current value
     * @param {*} newValue - New value
     * @param {string} key - State key
     * @param {string} source - Update source
     * @returns {*} Resolved value
     */
    resolveConflict(currentValue, newValue, key, source) {
        // Server updates always take precedence
        if (source === 'server') {
            return newValue;
        }

        // For certain critical game state fields, server state wins
        const serverOnlyFields = ['scores', 'currentRound', 'currentTrick', 'trumpSuit', 'declaringTeam'];
        if (serverOnlyFields.includes(key)) {
            return currentValue; // Keep current (server) value
        }

        // For player-specific updates, merge intelligently
        if (key === 'players' && typeof currentValue === 'object' && typeof newValue === 'object') {
            return { ...currentValue, ...newValue };
        }

        // Default: new value wins
        return newValue;
    }

    /**
     * Broadcast game state update to all players
     * @param {string} gameId - Game ID
     * @param {Object} gameState - Game state to broadcast
     * @param {string} updateSource - Source of the update
     */
    broadcastStateUpdate(gameId, gameState, updateSource) {
        // Create public state (filtered for all players)
        const publicState = this.filterStateForBroadcast(gameState);

        // Broadcast to all players in the game
        this.socketManager.broadcastGameStateUpdate(gameId, publicState);

        // Send player-specific states (with hand visibility)
        if (gameState.players && typeof gameState.players === 'object') {
            for (const playerId of Object.keys(gameState.players)) {
                const playerState = this.filterStateForPlayer(gameState, playerId);
                console.log(`[GameStateManager] Sending player-specific state to ${playerId}:`, {
                    playerId,
                    hasHand: !!playerState.players?.[playerId]?.hand,
                    handLength: playerState.players?.[playerId]?.hand?.length || 0,
                    trumpDeclarer: playerState.trumpDeclarer
                });
                this.socketManager.sendPlayerGameState(gameId, playerId, playerState);
            }
        }

        console.log(`[GameStateManager] Broadcasted state update for game ${gameId} from ${updateSource}`);
    }

    /**
     * Filter game state for public broadcast (hide private information)
     * @param {Object} gameState - Full game state
     * @returns {Object} Filtered public state
     */
    filterStateForBroadcast(gameState) {
        const publicState = { ...gameState };

        // Hide player hands from public state
        if (publicState.players) {
            publicState.players = Object.fromEntries(
                Object.entries(publicState.players).map(([playerId, player]) => [
                    playerId,
                    {
                        ...player,
                        hand: player.hand ? player.hand.length : 0, // Only show hand size
                        hasHand: Boolean(player.hand && player.hand.length > 0)
                    }
                ])
            );
        }

        return publicState;
    }

    /**
     * Filter game state for specific player (show their hand)
     * @param {Object} gameState - Full game state
     * @param {string} playerId - Player ID
     * @returns {Object} Player-specific state
     */
    filterStateForPlayer(gameState, playerId) {
        const playerState = { ...gameState };

        // Show full hand for the specific player, hide others
        if (playerState.players) {
            playerState.players = Object.fromEntries(
                Object.entries(playerState.players).map(([pid, player]) => [
                    pid,
                    {
                        ...player,
                        hand: pid === playerId ? player.hand : (player.hand ? player.hand.length : 0),
                        hasHand: Boolean(player.hand && player.hand.length > 0)
                    }
                ])
            );
        }

        return playerState;
    }

    /**
     * Synchronize game state from database
     * @param {string} gameId - Game ID
     * @returns {Object} Synchronized game state
     */
    async synchronizeFromDatabase(gameId) {
        try {
            // This would typically fetch from database
            // For now, we'll use the in-memory state
            const currentState = this.gameStates.get(gameId);
            
            if (currentState) {
                // Broadcast current state to ensure all clients are synchronized
                this.broadcastStateUpdate(gameId, currentState, 'server');
            }

            return currentState;
        } catch (error) {
            console.error(`[GameStateManager] Error synchronizing state for game ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Handle player disconnection - preserve state
     * @param {string} gameId - Game ID
     * @param {string} playerId - Disconnected player ID
     */
    handlePlayerDisconnection(gameId, playerId) {
        const gameState = this.gameStates.get(gameId);
        if (!gameState || !gameState.players[playerId]) {
            return;
        }

        // Mark player as disconnected but preserve their state
        const updates = {
            players: {
                ...gameState.players,
                [playerId]: {
                    ...gameState.players[playerId],
                    isConnected: false,
                    disconnectedAt: new Date().toISOString()
                }
            }
        };

        this.updateGameState(gameId, updates, 'server');
    }

    /**
     * Handle player reconnection - restore state
     * @param {string} gameId - Game ID
     * @param {string} playerId - Reconnected player ID
     */
    handlePlayerReconnection(gameId, playerId) {
        const gameState = this.gameStates.get(gameId);
        if (!gameState || !gameState.players[playerId]) {
            return;
        }

        // Mark player as connected and send full state
        const updates = {
            players: {
                ...gameState.players,
                [playerId]: {
                    ...gameState.players[playerId],
                    isConnected: true,
                    reconnectedAt: new Date().toISOString()
                }
            }
        };

        this.updateGameState(gameId, updates, 'server');

        // Send full game state to reconnected player
        const playerState = this.filterStateForPlayer(gameState, playerId);
        this.socketManager.sendPlayerGameState(gameId, playerId, {
            ...playerState,
            isReconnection: true
        });
    }

    /**
     * Clean up game state when game ends
     * @param {string} gameId - Game ID
     */
    cleanupGameState(gameId) {
        this.gameStates.delete(gameId);
        this.stateUpdateQueue.delete(gameId);
        console.log(`[GameStateManager] Cleaned up state for game ${gameId}`);
    }

    /**
     * Get statistics about managed game states
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            activeGames: this.gameStates.size,
            totalQueuedUpdates: Array.from(this.stateUpdateQueue.values())
                .reduce((total, queue) => total + queue.length, 0),
            averageQueueSize: this.stateUpdateQueue.size > 0 
                ? Array.from(this.stateUpdateQueue.values())
                    .reduce((total, queue) => total + queue.length, 0) / this.stateUpdateQueue.size
                : 0
        };
    }

    /**
     * Force state synchronization for all players in a game
     * @param {string} gameId - Game ID
     */
    forceSynchronization(gameId) {
        const gameState = this.gameStates.get(gameId);
        if (gameState) {
            this.broadcastStateUpdate(gameId, gameState, 'server');
            console.log(`[GameStateManager] Forced synchronization for game ${gameId}`);
        }
    }
}

export default GameStateManager;