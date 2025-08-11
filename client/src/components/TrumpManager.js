/**
 * TrumpManager - Manages trump declaration logic
 * Handles trump suit selection, validation, and UI interactions
 */

export class TrumpManager {
    constructor(gameState, uiManager) {
        this.gameState = gameState;
        this.uiManager = uiManager;
        this.selectedTrumpSuit = null;
        this.onTrumpDeclared = null; // Callback for trump declaration events
    }

    /**
     * Set up trump-related event listeners
     */
    setupEventListeners() {
        // Trump suit selection
        const trumpOptions = document.querySelectorAll('.trump-option');
        trumpOptions.forEach(option => {
            option.addEventListener('click', (e) => this.selectTrumpSuit(e.currentTarget));
        });

        // Confirm trump button
        const confirmTrumpBtn = document.getElementById('confirm-trump-btn');
        if (confirmTrumpBtn) {
            confirmTrumpBtn.addEventListener('click', () => this.confirmTrumpDeclaration());
        }
    }

    /**
     * Set callback for trump declaration events
     * @param {Function} callback - Function to call when trump is declared
     */
    setTrumpDeclarationCallback(callback) {
        this.onTrumpDeclared = callback;
    }

    /**
     * Show trump declaration modal
     */
    showTrumpDeclarationModal() {
        const modal = document.getElementById('trump-modal');
        if (!modal) {
            console.error('[TrumpManager] Trump modal element not found');
            return;
        }

        console.log('[TrumpManager] Showing trump declaration modal');

        // Render initial cards for trump declaration
        this.renderTrumpInitialCards();
        
        // Set recommended suit as default selection
        this.setDefaultRecommendedSuit();
        
        // Show modal
        modal.classList.remove('hidden');
        
        this.uiManager.addGameMessage('Choose the trump suit for this round', 'info');
    }

    /**
     * Hide trump declaration modal
     */
    hideTrumpDeclarationModal() {
        const modal = document.getElementById('trump-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    /**
     * Render initial cards for trump declaration
     */
    renderTrumpInitialCards() {
        const state = this.gameState.getState();
        const playerHand = state.playerHand || [];
        const container = document.getElementById('trump-initial-cards');
        
        console.log('[TrumpManager] Rendering trump cards:', {
            playerHand,
            handLength: playerHand.length,
            gameState: state
        });
        
        if (!container) return;

        container.innerHTML = '';

        // Show first 4 cards for trump declaration, sorted by suit
        const initialCards = playerHand.slice(0, 4);
        const sortedCards = this.sortCardsBySuit(initialCards);
        
        console.log('[TrumpManager] Cards to render:', { initialCards, sortedCards });
        
        sortedCards.forEach((card, index) => {
            const cardElement = this.createTrumpCardElement(card, index);
            container.appendChild(cardElement);
        });
    }

    /**
     * Create a card element for trump declaration
     * @param {Object} card - Card object
     * @param {number} index - Card index
     * @returns {HTMLElement} Card element
     */
    createTrumpCardElement(card, index) {
        const cardElement = document.createElement('div');
        cardElement.className = 'trump-modal-card';
        cardElement.classList.add(card.suit.toLowerCase()); // Add lowercase suit class for CSS styling
        cardElement.dataset.suit = card.suit;
        cardElement.dataset.rank = card.rank;

        const suitSymbols = {
            Hearts: '♥',
            Diamonds: '♦',
            Clubs: '♣',
            Spades: '♠'
        };

        cardElement.innerHTML = `
            <div class="card-corner card-corner-top">
                <div class="card-rank">${card.rank}</div>
                <div class="card-suit-small">${suitSymbols[card.suit]}</div>
            </div>
            <div class="card-center">
                <div class="card-suit">${suitSymbols[card.suit]}</div>
            </div>
            <div class="card-corner card-corner-bottom">
                <div class="card-rank">${card.rank}</div>
                <div class="card-suit-small">${suitSymbols[card.suit]}</div>
            </div>
        `;

        return cardElement;
    }

    /**
     * Select trump suit
     * @param {HTMLElement} optionElement - Trump option element
     */
    selectTrumpSuit(optionElement) {
        const suit = optionElement.dataset.suit;
        if (!suit) return;

        // Clear previous selection
        document.querySelectorAll('.trump-option').forEach(option => {
            option.classList.remove('selected');
        });

        // Select new suit
        optionElement.classList.add('selected');
        this.selectedTrumpSuit = suit;

        // Enable confirm button
        const confirmBtn = document.getElementById('confirm-trump-btn');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.classList.add('enabled');
        }

        // Show suit information
        this.showTrumpSuitInfo(suit);
    }

    /**
     * Show information about selected trump suit
     * @param {string} suit - Selected trump suit
     */
    showTrumpSuitInfo(suit) {
        const state = this.gameState.getState();
        const playerHand = state.playerHand || [];
        const suitCards = playerHand.filter(card => card.suit === suit);
        
        const suitNames = {
            Hearts: 'Hearts',
            Diamonds: 'Diamonds',
            Clubs: 'Clubs',
            Spades: 'Spades'
        };

        const message = `Selected ${suitNames[suit]} as trump (${suitCards.length} cards in hand)`;
        this.uiManager.addGameMessage(message, 'info');
    }

    /**
     * Confirm trump declaration
     */
    async confirmTrumpDeclaration() {
        if (!this.selectedTrumpSuit) {
            this.uiManager.addGameMessage('Please select a trump suit first', 'warning');
            return;
        }

        try {
            // Update game state
            this.gameState.updateState({
                trumpSuit: this.selectedTrumpSuit,
                gamePhase: 'playing'
            });

            // Hide modal
            this.hideTrumpDeclarationModal();

            // Update trump display
            this.uiManager.updateTrumpDisplay();

            // Trigger callback
            if (this.onTrumpDeclared) {
                await this.onTrumpDeclared(this.selectedTrumpSuit);
            }

            // Show success message
            const suitNames = {
                Hearts: 'Hearts',
                Diamonds: 'Diamonds',
                Clubs: 'Clubs',
                Spades: 'Spades'
            };

            this.uiManager.addGameMessage(`Trump declared: ${suitNames[this.selectedTrumpSuit]}`, 'success');

            // Complete trump declaration process
            this.handleTrumpDeclarationComplete();

        } catch (error) {
            console.error('[TrumpManager] Error confirming trump:', error);
            this.uiManager.showError('Failed to declare trump. Please try again.');
        }
    }

    /**
     * Handle completion of trump declaration
     */
    handleTrumpDeclarationComplete() {
        const state = this.gameState.getState();
        
        console.log('[TrumpManager] Trump declaration complete, current player:', state.currentPlayer);
        
        // Deal remaining cards (from 4 to 8 per player)
        this.dealRemainingCards();
        
        // Set up first trick
        this.gameState.updateState({
            currentTurnPlayer: state.currentPlayer, // Human player starts
            isMyTurn: true
        });

        // Update UI
        this.uiManager.updateUI();
        
        // Show game start message
        this.uiManager.addGameMessage('Trump declared! You lead the first trick.', 'success');
        
        console.log('[TrumpManager] Game phase set to playing, isMyTurn:', true);
    }

    /**
     * Deal remaining cards after trump declaration
     */
    dealRemainingCards() {
        const state = this.gameState.getState();
        
        // In demo mode, we already have all 8 cards
        if (state.isDemoMode) {
            return;
        }

        // For real games, this would be handled by the server
        // Here we just update the UI to show full hands
        Object.keys(state.players).forEach(playerId => {
            this.gameState.updatePlayer(playerId, { handSize: 8 });
        });
    }

    /**
     * Set recommended trump suit as default selection
     */
    setDefaultRecommendedSuit() {
        // Get recommendation from CardManager if available
        const recommendedSuit = this.getRecommendedTrumpSuit();
        
        if (recommendedSuit) {
            // Clear any previous selections
            document.querySelectorAll('.trump-option').forEach(option => {
                option.classList.remove('selected', 'recommended');
            });
            
            const recommendedOption = document.querySelector(`.trump-option[data-suit="${recommendedSuit}"]`);
            if (recommendedOption) {
                // Highlight as recommended (visual only, no label)
                recommendedOption.classList.add('recommended');
                
                // Auto-select the recommended suit
                this.selectTrumpSuit(recommendedOption);
            }
        }
    }

    /**
     * Get recommended trump suit based on hand analysis (initial 4 cards only)
     * @returns {string} Recommended trump suit
     */
    getRecommendedTrumpSuit() {
        const state = this.gameState.getState();
        const playerHand = state.playerHand || [];
        
        // Use only initial 4 cards for trump recommendation
        const initialCards = playerHand.slice(0, 4);

        // Count cards by suit
        const suitCounts = {
            hearts: 0,
            diamonds: 0,
            clubs: 0,
            spades: 0
        };

        // Calculate suit strength (count + high cards)
        const suitStrength = {};
        
        Object.keys(suitCounts).forEach(suit => {
            const suitCards = initialCards.filter(card => card.suit === suit);
            suitCounts[suit] = suitCards.length;
            
            let strength = suitCards.length;
            
            // Add bonus for high cards
            suitCards.forEach(card => {
                if (card.rank === 'A') strength += 3;
                else if (card.rank === 'K') strength += 2;
                else if (card.rank === 'Q') strength += 1.5;
                else if (card.rank === 'J') strength += 1;
            });
            
            suitStrength[suit] = strength;
        });

        // Return suit with highest strength
        return Object.keys(suitStrength).reduce((a, b) => 
            suitStrength[a] > suitStrength[b] ? a : b
        );
    }

    /**
     * Validate trump suit selection
     * @param {string} suit - Trump suit to validate
     * @returns {boolean} True if valid
     */
    isValidTrumpSuit(suit) {
        const validSuits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
        return validSuits.includes(suit);
    }

    /**
     * Get trump suit information
     * @returns {Object} Trump suit information
     */
    getTrumpInfo() {
        const state = this.gameState.getState();
        const trumpSuit = state.trumpSuit;
        
        if (!trumpSuit) {
            return {
                suit: null,
                name: 'Not Declared',
                symbol: '?',
                declarer: null
            };
        }

        const suitSymbols = {
            Hearts: '♥',
            Diamonds: '♦',
            Clubs: '♣',
            Spades: '♠'
        };

        const suitNames = {
            Hearts: 'Hearts',
            Diamonds: 'Diamonds',
            Clubs: 'Clubs',
            Spades: 'Spades'
        };

        return {
            suit: trumpSuit,
            name: suitNames[trumpSuit],
            symbol: suitSymbols[trumpSuit],
            declarer: state.trumpDeclarer
        };
    }

    /**
     * Check if a card is trump
     * @param {Object} card - Card to check
     * @returns {boolean} True if card is trump
     */
    isTrumpCard(card) {
        const state = this.gameState.getState();
        return card.suit === state.trumpSuit;
    }

    /**
     * Get trump cards from a hand
     * @param {Array} hand - Hand to check
     * @returns {Array} Trump cards
     */
    getTrumpCards(hand) {
        const state = this.gameState.getState();
        const trumpSuit = state.trumpSuit;
        
        if (!trumpSuit) return [];
        
        return hand.filter(card => card.suit === trumpSuit);
    }

    /**
     * Sort cards by suit (spades, hearts, diamonds, clubs) and then by rank
     * @param {Array} cards - Cards to sort
     * @returns {Array} Sorted cards
     */
    sortCardsBySuit(cards) {
        const suitOrder = ['Spades', 'Hearts', 'Diamonds', 'Clubs'];
        const rankOrder = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        
        return [...cards].sort((a, b) => {
            // First sort by suit
            const suitComparison = suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
            if (suitComparison !== 0) {
                return suitComparison;
            }
            
            // Then sort by rank within the same suit
            return rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank);
        });
    }
}