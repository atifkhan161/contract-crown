/**
 * GameState - Manages game state and data
 * Centralized state management for the Contract Crown game
 */

export class GameState {
    constructor() {
        this.state = {
            gameId: null,
            currentPlayer: 'player1',
            players: {
                'player1': { username: 'You', seatPosition: 1, handSize: 4 },
                'player2': { username: 'Player 2', seatPosition: 2, handSize: 4 },
                'player3': { username: 'Player 3', seatPosition: 3, handSize: 4 },
                'player4': { username: 'Player 4', seatPosition: 4, handSize: 4 }
            },
            currentRound: 1,
            currentTrick: {
                trickNumber: 1,
                cardsPlayed: [],
                leadSuit: null
            },
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
            currentTurnPlayer: null,
            isDemoMode: false,
            status: 'waiting'
        };
    }

    /**
     * Get current game state
     * @returns {Object} Current state
     */
    getState() {
        return this.state;
    }

    /**
     * Update game state with new data
     * @param {Object} updates - State updates to apply
     */
    updateState(updates) {
        this.state = { ...this.state, ...updates };
    }

    /**
     * Update specific player data
     * @param {string} playerId - Player ID
     * @param {Object} playerData - Player data updates
     */
    updatePlayer(playerId, playerData) {
        if (this.state.players[playerId]) {
            this.state.players[playerId] = { ...this.state.players[playerId], ...playerData };
        }
    }

    /**
     * Update current trick data
     * @param {Object} trickData - Trick data updates
     */
    updateTrick(trickData) {
        this.state.currentTrick = { ...this.state.currentTrick, ...trickData };
    }

    /**
     * Add card to current trick
     * @param {string} playerId - Player who played the card
     * @param {Object} card - Card that was played
     */
    addCardToTrick(playerId, card) {
        if (!this.state.currentTrick.cardsPlayed) {
            this.state.currentTrick.cardsPlayed = [];
        }
        
        this.state.currentTrick.cardsPlayed.push({
            playerId,
            card
        });

        // Set lead suit if this is the first card
        if (this.state.currentTrick.cardsPlayed.length === 1) {
            this.state.currentTrick.leadSuit = card.suit;
            this.state.leadSuit = card.suit;
            this.state.currentTrick.leadingPlayerId = playerId;
        }
    }

    /**
     * Remove card from player hand
     * @param {Object} card - Card to remove
     */
    removeCardFromHand(card) {
        const index = this.state.playerHand.findIndex(c => 
            c.suit === card.suit && c.rank === card.rank
        );
        if (index !== -1) {
            this.state.playerHand.splice(index, 1);
        }
    }

    /**
     * Clear current trick
     */
    clearTrick() {
        this.state.currentTrick = {
            trickNumber: (this.state.currentTrick?.trickNumber || 0) + 1,
            cardsPlayed: [],
            leadSuit: null,
            leadingPlayerId: null
        };
        this.state.leadSuit = null;
    }

    /**
     * Get players in clockwise seat order
     * @returns {Array} Array of player objects in seat order
     */
    getPlayersInSeatOrder() {
        const players = Object.entries(this.state.players).map(([id, player]) => ({
            id,
            ...player
        }));
        
        return players.sort((a, b) => a.seatPosition - b.seatPosition);
    }

    /**
     * Get the next player in clockwise order
     * @param {string} currentPlayerId - Current player ID
     * @returns {string} Next player ID
     */
    getNextPlayerInOrder(currentPlayerId) {
        const playersInOrder = this.getPlayersInSeatOrder();
        const currentIndex = playersInOrder.findIndex(p => p.id === currentPlayerId);
        
        if (currentIndex === -1) {
            return playersInOrder[0]?.id;
        }
        
        const nextIndex = (currentIndex + 1) % playersInOrder.length;
        return playersInOrder[nextIndex].id;
    }

    /**
     * Get current player ID
     * @returns {string} Current player ID
     */
    getCurrentPlayerId() {
        return this.state.currentPlayer || 'player1';
    }

    /**
     * Get player name by ID
     * @param {string} playerId - Player ID
     * @returns {string} Player name
     */
    getPlayerNameById(playerId) {
        if (this.state.players && this.state.players[playerId]) {
            return this.state.players[playerId].username;
        }
        return `Player ${playerId}`;
    }

    /**
     * Check if card exists in player hand
     * @param {Object} card - Card to check
     * @returns {boolean} True if card exists in hand
     */
    hasCard(card) {
        return this.state.playerHand.some(c =>
            c.suit === card.suit && c.rank === card.rank
        );
    }

    /**
     * Get cards of specific suit from player hand
     * @param {string} suit - Suit to filter by
     * @returns {Array} Cards of the specified suit
     */
    getCardsOfSuit(suit) {
        return this.state.playerHand.filter(c => c.suit === suit);
    }

    /**
     * Reset state for new game
     */
    reset() {
        const gameId = this.state.gameId;
        const isDemoMode = this.state.isDemoMode;
        
        this.state = {
            gameId,
            isDemoMode,
            currentPlayer: 'player1',
            players: {},
            currentRound: 1,
            currentTrick: {
                trickNumber: 1,
                cardsPlayed: [],
                leadSuit: null
            },
            trumpSuit: null,
            trumpDeclarer: null,
            scores: { team1: 0, team2: 0 },
            playerHand: [],
            selectedCard: null,
            isMyTurn: false,
            gamePhase: 'waiting',
            leadSuit: null,
            currentTurnPlayer: null,
            status: 'waiting'
        };
    }
}