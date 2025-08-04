/**
 * UIManager - Handles UI updates and DOM manipulation
 * Manages all user interface updates and interactions
 */

export class UIManager {
    constructor(gameState) {
        this.gameState = gameState;
        this.elements = {};
        this.initializeElements();
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
        this.elements.trumpInitialCards = document.getElementById('trump-initial-cards');
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

    /**
     * Update all UI elements
     */
    updateUI() {
        console.log('[UIManager] updateUI called');
        try {
            this.updateRoundInfo();
            this.updatePlayerInfo();
            this.updateTurnIndicators();
            this.updateTrumpDisplay();
            this.updateScoreDisplay();
            this.updateOpponentHands(); // Add this to ensure opponent hands are always updated
            console.log('[UIManager] updateUI completed successfully');
        } catch (error) {
            console.error('[UIManager] Error in updateUI:', error);
        }
    }

    /**
     * Update round and trick information
     */
    updateRoundInfo() {
        const state = this.gameState.getState();
        console.log('[UIManager] updateRoundInfo called, currentRound:', state.currentRound, 'currentTrick:', state.currentTrick);
        
        if (this.elements.currentRound) {
            this.elements.currentRound.textContent = state.currentRound || 1;
        }
        if (this.elements.currentTrick) {
            this.elements.currentTrick.textContent = state.currentTrick?.trickNumber || 1;
        }
    }

    /**
     * Update player information display
     */
    updatePlayerInfo() {
        const state = this.gameState.getState();
        
        Object.entries(state.players).forEach(([playerId, player]) => {
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

            // Render opponent hands (card backs) for non-human players
            if (playerId !== 'human_player' && playerId !== state.currentPlayer) {
                this.renderOpponentHand(playerId, player.handSize || 8);
            }
        });
    }

    /**
     * Update turn indicators
     */
    updateTurnIndicators() {
        const state = this.gameState.getState();
        
        // Clear all turn indicators
        [this.elements.playerTopTurn, this.elements.playerLeftTurn,
         this.elements.playerRightTurn, this.elements.playerBottomTurn].forEach(indicator => {
            if (indicator) indicator.classList.remove('active');
        });

        // Highlight current player's turn
        if (state.currentTurnPlayer) {
            const position = this.getPlayerPosition(state.currentTurnPlayer);
            const turnIndicator = this.elements[`player${position}Turn`];
            if (turnIndicator) {
                turnIndicator.classList.add('active');
            }
        }
    }

    /**
     * Update trump suit display
     */
    updateTrumpDisplay() {
        const state = this.gameState.getState();
        
        if (state.trumpSuit) {
            const suitSymbols = {
                hearts: '♥',
                diamonds: '♦',
                clubs: '♣',
                spades: '♠'
            };

            const symbol = suitSymbols[state.trumpSuit] || '?';
            const name = state.trumpSuit.charAt(0).toUpperCase() + state.trumpSuit.slice(1);

            this.elements.trumpSuit.innerHTML = `
                <span class="trump-symbol ${state.trumpSuit}">${symbol}</span>
                <span class="trump-name">${name}</span>
            `;
        } else {
            this.elements.trumpSuit.innerHTML = `
                <span class="trump-symbol">?</span>
                <span class="trump-name">Not Declared</span>
            `;
        }
    }

    /**
     * Update score display
     * @param {boolean} animated - Whether to show animation
     */
    updateScoreDisplay(animated = false) {
        const state = this.gameState.getState();
        
        if (this.elements.team1Score) {
            const scoreElement = this.elements.team1Score.querySelector('.score-value');
            const newScore = state.scores.team1;

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
            const newScore = state.scores.team2;

            if (animated && scoreElement.textContent !== newScore.toString()) {
                scoreElement.classList.add('updating');
                setTimeout(() => {
                    scoreElement.classList.remove('updating');
                }, 800);
            }

            scoreElement.textContent = newScore;
        }
    }

    /**
     * Update connection status display
     * @param {string} status - Connection status (connected, connecting, disconnected)
     */
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

    /**
     * Add game message to the message area
     * @param {string} message - Message text
     * @param {string} type - Message type (info, success, warning, error)
     */
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

    /**
     * Show loading overlay
     * @param {string} message - Loading message
     */
    showLoading(message = 'Loading...') {
        console.log('[UIManager] showLoading called with message:', message);
        if (this.elements.loadingText) {
            this.elements.loadingText.textContent = message;
        }
        if (this.elements.loadingOverlay) {
            this.elements.loadingOverlay.classList.remove('hidden');
        }
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        console.log('[UIManager] hideLoading called');
        if (this.elements.loadingOverlay) {
            this.elements.loadingOverlay.classList.add('hidden');
        }
    }

    /**
     * Show error modal
     * @param {string} message - Error message
     */
    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorModal.classList.remove('hidden');
    }

    /**
     * Hide error modal
     */
    hideError() {
        this.elements.errorModal.classList.add('hidden');
    }

    /**
     * Get player position on screen based on player ID
     * @param {string} playerId - Player ID
     * @returns {string} Position (Bottom, Left, Top, Right)
     */
    getPlayerPosition(playerId) {
        // Map specific player IDs to positions for demo game
        const positionMap = {
            'human_player': 'Bottom',
            'bot_1': 'Left',
            'bot_2': 'Top',
            'bot_3': 'Right'
        };
        
        return positionMap[playerId] || 'Bottom';
    }

    /**
     * Get player position on screen based on seat position
     * @param {number} seatPosition - Player's seat position (0-3)
     * @returns {string} Position string (bottom, left, top, right)
     */
    getPlayerPositionBySeat(seatPosition) {
        const positions = ['bottom', 'left', 'top', 'right'];
        return positions[seatPosition] || 'top';
    }

    /**
     * Get player ID by screen position
     * @param {string} position - Screen position
     * @returns {string} Player ID
     */
    getPlayerIdByPosition(position) {
        const state = this.gameState.getState();
        const positions = ['Bottom', 'Left', 'Top', 'Right'];
        const positionIndex = positions.indexOf(position);
        const playerIds = Object.keys(state.players);
        return playerIds[positionIndex] || null;
    }

    /**
     * Clear played cards from the table
     */
    clearPlayedCards() {
        [this.elements.playedCardTop, this.elements.playedCardLeft,
         this.elements.playedCardRight, this.elements.playedCardBottom].forEach(slot => {
            if (slot) {
                slot.innerHTML = '';
                slot.classList.remove('active');
            }
        });
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

    /**
     * Remove lead suit indicator
     */
    removeLeadSuitIndicator() {
        const leadSuitIndicator = document.querySelector('.lead-suit-indicator');
        if (leadSuitIndicator) {
            leadSuitIndicator.remove();
        }
    }

    /**
     * Update all opponent hands
     */
    updateOpponentHands() {
        const state = this.gameState.getState();
        
        Object.entries(state.players || {}).forEach(([playerId, player]) => {
            // Only render opponent hands (not the human player)
            if (playerId !== 'human_player' && playerId !== state.currentPlayer) {
                this.renderOpponentHand(playerId, player.handSize || 8);
            }
        });
    }

    /**
     * Render opponent hand (card backs)
     * @param {string} playerId - Player ID
     * @param {number} cardCount - Number of cards to show
     */
    renderOpponentHand(playerId, cardCount) {
        const position = this.getPlayerPosition(playerId);
        const handElement = this.elements[`player${position}Hand`];
        
        if (!handElement) {
            console.warn(`[UIManager] Hand element not found for position: ${position}`);
            return;
        }

        // Clear existing cards
        handElement.innerHTML = '';

        // Create card backs
        for (let i = 0; i < cardCount; i++) {
            const cardBack = document.createElement('div');
            cardBack.className = 'card-back';
            cardBack.style.animationDelay = `${i * 0.1}s`; // Stagger animation
            handElement.appendChild(cardBack);
        }
        
        console.log(`[UIManager] Rendered ${cardCount} card backs for ${playerId} at position ${position}`);
    }

    /**
     * Get DOM elements for external access
     * @returns {Object} DOM elements
     */
    getElements() {
        return this.elements;
    }
}