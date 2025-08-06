/**
 * CardManager - Handles card rendering, validation, and interactions
 * Manages all card-related UI operations and game logic
 */

export class CardManager {
    constructor(gameState, uiManager) {
        this.gameState = gameState;
        this.uiManager = uiManager;
        this.selectedCard = null;
        this.onCardPlay = null; // Callback for card play events
    }

    /**
     * Set up card-related event listeners
     */
    setupEventListeners() {
        const playerHand = document.getElementById('player-hand');
        if (playerHand) {
            playerHand.addEventListener('click', (e) => this.handleCardClick(e));
        }
    }

    /**
     * Set callback for card play events
     * @param {Function} callback - Function to call when card is played
     */
    setCardPlayCallback(callback) {
        this.onCardPlay = callback;
    }

    /**
     * Handle card click events
     * @param {Event} e - Click event
     */
    handleCardClick(e) {
        console.log('[CardManager] Card clicked');
        const cardElement = e.target.closest('.card');
        if (!cardElement) {
            console.log('[CardManager] No card element found');
            return;
        }

        const suit = cardElement.dataset.suit;
        const rank = cardElement.dataset.rank;
        
        console.log('[CardManager] Card data:', { suit, rank });
        
        if (!suit || !rank) {
            console.log('[CardManager] Missing card data');
            return;
        }

        const card = { suit, rank };
        
        // Check if it's the player's turn
        const state = this.gameState.getState();
        console.log('[CardManager] Game state check:', { 
            isMyTurn: state.isMyTurn, 
            gamePhase: state.gamePhase 
        });
        
        if (!state.isMyTurn) {
            this.uiManager.addGameMessage("It's not your turn", 'warning');
            return;
        }

        // Validate card play
        if (!this.isValidCardPlay(card)) {
            console.log('[CardManager] Invalid card play');
            return;
        }

        // Select/deselect card or play if already selected
        if (this.selectedCard && 
            this.selectedCard.suit === card.suit && 
            this.selectedCard.rank === card.rank) {
            // Card is already selected - play it
            console.log('[CardManager] Playing already selected card');
            this.playSelectedCard();
        } else {
            console.log('[CardManager] Selecting card');
            this.selectCard(card, cardElement);
        }
    }

    /**
     * Select a card
     * @param {Object} card - Card to select
     * @param {HTMLElement} cardElement - Card DOM element
     */
    selectCard(card, cardElement) {
        // Deselect previous card
        this.deselectCard();

        // Select new card
        this.selectedCard = card;
        cardElement.classList.add('selected');
        this.gameState.updateState({ selectedCard: card });

        // Auto-play if only one valid card
        const validCards = this.getValidCards();
        if (validCards.length === 1) {
            setTimeout(() => this.playSelectedCard(), 500);
        } else {
            this.uiManager.addGameMessage(`Selected ${card.rank} of ${card.suit}. Click again to play.`, 'info');
        }
    }

    /**
     * Deselect current card
     */
    deselectCard() {
        if (this.selectedCard) {
            const selectedElement = document.querySelector('.card.selected');
            if (selectedElement) {
                selectedElement.classList.remove('selected');
            }
            this.selectedCard = null;
            this.gameState.updateState({ selectedCard: null });
        }
    }

    /**
     * Play the currently selected card
     */
    async playSelectedCard() {
        if (!this.selectedCard) {
            this.uiManager.addGameMessage('No card selected', 'warning');
            return;
        }

        const card = this.selectedCard;
        console.log('[CardManager] Playing card:', card);
        
        this.deselectCard();

        // Remove card from hand
        this.gameState.removeCardFromHand(card);

        // Trigger card play callback
        if (this.onCardPlay) {
            console.log('[CardManager] Triggering card play callback');
            await this.onCardPlay(card);
        } else {
            console.warn('[CardManager] No card play callback set');
        }

        // Update UI
        this.renderPlayerHand();
        this.updateCardPlayability();
    }

    /**
     * Validate if a card can be played
     * @param {Object} card - Card to validate
     * @returns {boolean} True if card can be played
     */
    isValidCardPlay(card) {
        const state = this.gameState.getState();
        
        // Check if player has the card
        if (!this.gameState.hasCard(card)) {
            this.uiManager.addGameMessage("You don't have that card", 'error');
            return false;
        }

        // Check if it's trump declaration phase
        if (state.gamePhase === 'trump_declaration') {
            this.uiManager.addGameMessage('Please declare trump first', 'warning');
            return false;
        }

        // Check suit following rules
        const leadSuit = state.leadSuit;
        if (leadSuit && leadSuit !== card.suit) {
            const cardsOfLeadSuit = this.gameState.getCardsOfSuit(leadSuit);
            if (cardsOfLeadSuit.length > 0) {
                this.uiManager.addGameMessage(`You must follow suit: ${leadSuit}`, 'warning');
                return false;
            }
        }

        return true;
    }

    /**
     * Get all valid cards that can be played
     * @returns {Array} Array of valid cards
     */
    getValidCards() {
        const state = this.gameState.getState();
        const playerHand = state.playerHand || [];
        
        if (state.gamePhase !== 'playing') {
            return [];
        }

        const leadSuit = state.leadSuit;
        
        // If no lead suit, all cards are valid
        if (!leadSuit) {
            return [...playerHand];
        }

        // Must follow suit if possible
        const cardsOfLeadSuit = playerHand.filter(card => card.suit === leadSuit);
        if (cardsOfLeadSuit.length > 0) {
            return cardsOfLeadSuit;
        }

        // If can't follow suit, all remaining cards are valid
        return [...playerHand];
    }

    /**
     * Update card playability visual indicators
     */
    updateCardPlayability() {
        const validCards = this.getValidCards();
        const cardElements = document.querySelectorAll('#player-hand .card');

        cardElements.forEach(cardElement => {
            const suit = cardElement.dataset.suit;
            const rank = cardElement.dataset.rank;
            
            const isValid = validCards.some(card => 
                card.suit === suit && card.rank === rank
            );

            cardElement.classList.toggle('playable', isValid);
            cardElement.classList.toggle('unplayable', !isValid);
        });
    }

    /**
     * Render player's hand
     */
    renderPlayerHand() {
        const state = this.gameState.getState();
        const playerHand = state.playerHand || [];
        const handElement = document.getElementById('player-hand');
        
        if (!handElement) return;

        handElement.innerHTML = '';

        // Sort cards by suit before rendering
        const sortedHand = this.sortCardsBySuit(playerHand);

        sortedHand.forEach((card, index) => {
            const cardElement = this.createCardElement(card, index);
            handElement.appendChild(cardElement);
        });

        // Update playability after rendering
        setTimeout(() => this.updateCardPlayability(), 100);
    }

    /**
     * Create a card DOM element
     * @param {Object} card - Card object
     * @param {number} index - Card index in hand
     * @returns {HTMLElement} Card element
     */
    createCardElement(card, index) {
        const cardElement = document.createElement('div');
        cardElement.className = 'card';
        cardElement.dataset.suit = card.suit;
        cardElement.dataset.rank = card.rank;
        cardElement.style.zIndex = index + 1;

        const suitSymbols = {
            hearts: '♥',
            diamonds: '♦',
            clubs: '♣',
            spades: '♠'
        };

        // Add suit class for styling
        cardElement.classList.add(card.suit);
        
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
     * Render a played card on the table
     * @param {string} playerId - Player who played the card
     * @param {Object} card - Card that was played
     * @param {string} position - Position on table (top, left, right, bottom)
     */
    renderPlayedCard(playerId, card, position) {
        const slotId = `played-card-${position}`;
        const slot = document.getElementById(slotId);
        
        if (!slot) return;

        const cardElement = this.createCardElement(card, 0);
        cardElement.classList.add('played-card', 'animate-play');
        
        slot.innerHTML = '';
        slot.appendChild(cardElement);
        slot.classList.add('active');

        // Add player name label
        const playerName = this.gameState.getPlayerNameById(playerId);
        const nameLabel = document.createElement('div');
        nameLabel.className = 'played-card-player';
        nameLabel.textContent = playerName;
        slot.appendChild(nameLabel);

        // Remove animation class after animation completes
        setTimeout(() => {
            cardElement.classList.remove('animate-play');
        }, 600);
    }

    /**
     * Clear all played cards from the table
     */
    clearPlayedCards() {
        const slots = ['played-card-top', 'played-card-left', 'played-card-right', 'played-card-bottom'];
        
        slots.forEach(slotId => {
            const slot = document.getElementById(slotId);
            if (slot) {
                slot.innerHTML = '';
                slot.classList.remove('active');
            }
        });
    }

    /**
     * Highlight cards of a specific suit
     * @param {string} suit - Suit to highlight
     */
    highlightSuit(suit) {
        const cardElements = document.querySelectorAll('#player-hand .card');
        
        cardElements.forEach(cardElement => {
            if (cardElement.dataset.suit === suit) {
                cardElement.classList.add('highlighted');
            } else {
                cardElement.classList.remove('highlighted');
            }
        });

        // Remove highlights after 3 seconds
        setTimeout(() => {
            cardElements.forEach(cardElement => {
                cardElement.classList.remove('highlighted');
            });
        }, 3000);
    }

    /**
     * Get card count by suit in player's hand
     * @returns {Object} Object with suit counts
     */
    getSuitCounts() {
        const state = this.gameState.getState();
        const playerHand = state.playerHand || [];
        
        const counts = {
            hearts: 0,
            diamonds: 0,
            clubs: 0,
            spades: 0
        };

        playerHand.forEach(card => {
            if (counts.hasOwnProperty(card.suit)) {
                counts[card.suit]++;
            }
        });

        return counts;
    }

    /**
     * Get recommended trump suit based on hand strength (initial 4 cards only)
     * @returns {string} Recommended trump suit
     */
    getRecommendedTrumpSuit() {
        const state = this.gameState.getState();
        const playerHand = state.playerHand || [];
        
        // Use only initial 4 cards for trump recommendation
        const initialCards = playerHand.slice(0, 4);
        
        // Count cards by suit from initial cards only
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
     * Sort cards by suit (spades, hearts, diamonds, clubs) and then by rank
     * @param {Array} cards - Cards to sort
     * @returns {Array} Sorted cards
     */
    sortCardsBySuit(cards) {
        const suitOrder = ['spades', 'hearts', 'diamonds', 'clubs'];
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