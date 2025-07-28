/**
 * Client-side Game State Manager
 * Handles game state synchronization and local state management
 */

export class GameStateManager {
    constructor(socketManager) {
        this.socketManager = socketManager;
        this.gameState = null;
        this.gameId = null;
        this.playerId = null;
        this.stateListeners = new Map();
        this.lastStateVersion = 0;
        this.pendingUpdates = [];
        this.syncInProgress = false;
        
        this.setupSocketListeners();
    }

    /**
     * Initialize game state for a specific game and player
     * @param {string} gameId - Game ID
     * @param {string} playerId - Current player ID
     */
    initialize(gameId, playerId) {
        this.gameId = gameId;
        this.playerId = playerId;
        this.gameState = null;
        this.lastStateVersion = 0;
        this.pendingUpdates = [];
        
        // Request initial game state
        this.requestGameState();
        
        console.log(`[GameStateManager] Initialized for game ${gameId}, player ${playerId}`);
    }

    /**
     * Set up socket event listeners for game state updates
     */
    setupSocketListeners() {
        if (!this.socketManager) return;

        // Listen for game state updates
        this.socketManager.on('gameStateUpdate', (data) => {
            this.handleGameStateUpdate(data);
        });

        // Listen for specific game events
        this.socketManager.on('playerDeclareTrump', (data) => {
            this.handlePlayerAction('trump_declaration', data);
        });

        this.socketManager.on('gameTrumpDeclared', (data) => {
            this.handleGameEvent('trump_declared', data);
        });

        this.socketManager.on('playerPlayCard', (data) => {
            this.handlePlayerAction('card_play', data);
        });

        this.socketManager.on('gameCardPlayed', (data) => {
            this.handleGameEvent('card_played', data);
        });

        this.socketManager.on('gameTrickWon', (data) => {
            this.handleGameEvent('trick_won', data);
        });

        this.socketManager.on('gameRoundScores', (data) => {
            this.handleGameEvent('round_scores', data);
        });

        this.socketManager.on('gameComplete', (data) => {
            this.handleGameEvent('game_complete', data);
        });

        // Handle connection events
        this.socketManager.on('connect', () => {
            if (this.gameId) {
                this.requestGameState();
            }
        });

        this.socketManager.on('reconnect', () => {
            if (this.gameId) {
                this.requestGameState();
            }
        });
    }

    /**
     * Request current game state from server
     */
    requestGameState() {
        if (this.gameId && this.socketManager) {
            this.socketManager.requestGameState(this.gameId);
        }
    }

    /**
     * Handle game state update from server
     * @param {Object} data - Game state data
     */
    handleGameStateUpdate(data) {
        if (!data.gameId || data.gameId !== this.gameId) {
            return; // Ignore updates for other games
        }

        // Check for version conflicts
        if (data.version && this.lastStateVersion && data.version < this.lastStateVersion) {
            console.warn(`[GameStateManager] Received older state version ${data.version}, current: ${this.lastStateVersion}`);
            return;
        }

        // Update local state
        const previousState = this.gameState;
        this.gameState = { ...data };
        this.lastStateVersion = data.version || this.lastStateVersion + 1;

        // Process any pending updates
        this.processPendingUpdates();

        // Notify listeners of state change
        this.notifyStateChange('state_update', this.gameState, previousState);

        console.log(`[GameStateManager] Game state updated for ${this.gameId}`, this.gameState);
    }

    /**
     * Handle player action events
     * @param {string} actionType - Type of action
     * @param {Object} data - Action data
     */
    handlePlayerAction(actionType, data) {
        if (!data.gameId || data.gameId !== this.gameId) {
            return;
        }

        // Update local state optimistically if it's our action
        if (data.playerId === this.playerId) {
            this.applyOptimisticUpdate(actionType, data);
        }

        // Notify listeners
        this.notifyStateChange(actionType, data, this.gameState);

        console.log(`[GameStateManager] Player action: ${actionType}`, data);
    }

    /**
     * Handle game event updates
     * @param {string} eventType - Type of event
     * @param {Object} data - Event data
     */
    handleGameEvent(eventType, data) {
        if (!data.gameId || data.gameId !== this.gameId) {
            return;
        }

        // Update local state based on event
        this.applyGameEventUpdate(eventType, data);

        // Notify listeners
        this.notifyStateChange(eventType, data, this.gameState);

        console.log(`[GameStateManager] Game event: ${eventType}`, data);
    }

    /**
     * Apply optimistic update for player's own actions
     * @param {string} actionType - Type of action
     * @param {Object} data - Action data
     */
    applyOptimisticUpdate(actionType, data) {
        if (!this.gameState) return;

        const newState = { ...this.gameState };

        switch (actionType) {
            case 'trump_declaration':
                newState.trumpSuit = data.trumpSuit;
                newState.phase = 'final_dealing';
                break;

            case 'card_play':
                // Remove card from player's hand optimistically
                if (newState.players && newState.players[this.playerId] && newState.players[this.playerId].hand) {
                    const hand = [...newState.players[this.playerId].hand];
                    const cardIndex = hand.findIndex(c => 
                        c.suit === data.card.suit && c.rank === data.card.rank
                    );
                    if (cardIndex > -1) {
                        hand.splice(cardIndex, 1);
                        newState.players[this.playerId].hand = hand;
                    }
                }
                break;
        }

        this.gameState = newState;
    }

    /**
     * Apply game event updates to local state
     * @param {string} eventType - Type of event
     * @param {Object} data - Event data
     */
    applyGameEventUpdate(eventType, data) {
        if (!this.gameState) return;

        const newState = { ...this.gameState };

        switch (eventType) {
            case 'trump_declared':
                newState.trumpSuit = data.trumpSuit;
                newState.declaringTeam = data.declaringTeam;
                newState.challengingTeam = data.challengingTeam;
                newState.phase = data.phase || 'trick_taking';
                break;

            case 'card_played':
                // Update current trick
                if (data.cardsInTrick) {
                    newState.currentTrick = {
                        ...newState.currentTrick,
                        cardsPlayed: data.cardsInTrick
                    };
                }
                newState.currentPlayer = data.nextPlayerId;
                break;

            case 'trick_won':
                newState.currentTrick = {
                    ...newState.currentTrick,
                    winner: data.winnerId,
                    winningCard: data.winningCard,
                    complete: true
                };
                newState.currentPlayer = data.nextLeaderId;
                break;

            case 'round_scores':
                newState.scores = data.scores;
                newState.currentRound = {
                    ...newState.currentRound,
                    complete: true,
                    scores: data.scores
                };
                break;

            case 'game_complete':
                newState.status = 'completed';
                newState.winner = data.winningTeam;
                newState.finalScores = data.finalScores;
                break;
        }

        this.gameState = newState;
    }

    /**
     * Process any pending state updates
     */
    processPendingUpdates() {
        if (this.pendingUpdates.length === 0) return;

        for (const update of this.pendingUpdates) {
            this.applyGameEventUpdate(update.type, update.data);
        }

        this.pendingUpdates = [];
    }

    /**
     * Add state change listener
     * @param {string} event - Event type to listen for
     * @param {Function} callback - Callback function
     */
    on(event, callback) {
        if (!this.stateListeners.has(event)) {
            this.stateListeners.set(event, []);
        }
        this.stateListeners.get(event).push(callback);
    }

    /**
     * Remove state change listener
     * @param {string} event - Event type
     * @param {Function} callback - Callback function
     */
    off(event, callback) {
        if (this.stateListeners.has(event)) {
            const listeners = this.stateListeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * Notify listeners of state changes
     * @param {string} event - Event type
     * @param {Object} data - Event data
     * @param {Object} previousState - Previous state (optional)
     */
    notifyStateChange(event, data, previousState = null) {
        if (this.stateListeners.has(event)) {
            this.stateListeners.get(event).forEach(callback => {
                try {
                    callback(data, previousState);
                } catch (error) {
                    console.error(`[GameStateManager] Error in listener for ${event}:`, error);
                }
            });
        }

        // Also notify generic 'change' listeners
        if (event !== 'change' && this.stateListeners.has('change')) {
            this.stateListeners.get('change').forEach(callback => {
                try {
                    callback(event, data, previousState);
                } catch (error) {
                    console.error(`[GameStateManager] Error in change listener:`, error);
                }
            });
        }
    }

    /**
     * Get current game state
     * @returns {Object} Current game state
     */
    getState() {
        return this.gameState;
    }

    /**
     * Get current player's data
     * @returns {Object} Current player data
     */
    getCurrentPlayer() {
        if (!this.gameState || !this.gameState.players || !this.playerId) {
            return null;
        }
        return this.gameState.players[this.playerId];
    }

    /**
     * Get player's hand
     * @returns {Array} Player's cards
     */
    getPlayerHand() {
        const player = this.getCurrentPlayer();
        return player ? player.hand || [] : [];
    }

    /**
     * Get current trump suit
     * @returns {string} Trump suit
     */
    getTrumpSuit() {
        return this.gameState ? this.gameState.trumpSuit : null;
    }

    /**
     * Get current scores
     * @returns {Object} Team scores
     */
    getScores() {
        return this.gameState ? this.gameState.scores : { team1: 0, team2: 0 };
    }

    /**
     * Check if it's the current player's turn
     * @returns {boolean} True if it's player's turn
     */
    isPlayerTurn() {
        return this.gameState && this.gameState.currentPlayer === this.playerId;
    }

    /**
     * Get game phase
     * @returns {string} Current game phase
     */
    getPhase() {
        return this.gameState ? this.gameState.phase : 'lobby';
    }

    /**
     * Clean up when leaving game
     */
    cleanup() {
        this.gameState = null;
        this.gameId = null;
        this.playerId = null;
        this.stateListeners.clear();
        this.pendingUpdates = [];
        this.lastStateVersion = 0;
        
        console.log('[GameStateManager] Cleaned up');
    }

    /**
     * Force synchronization with server
     */
    forceSynchronization() {
        this.requestGameState();
    }

    /**
     * Get synchronization status
     * @returns {Object} Sync status information
     */
    getSyncStatus() {
        return {
            hasState: Boolean(this.gameState),
            gameId: this.gameId,
            playerId: this.playerId,
            lastVersion: this.lastStateVersion,
            pendingUpdates: this.pendingUpdates.length,
            connected: this.socketManager ? this.socketManager.isSocketConnected() : false
        };
    }
}