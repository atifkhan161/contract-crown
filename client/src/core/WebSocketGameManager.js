/**
 * WebSocketGameManager - Handles real multiplayer game logic
 * Manages WebSocket connections and multiplayer game events
 */

export class WebSocketGameManager {
    constructor(gameState, uiManager, cardManager, trumpManager, trickManager, authManager) {
        this.gameState = gameState;
        this.uiManager = uiManager;
        this.cardManager = cardManager;
        this.trumpManager = trumpManager;
        this.trickManager = trickManager;
        this.authManager = authManager;
        
        this.socket = null;
        this.gameId = null;
        
        this.setupCallbacks();
    }

    /**
     * Set up manager callbacks
     */
    setupCallbacks() {
        // These will be set up by the main GameManager
        // this.cardManager.setCardPlayCallback((card) => this.handleCardPlay(card));
        // this.trumpManager.setTrumpDeclarationCallback((suit) => this.handleTrumpDeclaration(suit));
        this.trickManager.setTrickCompleteCallback((winner, trick) => this.handleTrickComplete(winner, trick));
    }

    /**
     * Initialize WebSocket game
     * @param {string} gameId - Game ID
     */
    async init(gameId) {
        try {
            this.gameId = gameId;
            
            if (!gameId) {
                throw new Error('No game ID provided');
            }
            
            console.log('[WebSocketGameManager] Initializing multiplayer game:', gameId);
            
            // Initialize WebSocket connection
            await this.initializeWebSocket();
            
            // Join game room
            this.joinGameRoom();
            
        } catch (error) {
            console.error('[WebSocketGameManager] Failed to initialize:', error);
            this.uiManager.showError('Failed to connect to multiplayer game');
        }
    }

    /**
     * Initialize WebSocket connection
     */
    async initializeWebSocket() {
        return new Promise((resolve, reject) => {
            if (typeof io === 'undefined') {
                reject(new Error('WebSocket library not available'));
                return;
            }

            this.socket = io();
            
            // Connection events
            this.socket.on('connect', () => {
                console.log('[WebSocketGameManager] Connected to server');
                this.uiManager.updateConnectionStatus('connected');
                resolve();
            });

            this.socket.on('disconnect', () => {
                console.log('[WebSocketGameManager] Disconnected from server');
                this.uiManager.updateConnectionStatus('disconnected');
                this.uiManager.addGameMessage('Disconnected from server', 'warning');
            });

            this.socket.on('reconnecting', () => {
                console.log('[WebSocketGameManager] Reconnecting to server');
                this.uiManager.updateConnectionStatus('connecting');
                this.uiManager.addGameMessage('Reconnecting to server...', 'info');
            });

            this.socket.on('error', (error) => {
                console.error('[WebSocketGameManager] Socket error:', error);
                this.uiManager.addGameMessage('Connection error occurred', 'error');
                reject(error);
            });

            // Set up game event listeners
            this.setupGameEventListeners();
            
            // Timeout for connection
            setTimeout(() => {
                if (!this.socket.connected) {
                    reject(new Error('Connection timeout'));
                }
            }, 10000);
        });
    }

    /**
     * Set up game-specific event listeners
     */
    setupGameEventListeners() {
        // Room events
        this.socket.on('room-joined', (data) => this.handleRoomJoined(data));
        this.socket.on('player-joined', (data) => this.handlePlayerJoined(data));
        this.socket.on('player-left', (data) => this.handlePlayerLeft(data));
        this.socket.on('player-ready-changed', (data) => this.handlePlayerReadyChanged(data));
        this.socket.on('teams-formed', (data) => this.handleTeamsFormed(data));
        this.socket.on('game-starting', (data) => this.handleGameStarting(data));

        // Game events
        this.socket.on('game:state_update', (data) => this.handleGameStateUpdate(data));
        this.socket.on('game:trump_declared', (data) => this.handleTrumpDeclared(data));
        this.socket.on('game:card_played', (data) => this.handleCardPlayed(data));
        this.socket.on('game:trick_won', (data) => this.handleTrickWon(data));
        this.socket.on('game:round_scores', (data) => this.handleRoundScores(data));
        this.socket.on('game:error', (data) => this.handleGameError(data));
    }

    /**
     * Join game room
     */
    joinGameRoom() {
        if (!this.socket || !this.gameId) return;
        
        this.socket.emit('join-game-room', {
            gameId: this.gameId,
            userId: this.authManager.getUserId(),
            username: this.authManager.getUsername()
        });

        // Request initial game state
        setTimeout(() => {
            this.socket.emit('request-game-state', { gameId: this.gameId });
        }, 500);
    }

    /**
     * Handle card play from human player
     * @param {Object} card - Card played
     */
    async handleCardPlay(card) {
        if (!this.socket) return;
        
        console.log('[WebSocketGameManager] Playing card:', card);
        
        // Emit card play to server
        this.socket.emit('game:play_card', {
            gameId: this.gameId,
            card: card,
            playerId: this.authManager.getUserId()
        });
    }

    /**
     * Handle trump declaration
     * @param {string} suit - Trump suit declared
     */
    async handleTrumpDeclaration(suit) {
        if (!this.socket) return;
        
        console.log('[WebSocketGameManager] Declaring trump:', suit);
        
        // Emit trump declaration to server
        this.socket.emit('game:declare_trump', {
            gameId: this.gameId,
            trumpSuit: suit,
            playerId: this.authManager.getUserId()
        });
    }

    /**
     * Handle trick completion
     * @param {Object} winner - Trick winner
     * @param {Object} trick - Completed trick
     */
    handleTrickComplete(winner, trick) {
        console.log('[WebSocketGameManager] Trick complete:', winner);
        // Server handles trick completion logic
    }

    // WebSocket Event Handlers

    /**
     * Handle room joined event
     * @param {Object} data - Room data
     */
    handleRoomJoined(data) {
        console.log('[WebSocketGameManager] Room joined:', data);
        this.uiManager.hideLoading();
        this.uiManager.addGameMessage(`Joined game room with ${data.playerCount} players`, 'success');

        // Update game state with room data
        const players = {};
        data.players.forEach(player => {
            players[player.userId] = {
                username: player.username,
                isReady: player.isReady,
                teamAssignment: player.teamAssignment,
                isConnected: player.isConnected,
                handSize: player.handSize || 0
            };
        });

        this.gameState.updateState({ players });
        this.uiManager.updateUI();
    }

    /**
     * Handle player joined event
     * @param {Object} data - Player data
     */
    handlePlayerJoined(data) {
        console.log('[WebSocketGameManager] Player joined:', data);
        this.uiManager.addGameMessage(`${data.player.username} joined the game`, 'info');

        // Update players list
        this.gameState.updatePlayer(data.player.userId, {
            username: data.player.username,
            isReady: data.player.isReady,
            teamAssignment: data.player.teamAssignment,
            isConnected: true
        });

        this.uiManager.updateUI();
    }

    /**
     * Handle player left event
     * @param {Object} data - Player data
     */
    handlePlayerLeft(data) {
        console.log('[WebSocketGameManager] Player left:', data);
        this.uiManager.addGameMessage(`${data.playerName} left the game`, 'warning');

        // Remove player from state
        const state = this.gameState.getState();
        const players = { ...state.players };
        delete players[data.playerId];
        
        this.gameState.updateState({ players });
        this.uiManager.updateUI();
    }

    /**
     * Handle player ready changed event
     * @param {Object} data - Ready status data
     */
    handlePlayerReadyChanged(data) {
        console.log('[WebSocketGameManager] Player ready changed:', data);
        const readyText = data.isReady ? 'ready' : 'not ready';
        this.uiManager.addGameMessage(`${data.playerName} is ${readyText}`, 'info');

        // Update player ready status
        this.gameState.updatePlayer(data.playerId, { isReady: data.isReady });
        this.uiManager.updateUI();
    }

    /**
     * Handle teams formed event
     * @param {Object} data - Team data
     */
    handleTeamsFormed(data) {
        console.log('[WebSocketGameManager] Teams formed:', data);
        this.uiManager.addGameMessage(`Teams formed by ${data.formedBy}`, 'success');

        // Update team assignments
        data.players.forEach(player => {
            this.gameState.updatePlayer(player.userId, { 
                teamAssignment: player.teamAssignment 
            });
        });

        this.uiManager.updateUI();
    }

    /**
     * Handle game starting event
     * @param {Object} data - Game start data
     */
    handleGameStarting(data) {
        console.log('[WebSocketGameManager] Game starting:', data);
        this.uiManager.addGameMessage(`Game starting! Started by ${data.startedBy}`, 'success');

        // Update game phase
        this.gameState.updateState({
            gamePhase: 'starting',
            status: 'starting'
        });

        this.uiManager.updateUI();
    }

    /**
     * Handle game state update
     * @param {Object} data - Game state data
     */
    handleGameStateUpdate(data) {
        console.log('[WebSocketGameManager] Game state update:', data);

        // Update game state
        this.gameState.updateState(data);
        this.uiManager.updateUI();
        this.uiManager.hideLoading();

        // Handle specific game phases
        if (data.gamePhase === 'trump_declaration' && 
            data.trumpDeclarer === this.authManager.getUserId()) {
            setTimeout(() => {
                this.trumpManager.showTrumpDeclarationModal();
            }, 500);
        }

        // Update card rendering
        if (data.playerHand) {
            this.cardManager.renderPlayerHand();
        }
    }

    /**
     * Handle trump declared event
     * @param {Object} data - Trump declaration data
     */
    handleTrumpDeclared(data) {
        console.log('[WebSocketGameManager] Trump declared:', data);
        
        this.gameState.updateState({
            trumpSuit: data.trumpSuit,
            gamePhase: 'playing'
        });

        this.uiManager.updateTrumpDisplay();
        this.trumpManager.hideTrumpDeclarationModal();
        this.uiManager.addGameMessage(`Trump suit declared: ${data.trumpSuit}`, 'success');
        
        // Update card playability
        this.cardManager.updateCardPlayability();
    }

    /**
     * Handle card played event
     * @param {Object} data - Card play data
     */
    handleCardPlayed(data) {
        console.log('[WebSocketGameManager] Card played:', data);

        // Update current trick state
        if (data.cardsInTrick) {
            this.gameState.updateTrick({
                cardsPlayed: data.cardsInTrick
            });
        }

        // Update current player turn
        if (data.nextPlayerId) {
            this.gameState.updateState({
                currentTurnPlayer: data.nextPlayerId,
                isMyTurn: (data.nextPlayerId === this.authManager.getUserId())
            });
        }

        // Render the played card
        const playerPosition = this.getPlayerPosition(data.playedBy);
        this.cardManager.renderPlayedCard(data.playedBy, data.card, playerPosition);

        // Update opponent hand sizes
        this.gameState.updatePlayer(data.playedBy, { 
            handSize: (this.gameState.getState().players[data.playedBy]?.handSize || 8) - 1 
        });

        // Update UI
        this.uiManager.updateTurnIndicators();
        this.cardManager.updateCardPlayability();

        // Add game message
        const playerName = data.playedByName || this.gameState.getPlayerNameById(data.playedBy);
        this.uiManager.addGameMessage(`${playerName} played ${data.card.rank} of ${data.card.suit}`, 'info');
    }

    /**
     * Handle trick won event
     * @param {Object} data - Trick winner data
     */
    handleTrickWon(data) {
        console.log('[WebSocketGameManager] Trick won:', data);
        
        const playerName = this.gameState.getPlayerNameById(data.winnerId);
        this.uiManager.addGameMessage(
            `${playerName} wins the trick`,
            'success'
        );

        // Update scores if provided
        if (data.scores) {
            this.gameState.updateState({ scores: data.scores });
            this.uiManager.updateScoreDisplay(true);
        }

        // Clear played cards and start next trick
        setTimeout(() => {
            this.uiManager.clearPlayedCards();
            this.gameState.clearTrick();
            
            // Update turn
            this.gameState.updateState({
                currentTurnPlayer: data.winnerId,
                isMyTurn: (data.winnerId === this.authManager.getUserId())
            });
            
            this.uiManager.updateTurnIndicators();
            
        }, 2000);
    }

    /**
     * Handle round scores event
     * @param {Object} data - Round score data
     */
    handleRoundScores(data) {
        console.log('[WebSocketGameManager] Round scores:', data);
        
        // Update scores
        this.gameState.updateState({ scores: data.scores });
        this.uiManager.updateScoreDisplay(true);
        
        // Show round summary
        this.uiManager.addGameMessage(
            `Round ${data.round} complete! Scores - Team 1: ${data.scores.team1}, Team 2: ${data.scores.team2}`,
            'success'
        );
    }

    /**
     * Handle game error event
     * @param {Object} data - Error data
     */
    handleGameError(data) {
        console.error('[WebSocketGameManager] Game error:', data);
        this.uiManager.showError(data.message || 'A game error occurred');
    }

    /**
     * Get player position on screen
     * @param {string} playerId - Player ID
     * @returns {string} Screen position
     */
    getPlayerPosition(playerId) {
        const state = this.gameState.getState();
        const currentPlayerId = this.authManager.getUserId();
        
        // Get all players in order
        const players = Object.keys(state.players || {});
        const currentIndex = players.indexOf(currentPlayerId);
        const targetIndex = players.indexOf(playerId);
        
        if (currentIndex === -1 || targetIndex === -1) return 'top';
        
        // Calculate relative position
        const relativePosition = (targetIndex - currentIndex + 4) % 4;
        const positions = ['bottom', 'left', 'top', 'right'];
        return positions[relativePosition];
    }

    /**
     * Cleanup WebSocket resources
     */
    cleanup() {
        console.log('[WebSocketGameManager] Cleaning up WebSocket connection');
        
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }
}