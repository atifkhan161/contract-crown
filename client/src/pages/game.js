/**
 * Game Page - Contract Crown PWA
 * Handles game table layout, card display, and basic game state management
 */

import { AuthManager } from '../core/auth.js';

class GameManager {
    constructor() {
        this.authManager = new AuthManager();
        this.socket = null;
        this.gameState = {
            gameId: null,
            currentPlayer: 'player1',
            players: {
                'player1': { username: 'You', seatPosition: 1, handSize: 4 },
                'player2': { username: 'Player 2', seatPosition: 2, handSize: 4 },
                'player3': { username: 'Player 3', seatPosition: 3, handSize: 4 },
                'player4': { username: 'Player 4', seatPosition: 4, handSize: 4 }
            },
            currentRound: 1,
            currentTrick: 1,
            trumpSuit: null,
            trumpDeclarer: 'player1',
            scores: { team1: 0, team2: 0 },
            playerHand: [
                // Initial 4 cards for trump declaration
                { suit: 'hearts', rank: 'A' },
                { suit: 'hearts', rank: 'K' },
                { suit: 'diamonds', rank: 'Q' },
                { suit: 'spades', rank: 'J' }
            ],
            selectedCard: null,
            isMyTurn: false,
            gamePhase: 'trump_declaration', // waiting, trump_declaration, playing, round_end
            leadSuit: null,
            currentTurnPlayer: null
        };
        
        this.elements = {};
        this.init();
    }

    async init() {
        try {
            // Check authentication
            if (!this.authManager.isAuthenticated()) {
                window.location.href = '/login.html';
                return;
            }

            this.initializeElements();
            this.setupEventListeners();
            this.initializeWebSocket();
            this.updateUI();
            
            // Show loading initially
            this.showLoading('Connecting to game...');
            
        } catch (error) {
            console.error('Failed to initialize game:', error);
            this.showError('Failed to initialize game. Please try again.');
        }
    }

    initializeElements() {
        // Header elements
        this.elements.leaveGameBtn = document.getElementById('leave-game-btn');
        this.elements.currentRound = document.getElementById('current-round');
        this.elements.connectionStatus = document.getElementById('connection-status');
        this.elements.statusIndicator = document.getElementById('status-indicator');
        this.elements.statusText = document.getElementById('status-text');

        // Player elements
        this.elements.playerTopName = document.getElementById('player-top-name');
        this.elements.playerLeftName = document.getElementById('player-left-name');
        this.elements.playerRightName = document.getElementById('player-right-name');
        this.elements.playerBottomName = document.getElementById('player-bottom-name');
        
        this.elements.playerTopCards = document.getElementById('player-top-cards');
        this.elements.playerLeftCards = document.getElementById('player-left-cards');
        this.elements.playerRightCards = document.getElementById('player-right-cards');
        this.elements.playerBottomCards = document.getElementById('player-bottom-cards');
        
        this.elements.playerTopTurn = document.getElementById('player-top-turn');
        this.elements.playerLeftTurn = document.getElementById('player-left-turn');
        this.elements.playerRightTurn = document.getElementById('player-right-turn');
        this.elements.playerBottomTurn = document.getElementById('player-bottom-turn');
        
        this.elements.playerTopHand = document.getElementById('player-top-hand');
        this.elements.playerLeftHand = document.getElementById('player-left-hand');
        this.elements.playerRightHand = document.getElementById('player-right-hand');
        this.elements.playerHand = document.getElementById('player-hand');

        // Center table elements
        this.elements.trumpSuit = document.getElementById('trump-suit');
        this.elements.currentTrick = document.getElementById('current-trick');
        this.elements.trickArea = document.getElementById('trick-area');
        this.elements.playedCardTop = document.getElementById('played-card-top');
        this.elements.playedCardLeft = document.getElementById('played-card-left');
        this.elements.playedCardRight = document.getElementById('played-card-right');
        this.elements.playedCardBottom = document.getElementById('played-card-bottom');
        
        // Score elements
        this.elements.team1Score = document.getElementById('team-1-score');
        this.elements.team2Score = document.getElementById('team-2-score');

        // Modal elements
        this.elements.trumpModal = document.getElementById('trump-modal');
        this.elements.trumpOptions = document.querySelectorAll('.trump-option');
        this.elements.confirmTrumpBtn = document.getElementById('confirm-trump-btn');

        // Messages and overlays
        this.elements.gameMessages = document.getElementById('game-messages');
        this.elements.loadingOverlay = document.getElementById('loading-overlay');
        this.elements.loadingText = document.getElementById('loading-text');
        this.elements.errorModal = document.getElementById('error-modal');
        this.elements.errorMessage = document.getElementById('error-message');
        this.elements.closeErrorBtn = document.getElementById('close-error-btn');
        this.elements.errorOkBtn = document.getElementById('error-ok-btn');
    }

    setupEventListeners() {
        // Leave game button
        this.elements.leaveGameBtn.addEventListener('click', () => this.leaveGame());

        // Trump declaration
        this.elements.trumpOptions.forEach(option => {
            option.addEventListener('click', (e) => this.selectTrumpSuit(e.currentTarget));
        });
        this.elements.confirmTrumpBtn.addEventListener('click', () => this.confirmTrumpDeclaration());

        // Error modal
        this.elements.closeErrorBtn.addEventListener('click', () => this.hideError());
        this.elements.errorOkBtn.addEventListener('click', () => this.hideError());

        // Card selection (will be set up when cards are rendered)
        this.elements.playerHand.addEventListener('click', (e) => this.handleCardClick(e));
    }

    initializeWebSocket() {
        if (typeof io === 'undefined') {
            this.showError('WebSocket connection not available');
            return;
        }

        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to game server');
            this.updateConnectionStatus('connected');
            this.joinGame();
            
            // Fallback: hide loading after 5 seconds if no game state received
            setTimeout(() => {
                if (this.elements.loadingOverlay && !this.elements.loadingOverlay.classList.contains('hidden')) {
                    console.log('Fallback: hiding loading screen after timeout');
                    this.hideLoading();
                    this.addGameMessage('Connected to game server', 'success');
                }
            }, 5000);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from game server');
            this.updateConnectionStatus('disconnected');
            this.addGameMessage('Disconnected from server', 'warning');
        });

        this.socket.on('reconnecting', () => {
            console.log('Reconnecting to game server');
            this.updateConnectionStatus('connecting');
            this.addGameMessage('Reconnecting to server...', 'info');
        });

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.addGameMessage('Connection error occurred', 'error');
        });

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

    joinGame() {
        const urlParams = new URLSearchParams(window.location.search);
        const gameId = urlParams.get('gameId');
        
        if (!gameId) {
            this.showError('No game ID provided');
            return;
        }

        this.gameState.gameId = gameId;
        
        // Join the game room
        this.socket.emit('join-game-room', { 
            gameId: gameId,
            userId: this.authManager.getUserId(),
            username: this.authManager.getUsername()
        });
        
        // Request initial game state
        setTimeout(() => {
            this.socket.emit('request-game-state', { gameId: gameId });
        }, 500);
    }

    // Room Event Handlers
    handleRoomJoined(data) {
        console.log('Room joined:', data);
        this.hideLoading();
        this.addGameMessage(`Joined game room with ${data.playerCount} players`, 'success');
        
        // Update game state with room data
        this.gameState.players = {};
        data.players.forEach(player => {
            this.gameState.players[player.userId] = {
                username: player.username,
                isReady: player.isReady,
                teamAssignment: player.teamAssignment,
                isConnected: player.isConnected
            };
        });
        
        this.updateUI();
    }

    handlePlayerJoined(data) {
        console.log('Player joined:', data);
        this.addGameMessage(`${data.player.username} joined the game`, 'info');
        
        // Update players list
        this.gameState.players[data.player.userId] = {
            username: data.player.username,
            isReady: data.player.isReady,
            teamAssignment: data.player.teamAssignment,
            isConnected: true
        };
        
        this.updateUI();
    }

    handlePlayerLeft(data) {
        console.log('Player left:', data);
        this.addGameMessage(`${data.playerName} left the game`, 'warning');
        
        // Remove player from state
        if (this.gameState.players[data.playerId]) {
            delete this.gameState.players[data.playerId];
        }
        
        this.updateUI();
    }

    handlePlayerReadyChanged(data) {
        console.log('Player ready changed:', data);
        const readyText = data.isReady ? 'ready' : 'not ready';
        this.addGameMessage(`${data.playerName} is ${readyText}`, 'info');
        
        // Update player ready status
        if (this.gameState.players[data.playerId]) {
            this.gameState.players[data.playerId].isReady = data.isReady;
        }
        
        this.updateUI();
    }

    handleTeamsFormed(data) {
        console.log('Teams formed:', data);
        this.addGameMessage(`Teams formed by ${data.formedBy}`, 'success');
        
        // Update team assignments
        data.players.forEach(player => {
            if (this.gameState.players[player.userId]) {
                this.gameState.players[player.userId].teamAssignment = player.teamAssignment;
            }
        });
        
        this.updateUI();
    }

    handleGameStarting(data) {
        console.log('Game starting:', data);
        this.addGameMessage(`Game starting! Started by ${data.startedBy}`, 'success');
        
        // Update game phase
        this.gameState.gamePhase = 'starting';
        this.gameState.status = 'starting';
        
        this.updateUI();
    }

    // Game State Management
    handleGameStateUpdate(data) {
        console.log('Game state update:', data);
        
        this.gameState = { ...this.gameState, ...data };
        this.updateUI();
        this.hideLoading();
        
        // Handle different game phases
        if (data.gamePhase === 'trump_declaration' && data.trumpDeclarer === this.gameState.currentPlayer) {
            setTimeout(() => {
                this.showTrumpDeclarationModal();
                this.highlightRecommendedSuit();
            }, 500);
        }
    }

    handleTrumpDeclared(data) {
        console.log('Trump declared:', data);
        this.gameState.trumpSuit = data.trumpSuit;
        this.gameState.gamePhase = 'playing';
        this.updateTrumpDisplay();
        this.hideTrumpDeclarationModal();
        this.handleTrumpDeclarationComplete();
        this.addGameMessage(`Trump suit declared: ${data.trumpSuit}`, 'success');
    }

    handleCardPlayed(data) {
        console.log('Card played:', data);
        
        // Update current trick state
        if (data.cardsInTrick) {
            this.gameState.currentTrick = {
                ...this.gameState.currentTrick,
                cardsPlayed: data.cardsInTrick
            };
        }

        // Update current player turn
        if (data.nextPlayerId) {
            this.gameState.currentTurnPlayer = data.nextPlayerId;
            this.gameState.isMyTurn = (data.nextPlayerId === this.getCurrentPlayerId());
        }

        // Render the played card with animation
        const playerPosition = this.getPlayerPositionById(data.playedBy);
        this.renderPlayedCard(data.playedBy, data.card, playerPosition);
        
        // Update opponent hand sizes
        this.updateOpponentHandSize(data.playedBy);
        
        // Update UI elements
        this.updateTurnIndicators();
        this.updateCardPlayability();
        
        // Add game message
        const playerName = data.playedByName || this.getPlayerNameById(data.playedBy);
        this.addGameMessage(`${playerName} played ${data.card.rank} of ${data.card.suit}`, 'info');
        
        // Show visual feedback for suit following
        this.highlightLeadSuit(data.card);
    }

    /**
     * Get current player ID
     * @returns {string} Current player ID
     */
    getCurrentPlayerId() {
        // This should be set during game initialization
        return this.gameState.currentPlayer || 'player1';
    }

    /**
     * Get player position by player ID
     * @param {string} playerId - Player ID
     * @returns {string} Player position (top, left, right, bottom)
     */
    getPlayerPositionById(playerId) {
        // Map player IDs to positions based on seat arrangement
        const playerPositions = {
            [this.getCurrentPlayerId()]: 'bottom',
            // This mapping should be set up during game initialization
            // For now, use a simple mapping
        };
        
        // If not found, determine position based on player order
        const players = Object.keys(this.gameState.players || {});
        const currentIndex = players.indexOf(this.getCurrentPlayerId());
        const targetIndex = players.indexOf(playerId);
        
        if (currentIndex === -1 || targetIndex === -1) return 'top';
        
        const relativePosition = (targetIndex - currentIndex + 4) % 4;
        const positions = ['bottom', 'left', 'top', 'right'];
        return positions[relativePosition];
    }

    /**
     * Get player name by ID
     * @param {string} playerId - Player ID
     * @returns {string} Player name
     */
    getPlayerNameById(playerId) {
        if (this.gameState.players && this.gameState.players[playerId]) {
            return this.gameState.players[playerId].username;
        }
        return `Player ${playerId}`;
    }

    /**
     * Update opponent hand size after card play
     * @param {string} playerId - Player who played the card
     */
    updateOpponentHandSize(playerId) {
        if (this.gameState.players && this.gameState.players[playerId]) {
            const player = this.gameState.players[playerId];
            if (player.handSize > 0) {
                player.handSize--;
            }
        }
        this.updatePlayerInfo();
    }

    /**
     * Highlight the lead suit for visual feedback
     * @param {Object} card - Card that was played
     */
    highlightLeadSuit(card) {
        const currentTrick = this.gameState.currentTrick;
        if (!currentTrick || !currentTrick.cardsPlayed) return;
        
        // If this is the first card, it sets the lead suit
        if (currentTrick.cardsPlayed.length === 1) {
            this.gameState.leadSuit = card.suit;
            this.showLeadSuitIndicator(card.suit);
        }
    }

    /**
     * Show lead suit indicator
     * @param {string} suit - Lead suit
     */
    showLeadSuitIndicator(suit) {
        const suitSymbols = {
            hearts: '♥',
            diamonds: '♦',
            clubs: '♣',
            spades: '♠'
        };
        
        const message = `Lead suit: ${suitSymbols[suit]} ${suit.charAt(0).toUpperCase() + suit.slice(1)}`;
        this.addGameMessage(message, 'info');
        
        // Add visual indicator to trick area
        const trickArea = this.elements.trickArea;
        if (trickArea) {
            const leadSuitIndicator = trickArea.querySelector('.lead-suit-indicator') || 
                document.createElement('div');
            leadSuitIndicator.className = 'lead-suit-indicator';
            leadSuitIndicator.innerHTML = `
                <span class="lead-suit-label">Lead:</span>
                <span class="lead-suit-symbol ${suit}">${suitSymbols[suit]}</span>
            `;
            
            if (!trickArea.querySelector('.lead-suit-indicator')) {
                trickArea.appendChild(leadSuitIndicator);
            }
        }
    }

    handleTrickWon(data) {
        console.log('Trick won:', data);
        
        // Update game state with trick winner
        this.gameState.currentTrick = {
            ...this.gameState.currentTrick,
            winner: data.winnerId,
            winningCard: data.winningCard,
            complete: true
        };

        // Show trick winner animation
        this.showTrickWinnerAnimation(data.winnerId, data.winningCard);
        
        // Add game message
        const winnerName = data.winnerName || this.getPlayerNameById(data.winnerId);
        this.addGameMessage(`${winnerName} won the trick with ${data.winningCard.rank} of ${data.winningCard.suit}`, 'success');
        
        // Clear played cards and prepare for next trick after animation
        setTimeout(() => {
            this.clearPlayedCards();
            this.prepareNextTrick(data);
        }, 2500);
    }

    /**
     * Show trick winner animation
     * @param {string} winnerId - Winner player ID
     * @param {Object} winningCard - Winning card
     */
    showTrickWinnerAnimation(winnerId, winningCard) {
        // Highlight the winning card
        const playedCards = document.querySelectorAll('.played-card');
        playedCards.forEach(card => {
            const cardRank = card.querySelector('.card-rank')?.textContent;
            const cardSuit = card.querySelector('.card-suit')?.textContent;
            
            if (cardRank === winningCard.rank && this.getSuitSymbol(winningCard.suit) === cardSuit) {
                card.classList.add('winning-card');
                
                // Add pulsing animation
                setTimeout(() => {
                    card.classList.add('winner-pulse');
                }, 100);
            } else {
                card.classList.add('losing-card');
            }
        });

        // Highlight winner's position
        const winnerPosition = this.getPlayerPositionById(winnerId);
        const winnerTurnIndicator = this.elements[`player${winnerPosition.charAt(0).toUpperCase() + winnerPosition.slice(1)}Turn`];
        if (winnerTurnIndicator) {
            winnerTurnIndicator.classList.add('trick-winner');
            setTimeout(() => {
                winnerTurnIndicator.classList.remove('trick-winner');
            }, 2000);
        }
    }

    /**
     * Get suit symbol for display
     * @param {string} suit - Suit name
     * @returns {string} Suit symbol
     */
    getSuitSymbol(suit) {
        const symbols = {
            hearts: '♥',
            diamonds: '♦',
            clubs: '♣',
            spades: '♠'
        };
        return symbols[suit] || '?';
    }

    /**
     * Prepare for next trick
     * @param {Object} trickData - Trick completion data
     */
    prepareNextTrick(trickData) {
        // Update trick number
        if (this.gameState.currentRound) {
            this.gameState.currentRound.currentTrick = (this.gameState.currentRound.currentTrick || 1) + 1;
        }

        // Set next leader
        if (trickData.nextLeaderId) {
            this.gameState.currentTurnPlayer = trickData.nextLeaderId;
            this.gameState.isMyTurn = (trickData.nextLeaderId === this.getCurrentPlayerId());
        }

        // Clear lead suit for new trick
        this.gameState.leadSuit = null;
        
        // Remove lead suit indicator
        const leadSuitIndicator = document.querySelector('.lead-suit-indicator');
        if (leadSuitIndicator) {
            leadSuitIndicator.remove();
        }

        // Update UI
        this.updateUI();
        
        // Check if this was the last trick of the round
        if (this.gameState.currentRound && this.gameState.currentRound.currentTrick > 8) {
            this.addGameMessage('Round complete! Calculating scores...', 'info');
        } else {
            const nextTrickNumber = this.gameState.currentRound?.currentTrick || 1;
            this.addGameMessage(`Starting trick ${nextTrickNumber}`, 'info');
        }
    }

    handleRoundScores(data) {
        console.log('Round scores:', data);
        
        // Update game state with new scores
        this.gameState.scores = data.scores;
        this.gameState.currentRound = {
            ...this.gameState.currentRound,
            complete: true,
            roundNumber: data.roundNumber,
            declaringTeamTricks: data.declaringTeamTricks,
            challengingTeamTricks: data.challengingTeamTricks
        };

        // Show round completion animation
        this.showRoundCompletionAnimation(data);
        
        // Update score display with animation
        this.updateScoreDisplay(true);
        
        // Show detailed round results
        this.showRoundResults(data);
        
        // Check if game is complete
        if (data.gameComplete) {
            setTimeout(() => {
                this.handleGameComplete(data);
            }, 3000);
        } else if (data.nextRound) {
            // Prepare for next round
            setTimeout(() => {
                this.prepareNextRound(data.nextRound);
            }, 4000);
        }
    }

    /**
     * Show round completion animation
     * @param {Object} data - Round completion data
     */
    showRoundCompletionAnimation(data) {
        // Create round completion overlay
        const overlay = document.createElement('div');
        overlay.className = 'round-completion-overlay';
        overlay.innerHTML = `
            <div class="round-completion-content">
                <h2>Round ${data.roundNumber} Complete!</h2>
                <div class="round-stats">
                    <div class="team-result">
                        <h3>Declaring Team</h3>
                        <p>${data.declaringTeamTricks} tricks won</p>
                        <p class="${data.declaringTeamTricks >= 5 ? 'success' : 'failure'}">
                            ${data.declaringTeamTricks >= 5 ? 'Contract Made!' : 'Contract Failed'}
                        </p>
                    </div>
                    <div class="team-result">
                        <h3>Challenging Team</h3>
                        <p>${data.challengingTeamTricks} tricks won</p>
                        <p class="${data.challengingTeamTricks >= 4 ? 'success' : 'failure'}">
                            ${data.challengingTeamTricks >= 4 ? 'Points Earned!' : 'No Points'}
                        </p>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Remove overlay after animation
        setTimeout(() => {
            overlay.classList.add('fade-out');
            setTimeout(() => {
                document.body.removeChild(overlay);
            }, 500);
        }, 2500);
    }

    /**
     * Show detailed round results
     * @param {Object} data - Round completion data
     */
    showRoundResults(data) {
        const message = `Round ${data.roundNumber}: Declaring team ${data.declaringTeamTricks} tricks, Challenging team ${data.challengingTeamTricks} tricks`;
        this.addGameMessage(message, 'success');
        
        // Show score changes
        Object.entries(data.scores).forEach(([teamId, score]) => {
            if (score > 0) {
                const teamName = this.getTeamName(teamId);
                this.addGameMessage(`${teamName} earned ${score} points`, 'info');
            }
        });
    }

    /**
     * Get team name for display
     * @param {string} teamId - Team ID
     * @returns {string} Team display name
     */
    getTeamName(teamId) {
        // This should be enhanced based on actual team data
        if (this.gameState.teams) {
            const team = this.gameState.teams.find(t => t.teamId === teamId);
            if (team) {
                return `Team ${team.teamNumber}`;
            }
        }
        return `Team ${teamId}`;
    }

    /**
     * Prepare for next round
     * @param {Object} nextRoundData - Next round information
     */
    prepareNextRound(nextRoundData) {
        console.log('Preparing next round:', nextRoundData);
        
        // Update game state for new round
        this.gameState.currentRound = {
            roundId: nextRoundData.roundId,
            roundNumber: nextRoundData.roundNumber,
            dealerUserId: nextRoundData.dealerUserId,
            firstPlayerUserId: nextRoundData.firstPlayerUserId,
            trumpDeclarerUserId: nextRoundData.trumpDeclarerUserId,
            currentTrick: 1,
            complete: false
        };

        // Reset trump suit for new round
        this.gameState.trumpSuit = null;
        this.gameState.gamePhase = 'trump_declaration';
        
        // Update player hands with new cards
        if (nextRoundData.playerHands && nextRoundData.playerHands[this.getCurrentPlayerId()]) {
            this.gameState.playerHand = nextRoundData.playerHands[this.getCurrentPlayerId()];
        }

        // Clear played cards
        this.clearPlayedCards();
        
        // Update UI
        this.updateUI();
        
        // Show new round message
        this.addGameMessage(`Starting Round ${nextRoundData.roundNumber}`, 'success');
        
        // If current player is trump declarer, show trump selection
        if (nextRoundData.trumpDeclarerUserId === this.getCurrentPlayerId()) {
            setTimeout(() => {
                this.showTrumpDeclarationModal();
                this.addGameMessage('Choose the trump suit for this round', 'info');
            }, 1000);
        } else {
            const declarerName = this.getPlayerNameById(nextRoundData.trumpDeclarerUserId);
            this.addGameMessage(`Waiting for ${declarerName} to declare trump...`, 'info');
        }
    }

    /**
     * Handle game completion
     * @param {Object} data - Game completion data
     */
    handleGameComplete(data) {
        console.log('Game complete:', data);
        
        this.gameState.status = 'completed';
        this.gameState.winner = data.winningTeam;
        
        // Show game completion modal
        this.showGameCompletionModal(data);
    }

    /**
     * Show game completion modal
     * @param {Object} data - Game completion data
     */
    showGameCompletionModal(data) {
        const modal = document.createElement('div');
        modal.className = 'game-completion-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="game-complete-header">
                    <h1>🎉 Game Complete! 🎉</h1>
                </div>
                <div class="winner-announcement">
                    <h2>${data.winningTeam ? `Team ${data.winningTeam.teamNumber} Wins!` : 'Game Complete'}</h2>
                    <p class="final-score">Final Score: ${data.winningTeam ? data.winningTeam.finalScore : 'N/A'} points</p>
                </div>
                <div class="final-scores">
                    <h3>Final Scores</h3>
                    <div class="score-list">
                        ${Object.entries(data.scores || {}).map(([teamId, score]) => `
                            <div class="team-final-score ${teamId === data.winningTeam?.teamId ? 'winner' : ''}">
                                <span>${this.getTeamName(teamId)}</span>
                                <span>${score} points</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="game-actions">
                    <button id="return-to-dashboard" class="btn btn-primary">Return to Dashboard</button>
                    <button id="view-statistics" class="btn btn-secondary">View Statistics</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Add event listeners
        document.getElementById('return-to-dashboard').addEventListener('click', () => {
            window.location.href = '/dashboard.html';
        });

        document.getElementById('view-statistics').addEventListener('click', () => {
            this.showGameStatistics();
        });
    }

    /**
     * Show game statistics
     */
    async showGameStatistics() {
        try {
            // Fetch game statistics from server
            const response = await fetch(`/api/statistics/game/${this.gameState.gameId}`, {
                headers: {
                    'Authorization': `Bearer ${this.authManager.getToken()}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch game statistics');
            }

            const result = await response.json();
            if (result.success) {
                this.displayGameStatisticsModal(result.data);
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Error fetching game statistics:', error);
            this.addGameMessage('Failed to load game statistics', 'error');
        }
    }

    /**
     * Display game statistics modal
     * @param {Object} stats - Game statistics data
     */
    displayGameStatisticsModal(stats) {
        const modal = document.createElement('div');
        modal.className = 'statistics-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Game Statistics</h2>
                    <button class="close-btn" id="close-stats-modal">&times;</button>
                </div>
                <div class="statistics-content">
                    <div class="game-overview">
                        <h3>Game Overview</h3>
                        <div class="stat-grid">
                            <div class="stat-item">
                                <span class="stat-label">Duration</span>
                                <span class="stat-value">${this.formatDuration(stats.duration)}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Total Rounds</span>
                                <span class="stat-value">${stats.totalRounds || 'N/A'}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Total Tricks</span>
                                <span class="stat-value">${stats.totalTricks || 'N/A'}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Game Status</span>
                                <span class="stat-value">${stats.status || 'Completed'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="player-performance">
                        <h3>Player Performance</h3>
                        <div class="performance-table">
                            <div class="table-header">
                                <span>Player</span>
                                <span>Team</span>
                                <span>Tricks Won</span>
                                <span>Team Score</span>
                                <span>Result</span>
                            </div>
                            ${this.renderPlayerPerformance(stats.players || stats.playerStats)}
                        </div>
                    </div>
                    
                    ${stats.trumpStats ? this.renderTrumpStatistics(stats.trumpStats) : ''}
                    
                    <div class="personal-stats">
                        <h3>Your Performance</h3>
                        ${this.renderPersonalStats(stats)}
                    </div>
                </div>
                <div class="modal-actions">
                    <button id="share-stats" class="btn btn-secondary">Share Stats</button>
                    <button id="download-stats" class="btn btn-secondary">Download</button>
                    <button id="view-profile" class="btn btn-primary">View Profile</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Add event listeners
        document.getElementById('close-stats-modal').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        document.getElementById('share-stats').addEventListener('click', () => {
            this.shareGameStats(stats);
        });

        document.getElementById('download-stats').addEventListener('click', () => {
            this.downloadGameStats(stats);
        });

        document.getElementById('view-profile').addEventListener('click', () => {
            window.location.href = '/profile.html';
        });

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    /**
     * Format duration in milliseconds to readable format
     * @param {number} duration - Duration in milliseconds
     * @returns {string} Formatted duration
     */
    formatDuration(duration) {
        if (!duration) return 'N/A';
        
        const minutes = Math.floor(duration / 60000);
        const seconds = Math.floor((duration % 60000) / 1000);
        
        if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Render player performance table
     * @param {Array} players - Player performance data
     * @returns {string} HTML for player performance
     */
    renderPlayerPerformance(players) {
        if (!players || players.length === 0) {
            return '<div class="no-data">No player data available</div>';
        }

        return players.map(player => `
            <div class="table-row ${player.isWinner ? 'winner' : ''}">
                <span class="player-name">${player.username}</span>
                <span class="team-info">Team ${this.getTeamNumber(player.teamId)}</span>
                <span class="tricks-won">${player.tricksWon || 0}</span>
                <span class="team-score">${player.teamScore || 0}</span>
                <span class="result ${player.isWinner ? 'win' : 'loss'}">
                    ${player.isWinner ? '🏆 Win' : '❌ Loss'}
                </span>
            </div>
        `).join('');
    }

    /**
     * Render trump declaration statistics
     * @param {Object} trumpStats - Trump statistics data
     * @returns {string} HTML for trump statistics
     */
    renderTrumpStatistics(trumpStats) {
        const statsEntries = Object.entries(trumpStats);
        if (statsEntries.length === 0) {
            return '';
        }

        return `
            <div class="trump-statistics">
                <h3>Trump Declaration Statistics</h3>
                <div class="trump-stats-grid">
                    ${statsEntries.map(([playerId, stats]) => `
                        <div class="trump-stat-item">
                            <span class="player-name">${this.getPlayerNameById(playerId)}</span>
                            <div class="trump-details">
                                <span class="declarations">Declarations: ${stats.declarations}</span>
                                <span class="successful">Successful: ${stats.successful}</span>
                                <span class="failed">Failed: ${stats.failed}</span>
                                <span class="success-rate">Success Rate: ${
                                    stats.declarations > 0 
                                        ? Math.round((stats.successful / stats.declarations) * 100)
                                        : 0
                                }%</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render personal statistics
     * @param {Object} stats - Game statistics
     * @returns {string} HTML for personal stats
     */
    renderPersonalStats(stats) {
        const currentPlayerId = this.getCurrentPlayerId();
        const playerStats = (stats.players || stats.playerStats || [])
            .find(p => p.userId === currentPlayerId);

        if (!playerStats) {
            return '<div class="no-data">No personal statistics available</div>';
        }

        const trumpStats = stats.trumpStats && stats.trumpStats[currentPlayerId];

        return `
            <div class="personal-stats-grid">
                <div class="personal-stat">
                    <span class="stat-icon">🎯</span>
                    <span class="stat-label">Tricks Won</span>
                    <span class="stat-value">${playerStats.tricksWon || 0}</span>
                </div>
                <div class="personal-stat">
                    <span class="stat-icon">⭐</span>
                    <span class="stat-label">Team Score</span>
                    <span class="stat-value">${playerStats.teamScore || 0}</span>
                </div>
                <div class="personal-stat">
                    <span class="stat-icon">${playerStats.isWinner ? '🏆' : '🎮'}</span>
                    <span class="stat-label">Result</span>
                    <span class="stat-value">${playerStats.isWinner ? 'Victory' : 'Defeat'}</span>
                </div>
                ${trumpStats ? `
                    <div class="personal-stat">
                        <span class="stat-icon">♠</span>
                        <span class="stat-label">Trump Success</span>
                        <span class="stat-value">${trumpStats.successful}/${trumpStats.declarations}</span>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Get team number from team ID
     * @param {string} teamId - Team ID
     * @returns {number} Team number
     */
    getTeamNumber(teamId) {
        // This should be enhanced based on actual team data
        if (this.gameState.teams) {
            const team = this.gameState.teams.find(t => t.teamId === teamId);
            if (team) return team.teamNumber;
        }
        return teamId.includes('1') ? 1 : 2;
    }

    /**
     * Share game statistics
     * @param {Object} stats - Game statistics
     */
    shareGameStats(stats) {
        const currentPlayer = (stats.players || stats.playerStats || [])
            .find(p => p.userId === this.getCurrentPlayerId());
        
        const shareText = `Just finished a Contract Crown game! ${
            currentPlayer?.isWinner ? '🏆 Victory!' : 'Good game!'
        } I won ${currentPlayer?.tricksWon || 0} tricks. Game lasted ${this.formatDuration(stats.duration)}.`;

        if (navigator.share) {
            navigator.share({
                title: 'Contract Crown Game Results',
                text: shareText,
                url: window.location.href
            });
        } else {
            // Fallback to clipboard
            navigator.clipboard.writeText(shareText).then(() => {
                this.addGameMessage('Game stats copied to clipboard!', 'success');
            });
        }
    }

    /**
     * Download game statistics as JSON
     * @param {Object} stats - Game statistics
     */
    downloadGameStats(stats) {
        const dataStr = JSON.stringify(stats, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `contract-crown-game-${this.gameState.gameId}-stats.json`;
        link.click();
        
        this.addGameMessage('Game statistics downloaded!', 'success');
    }

    handleGameError(data) {
        console.error('Game error:', data);
        
        // Handle specific error types
        if (data.type === 'invalid_card_play') {
            this.handleInvalidCardPlay(data);
        } else if (data.type === 'turn_violation') {
            this.handleTurnViolation(data);
        } else {
            this.showError(data.message || 'A game error occurred');
        }
    }

    /**
     * Handle invalid card play error
     * @param {Object} data - Error data
     */
    handleInvalidCardPlay(data) {
        // Remove loading state from cards
        const playingCards = this.elements.playerHand.querySelectorAll('.card.playing');
        playingCards.forEach(card => card.classList.remove('playing'));
        
        // Re-enable card selection
        this.gameState.isMyTurn = true;
        this.updateCardPlayability();
        
        // Show specific error message
        this.addGameMessage(data.message || 'Invalid card play', 'error');
        
        // Highlight valid cards
        this.highlightValidCards();
    }

    /**
     * Handle turn violation error
     * @param {Object} data - Error data
     */
    handleTurnViolation(data) {
        // Remove loading state
        const playingCards = this.elements.playerHand.querySelectorAll('.card.playing');
        playingCards.forEach(card => card.classList.remove('playing'));
        
        // Show turn violation message
        this.addGameMessage(data.message || "It's not your turn", 'warning');
        
        // Update turn indicators
        this.updateTurnIndicators();
    }

    /**
     * Highlight valid cards that can be played
     */
    highlightValidCards() {
        const cardElements = this.elements.playerHand.querySelectorAll('.card');
        
        cardElements.forEach((cardElement, index) => {
            const card = this.gameState.playerHand[index];
            if (!card) return;
            
            if (this.isCardPlayable(card)) {
                cardElement.classList.add('valid-play');
                setTimeout(() => {
                    cardElement.classList.remove('valid-play');
                }, 2000);
            }
        });
    }

    // UI Updates
    updateUI() {
        this.updateRoundInfo();
        this.updatePlayerInfo();
        this.updateTurnIndicators();
        this.updateTrumpDisplay();
        this.updateScoreDisplay();
        this.renderPlayerHand();
        this.renderOpponentHands();
        this.updateCardPlayability();
    }

    updateRoundInfo() {
        this.elements.currentRound.textContent = this.gameState.currentRound;
        this.elements.currentTrick.textContent = this.gameState.currentTrick;
    }

    updatePlayerInfo() {
        // Update player names and card counts
        Object.entries(this.gameState.players).forEach(([playerId, player]) => {
            const position = this.getPlayerPosition(playerId);
            const nameElement = this.elements[`player${position}Name`];
            const cardsElement = this.elements[`player${position}Cards`];
            
            if (nameElement) {
                nameElement.textContent = player.username || `Player ${player.seatPosition}`;
            }
            
            if (cardsElement) {
                const cardCount = player.handSize || 8;
                cardsElement.textContent = `${cardCount} card${cardCount !== 1 ? 's' : ''}`;
            }
        });
    }

    updateTurnIndicators() {
        // Clear all turn indicators
        [this.elements.playerTopTurn, this.elements.playerLeftTurn, 
         this.elements.playerRightTurn, this.elements.playerBottomTurn].forEach(indicator => {
            if (indicator) indicator.classList.remove('active');
        });

        // Highlight current player's turn
        if (this.gameState.currentTurnPlayer) {
            const position = this.getPlayerPosition(this.gameState.currentTurnPlayer);
            const turnIndicator = this.elements[`player${position}Turn`];
            if (turnIndicator) {
                turnIndicator.classList.add('active');
            }
        }
    }

    updateTrumpDisplay() {
        if (this.gameState.trumpSuit) {
            const suitSymbols = {
                hearts: '♥',
                diamonds: '♦',
                clubs: '♣',
                spades: '♠'
            };
            
            const symbol = suitSymbols[this.gameState.trumpSuit] || '?';
            const name = this.gameState.trumpSuit.charAt(0).toUpperCase() + this.gameState.trumpSuit.slice(1);
            
            this.elements.trumpSuit.innerHTML = `
                <span class="trump-symbol ${this.gameState.trumpSuit}">${symbol}</span>
                <span class="trump-name">${name}</span>
            `;
        } else {
            this.elements.trumpSuit.innerHTML = `
                <span class="trump-symbol">?</span>
                <span class="trump-name">Not Declared</span>
            `;
        }
    }

    updateScoreDisplay(animated = false) {
        if (this.elements.team1Score) {
            const scoreElement = this.elements.team1Score.querySelector('.score-value');
            const newScore = this.gameState.scores.team1;
            
            if (animated && scoreElement.textContent !== newScore.toString()) {
                scoreElement.classList.add('updating');
                setTimeout(() => {
                    scoreElement.classList.remove('updating');
                }, 800);
            }
            
            scoreElement.textContent = newScore;
        }
        
        if (this.elements.team2Score) {
            const scoreElement = this.elements.team2Score.querySelector('.score-value');
            const newScore = this.gameState.scores.team2;
            
            if (animated && scoreElement.textContent !== newScore.toString()) {
                scoreElement.classList.add('updating');
                setTimeout(() => {
                    scoreElement.classList.remove('updating');
                }, 800);
            }
            
            scoreElement.textContent = newScore;
        }
    }

    updateConnectionStatus(status) {
        const statusMap = {
            connected: { text: 'Connected', class: 'connected' },
            connecting: { text: 'Connecting...', class: 'connecting' },
            disconnected: { text: 'Disconnected', class: 'disconnected' }
        };

        const statusInfo = statusMap[status] || statusMap.disconnected;
        
        this.elements.statusText.textContent = statusInfo.text;
        this.elements.statusIndicator.className = `status-indicator ${statusInfo.class}`;
    }

    // Card Rendering
    renderPlayerHand() {
        if (!this.gameState.playerHand || !this.elements.playerHand) return;

        this.elements.playerHand.innerHTML = '';
        
        this.gameState.playerHand.forEach((card, index) => {
            const cardElement = this.createCardElement(card, index);
            this.elements.playerHand.appendChild(cardElement);
        });

        // Update card count display
        this.elements.playerBottomCards.textContent = `${this.gameState.playerHand.length} card${this.gameState.playerHand.length !== 1 ? 's' : ''}`;
    }

    renderOpponentHands() {
        // Render card backs for opponents based on actual hand sizes
        const positions = ['Top', 'Left', 'Right'];
        
        positions.forEach(position => {
            const handElement = this.elements[`player${position}Hand`];
            if (!handElement) return;

            // Get card count for this position from game state
            const playerId = this.getPlayerIdByPosition(position);
            const player = this.gameState.players[playerId];
            const cardCount = player ? (player.handSize || 8) : 8;

            handElement.innerHTML = '';
            
            // Create card backs with stacking effect
            for (let i = 0; i < cardCount; i++) {
                const cardBack = this.createCardBackElement(i, cardCount);
                handElement.appendChild(cardBack);
            }
        });
    }

    createCardElement(card, index) {
        const cardElement = document.createElement('div');
        cardElement.className = 'card';
        cardElement.dataset.cardIndex = index;
        cardElement.dataset.suit = card.suit;
        cardElement.dataset.rank = card.rank;

        // Check if card is playable (basic validation)
        const isPlayable = this.isCardPlayable(card);
        if (!isPlayable) {
            cardElement.classList.add('disabled');
        }

        const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
        const colorClass = isRed ? 'red' : 'black';

        const suitSymbols = {
            hearts: '♥',
            diamonds: '♦',
            clubs: '♣',
            spades: '♠'
        };

        // Enhanced card layout with corner ranks and center suit
        cardElement.innerHTML = `
            <div class="card-corner card-corner-top">
                <div class="card-rank ${colorClass}">${card.rank}</div>
                <div class="card-suit-small ${colorClass}">${suitSymbols[card.suit]}</div>
            </div>
            <div class="card-center">
                <div class="card-suit ${colorClass}">${suitSymbols[card.suit]}</div>
            </div>
            <div class="card-corner card-corner-bottom">
                <div class="card-rank ${colorClass}">${card.rank}</div>
                <div class="card-suit-small ${colorClass}">${suitSymbols[card.suit]}</div>
            </div>
        `;

        // Add touch event listeners for better mobile interaction
        this.addCardTouchEvents(cardElement);

        return cardElement;
    }

    createCardBackElement(index, totalCards) {
        const cardBack = document.createElement('div');
        cardBack.className = 'card-back';
        
        // Add stacking effect
        cardBack.style.zIndex = totalCards - index;
        
        // Add subtle animation delay for visual appeal
        cardBack.style.animationDelay = `${index * 0.1}s`;
        
        return cardBack;
    }

    addCardTouchEvents(cardElement) {
        let touchStartY = 0;
        let touchStartTime = 0;
        let isDragging = false;

        // Touch start
        cardElement.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
            isDragging = false;
            
            // Add touch feedback
            cardElement.classList.add('touching');
        }, { passive: true });

        // Touch move
        cardElement.addEventListener('touchmove', (e) => {
            const touchY = e.touches[0].clientY;
            const deltaY = touchStartY - touchY;
            
            // If moved up significantly, consider it a drag
            if (deltaY > 20) {
                isDragging = true;
                cardElement.style.transform = `translateY(${-Math.min(deltaY, 50)}px)`;
            }
        }, { passive: true });

        // Touch end
        cardElement.addEventListener('touchend', (e) => {
            const touchDuration = Date.now() - touchStartTime;
            
            cardElement.classList.remove('touching');
            cardElement.style.transform = '';
            
            // If it was a quick tap or significant drag up, select the card
            if (touchDuration < 300 || isDragging) {
                this.handleCardSelection(cardElement);
            }
        });

        // Mouse events for desktop
        cardElement.addEventListener('mouseenter', () => {
            if (!cardElement.classList.contains('disabled')) {
                cardElement.classList.add('hover');
            }
        });

        cardElement.addEventListener('mouseleave', () => {
            cardElement.classList.remove('hover');
        });
    }

    isCardPlayable(card) {
        // Check if it's player's turn
        if (!this.gameState.isMyTurn) return false;
        
        // During trump declaration phase, cards are not playable
        if (this.gameState.gamePhase === 'trump_declaration') return false;
        
        // During playing phase, implement suit following rules
        if (this.gameState.gamePhase === 'playing') {
            const currentTrick = this.gameState.currentTrick;
            if (!currentTrick) return false;

            const cardsPlayed = currentTrick.cardsPlayed || [];
            
            // If no cards played yet in trick, any card is playable
            if (cardsPlayed.length === 0) return true;
            
            // Get the lead suit (first card played in trick)
            const leadSuit = cardsPlayed[0].card.suit;
            
            // Must follow suit if possible
            const playerSuitCards = this.gameState.playerHand.filter(c => c.suit === leadSuit);
            if (playerSuitCards.length > 0 && card.suit !== leadSuit) {
                return false; // Must follow suit
            }
        }
        
        return true;
    }

    updateCardPlayability() {
        // Update which cards can be played based on current game state
        const cardElements = this.elements.playerHand.querySelectorAll('.card');
        
        cardElements.forEach((cardElement, index) => {
            const card = this.gameState.playerHand[index];
            if (!card) return;
            
            const isPlayable = this.isCardPlayable(card);
            
            if (isPlayable) {
                cardElement.classList.remove('disabled');
            } else {
                cardElement.classList.add('disabled');
            }
        });
    }

    renderPlayedCard(playerId, card, position) {
        const slotElement = this.elements[`playedCard${position.charAt(0).toUpperCase() + position.slice(1)}`];
        if (!slotElement) return;

        const cardElement = this.createPlayedCardElement(card);
        
        // Add animation class
        cardElement.classList.add('card-play-animation');
        
        // Clear previous card and add new one
        slotElement.innerHTML = '';
        slotElement.appendChild(cardElement);
        slotElement.classList.add('active');
        
        // Add position-specific animation
        setTimeout(() => {
            cardElement.classList.add('card-played');
        }, 50);
        
        // Remove animation class after animation completes
        setTimeout(() => {
            cardElement.classList.remove('card-play-animation');
        }, 500);
    }

    createPlayedCardElement(card) {
        const cardElement = document.createElement('div');
        cardElement.className = 'played-card';

        const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
        const colorClass = isRed ? 'red' : 'black';

        const suitSymbols = {
            hearts: '♥',
            diamonds: '♦',
            clubs: '♣',
            spades: '♠'
        };

        cardElement.innerHTML = `
            <div class="card-rank ${colorClass}">${card.rank}</div>
            <div class="card-suit ${colorClass}">${suitSymbols[card.suit]}</div>
        `;

        return cardElement;
    }

    clearPlayedCards() {
        [this.elements.playedCardTop, this.elements.playedCardLeft,
         this.elements.playedCardRight, this.elements.playedCardBottom].forEach(slot => {
            if (slot) {
                slot.innerHTML = '';
                slot.classList.remove('active');
            }
        });
    }

    // Card Interaction
    handleCardClick(event) {
        const cardElement = event.target.closest('.card');
        if (!cardElement) return;

        this.handleCardSelection(cardElement);
    }

    handleCardSelection(cardElement) {
        if (!this.gameState.isMyTurn || cardElement.classList.contains('disabled')) {
            this.addGameMessage("It's not your turn or this card cannot be played", 'warning');
            return;
        }

        const cardIndex = parseInt(cardElement.dataset.cardIndex);
        const card = this.gameState.playerHand[cardIndex];

        if (!card) return;

        // Toggle selection
        if (this.gameState.selectedCard === cardIndex) {
            this.deselectCard();
        } else {
            this.selectCard(cardIndex);
        }
    }

    selectCard(cardIndex) {
        // Deselect previous card
        this.deselectCard();

        // Select new card
        this.gameState.selectedCard = cardIndex;
        const cardElement = this.elements.playerHand.children[cardIndex];
        if (cardElement) {
            cardElement.classList.add('selected');
        }

        // Play the card (for now, auto-play on selection)
        this.playSelectedCard();
    }

    deselectCard() {
        if (this.gameState.selectedCard !== null) {
            const cardElement = this.elements.playerHand.children[this.gameState.selectedCard];
            if (cardElement) {
                cardElement.classList.remove('selected');
            }
            this.gameState.selectedCard = null;
        }
    }

    playSelectedCard() {
        if (this.gameState.selectedCard === null || !this.gameState.isMyTurn) return;

        const card = this.gameState.playerHand[this.gameState.selectedCard];
        if (!card) return;

        // Validate card play before sending to server
        const validation = this.validateCardPlay(card);
        if (!validation.isValid) {
            this.addGameMessage(validation.reason, 'error');
            this.deselectCard();
            return;
        }

        // Show loading state
        this.showCardPlayLoading(card);

        // Emit card play to server with current game context
        this.socket.emit('play-card', {
            gameId: this.gameState.gameId,
            card: card,
            trickId: this.gameState.currentTrick?.trickId,
            roundId: this.gameState.currentRound?.roundId
        });

        // Optimistic update - remove card from hand
        this.gameState.playerHand.splice(this.gameState.selectedCard, 1);
        this.gameState.selectedCard = null;
        this.gameState.isMyTurn = false;
        
        this.renderPlayerHand();
        this.addGameMessage(`You played ${card.rank} of ${card.suit}`, 'info');
    }

    /**
     * Validate if a card can be played according to Contract Crown rules
     * @param {Object} card - Card to validate
     * @returns {Object} Validation result with isValid and reason
     */
    validateCardPlay(card) {
        // Check if it's player's turn
        if (!this.gameState.isMyTurn) {
            return { isValid: false, reason: "It's not your turn" };
        }

        // Check if game is in playing phase
        if (this.gameState.gamePhase !== 'playing') {
            return { isValid: false, reason: "Game is not in playing phase" };
        }

        // Check if player has the card
        const hasCard = this.gameState.playerHand.some(c => 
            c.suit === card.suit && c.rank === card.rank
        );
        if (!hasCard) {
            return { isValid: false, reason: "You don't have this card" };
        }

        // Get current trick information
        const currentTrick = this.gameState.currentTrick;
        if (!currentTrick) {
            return { isValid: false, reason: "No active trick" };
        }

        const cardsPlayed = currentTrick.cardsPlayed || [];
        
        // If this is the first card of the trick, any card is valid
        if (cardsPlayed.length === 0) {
            return { isValid: true };
        }

        // Get the lead suit (first card played in trick)
        const leadSuit = cardsPlayed[0].card.suit;
        
        // Check suit-following rules
        const playerSuitCards = this.gameState.playerHand.filter(c => c.suit === leadSuit);
        
        // Must follow suit if possible
        if (playerSuitCards.length > 0 && card.suit !== leadSuit) {
            return { 
                isValid: false, 
                reason: `Must follow suit (${leadSuit}) when possible` 
            };
        }

        // If can't follow suit, can play trump or any other card
        return { isValid: true };
    }

    /**
     * Show loading state for card play
     * @param {Object} card - Card being played
     */
    showCardPlayLoading(card) {
        // Add visual feedback that card is being played
        const cardElements = this.elements.playerHand.querySelectorAll('.card');
        cardElements.forEach(cardEl => {
            if (cardEl.dataset.suit === card.suit && cardEl.dataset.rank === card.rank) {
                cardEl.classList.add('playing');
            }
        });
    }

    // Trump Declaration
    showTrumpDeclarationModal() {
        // Show only the first 4 cards during trump declaration
        this.renderInitialCards();
        this.elements.trumpModal.classList.remove('hidden');
        this.addGameMessage("Choose the trump suit based on your first 4 cards", 'info');
    }

    hideTrumpDeclarationModal() {
        this.elements.trumpModal.classList.add('hidden');
        this.clearTrumpSelection();
    }

    renderInitialCards() {
        // During trump declaration, show only first 4 cards
        if (this.gameState.gamePhase === 'trump_declaration') {
            const initialCards = this.gameState.playerHand.slice(0, 4);
            this.renderPartialHand(initialCards);
            
            // Update card count display
            this.elements.playerBottomCards.textContent = "4 cards (choosing trump)";
        }
    }

    renderPartialHand(cards) {
        if (!this.elements.playerHand) return;

        this.elements.playerHand.innerHTML = '';
        
        cards.forEach((card, index) => {
            const cardElement = this.createCardElement(card, index);
            // During trump declaration, cards are not playable
            cardElement.classList.add('disabled');
            this.elements.playerHand.appendChild(cardElement);
        });
    }

    selectTrumpSuit(optionElement) {
        // Clear previous selection
        this.elements.trumpOptions.forEach(option => option.classList.remove('selected'));
        
        // Select new option
        optionElement.classList.add('selected');
        this.elements.confirmTrumpBtn.disabled = false;
        
        // Add visual feedback
        const suit = optionElement.dataset.suit;
        this.addGameMessage(`Selected ${suit} as trump suit`, 'info');
    }

    confirmTrumpDeclaration() {
        const selectedOption = document.querySelector('.trump-option.selected');
        if (!selectedOption) {
            this.addGameMessage('Please select a trump suit first', 'warning');
            return;
        }

        const trumpSuit = selectedOption.dataset.suit;
        
        // Validate trump declaration
        if (!this.validateTrumpDeclaration(trumpSuit)) {
            this.addGameMessage('Invalid trump selection', 'error');
            return;
        }
        
        // Show loading state
        this.elements.confirmTrumpBtn.disabled = true;
        this.elements.confirmTrumpBtn.innerHTML = '<span class="spinner"></span> Declaring...';
        
        this.socket.emit('game:declare_trump', {
            gameId: this.gameState.gameId,
            trumpSuit: trumpSuit
        });

        this.addGameMessage(`Declaring ${trumpSuit} as trump...`, 'info');
    }

    validateTrumpDeclaration(trumpSuit) {
        // Basic validation - ensure it's a valid suit
        const validSuits = ['hearts', 'diamonds', 'clubs', 'spades'];
        if (!validSuits.includes(trumpSuit)) {
            return false;
        }

        // Check if player is allowed to declare trump
        if (this.gameState.gamePhase !== 'trump_declaration') {
            return false;
        }

        // Additional validation could be added here
        return true;
    }

    clearTrumpSelection() {
        this.elements.trumpOptions.forEach(option => option.classList.remove('selected'));
        this.elements.confirmTrumpBtn.disabled = true;
        this.elements.confirmTrumpBtn.innerHTML = 'Confirm Trump';
    }

    handleTrumpDeclarationComplete() {
        // After trump is declared, deal remaining 4 cards
        this.dealRemainingCards();
        this.gameState.gamePhase = 'playing';
        this.updateUI();
        this.addGameMessage("Trump declared! Dealing remaining cards...", 'success');
    }

    dealRemainingCards() {
        // In a real implementation, this would come from the server
        // For now, simulate dealing the remaining 4 cards
        if (this.gameState.playerHand.length === 4) {
            const remainingCards = [
                { suit: 'hearts', rank: '10' },
                { suit: 'diamonds', rank: '9' },
                { suit: 'clubs', rank: '8' },
                { suit: 'spades', rank: '7' }
            ];
            
            this.gameState.playerHand = [...this.gameState.playerHand, ...remainingCards];
            
            // Animate card dealing
            setTimeout(() => {
                this.renderPlayerHand();
                this.addCardDealingAnimation();
            }, 500);
        }
    }

    addCardDealingAnimation() {
        const cards = this.elements.playerHand.querySelectorAll('.card');
        cards.forEach((card, index) => {
            if (index >= 4) { // Only animate the new cards
                card.classList.add('card-dealing');
                card.style.animationDelay = `${(index - 4) * 0.1}s`;
            }
        });
    }

    getSuitRecommendation() {
        // Analyze first 4 cards to suggest best trump suit
        if (this.gameState.playerHand.length < 4) return null;
        
        const firstFour = this.gameState.playerHand.slice(0, 4);
        const suitCounts = {};
        const highCards = ['A', 'K', 'Q', 'J'];
        
        firstFour.forEach(card => {
            if (!suitCounts[card.suit]) {
                suitCounts[card.suit] = { count: 0, highCards: 0 };
            }
            suitCounts[card.suit].count++;
            if (highCards.includes(card.rank)) {
                suitCounts[card.suit].highCards++;
            }
        });
        
        // Find suit with most cards or highest value cards
        let bestSuit = null;
        let bestScore = 0;
        
        Object.entries(suitCounts).forEach(([suit, data]) => {
            const score = data.count * 2 + data.highCards * 3;
            if (score > bestScore) {
                bestScore = score;
                bestSuit = suit;
            }
        });
        
        return bestSuit;
    }

    highlightRecommendedSuit() {
        const recommendedSuit = this.getSuitRecommendation();
        if (recommendedSuit) {
            const recommendedOption = document.querySelector(`[data-suit="${recommendedSuit}"]`);
            if (recommendedOption) {
                recommendedOption.classList.add('recommended');
                
                // Add recommendation text
                const recommendation = document.createElement('div');
                recommendation.className = 'suit-recommendation';
                recommendation.textContent = 'Recommended';
                recommendedOption.appendChild(recommendation);
            }
        }
    }

    // Utility Methods
    getPlayerPosition(playerId) {
        // This would map player IDs to screen positions
        // For now, return a default mapping
        const positions = ['Bottom', 'Left', 'Top', 'Right'];
        const playerIndex = Object.keys(this.gameState.players).indexOf(playerId);
        return positions[playerIndex] || 'Bottom';
    }

    getPlayerIdByPosition(position) {
        // Reverse mapping from position to player ID
        const positions = ['Bottom', 'Left', 'Top', 'Right'];
        const positionIndex = positions.indexOf(position);
        const playerIds = Object.keys(this.gameState.players);
        return playerIds[positionIndex] || null;
    }

    handleGameError(data) {
        console.error('Game error:', data);
        this.addGameMessage(data.message || 'A game error occurred', 'error');
        
        // Handle specific error types
        if (data.type === 'invalid_move') {
            this.highlightValidCards();
        } else if (data.type === 'connection_error') {
            this.showError('Connection error. Please try again.');
        }
    }

    addGameMessage(message, type = 'info') {
        const messageElement = document.createElement('div');
        messageElement.className = `game-message ${type}`;
        messageElement.textContent = message;
        
        this.elements.gameMessages.appendChild(messageElement);
        this.elements.gameMessages.scrollTop = this.elements.gameMessages.scrollHeight;

        // Remove old messages if too many
        const messages = this.elements.gameMessages.children;
        if (messages.length > 10) {
            messages[0].remove();
        }
    }

    // UI State Management
    showLoading(message = 'Loading...') {
        this.elements.loadingText.textContent = message;
        this.elements.loadingOverlay.classList.remove('hidden');
    }

    hideLoading() {
        this.elements.loadingOverlay.classList.add('hidden');
    }

    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorModal.classList.remove('hidden');
    }

    hideError() {
        this.elements.errorModal.classList.add('hidden');
    }

    leaveGame() {
        if (confirm('Are you sure you want to leave the game?')) {
            if (this.socket) {
                this.socket.emit('game:leave', { gameId: this.gameState.gameId });
            }
            window.location.href = '/dashboard.html';
        }
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new GameManager();
});

export { GameManager };