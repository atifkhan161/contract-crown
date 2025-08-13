/**
 * WebSocketGameManager - Handles real multiplayer game logic
 * Manages WebSocket connections and multiplayer game events
 */

import { getErrorHandler } from './ErrorHandler.js';

export class WebSocketGameManager {
    constructor(gameState, uiManager, cardManager, trumpManager, trickManager, authManager) {
        this.gameState = gameState;
        this.uiManager = uiManager;
        this.cardManager = cardManager;
        this.trumpManager = trumpManager;
        this.trickManager = trickManager;
        this.authManager = authManager;
        this.errorHandler = getErrorHandler(authManager);
        
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
        this.uiManager.setNextRoundCallback((roundWinner) => this.handleNextRound(roundWinner));
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
            
            // Game room joining will happen after connection confirmation
            
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

            // Get authentication token
            const token = this.authManager.getToken();
            if (!token) {
                reject(new Error('No authentication token available'));
                return;
            }

            // Initialize socket with authentication
            this.socket = io({
                auth: {
                    token: token
                },
                transports: ['websocket', 'polling']
            });
            
            // Connection events
            this.socket.on('connect', () => {
                console.log('[WebSocketGameManager] Connected to server');
                this.uiManager.updateConnectionStatus('connected');
                resolve();
            });

            this.socket.on('connection-confirmed', (data) => {
                console.log('[WebSocketGameManager] Connection confirmed:', data);
                
                // Store current user ID in game state
                this.gameState.updateState({
                    currentUserId: data.userId,
                    connectionInfo: data
                });
                
                // Now that connection is confirmed, join the game room
                this.joinGameRoom();
            });

            this.socket.on('disconnect', (reason) => {
                console.log('[WebSocketGameManager] Disconnected from server:', reason);
                this.uiManager.updateConnectionStatus('disconnected');
                this.uiManager.addGameMessage('Disconnected from server', 'warning');
                
                // Handle critical disconnect reasons
                if (reason === 'io server disconnect' || reason === 'transport error') {
                    this.errorHandler?.handleWebSocketError(`Connection error: ${reason}`, this.socket);
                }
            });

            this.socket.on('reconnecting', () => {
                console.log('[WebSocketGameManager] Reconnecting to server');
                this.uiManager.updateConnectionStatus('connecting');
                this.uiManager.addGameMessage('Reconnecting to server...', 'info');
            });

            this.socket.on('connect_error', (error) => {
                console.error('[WebSocketGameManager] Connection error:', error);
                this.errorHandler?.handleWebSocketError(error, this.socket);
                this.uiManager.addGameMessage('Connection error occurred', 'error');
                reject(error);
            });

            this.socket.on('auth_error', (error) => {
                console.error('[WebSocketGameManager] Authentication error:', error);
                this.errorHandler?.handleAuthError(error);
                reject(new Error('Authentication failed'));
            });

            this.socket.on('error', (error) => {
                console.error('[WebSocketGameManager] Socket error:', error);
                this.errorHandler?.handleWebSocketError(error, this.socket);
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
        this.socket.on('game-initialized', (data) => this.handleGameInitialized(data));
        this.socket.on('game:trump_declared', (data) => this.handleTrumpDeclared(data));
        this.socket.on('game:card_played', (data) => this.handleCardPlayed(data));
        this.socket.on('game:trick_won', (data) => this.handleTrickWon(data));
        this.socket.on('game:round_scores', (data) => this.handleRoundScores(data));
        this.socket.on('game:error', (data) => this.handleGameError(data));
        this.socket.on('bots-added', (data) => this.handleBotsAdded(data));
        this.socket.on('game:next_trick', (data) => this.handleNextTrick(data));
        this.socket.on('game:round_complete', (data) => this.handleRoundComplete(data));
        this.socket.on('game:new_round', (data) => this.handleNewRound(data));
        this.socket.on('game:complete', (data) => this.handleGameComplete(data));
    }

    /**
     * Join game room
     */
    joinGameRoom() {
        if (!this.socket || !this.gameId) {
            console.error('[WebSocketGameManager] Cannot join room - missing socket or gameId');
            return;
        }
        
        const userId = this.authManager.getUserId();
        const username = this.authManager.getUsername();
        
        console.log('[WebSocketGameManager] Joining game room:', {
            gameId: this.gameId,
            userId: userId,
            username: username,
            socketConnected: this.socket.connected
        });
        
        this.socket.emit('join-game-room', {
            gameId: this.gameId,
            userId: userId,
            username: username
        });

        // Request initial game state
        setTimeout(() => {
            if (this.socket && this.socket.connected) {
                console.log('[WebSocketGameManager] Requesting initial game state');
                this.socket.emit('request-game-state', { gameId: this.gameId });
            }
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
        
        // Trump suit should already be in proper case (Hearts, Diamonds, Clubs, Spades)
        const trumpSuit = suit;
        
        // Emit trump declaration to server
        this.socket.emit('declare-trump', {
            gameId: this.gameId,
            trumpSuit: trumpSuit,
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
        const currentUserId = this.authManager.getUserId();
        const players = {};
        let playerHand = null;
        
        data.players.forEach(player => {
            players[player.userId] = {
                username: player.username,
                isReady: player.isReady,
                teamAssignment: player.teamAssignment,
                isConnected: player.isConnected,
                handSize: player.handSize || 0
            };
            
            // Extract current user's hand if available
            if (player.userId === currentUserId && (player.hand || player.cards)) {
                playerHand = player.hand || player.cards;
            }
        });

        const stateUpdate = { players };
        if (playerHand) {
            stateUpdate.playerHand = playerHand;
        }

        this.gameState.updateState(stateUpdate);
        this.uiManager.updateUI();
        
        // Render player's hand if available
        if (playerHand && playerHand.length > 0) {
            this.cardManager.renderPlayerHand();
        }
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

        // Update game phase based on the server data
        const gamePhase = data.phase || 'starting';
        
        this.gameState.updateState({
            gamePhase: gamePhase,
            status: 'in_progress',
            currentRound: data.currentRound || 1,
            trumpDeclarer: data.trumpDeclarer,
            dealerUserId: data.dealerUserId
        });

        this.uiManager.updateUI();

        // If we're in trump declaration phase, show appropriate UI
        if (gamePhase === 'trump_declaration') {
            const currentUserId = this.authManager.getUserId();
            if (data.trumpDeclarer === currentUserId) {
                this.uiManager.addGameMessage('Your turn to declare trump!', 'info');
                // The trump modal will be shown when the game state update arrives with the player's hand
            } else {
                const declarerName = this.getPlayerName(data.trumpDeclarer);
                this.uiManager.addGameMessage(`Waiting for ${declarerName} to declare trump...`, 'info');
            }
        }
    }

    /**
     * Handle game initialized event
     * @param {Object} data - Game initialization data
     */
    handleGameInitialized(data) {
        console.log('[WebSocketGameManager] Game initialized:', data);
        
        this.uiManager.addGameMessage('Game initialized! Cards dealt.', 'success');

        // Update game state
        this.gameState.updateState({
            gamePhase: data.phase,
            status: 'in_progress',
            currentRound: data.currentRound,
            trumpDeclarer: data.trumpDeclarer,
            dealerUserId: data.dealerUserId
        });

        this.uiManager.updateUI();

        // Show trump declaration message
        const currentUserId = this.authManager.getUserId();
        if (data.trumpDeclarer === currentUserId) {
            this.uiManager.addGameMessage('Your turn to declare trump!', 'info');
        } else {
            const declarerName = this.getPlayerName(data.trumpDeclarer);
            this.uiManager.addGameMessage(`Waiting for ${declarerName} to declare trump...`, 'info');
        }
    }

    /**
     * Get player name by ID
     * @param {string} playerId - Player ID
     * @returns {string} Player name
     */
    getPlayerName(playerId) {
        const state = this.gameState.getState();
        if (state.players && state.players[playerId]) {
            return state.players[playerId].username || 'Unknown Player';
        }
        return 'Unknown Player';
    }

    /**
     * Handle game state update
     * @param {Object} data - Game state data
     */
    handleGameStateUpdate(data) {
        console.log('[WebSocketGameManager] Game state update:', data);

        // Extract game phase first
        const gamePhase = data.phase || 'playing';

        // Extract current user's hand from players data
        const currentUserId = this.authManager.getUserId();
        let playerHand = data.playerHand;
        
        console.log('[WebSocketGameManager] Debug player hand extraction:', {
            currentUserId,
            directPlayerHand: data.playerHand,
            playersData: data.players,
            currentPlayerData: data.players?.[currentUserId],
            gamePhase,
            trumpSuit: data.trumpSuit,
            trumpDeclarer: data.trumpDeclarer,
            phase: data.phase,
            hasPlayerHand: !!playerHand,
            playerHandLength: playerHand?.length || 0,
            currentPlayerHand: data.players?.[currentUserId]?.hand,
            currentPlayerCards: data.players?.[currentUserId]?.cards
        });
        
        // If playerHand is not directly provided, extract it from players data
        if (!playerHand && data.players && data.players[currentUserId]) {
            playerHand = data.players[currentUserId].hand || data.players[currentUserId].cards;
            console.log('[WebSocketGameManager] Extracted player hand from players data:', playerHand);
        }

        // Preserve existing player data and merge with new data
        const currentState = this.gameState.getState();
        const mergedPlayers = { ...currentState.players };
        
        // Merge new player data while preserving existing data
        if (data.players) {
            Object.keys(data.players).forEach(playerId => {
                if (mergedPlayers[playerId]) {
                    // Merge new data with existing player data
                    mergedPlayers[playerId] = {
                        ...mergedPlayers[playerId],
                        ...data.players[playerId]
                    };
                } else {
                    // Add new player
                    mergedPlayers[playerId] = data.players[playerId];
                }
            });
        }

        // Update game state with merged player data
        const stateUpdate = {
            ...data,
            players: mergedPlayers,
            playerHand: playerHand,
            gamePhase: gamePhase
        };

        this.gameState.updateState(stateUpdate);

        // Update card rendering if player has cards BEFORE updateUI
        if (playerHand && playerHand.length > 0) {
            console.log('[WebSocketGameManager] Rendering player hand with', playerHand.length, 'cards');
            this.cardManager.renderPlayerHand();
            
            // If this is the trump declaration phase and player has initial 4 cards, show trump modal
            console.log('[WebSocketGameManager] Trump modal check:', {
                gamePhase,
                trumpDeclarer: data.trumpDeclarer,
                currentUserId,
                isCurrentUserDeclarer: data.trumpDeclarer === currentUserId,
                playerHandLength: playerHand.length,
                shouldShowModal: gamePhase === 'trump_declaration' && data.trumpDeclarer === currentUserId && playerHand.length === 4
            });
            
            if (gamePhase === 'trump_declaration' && 
                data.trumpDeclarer === currentUserId && 
                playerHand.length === 4) {
                console.log('[WebSocketGameManager] Showing trump modal for current user (trump declarer)');
                setTimeout(() => {
                    this.trumpManager.showTrumpDeclarationModal();
                }, 1000); // Give time for cards to render
            }
        } else {
            console.log('[WebSocketGameManager] No player hand to render:', { 
                playerHand, 
                length: playerHand?.length,
                gameStatePlayerHand: this.gameState.getState().playerHand
            });
            
            // Force render if game state has player hand but we didn't extract it properly
            const gameStatePlayerHand = this.gameState.getState().playerHand;
            if (gameStatePlayerHand && gameStatePlayerHand.length > 0) {
                console.log('[WebSocketGameManager] Force rendering from game state with', gameStatePlayerHand.length, 'cards');
                this.cardManager.renderPlayerHand();
                
                // Check for trump modal in fallback case too
                if (gamePhase === 'trump_declaration' && 
                    data.trumpDeclarer === currentUserId && 
                    gameStatePlayerHand.length === 4) {
                    console.log('[WebSocketGameManager] Showing trump modal for current user (trump declarer) - fallback');
                    setTimeout(() => {
                        this.trumpManager.showTrumpDeclarationModal();
                    }, 1000);
                }
            }
        }

        // Update UI after card rendering so it doesn't override player cards
        this.uiManager.updateUI();
        this.uiManager.hideLoading();

        // Handle specific game phases
        console.log('[WebSocketGameManager] Trump declaration check:', {
            gamePhase,
            trumpDeclarer: data.trumpDeclarer,
            currentUserId,
            isMatch: data.trumpDeclarer === currentUserId
        });
    }

    /**
     * Handle trump declared event
     * @param {Object} data - Trump declaration data
     */
    handleTrumpDeclared(data) {
        console.log('[WebSocketGameManager] Trump declared:', data);
        
        const stateUpdate = {
            trumpSuit: data.trumpSuit,
            gamePhase: data.phase || 'playing',
            declaringTeam: data.declaringTeam,
            challengingTeam: data.challengingTeam
        };

        // Add current turn player if available
        if (data.currentTurnPlayer) {
            stateUpdate.currentTurnPlayer = data.currentTurnPlayer;
            stateUpdate.isMyTurn = (data.currentTurnPlayer === this.authManager.getUserId());
        }

        // Add current trick information if available
        if (data.currentTrick) {
            stateUpdate.currentTrick = data.currentTrick;
            // Use currentTurnPlayer from data if available, otherwise fall back to currentTrick.currentPlayer
            if (!stateUpdate.currentTurnPlayer && data.currentTrick.currentPlayer) {
                stateUpdate.currentTurnPlayer = data.currentTrick.currentPlayer;
                stateUpdate.isMyTurn = (data.currentTrick.currentPlayer === this.authManager.getUserId());
            }
        }

        this.gameState.updateState(stateUpdate);

        this.uiManager.updateTrumpDisplay();
        this.trumpManager.hideTrumpDeclarationModal();
        
        // Show trump declaration message with declarer name
        const declarerName = data.declaredByName || 'Someone';
        this.uiManager.showTrumpDeclaredToast(data.trumpSuit, declarerName);
        
        // Update card playability and UI
        this.cardManager.updateCardPlayability();
        this.uiManager.updateUI();

        // Show game phase message
        if (data.phase === 'playing') {
            this.uiManager.addGameMessage('All cards dealt! Trick-taking begins!', 'success');
            
            // Show whose turn it is
            if (data.currentTrick && data.currentTrick.currentPlayer) {
                const currentPlayerName = this.getPlayerName(data.currentTrick.currentPlayer);
                const currentUserId = this.authManager.getUserId();
                
                if (data.currentTrick.currentPlayer === currentUserId) {
                    this.uiManager.addGameMessage('Your turn to play a card!', 'info');
                } else {
                    this.uiManager.addGameMessage(`${currentPlayerName}'s turn to play`, 'info');
                }
            }
        }
    }

    /**
     * Handle card played event
     * @param {Object} data - Card play data
     */
    handleCardPlayed(data) {
        console.log('[WebSocketGameManager] Card played:', data);

        const state = this.gameState.getState();
        const currentUserId = this.authManager.getUserId();

        // Add card to current trick
        const currentTrick = state.currentTrick || { cardsPlayed: [], trickNumber: 1 };
        const cardPlay = {
            playerId: data.playedBy,
            card: data.card,
            playerName: data.playedByName
        };

        // Add to trick if not already present
        const existingCardIndex = currentTrick.cardsPlayed.findIndex(play => 
            play.playerId === data.playedBy && 
            play.card.suit === data.card.suit && 
            play.card.rank === data.card.rank
        );

        if (existingCardIndex === -1) {
            currentTrick.cardsPlayed.push(cardPlay);
        }

        // Set lead suit if this is the first card
        if (currentTrick.cardsPlayed.length === 1) {
            currentTrick.leadSuit = data.card.suit;
            this.gameState.updateState({ leadSuit: data.card.suit });
        }

        // Update trick state
        this.gameState.updateTrick({
            cardsPlayed: currentTrick.cardsPlayed,
            leadSuit: currentTrick.leadSuit
        });

        // Update current player turn (unless trick is complete)
        if (currentTrick.cardsPlayed.length < 4) {
            // Use nextPlayerId from server if provided, otherwise calculate it
            let nextPlayerId = data.nextPlayerId;
            
            if (!nextPlayerId) {
                // Fallback: determine next player using proper turn order
                const playerIds = Object.keys(state.players || {}).sort(); // Sort for consistency
                const currentPlayerIndex = playerIds.indexOf(data.playedBy);
                const nextPlayerIndex = (currentPlayerIndex + 1) % playerIds.length;
                nextPlayerId = playerIds[nextPlayerIndex];
            }

            this.gameState.updateState({
                currentTurnPlayer: nextPlayerId,
                isMyTurn: (nextPlayerId === currentUserId)
            });

            console.log(`[WebSocketGameManager] Turn updated: ${data.playedBy} -> ${nextPlayerId} (isMyTurn: ${nextPlayerId === currentUserId})`);
        }

        // Render the played card
        const playerPosition = this.getPlayerPosition(data.playedBy);
        this.cardManager.renderPlayedCard(data.playedBy, data.card, playerPosition);

        // Update opponent hand sizes
        this.gameState.updatePlayer(data.playedBy, { 
            handSize: (this.gameState.getState().players[data.playedBy]?.handSize || 8) - 1 
        });

        // If this was the current user's card, remove it from their hand
        if (data.playedBy === currentUserId) {
            const playerHand = state.playerHand || [];
            const cardIndex = playerHand.findIndex(c => c.suit === data.card.suit && c.rank === data.card.rank);
            if (cardIndex !== -1) {
                playerHand.splice(cardIndex, 1);
                this.gameState.updateState({ playerHand });
                this.cardManager.renderPlayerHand();
            }
        }

        // Update UI
        this.uiManager.updateTurnIndicators();
        this.cardManager.updateCardPlayability();

        // Add game message
        const playerName = data.playedByName || this.gameState.getPlayerNameById(data.playedBy);
        this.uiManager.addGameMessage(`${playerName} played ${data.card.rank} of ${data.card.suit}`, 'info');

        // Check if trick is complete (4 cards played) - server will handle evaluation
        if (currentTrick.cardsPlayed.length === 4) {
            console.log('[WebSocketGameManager] Trick complete, waiting for server evaluation...');
            // Server will handle trick evaluation and send game:trick_won event
        }
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
     * Handle bots added event
     * @param {Object} data - Bots added data
     */
    handleBotsAdded(data) {
        console.log('[WebSocketGameManager] Bots added:', data);
        
        // Add bots to game state
        const botPlayers = {};
        data.bots.forEach(bot => {
            botPlayers[bot.userId] = {
                username: bot.username,
                isReady: bot.isReady,
                teamAssignment: bot.teamAssignment,
                isConnected: bot.isConnected,
                isBot: bot.isBot,
                hand: [],
                handSize: 0,
                tricksWon: 0
            };
        });

        this.gameState.updateState({
            players: {
                ...this.gameState.getState().players,
                ...botPlayers
            }
        });

        // Update UI to show bots
        this.uiManager.updateUI();

        // Show message about bots being added
        const botCount = data.bots.length;
        this.uiManager.addGameMessage(`${botCount} bot${botCount > 1 ? 's' : ''} added to the game`, 'info');
    }

    /**
     * Handle next trick event
     * @param {Object} data - Next trick data
     */
    handleNextTrick(data) {
        console.log('[WebSocketGameManager] Next trick starting:', data);
        
        // Clear played cards from table
        this.uiManager.clearPlayedCards();
        
        // Update game state
        this.gameState.updateState({
            currentTurnPlayer: data.leaderId,
            isMyTurn: (data.leaderId === this.authManager.getUserId()),
            currentTrick: {
                trickNumber: data.trickNumber,
                cardsPlayed: [],
                leadSuit: null
            },
            scores: data.scores
        });
        
        // Update UI
        this.uiManager.updateTurnIndicators();
        this.uiManager.updateScoreDisplay(true);
        
        // Show message
        const isMyTurn = data.leaderId === this.authManager.getUserId();
        if (isMyTurn) {
            this.uiManager.addGameMessage(`Trick ${data.trickNumber}: Your turn to lead!`, 'info');
        } else {
            this.uiManager.addGameMessage(`Trick ${data.trickNumber}: ${data.leaderName} leads`, 'info');
        }
    }

    /**
     * Handle round completion event
     * @param {Object} data - Round completion data
     */
    handleRoundComplete(data) {
        console.log('[WebSocketGameManager] Round complete:', data);
        
        // Update game state with round results
        this.gameState.updateState({
            roundScores: data.roundScores,
            lastRoundWinner: data.roundWinner,
            scores: { team1: 0, team2: 0 } // Reset trick scores for display
        });
        
        // Update UI
        this.uiManager.updateScoreDisplay(true);
        this.uiManager.updateRoundScoreDisplay(true);
        
        // Show round completion message
        this.uiManager.addGameMessage('Round complete!', 'success');
        this.uiManager.addGameMessage(
            `Tricks won - Team 1: ${data.trickScores.team1}, Team 2: ${data.trickScores.team2}`,
            'info'
        );
        this.uiManager.addGameMessage(`${data.roundWinner.teamName} wins the round!`, 'success');
        
        // Show congratulations modal
        setTimeout(() => {
            this.uiManager.showCongratulationsModal(
                data.roundWinner,
                data.trickScores,
                data.roundScores
            );
        }, 2000);
    }

    /**
     * Handle next round start
     * @param {Object} roundWinner - Round winner information
     */
    handleNextRound(roundWinner) {
        console.log('[WebSocketGameManager] Starting next round after:', roundWinner);
        
        // Request server to start next round
        if (this.socket) {
            this.socket.emit('start-next-round', {
                gameId: this.gameId,
                previousRoundWinner: roundWinner
            });
        }
    }

    /**
     * Handle new round event
     * @param {Object} data - New round data
     */
    handleNewRound(data) {
        console.log('[WebSocketGameManager] New round starting:', data);
        
        // Clear played cards and reset UI
        this.uiManager.clearPlayedCards();
        this.uiManager.hideCongratulationsModal();
        
        // Show new round message
        this.uiManager.addGameMessage(`Round ${data.roundNumber} begins!`, 'success');
        
        const currentUserId = this.authManager.getUserId();
        if (data.trumpDeclarer === currentUserId) {
            this.uiManager.addGameMessage('Your turn to declare trump!', 'info');
        } else {
            this.uiManager.addGameMessage(`${data.trumpDeclarerName} will declare trump`, 'info');
        }
    }

    /**
     * Handle game completion event
     * @param {Object} data - Game completion data
     */
    handleGameComplete(data) {
        console.log('[WebSocketGameManager] Game complete:', data);
        
        // Show game over message
        this.uiManager.addGameMessage(`Game Over! ${data.winner} wins with ${data.finalScore} points`, 'success');
        
        // Show game over modal or redirect after delay
        setTimeout(() => {
            if (confirm(`Game Over! ${data.winner} wins with ${data.finalScore} points\n\nReturn to waiting room?`)) {
                window.location.href = '/waiting-room.html';
            }
        }, 3000);
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