/**
 * UIManager - Handles UI updates and DOM manipulation
 * Manages all user interface updates and interactions
 */

export class UIManager {
    constructor(gameState) {
        this.gameState = gameState;
        this.elements = {};
        this.onNextRoundCallback = null;
        this.initializeElements();
    }

    initializeElements() {
        // Header elements
        this.elements.leaveGameBtn = document.getElementById('leave-game-btn');
        this.elements.currentRound = document.getElementById('current-round');
        this.elements.connectionStatus = document.getElementById('connection-status');
        this.elements.statusIndicator = document.getElementById('status-indicator');
        this.elements.statusText = document.getElementById('status-text');

        // Mobile elements
        this.elements.mobileStatusIndicator = document.getElementById('mobile-status-indicator');
        this.elements.mobileStatusText = document.getElementById('mobile-status-text');

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
        
        // Congratulations modal elements
        this.elements.congratulationsModal = document.getElementById('congratulations-modal');
        this.elements.winnerTeam = document.getElementById('winner-team');
        this.elements.winnerReason = document.getElementById('winner-reason');
        this.elements.continueGameBtn = document.getElementById('continue-game-btn');

        // Messages and overlays
        this.elements.toastContainer = document.getElementById('toast-container');
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
            this.updateRoundScoreDisplay();
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
                const teamNumber = this.getPlayerTeam(playerId);
                const playerName = player.username || `Player ${player.seatPosition}`;
                nameElement.innerHTML = `<div class="player-display">Team ${teamNumber} - ${playerName}</div>`;
            }

            if (cardsElement) {
                const cardCount = player.handSize !== undefined ? player.handSize : 8;
                cardsElement.textContent = cardCount === 0 ? 'No cards' : `${cardCount} card${cardCount !== 1 ? 's' : ''}`;
            }

            // Render opponent hands (card backs) for non-human players
            // Only render if player has cards and is not the current human player
            if (playerId !== 'human_player' && playerId !== state.currentPlayer) {
                const cardCount = player.handSize !== undefined ? player.handSize : 8;
                this.renderOpponentHand(playerId, cardCount);
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
        
        // Update trick scores (current round)
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

        // Update round scores (game points) - handled separately
        this.updateRoundScoreDisplay(animated);
    }

    /**
     * Update round score display (game points)
     * @param {boolean} animated - Whether to show animation
     */
    updateRoundScoreDisplay(animated = false) {
        const state = this.gameState.getState();
        const roundScores = state.roundScores || { team1: 0, team2: 0 };
        
        const team1RoundScore = document.getElementById('team-1-round-score');
        if (team1RoundScore) {
            const scoreElement = team1RoundScore.querySelector('.score-value');
            const newScore = roundScores.team1;

            if (animated && scoreElement.textContent !== newScore.toString()) {
                scoreElement.classList.add('updating');
                setTimeout(() => {
                    scoreElement.classList.remove('updating');
                }, 800);
            }

            scoreElement.textContent = newScore;
        }

        const team2RoundScore = document.getElementById('team-2-round-score');
        if (team2RoundScore) {
            const scoreElement = team2RoundScore.querySelector('.score-value');
            const newScore = roundScores.team2;

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

        // Update desktop connection status
        if (this.elements.statusText) {
            this.elements.statusText.textContent = statusInfo.text;
        }
        if (this.elements.statusIndicator) {
            this.elements.statusIndicator.className = `status-indicator ${statusInfo.class}`;
        }

        // Update mobile connection status
        if (this.elements.mobileStatusText) {
            this.elements.mobileStatusText.textContent = statusInfo.text;
        }
        if (this.elements.mobileStatusIndicator) {
            this.elements.mobileStatusIndicator.className = `status-indicator ${statusInfo.class}`;
        }
    }

    /**
     * Add game message as a disappearing toast
     * @param {string} message - Message text
     * @param {string} type - Message type (info, success, warning, error)
     * @param {number} duration - Duration in milliseconds (default: 3000)
     */
    addGameMessage(message, type = 'info', duration = 3000) {
        if (!this.elements.toastContainer) {
            console.warn('[UIManager] Toast container not found');
            return;
        }

        // Create toast element
        const toastElement = document.createElement('div');
        toastElement.className = `toast-message ${type}`;
        toastElement.textContent = message;
        toastElement.setAttribute('role', 'alert');
        toastElement.setAttribute('aria-live', 'polite');

        // Add to container
        this.elements.toastContainer.appendChild(toastElement);

        // Trigger show animation
        requestAnimationFrame(() => {
            toastElement.classList.add('show');
        });

        // Auto-dismiss after duration
        const dismissTimer = setTimeout(() => {
            this.dismissToast(toastElement);
        }, duration);

        // Store timer reference for potential cancellation
        toastElement._dismissTimer = dismissTimer;

        // Limit number of toasts (remove oldest if too many)
        const toasts = this.elements.toastContainer.children;
        if (toasts.length > 5) {
            this.dismissToast(toasts[0]);
        }

        // Optional: Pause auto-dismiss on hover (desktop only)
        if (window.matchMedia('(hover: hover)').matches) {
            toastElement.addEventListener('mouseenter', () => {
                if (toastElement._dismissTimer) {
                    clearTimeout(toastElement._dismissTimer);
                }
            });

            toastElement.addEventListener('mouseleave', () => {
                toastElement._dismissTimer = setTimeout(() => {
                    this.dismissToast(toastElement);
                }, 1000); // Shorter duration after hover
            });
        }
    }

    /**
     * Dismiss a specific toast message
     * @param {HTMLElement} toastElement - Toast element to dismiss
     */
    dismissToast(toastElement) {
        if (!toastElement || !toastElement.parentNode) return;

        // Clear any pending timer
        if (toastElement._dismissTimer) {
            clearTimeout(toastElement._dismissTimer);
        }

        // Add hide animation
        toastElement.classList.add('hide');

        // Remove from DOM after animation
        setTimeout(() => {
            if (toastElement.parentNode) {
                toastElement.parentNode.removeChild(toastElement);
            }
        }, 300); // Match animation duration
    }

    /**
     * Clear all toast messages
     */
    clearAllToasts() {
        if (!this.elements.toastContainer) return;

        const toasts = Array.from(this.elements.toastContainer.children);
        toasts.forEach(toast => this.dismissToast(toast));
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
     * Get player team number based on player ID
     * @param {string} playerId - Player ID
     * @returns {number} Team number (1 or 2)
     */
    getPlayerTeam(playerId) {
        // Team 1: human_player and bot_2 (bottom and top)
        // Team 2: bot_1 and bot_3 (left and right)
        const team1Players = ['human_player', 'bot_2', 'player1', 'player3'];
        const team2Players = ['bot_1', 'bot_3', 'player2', 'player4'];
        
        if (team1Players.includes(playerId)) {
            return 1;
        } else if (team2Players.includes(playerId)) {
            return 2;
        }
        
        // Fallback: determine by position
        const position = this.getPlayerPosition(playerId);
        return (position === 'Bottom' || position === 'Top') ? 1 : 2;
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
     * Show lead suit indicator as toast
     * @param {string} suit - Lead suit
     */
    showLeadSuitIndicator(suit) {
        this.showLeadSuitToast(suit);
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

        // Don't render any cards if cardCount is 0 (8th turn scenario)
        if (cardCount <= 0) {
            console.log(`[UIManager] No cards to render for ${playerId} at position ${position}`);
            return;
        }

        // Create card backs with smoother animations
        for (let i = 0; i < cardCount; i++) {
            const cardBack = document.createElement('div');
            cardBack.className = 'card-back';
            // Reduced stagger delay for smoother animation (0.05s instead of 0.1s)
            cardBack.style.animationDelay = `${i * 0.05}s`;
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

    /**
     * Show success toast message
     * @param {string} message - Success message
     * @param {number} duration - Duration in milliseconds
     */
    showSuccessToast(message, duration = 3000) {
        this.addGameMessage(message, 'success', duration);
    }

    /**
     * Show error toast message
     * @param {string} message - Error message
     * @param {number} duration - Duration in milliseconds
     */
    showErrorToast(message, duration = 4000) {
        this.addGameMessage(message, 'error', duration);
    }

    /**
     * Show warning toast message
     * @param {string} message - Warning message
     * @param {number} duration - Duration in milliseconds
     */
    showWarningToast(message, duration = 3500) {
        this.addGameMessage(message, 'warning', duration);
    }

    /**
     * Show info toast message
     * @param {string} message - Info message
     * @param {number} duration - Duration in milliseconds
     */
    showInfoToast(message, duration = 3000) {
        this.addGameMessage(message, 'info', duration);
    }    /*
*
     * Show lead suit toast with suit symbol
     * @param {string} suit - Lead suit (hearts, diamonds, clubs, spades)
     */
    showLeadSuitToast(suit) {
        const suitSymbols = {
            hearts: '♥',
            diamonds: '♦',
            clubs: '♣',
            spades: '♠'
        };

        const symbol = suitSymbols[suit] || '?';
        const suitName = suit.charAt(0).toUpperCase() + suit.slice(1);
        
        const toastElement = document.createElement('div');
        toastElement.className = `toast-message lead-suit`;
        toastElement.innerHTML = `
            <span>Lead suit:</span>
            <span class="suit-symbol ${suit}">${symbol}</span>
            <span>${suitName}</span>
        `;
        toastElement.setAttribute('role', 'alert');
        toastElement.setAttribute('aria-live', 'polite');

        this.elements.toastContainer.appendChild(toastElement);

        requestAnimationFrame(() => {
            toastElement.classList.add('show');
        });

        setTimeout(() => {
            this.dismissToast(toastElement);
        }, 4000);
    }

    /**
     * Show trump declaration toast
     * @param {string} suit - Trump suit
     * @param {string} playerName - Player who declared trump
     */
    showTrumpDeclaredToast(suit, playerName = 'You') {
        const suitSymbols = {
            hearts: '♥',
            diamonds: '♦',
            clubs: '♣',
            spades: '♠'
        };

        const symbol = suitSymbols[suit] || '?';
        const suitName = suit.charAt(0).toUpperCase() + suit.slice(1);
        const message = `${playerName} declared ${symbol} ${suitName} as Trump!`;
        
        this.addGameMessage(message, 'trump-declared', 4000);
    }

    /**
     * Show trick winner toast
     * @param {string} winnerName - Name of trick winner
     * @param {number} trickNumber - Trick number
     */
    showTrickWinnerToast(winnerName, trickNumber) {
        const message = `${winnerName} wins Trick ${trickNumber}!`;
        this.addGameMessage(message, 'trick-winner', 3000);
    }

    /**
     * Show game phase toast
     * @param {string} phase - Game phase (e.g., "Round 2", "Final Trick")
     */
    showGamePhaseToast(phase) {
        this.addGameMessage(phase, 'game-phase', 2500);
    }

    /**
     * Show compact toast for frequent updates
     * @param {string} message - Message text
     * @param {string} type - Message type
     */
    showCompactToast(message, type = 'info') {
        const toastElement = document.createElement('div');
        toastElement.className = `toast-message compact ${type}`;
        toastElement.textContent = message;
        toastElement.setAttribute('role', 'status');
        toastElement.setAttribute('aria-live', 'polite');

        this.elements.toastContainer.appendChild(toastElement);

        requestAnimationFrame(() => {
            toastElement.classList.add('show');
        });

        setTimeout(() => {
            this.dismissToast(toastElement);
        }, 2000);
    }

    /**
     * Show toast with action button
     * @param {string} message - Message text
     * @param {string} actionText - Action button text
     * @param {Function} actionCallback - Action button callback
     * @param {string} type - Message type
     * @param {number} duration - Duration (0 for persistent)
     */
    showActionToast(message, actionText, actionCallback, type = 'info', duration = 0) {
        const toastElement = document.createElement('div');
        toastElement.className = `toast-message with-action ${type}`;
        toastElement.innerHTML = `
            ${message}
            <button class="toast-action">${actionText}</button>
        `;
        toastElement.setAttribute('role', 'alert');
        toastElement.setAttribute('aria-live', 'polite');

        const actionButton = toastElement.querySelector('.toast-action');
        actionButton.addEventListener('click', () => {
            actionCallback();
            this.dismissToast(toastElement);
        });

        this.elements.toastContainer.appendChild(toastElement);

        requestAnimationFrame(() => {
            toastElement.classList.add('show');
        });

        if (duration > 0) {
            setTimeout(() => {
                this.dismissToast(toastElement);
            }, duration);
        }
    }

    /**
     * Smoothly remove a card from opponent hand
     * @param {string} playerId - Player ID
     * @param {number} newCardCount - New card count after card is played
     */
    smoothRemoveOpponentCard(playerId, newCardCount) {
        const position = this.getPlayerPosition(playerId);
        const handElement = this.elements[`player${position}Hand`];
        
        if (!handElement) {
            console.warn(`[UIManager] Hand element not found for position: ${position}`);
            return;
        }

        const cards = handElement.children;
        if (cards.length > 0) {
            // Add removal animation to the last card
            const lastCard = cards[cards.length - 1];
            lastCard.classList.add('removing');
            
            // Remove the card after animation completes
            setTimeout(() => {
                if (lastCard.parentNode) {
                    lastCard.parentNode.removeChild(lastCard);
                }
                
                // Update the remaining cards count display
                this.updatePlayerCardCount(playerId, newCardCount);
            }, 300); // Match animation duration
        }
    }

    /**
     * Update player card count display
     * @param {string} playerId - Player ID
     * @param {number} cardCount - New card count
     */
    updatePlayerCardCount(playerId, cardCount) {
        const position = this.getPlayerPosition(playerId);
        const cardsElement = this.elements[`player${position}Cards`];
        
        if (cardsElement) {
            cardsElement.textContent = `${cardCount} card${cardCount !== 1 ? 's' : ''}`;
        }
    }

    /**
     * Animate card play for smoother transitions
     * @param {HTMLElement} cardElement - Card element to animate
     * @param {Function} callback - Callback after animation
     */
    animateCardPlay(cardElement, callback) {
        if (!cardElement) return;
        
        cardElement.classList.add('playing');
        
        setTimeout(() => {
            if (callback) callback();
        }, 400); // Match animation duration
    }

    /**
     * Show congratulations modal for round winner
     * @param {Object} roundWinner - Round winner information
     * @param {Object} scores - Current trick scores
     * @param {Object} roundScores - Total game scores
     */
    showCongratulationsModal(roundWinner, scores, roundScores) {
        const modal = document.getElementById('congratulations-modal');
        const winnerTeam = document.getElementById('winner-team');
        const winnerReason = document.getElementById('winner-reason');
        const team1Tricks = document.getElementById('team1-tricks');
        const team2Tricks = document.getElementById('team2-tricks');
        const team1Points = document.getElementById('team1-points');
        const team2Points = document.getElementById('team2-points');
        const totalTeam1Score = document.getElementById('total-team1-score');
        const totalTeam2Score = document.getElementById('total-team2-score');
        const continueBtn = document.getElementById('continue-game-btn');

        if (!modal) {
            console.error('[UIManager] Congratulations modal not found');
            return;
        }

        // Update winner information
        if (winnerTeam) {
            winnerTeam.textContent = `${roundWinner.teamName} Wins!`;
        }
        if (winnerReason) {
            winnerReason.textContent = roundWinner.reason;
        }

        // Update trick counts
        if (team1Tricks) {
            team1Tricks.textContent = `${scores.team1} tricks`;
        }
        if (team2Tricks) {
            team2Tricks.textContent = `${scores.team2} tricks`;
        }

        // Calculate points awarded (winning team gets their trick count as points)
        const team1PointsAwarded = roundWinner.teamKey === 'team1' ? scores.team1 : 0;
        const team2PointsAwarded = roundWinner.teamKey === 'team2' ? scores.team2 : 0;

        if (team1Points) {
            team1Points.textContent = team1PointsAwarded > 0 ? `+${team1PointsAwarded} points` : '+0 points';
        }
        if (team2Points) {
            team2Points.textContent = team2PointsAwarded > 0 ? `+${team2PointsAwarded} points` : '+0 points';
        }

        // Update total game scores
        if (totalTeam1Score) {
            totalTeam1Score.textContent = roundScores.team1.toString();
        }
        if (totalTeam2Score) {
            totalTeam2Score.textContent = roundScores.team2.toString();
        }

        // Hide continue button
        if (continueBtn) {
            continueBtn.style.display = 'none';
        }

        // Show modal
        modal.classList.remove('hidden');

        // Auto-hide modal after 10 seconds
        setTimeout(() => {
            this.hideCongratulationsModal();
            // Trigger next round start after modal closes
            setTimeout(() => {
                this.triggerNextRound(roundWinner);
            }, 500);
        }, 10000);
    }

    /**
     * Hide congratulations modal
     */
    hideCongratulationsModal() {
        const modal = document.getElementById('congratulations-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    /**
     * Set callback for next round trigger
     * @param {Function} callback - Function to call when next round should start
     */
    setNextRoundCallback(callback) {
        this.onNextRoundCallback = callback;
    }

    /**
     * Trigger next round start
     * @param {Object} roundWinner - Round winner information
     */
    triggerNextRound(roundWinner) {
        if (this.onNextRoundCallback) {
            this.onNextRoundCallback(roundWinner);
        }
    }

    /**
     * Clear all card animations and reset to normal state
     */
    clearCardAnimations() {
        const allCards = document.querySelectorAll('.card, .card-back');
        allCards.forEach(card => {
            card.classList.remove('playing', 'removing', 'winner', 'trick-complete');
        });
    }}
