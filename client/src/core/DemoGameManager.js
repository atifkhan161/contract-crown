/**
 * DemoGameManager - Handles demo game logic
 * Manages single-player demo games with AI bots
 */

export class DemoGameManager {
    constructor(gameState, uiManager, cardManager, trumpManager, trickManager) {
        this.gameState = gameState;
        this.uiManager = uiManager;
        this.cardManager = cardManager;
        this.trumpManager = trumpManager;
        this.trickManager = trickManager;
        
        this.botHands = {};
        this.gameId = null;
        this.fullPlayerHand = null; // Store full 8-card hand during trump declaration
        
        // Bot play state management to prevent multiple plays
        this.botPlayTimeout = null;
        this.isBotPlaying = false;
        
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
        this.trickManager.setNewRoundStartCallback((trumpDeclarer) => this.setupNewRound(trumpDeclarer));
    }

    /**
     * Initialize demo game
     * @param {string} gameId - Demo game ID
     */
    async init(gameId) {
        try {
            this.gameId = gameId;
            
            console.log('[DemoGameManager] Initializing demo game:', gameId);
            
            // Set up demo game state
            await this.setupDemoGame();
            
            // Update UI
            this.uiManager.updateConnectionStatus('connected');
            this.uiManager.hideLoading();
            this.uiManager.addGameMessage('Demo game loaded with 3 AI bots', 'success');
            
            // Start trump declaration
            setTimeout(() => {
                this.trumpManager.showTrumpDeclarationModal();
            }, 1000);
            
        } catch (error) {
            console.error('[DemoGameManager] Failed to initialize:', error);
            this.uiManager.showError('Failed to load demo game');
        }
    }

    /**
     * Set up demo game with bots and cards
     */
    async setupDemoGame() {
        // Create demo players
        const demoPlayers = {
            'human_player': { 
                username: 'You', 
                seatPosition: 0, 
                handSize: 8, 
                isBot: false 
            },
            'bot_1': { 
                username: 'Bot Alice', 
                seatPosition: 1, 
                handSize: 8, 
                isBot: true 
            },
            'bot_2': { 
                username: 'Bot Bob', 
                seatPosition: 2, 
                handSize: 8, 
                isBot: true 
            },
            'bot_3': { 
                username: 'Bot Charlie', 
                seatPosition: 3, 
                handSize: 8, 
                isBot: true 
            }
        };

        // Generate and distribute cards
        const cardDistribution = this.generateDemoCards();
        
        // Sort the human player's hand by suit
        const sortedPlayerHand = this.sortCardsBySuit(cardDistribution.humanPlayerHand);
        
        // During trump declaration, only show initial 4 cards
        const initialCards = sortedPlayerHand.slice(0, 4);
        
        // Store the full hand for later use
        this.fullPlayerHand = sortedPlayerHand;

        // Update game state with only initial 4 cards during trump declaration
        this.gameState.updateState({
            gameId: this.gameId,
            isDemoMode: true,
            players: demoPlayers,
            currentPlayer: 'human_player',
            trumpDeclarer: 'human_player',
            gamePhase: 'trump_declaration',
            playerHand: initialCards,
            isMyTurn: true,
            status: 'playing'
        });

        // Store bot hands
        this.botHands = cardDistribution.botHands;

        // Render player hand (only initial 4 cards)
        this.cardManager.renderPlayerHand();
        
        // Update UI after setup to show opponent hands
        this.uiManager.updateUI();
        
        console.log('[DemoGameManager] Demo game setup complete');
    }

    /**
     * Generate demo cards for all players
     * @returns {Object} Card distribution
     */
    generateDemoCards() {
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        const ranks = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        
        // Create full deck
        const deck = [];
        for (const suit of suits) {
            for (const rank of ranks) {
                deck.push({ suit, rank });
            }
        }

        // Shuffle deck
        const shuffledDeck = this.shuffleDeck(deck);
        
        // Deal 8 cards to each player
        const hands = {
            humanPlayerHand: shuffledDeck.slice(0, 8),
            botHands: {
                bot_1: shuffledDeck.slice(8, 16),
                bot_2: shuffledDeck.slice(16, 24),
                bot_3: shuffledDeck.slice(24, 32)
            }
        };

        console.log('[DemoGameManager] Cards dealt:', {
            human: hands.humanPlayerHand.length,
            bot1: hands.botHands.bot_1.length,
            bot2: hands.botHands.bot_2.length,
            bot3: hands.botHands.bot_3.length
        });

        return hands;
    }

    /**
     * Shuffle deck using Fisher-Yates algorithm
     * @param {Array} deck - Deck to shuffle
     * @returns {Array} Shuffled deck
     */
    shuffleDeck(deck) {
        const shuffled = [...deck];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    /**
     * Handle card play from human player
     * @param {Object} card - Card played
     */
    async handleCardPlay(card) {
        console.log('[DemoGameManager] Human player played:', card);
        
        const state = this.gameState.getState();
        console.log('[DemoGameManager] Current game phase:', state.gamePhase);
        console.log('[DemoGameManager] Is my turn:', state.isMyTurn);
        
        // Add card to trick
        this.trickManager.addCardToTrick('human_player', card);
        
        // Render played card
        this.cardManager.renderPlayedCard('human_player', card, 'bottom');
        
        // Update turn to next player
        const nextPlayer = this.gameState.getNextPlayerInOrder('human_player');
        this.updateTurn(nextPlayer);
        
        // Schedule bot plays
        this.scheduleBotPlays();
    }

    /**
     * Handle trump declaration
     * @param {string} suit - Trump suit declared
     */
    async handleTrumpDeclaration(suit) {
        console.log('[DemoGameManager] Trump declared:', suit);
        
        // Give player the remaining 4 cards after trump declaration
        if (this.fullPlayerHand) {
            this.gameState.updateState({
                playerHand: this.fullPlayerHand
            });
        }
        
        // Update game state
        this.gameState.updateState({
            trumpSuit: suit,
            gamePhase: 'playing',
            currentTurnPlayer: 'human_player',
            isMyTurn: true
        });
        
        // Re-render player hand with all 8 cards
        this.cardManager.renderPlayerHand();
        
        // Update UI
        this.uiManager.updateUI();
        this.cardManager.updateCardPlayability();
        
        this.uiManager.addGameMessage(`Trump declared: ${suit}. You lead the first trick!`, 'success');
    }

    /**
     * Handle trick completion
     * @param {Object} winner - Trick winner
     * @param {Object} trick - Completed trick
     */
    handleTrickComplete(winner, trick) {
        console.log('[DemoGameManager] Trick complete, winner:', winner);
        
        // Clear any pending bot plays
        this.cleanupBotPlays();
        
        // Winner leads next trick
        this.updateTurn(winner.playerId);
        
        // If a bot won the trick, schedule them to play the first card of the next trick
        if (winner.playerId !== 'human_player') {
            console.log('[DemoGameManager] Bot won trick, scheduling bot to lead next trick');
            this.scheduleNextBotPlay(2500); // Give time for UI to clear and show next trick message
        }
    }

    /**
     * Schedule bot card plays
     */
    async scheduleBotPlays() {
        const state = this.gameState.getState();
        const currentTrick = state.currentTrick;
        
        if (!currentTrick || !currentTrick.cardsPlayed) return;
        
        const cardsInTrick = currentTrick.cardsPlayed.length;
        console.log('[DemoGameManager] Scheduling bot plays, cards in trick:', cardsInTrick);
        
        // Only schedule if the next player is a bot and no bot is currently playing
        const currentTurnPlayer = state.currentTurnPlayer;
        if (currentTurnPlayer !== 'human_player' && !this.isBotPlaying) {
            this.scheduleNextBotPlay(1500);
        }
    }

    /**
     * Schedule next bot play with timeout management
     * @param {number} delay - Delay in milliseconds
     */
    scheduleNextBotPlay(delay = 1500) {
        // Clear any existing timeout
        if (this.botPlayTimeout) {
            clearTimeout(this.botPlayTimeout);
            this.botPlayTimeout = null;
        }
        
        // Don't schedule if already playing
        if (this.isBotPlaying) {
            console.log('[DemoGameManager] Bot already playing, skipping schedule');
            return;
        }
        
        this.botPlayTimeout = setTimeout(() => {
            this.playBotCard();
        }, delay);
    }

    /**
     * Play a card for the current bot
     */
    playBotCard() {
        // Prevent multiple simultaneous bot plays
        if (this.isBotPlaying) {
            console.log('[DemoGameManager] Bot already playing, skipping');
            return;
        }
        
        const state = this.gameState.getState();
        const currentPlayer = state.currentTurnPlayer;
        
        console.log('[DemoGameManager] playBotCard called, currentPlayer:', currentPlayer);
        
        if (!currentPlayer || currentPlayer === 'human_player') {
            console.log('[DemoGameManager] Not a bot turn, skipping');
            this.isBotPlaying = false;
            return;
        }
        
        const botHand = this.botHands[currentPlayer];
        if (!botHand || botHand.length === 0) {
            console.log('[DemoGameManager] Bot has no cards, skipping');
            this.isBotPlaying = false;
            return;
        }
        
        // Set playing flag
        this.isBotPlaying = true;
        
        // Simple bot AI - play first valid card
        const validCard = this.getBotValidCard(currentPlayer, botHand);
        
        if (validCard) {
            console.log('[DemoGameManager] Bot playing card:', validCard);
            
            // Remove card from bot hand
            const cardIndex = botHand.findIndex(c => 
                c.suit === validCard.suit && c.rank === validCard.rank
            );
            if (cardIndex !== -1) {
                botHand.splice(cardIndex, 1);
            }
            
            // Add to trick
            this.trickManager.addCardToTrick(currentPlayer, validCard);
            
            // Render played card
            const position = this.getBotPosition(currentPlayer);
            this.cardManager.renderPlayedCard(currentPlayer, validCard, position);
            
            // Update player hand size
            this.gameState.updatePlayer(currentPlayer, { handSize: botHand.length });
            
            // Update UI to reflect card count changes
            this.uiManager.updateUI();
            
            // Update turn
            const nextPlayer = this.gameState.getNextPlayerInOrder(currentPlayer);
            this.updateTurn(nextPlayer);
            
            // Add message
            const playerName = this.gameState.getPlayerNameById(currentPlayer);
            this.uiManager.addGameMessage(`${playerName} played ${validCard.rank} of ${validCard.suit}`, 'info');
            
            // Clear playing flag
            this.isBotPlaying = false;
            
            // If there are still bots to play in this trick, schedule the next one
            const currentTrick = this.gameState.getState().currentTrick;
            if (currentTrick && currentTrick.cardsPlayed && currentTrick.cardsPlayed.length < 4) {
                const nextPlayerAfterUpdate = this.gameState.getState().currentTurnPlayer;
                if (nextPlayerAfterUpdate !== 'human_player') {
                    this.scheduleNextBotPlay(1500);
                }
            }
        } else {
            // Clear playing flag if no valid card found
            this.isBotPlaying = false;
        }
    }

    /**
     * Get valid card for bot to play
     * @param {string} botId - Bot player ID
     * @param {Array} botHand - Bot's hand
     * @returns {Object} Valid card to play
     */
    getBotValidCard(botId, botHand) {
        const state = this.gameState.getState();
        const leadSuit = state.leadSuit;
        
        if (!leadSuit) {
            // No lead suit - play any card (simple strategy: play lowest)
            return this.getLowestCard(botHand);
        }
        
        // Must follow suit if possible
        const cardsOfLeadSuit = botHand.filter(card => card.suit === leadSuit);
        if (cardsOfLeadSuit.length > 0) {
            return this.getLowestCard(cardsOfLeadSuit);
        }
        
        // Can't follow suit - play any card
        return this.getLowestCard(botHand);
    }

    /**
     * Get lowest card from hand (simple bot strategy)
     * @param {Array} hand - Cards to choose from
     * @returns {Object} Lowest card
     */
    getLowestCard(hand) {
        if (!hand || hand.length === 0) return null;
        
        const rankValues = {
            '7': 1, '8': 2, '9': 3, '10': 4,
            'J': 5, 'Q': 6, 'K': 7, 'A': 8
        };
        
        return hand.reduce((lowest, card) => {
            if (!lowest) return card;
            return rankValues[card.rank] < rankValues[lowest.rank] ? card : lowest;
        }, null);
    }



    /**
     * Get bot's position on screen
     * @param {string} botId - Bot player ID
     * @returns {string} Screen position
     */
    getBotPosition(botId) {
        const positions = {
            'bot_1': 'left',
            'bot_2': 'top', 
            'bot_3': 'right'
        };
        return positions[botId] || 'top';
    }

    /**
     * Update current turn
     * @param {string} playerId - Player whose turn it is
     */
    updateTurn(playerId) {
        const isMyTurn = (playerId === 'human_player');
        
        this.gameState.updateState({
            currentTurnPlayer: playerId,
            isMyTurn: isMyTurn
        });
        
        this.uiManager.updateTurnIndicators();
        
        if (isMyTurn) {
            this.cardManager.updateCardPlayability();
        }
    }

    /**
     * Cleanup demo game resources
     */
    cleanup() {
        console.log('[DemoGameManager] Cleaning up demo game');
        this.botHands = {};
        this.fullPlayerHand = null;
    }

    /**
     * Cleanup method to clear any pending bot plays
     */
    cleanupBotPlays() {
        if (this.botPlayTimeout) {
            clearTimeout(this.botPlayTimeout);
            this.botPlayTimeout = null;
        }
        this.isBotPlaying = false;
    }

    /**
     * Reset bot play state (useful for new rounds/games)
     */
    resetBotPlayState() {
        this.cleanupBotPlays();
        console.log('[DemoGameManager] Bot play state reset');
    }

    /**
     * Setup new round with fresh cards
     * @param {string} trumpDeclarer - Player who will declare trump this round
     */
    setupNewRound(trumpDeclarer) {
        console.log('[DemoGameManager] Setting up new round, trump declarer:', trumpDeclarer);
        
        // Generate and distribute new cards
        const cardDistribution = this.generateDemoCards();
        
        // Sort the human player's hand by suit
        const sortedPlayerHand = this.sortCardsBySuit(cardDistribution.humanPlayerHand);
        
        // During trump declaration, only show initial 4 cards
        const initialCards = sortedPlayerHand.slice(0, 4);
        
        // Store the full hand for later use
        this.fullPlayerHand = sortedPlayerHand;

        // Update game state for new round
        this.gameState.updateState({
            gamePhase: 'trump_declaration',
            trumpSuit: null,
            trumpDeclarer: trumpDeclarer,
            playerHand: initialCards,
            currentTurnPlayer: null,
            isMyTurn: (trumpDeclarer === 'human_player'),
            leadSuit: null
        });

        // Update all players' hand sizes
        Object.keys(this.gameState.getState().players).forEach(playerId => {
            this.gameState.updatePlayer(playerId, { handSize: 8 });
        });

        // Store new bot hands
        this.botHands = cardDistribution.botHands;

        // Reset bot play state
        this.resetBotPlayState();

        // Reset trick for new round
        this.gameState.resetTrickForNewRound();

        // Render player hand (only initial 4 cards)
        this.cardManager.renderPlayerHand();
        
        // Update UI
        this.uiManager.updateUI();
        
        // Show trump declaration modal if human player is declaring
        if (trumpDeclarer === 'human_player') {
            setTimeout(() => {
                this.trumpManager.showTrumpDeclarationModal();
            }, 1000);
        } else {
            // Bot declares trump automatically
            setTimeout(() => {
                this.handleBotTrumpDeclaration(trumpDeclarer);
            }, 2000);
        }
        
        console.log('[DemoGameManager] New round setup complete');
    }

    /**
     * Handle bot trump declaration
     * @param {string} botId - Bot player ID
     */
    handleBotTrumpDeclaration(botId) {
        const botHand = this.botHands[botId];
        if (!botHand) {
            console.error('[DemoGameManager] Bot hand not found for trump declaration:', botId);
            return;
        }

        // Simple bot trump selection - choose suit with most cards in initial 4 cards
        const initialCards = botHand.slice(0, 4);
        const suitCounts = {};
        
        initialCards.forEach(card => {
            suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
        });

        // Find suit with most cards
        const trumpSuit = Object.keys(suitCounts).reduce((a, b) => 
            suitCounts[a] > suitCounts[b] ? a : b
        );

        const botName = this.gameState.getPlayerNameById(botId);
        this.uiManager.addGameMessage(`${botName} declares ${trumpSuit} as trump`, 'info');

        // Update game state
        this.gameState.updateState({
            trumpSuit: trumpSuit,
            gamePhase: 'playing',
            currentTurnPlayer: botId, // Bot who declared trump leads first trick
            isMyTurn: false
        });

        // Update trump display
        this.uiManager.updateTrumpDisplay();
        this.uiManager.updateUI();

        // If human player, give them full hand
        if (this.fullPlayerHand) {
            this.gameState.updateState({
                playerHand: this.fullPlayerHand
            });
            this.cardManager.renderPlayerHand();
        }

        // Start the first trick with the bot leading
        this.uiManager.addGameMessage(`${botName} leads the first trick`, 'info');
        
        // Schedule bot to play first card
        this.scheduleNextBotPlay(1500);
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