import { v4 as uuidv4 } from 'uuid';
// Legacy MariaDB connection removed - now using RxDB
// import dbConnection from '../../database/connection.js';

// Temporary compatibility layer - this needs to be replaced with RxDB queries
const dbConnection = {
    query: () => {
        throw new Error('dbConnection is not defined - GameEngine needs to be migrated to RxDB');
    }
};

/**
 * GameEngine class handles core game logic for Contract Crown
 * Implements 32-card deck, trump declaration, trick-taking, and scoring
 */
class GameEngine {
    constructor() {
        // Define the 32-card deck (7 through Ace)
        this.suits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
        this.ranks = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

        // Card values for comparison (higher value wins)
        this.cardValues = {
            '7': 7, '8': 8, '9': 9, '10': 10,
            'J': 11, 'Q': 12, 'K': 13, 'A': 14
        };
    }

    /**
     * Check if a game is in demo mode
     * @param {string} gameId - Game ID
     * @returns {Promise<boolean>} True if game is in demo mode
     */
    async isDemoMode(gameId) {
        try {
            const { default: Game } = await import('../models/Game.js');
            const gameModel = new Game();
            const game = await gameModel.findOne({ game_id: gameId });

            if (!game) {
                return false;
            }

            return Boolean(game.is_demo_mode);
        } catch (error) {
            console.error('[GameEngine] Error checking demo mode:', error.message);
            return false;
        }
    }

    /**
     * Initialize demo game with 1 human player and 3 bots
     * @param {string} gameId - Game ID
     * @param {string} humanPlayerId - Human player ID
     * @param {Array} botPlayers - Array of bot player objects
     * @returns {Promise<Object>} Demo game initialization result
     */
    async initializeDemoGame(gameId, humanPlayerId, botPlayers) {
        try {
            console.log(`[GameEngine] Initializing demo game ${gameId} with human player ${humanPlayerId} and ${botPlayers.length} bots`);

            // Validate demo game setup
            if (botPlayers.length !== 3) {
                throw new Error('Demo game must have exactly 3 bot players');
            }

            // Mark game as demo mode
            const { default: Game } = await import('../models/Game.js');
            const gameModel = new Game();
            const game = await gameModel.findOne({ game_id: gameId });
            if (game) {
                await game.update({ is_demo_mode: true });
            }

            // Verify all players are properly set up in game_players table
            const allPlayers = await this.getGamePlayers(gameId);
            if (allPlayers.length !== 4) {
                throw new Error('Demo game must have exactly 4 players (1 human + 3 bots)');
            }

            // Validate that we have the right mix of human and bot players
            const humanPlayers = allPlayers.filter(p => !this.isPlayerBot(p.user_id, botPlayers));
            const botPlayerIds = botPlayers.map(bot => bot.id);
            const gameBotsInDb = allPlayers.filter(p => botPlayerIds.includes(p.user_id));

            if (humanPlayers.length !== 1 || gameBotsInDb.length !== 3) {
                throw new Error('Invalid demo game player composition');
            }

            console.log(`[GameEngine] Demo game ${gameId} initialized successfully`);

            return {
                gameId,
                isDemoMode: true,
                humanPlayerId,
                botPlayerIds: botPlayerIds,
                totalPlayers: 4,
                status: 'initialized'
            };
        } catch (error) {
            console.error('[GameEngine] Demo game initialization error:', error.message);
            throw error;
        }
    }

    /**
     * Check if a player ID belongs to a bot
     * @param {string} playerId - Player ID to check
     * @param {Array} botPlayers - Array of bot player objects
     * @returns {boolean} True if player is a bot
     */
    isPlayerBot(playerId, botPlayers = []) {
        return botPlayers.some(bot => bot.id === playerId);
    }

    /**
     * Get demo game state with bot-specific information
     * @param {string} gameId - Game ID
     * @returns {Promise<Object>} Demo game state
     */
    async getDemoGameState(gameId) {
        try {
            // Get base game state
            const gameState = await this.getGameState(gameId);

            // Check if this is a demo game
            const isDemoMode = await this.isDemoMode(gameId);

            if (!isDemoMode) {
                return gameState;
            }

            // Enhance with demo-specific information
            const demoGameState = {
                ...gameState,
                isDemoMode: true,
                demoInfo: {
                    humanPlayers: [],
                    botPlayers: []
                }
            };

            // Categorize players as human or bot
            for (const player of gameState.players) {
                const isBot = await this.isPlayerBotInDatabase(player.user_id);
                if (isBot) {
                    demoGameState.demoInfo.botPlayers.push({
                        ...player,
                        isBot: true
                    });
                } else {
                    demoGameState.demoInfo.humanPlayers.push({
                        ...player,
                        isBot: false
                    });
                }
            }

            console.log(`[GameEngine] Retrieved demo game state for ${gameId}: ${demoGameState.demoInfo.humanPlayers.length} human, ${demoGameState.demoInfo.botPlayers.length} bots`);

            return demoGameState;
        } catch (error) {
            console.error('[GameEngine] Get demo game state error:', error.message);
            throw error;
        }
    }

    /**
     * Check if a player is a bot by querying the database
     * @param {string} playerId - Player ID
     * @returns {Promise<boolean>} True if player is a bot
     */
    async isPlayerBotInDatabase(playerId) {
        try {
            const { default: User } = await import('../models/User.js');
            const userModel = new User();
            const user = await userModel.findOne({ user_id: playerId });

            return user && Boolean(user.is_bot);
        } catch (error) {
            console.error('[GameEngine] Error checking if player is bot:', error.message);
            return false;
        }
    }

    /**
     * Validate demo game operations
     * @param {string} gameId - Game ID
     * @param {string} operation - Operation being performed
     * @returns {Promise<boolean>} True if operation is valid for demo game
     */
    async validateDemoGameOperation(gameId, operation) {
        try {
            const isDemoMode = await this.isDemoMode(gameId);

            if (!isDemoMode) {
                return true; // Regular game, all operations allowed
            }

            // Demo-specific validations
            const allowedOperations = [
                'deal_cards', 'declare_trump', 'play_card', 'complete_trick',
                'complete_round', 'start_next_round', 'complete_game'
            ];

            if (!allowedOperations.includes(operation)) {
                console.warn(`[GameEngine] Operation ${operation} not allowed in demo mode`);
                return false;
            }

            return true;
        } catch (error) {
            console.error('[GameEngine] Demo game validation error:', error.message);
            return false;
        }
    }

    /**
     * Generate a complete 32-card deck
     * @returns {Array} Array of card objects with suit and rank
     */
    generateDeck() {
        const deck = [];
        for (const suit of this.suits) {
            for (const rank of this.ranks) {
                deck.push({
                    suit,
                    rank,
                    value: this.cardValues[rank]
                });
            }
        }
        return deck;
    }

    /**
     * Shuffle deck using Fisher-Yates algorithm with enhanced randomization
     * @param {Array} deck - Array of cards to shuffle
     * @returns {Array} Shuffled deck
     */
    shuffleDeck(deck) {
        const shuffled = [...deck];
        
        // Multiple shuffle passes for better randomization
        for (let pass = 0; pass < 3; pass++) {
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
        }
        
        return shuffled;
    }

    /**
     * Validate that no player has 3 or more Aces or 7s
     * @param {Object} playerHands - Object with playerId as key and hand array as value
     * @returns {boolean} True if hands are valid, false if reshuffling needed
     */
    validateHandDistribution(playerHands) {
        for (const [playerId, hand] of Object.entries(playerHands)) {
            const aces = hand.filter(card => card.rank === 'A').length;
            const sevens = hand.filter(card => card.rank === '7').length;
            
            if (aces >= 3 || sevens >= 3) {
                console.log(`[GameEngine] Invalid hand for player ${playerId}: ${aces} Aces, ${sevens} 7s - reshuffling required`);
                return false;
            }
        }
        return true;
    }

    /**
     * Ensure all cards dealt are unique (no duplicates)
     * @param {Object} playerHands - Object with playerId as key and hand array as value
     * @returns {boolean} True if all cards are unique
     */
    validateUniqueCards(playerHands) {
        const allDealtCards = [];
        
        for (const [playerId, hand] of Object.entries(playerHands)) {
            for (const card of hand) {
                const cardId = `${card.suit}-${card.rank}`;
                if (allDealtCards.includes(cardId)) {
                    console.log(`[GameEngine] Duplicate card found: ${cardId} - reshuffling required`);
                    return false;
                }
                allDealtCards.push(cardId);
            }
        }
        
        return true;
    }

    /**
     * Deal cards with validation and automatic reshuffling
     * @param {Array} shuffledDeck - Pre-shuffled deck
     * @param {Array} players - Array of player objects
     * @param {number} cardsPerPlayer - Number of cards to deal per player
     * @param {number} maxAttempts - Maximum reshuffling attempts
     * @returns {Object} Valid player hands and remaining deck
     */
    dealCardsWithValidation(shuffledDeck, players, cardsPerPlayer, maxAttempts = 10) {
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            attempts++;
            
            // Deal cards to players
            const playerHands = {};
            let cardIndex = 0;
            
            for (const player of players) {
                playerHands[player.user_id] = shuffledDeck.slice(cardIndex, cardIndex + cardsPerPlayer);
                cardIndex += cardsPerPlayer;
            }
            
            // Validate unique cards
            if (!this.validateUniqueCards(playerHands)) {
                console.log(`[GameEngine] Attempt ${attempts}: Duplicate cards detected, reshuffling...`);
                shuffledDeck = this.shuffleDeck(shuffledDeck);
                continue;
            }
            
            // Validate hand distribution (no 3+ Aces or 7s)
            if (!this.validateHandDistribution(playerHands)) {
                console.log(`[GameEngine] Attempt ${attempts}: Invalid hand distribution, reshuffling...`);
                shuffledDeck = this.shuffleDeck(shuffledDeck);
                continue;
            }
            
            // Valid deal found
            console.log(`[GameEngine] Valid card distribution found after ${attempts} attempt(s)`);
            const remainingDeck = shuffledDeck.slice(cardIndex);
            
            return {
                playerHands,
                remainingDeck,
                attempts
            };
        }
        
        throw new Error(`Failed to find valid card distribution after ${maxAttempts} attempts`);
    }

    /**
     * Deal initial 4 cards to each player with validation
     * @param {string} gameId - Game ID
     * @returns {Object} Object containing player hands and remaining deck
     */
    async dealInitialCards(gameId) {
        try {
            // Validate demo game operation
            const isValidOperation = await this.validateDemoGameOperation(gameId, 'deal_cards');
            if (!isValidOperation) {
                throw new Error('Deal cards operation not allowed in current game mode');
            }

            // Get game players in seat order
            const players = await this.getGamePlayers(gameId);
            if (players.length !== 4) {
                throw new Error('Game must have exactly 4 players');
            }

            // Check if this is a demo game for logging
            const isDemoMode = await this.isDemoMode(gameId);
            if (isDemoMode) {
                console.log(`[GameEngine] Dealing initial cards for demo game ${gameId} with validation`);
            }

            // Generate and shuffle deck
            const deck = this.generateDeck();
            const shuffledDeck = this.shuffleDeck(deck);

            // Deal cards with validation (4 cards per player)
            const dealResult = this.dealCardsWithValidation(shuffledDeck, players, 4);
            const { playerHands, remainingDeck, attempts } = dealResult;

            // Update player hands in database using RxDB
            const { default: GamePlayer } = await import('../models/GamePlayer.js');
            const gamePlayerModel = new GamePlayer();
            
            for (const player of players) {
                await gamePlayerModel.updateOne(
                    { game_id: gameId, user_id: player.user_id },
                    { current_hand: JSON.stringify(playerHands[player.user_id]) }
                );
            }

            console.log(`[GameEngine] Dealt initial 4 cards to each player in game ${gameId} (${attempts} shuffle attempts)`);

            // Log hand summary for demo games
            if (isDemoMode) {
                for (const [playerId, hand] of Object.entries(playerHands)) {
                    const isBot = await this.isPlayerBotInDatabase(playerId);
                    const handSummary = hand.map(c => `${c.rank}${c.suit.charAt(0)}`).join(', ');
                    console.log(`[GameEngine] ${isBot ? 'Bot' : 'Human'} ${playerId}: ${handSummary}`);
                }
            }

            return {
                playerHands,
                remainingDeck,
                dealerUserId: players[0].user_id, // First player is dealer for first round
                firstPlayerUserId: players[1].user_id // Player to left of dealer goes first
            };
        } catch (error) {
            console.error('[GameEngine] Deal initial cards error:', error.message);
            throw error;
        }
    }

    /**
     * Deal final 4 cards to each player after trump declaration with validation
     * @param {string} gameId - Game ID
     * @param {Array} remainingDeck - Remaining 16 cards to deal
     * @returns {Object} Updated player hands
     */
    async dealFinalCards(gameId, remainingDeck) {
        try {
            // Get current player hands and players
            const players = await this.getGamePlayers(gameId);
            const currentHands = {};
            
            // Load current hands from database
            for (const player of players) {
                const currentHandResult = await dbConnection.query(`
                    SELECT current_hand FROM game_players 
                    WHERE game_id = ? AND user_id = ?
                `, [gameId, player.user_id]);

                currentHands[player.user_id] = JSON.parse(currentHandResult[0].current_hand || '[]');
            }

            // Deal additional 4 cards with validation
            const dealResult = this.dealCardsWithValidation(remainingDeck, players, 4);
            const { playerHands: additionalCards, attempts } = dealResult;

            // Combine current hands with additional cards
            const updatedHands = {};
            for (const player of players) {
                const currentHand = currentHands[player.user_id];
                const newCards = additionalCards[player.user_id];
                const fullHand = [...currentHand, ...newCards];
                
                updatedHands[player.user_id] = fullHand;

                // Update database with full hand
                await dbConnection.query(`
                    UPDATE game_players 
                    SET current_hand = ? 
                    WHERE game_id = ? AND user_id = ?
                `, [JSON.stringify(fullHand), gameId, player.user_id]);
            }

            // Validate final hands (8 cards each)
            if (!this.validateUniqueCards(updatedHands)) {
                throw new Error('Final hand validation failed - duplicate cards detected');
            }

            if (!this.validateHandDistribution(updatedHands)) {
                throw new Error('Final hand validation failed - invalid distribution detected');
            }

            console.log(`[GameEngine] Dealt final 4 cards to each player in game ${gameId} (${attempts} shuffle attempts)`);

            // Check if this is a demo game for enhanced logging
            const isDemoMode = await this.isDemoMode(gameId);
            if (isDemoMode) {
                for (const [playerId, hand] of Object.entries(updatedHands)) {
                    const isBot = await this.isPlayerBotInDatabase(playerId);
                    const handSummary = hand.map(c => `${c.rank}${c.suit.charAt(0)}`).join(', ');
                    const aces = hand.filter(c => c.rank === 'A').length;
                    const sevens = hand.filter(c => c.rank === '7').length;
                    console.log(`[GameEngine] Final hand - ${isBot ? 'Bot' : 'Human'} ${playerId}: ${handSummary} (${aces}A, ${sevens}7)`);
                }
            }

            return updatedHands;
        } catch (error) {
            console.error('[GameEngine] Deal final cards error:', error.message);
            throw error;
        }
    }

    /**
     * Get next dealer for a new round (rotates clockwise)
     * @param {string} gameId - Game ID
     * @param {string} currentDealerId - Current dealer's user ID
     * @returns {Object} Next dealer and first player info
     */
    async getNextDealer(gameId, currentDealerId) {
        try {
            const players = await this.getGamePlayers(gameId);
            const currentDealerIndex = players.findIndex(p => p.user_id === currentDealerId);

            if (currentDealerIndex === -1) {
                throw new Error('Current dealer not found in game');
            }

            // Next dealer is clockwise (next index, wrapping around)
            const nextDealerIndex = (currentDealerIndex + 1) % players.length;
            const firstPlayerIndex = (nextDealerIndex + 1) % players.length;

            return {
                dealerUserId: players[nextDealerIndex].user_id,
                firstPlayerUserId: players[firstPlayerIndex].user_id
            };
        } catch (error) {
            console.error('[GameEngine] Get next dealer error:', error.message);
            throw error;
        }
    }

    /**
     * Get game players in seat order
     * @param {string} gameId - Game ID
     * @returns {Array} Array of player objects ordered by seat position
     */
    async getGamePlayers(gameId) {
        try {
            const { default: GamePlayer } = await import('../models/GamePlayer.js');
            const { default: User } = await import('../models/User.js');
            
            const gamePlayerModel = new GamePlayer();
            const userModel = new User();
            
            const gamePlayers = await gamePlayerModel.find({ game_id: gameId });
            
            // Get user data for each player
            const players = [];
            for (const gamePlayer of gamePlayers) {
                const user = await userModel.findOne({ user_id: gamePlayer.user_id });
                if (user) {
                    players.push({
                        user_id: gamePlayer.user_id,
                        seat_position: gamePlayer.seat_position,
                        team_id: gamePlayer.team_id,
                        username: user.username
                    });
                }
            }
            
            // Sort by seat position
            players.sort((a, b) => (a.seat_position || 0) - (b.seat_position || 0));

            return players;
        } catch (error) {
            console.error('[GameEngine] Get game players error:', error.message);
            throw error;
        }
    }

    /**
     * Create a new game round
     * @param {string} gameId - Game ID
     * @param {number} roundNumber - Round number
     * @param {string} dealerUserId - Dealer's user ID
     * @param {string} firstPlayerUserId - First player's user ID
     * @returns {string} Round ID
     */
    async createGameRound(gameId, roundNumber, dealerUserId, firstPlayerUserId) {
        try {
            const roundId = uuidv4();

            const { default: GameRound } = await import('../models/GameRound.js');
            const gameRoundModel = new GameRound();
            
            await gameRoundModel.create({
                round_id: roundId,
                game_id: gameId,
                round_number: roundNumber,
                dealer_user_id: dealerUserId,
                first_player_user_id: firstPlayerUserId,
                trump_suit: null,
                declaring_team_id: null,
                declaring_team_tricks_won: 0,
                challenging_team_tricks_won: 0,
                round_completed_at: null,
                created_at: new Date().toISOString()
            });

            console.log(`[GameEngine] Created round ${roundNumber} for game ${gameId}`);
            return roundId;
        } catch (error) {
            console.error('[GameEngine] Create game round error:', error.message);
            throw error;
        }
    }

    /**
     * Declare trump suit for the current round
     * @param {string} gameId - Game ID
     * @param {string} roundId - Round ID
     * @param {string} playerId - Player declaring trump
     * @param {string} trumpSuit - Trump suit ('Hearts', 'Diamonds', 'Clubs', 'Spades')
     * @returns {Object} Trump declaration result with team assignments
     */
    async declareTrump(gameId, roundId, playerId, trumpSuit) {
        try {
            // Validate demo game operation
            const isValidOperation = await this.validateDemoGameOperation(gameId, 'declare_trump');
            if (!isValidOperation) {
                throw new Error('Declare trump operation not allowed in current game mode');
            }

            // Validate trump suit
            if (!this.suits.includes(trumpSuit)) {
                throw new Error('Invalid trump suit. Must be Hearts, Diamonds, Clubs, or Spades');
            }

            // Check if this is a demo game for enhanced logging
            const isDemoMode = await this.isDemoMode(gameId);
            if (isDemoMode) {
                const isBot = await this.isPlayerBotInDatabase(playerId);
                console.log(`[GameEngine] Trump declaration in demo game ${gameId} by ${isBot ? 'bot' : 'human'} player ${playerId}: ${trumpSuit}`);
            }

            // Get round info to verify it's the correct player's turn
            const roundResult = await dbConnection.query(`
                SELECT first_player_user_id, trump_suit, declaring_team_id
                FROM game_rounds 
                WHERE round_id = ? AND game_id = ?
            `, [roundId, gameId]);

            if (roundResult.length === 0) {
                throw new Error('Round not found');
            }

            const round = roundResult[0];

            // Check if trump has already been declared
            if (round.trump_suit) {
                throw new Error('Trump has already been declared for this round');
            }

            // Verify it's the correct player's turn to declare trump
            if (round.first_player_user_id !== playerId) {
                throw new Error('Only the first player can declare trump');
            }

            // Get player's team
            const playerTeamResult = await dbConnection.query(`
                SELECT team_id FROM game_players 
                WHERE game_id = ? AND user_id = ?
            `, [gameId, playerId]);

            if (playerTeamResult.length === 0) {
                throw new Error('Player not found in game');
            }

            const declaringTeamId = playerTeamResult[0].team_id;

            // Update round with trump declaration
            await dbConnection.query(`
                UPDATE game_rounds 
                SET trump_suit = ?, declaring_team_id = ?
                WHERE round_id = ?
            `, [trumpSuit, declaringTeamId, roundId]);

            // Get team information
            const teams = await this.getGameTeams(gameId);
            const declaringTeam = teams.find(t => t.team_id === declaringTeamId);
            const challengingTeam = teams.find(t => t.team_id !== declaringTeamId);

            console.log(`[GameEngine] Trump declared: ${trumpSuit} by player ${playerId} in game ${gameId}`);

            return {
                trumpSuit,
                declaringTeamId,
                challengingTeamId: challengingTeam.team_id,
                declaringTeam: {
                    teamId: declaringTeam.team_id,
                    teamNumber: declaringTeam.team_number,
                    players: [declaringTeam.player1_id, declaringTeam.player2_id].filter(Boolean)
                },
                challengingTeam: {
                    teamId: challengingTeam.team_id,
                    teamNumber: challengingTeam.team_number,
                    players: [challengingTeam.player1_id, challengingTeam.player2_id].filter(Boolean)
                },
                phase: 'final_dealing' // Next phase is dealing final cards
            };
        } catch (error) {
            console.error('[GameEngine] Declare trump error:', error.message);
            throw error;
        }
    }

    /**
     * Validate trump declaration timeout
     * @param {string} roundId - Round ID
     * @param {number} timeoutSeconds - Timeout in seconds (default 30)
     * @returns {boolean} True if declaration is within timeout
     */
    async validateTrumpTimeout(roundId, timeoutSeconds = 30) {
        try {
            const roundResult = await dbConnection.query(`
                SELECT created_at FROM game_rounds WHERE round_id = ?
            `, [roundId]);

            if (roundResult.length === 0) {
                return false;
            }

            const roundCreated = new Date(roundResult[0].created_at);
            const now = new Date();
            const elapsedSeconds = (now - roundCreated) / 1000;

            return elapsedSeconds <= timeoutSeconds;
        } catch (error) {
            console.error('[GameEngine] Validate trump timeout error:', error.message);
            return false;
        }
    }

    /**
     * Handle trump declaration timeout (auto-assign random trump)
     * @param {string} gameId - Game ID
     * @param {string} roundId - Round ID
     * @returns {Object} Auto-assigned trump result
     */
    async handleTrumpTimeout(gameId, roundId) {
        try {
            // Check if trump is already declared
            const roundResult = await dbConnection.query(`
                SELECT trump_suit, first_player_user_id FROM game_rounds 
                WHERE round_id = ?
            `, [roundId]);

            if (roundResult.length === 0 || roundResult[0].trump_suit) {
                throw new Error('Round not found or trump already declared');
            }

            // Auto-assign random trump suit
            const randomTrumpSuit = this.suits[Math.floor(Math.random() * this.suits.length)];
            const firstPlayerId = roundResult[0].first_player_user_id;

            console.log(`[GameEngine] Trump declaration timeout, auto-assigning ${randomTrumpSuit} in game ${gameId}`);

            // Use the regular declare trump method
            return await this.declareTrump(gameId, roundId, firstPlayerId, randomTrumpSuit);
        } catch (error) {
            console.error('[GameEngine] Handle trump timeout error:', error.message);
            throw error;
        }
    }

    /**
     * Get game teams information
     * @param {string} gameId - Game ID
     * @returns {Array} Array of team objects
     */
    async getGameTeams(gameId) {
        try {
            const teams = await dbConnection.query(`
                SELECT team_id, team_number, current_score, player1_id, player2_id
                FROM teams 
                WHERE game_id = ?
                ORDER BY team_number ASC
            `, [gameId]);

            return teams;
        } catch (error) {
            console.error('[GameEngine] Get game teams error:', error.message);
            throw error;
        }
    }

    /**
     * Get current round information
     * @param {string} gameId - Game ID
     * @returns {Object} Current round information
     */
    async getCurrentRound(gameId) {
        try {
            const roundResult = await dbConnection.query(`
                SELECT * FROM game_rounds 
                WHERE game_id = ? 
                ORDER BY round_number DESC 
                LIMIT 1
            `, [gameId]);

            if (roundResult.length === 0) {
                return null;
            }

            return roundResult[0];
        } catch (error) {
            console.error('[GameEngine] Get current round error:', error.message);
            throw error;
        }
    }

    /**
     * Complete trump declaration phase and deal final cards
     * @param {string} gameId - Game ID
     * @param {Array} remainingDeck - Remaining cards to deal
     * @returns {Object} Updated game state with full hands
     */
    async completeTrumpDeclaration(gameId, remainingDeck) {
        try {
            // Deal final 4 cards to each player
            const updatedHands = await this.dealFinalCards(gameId, remainingDeck);

            console.log(`[GameEngine] Completed trump declaration phase for game ${gameId}`);

            return {
                playerHands: updatedHands,
                phase: 'trick_taking' // Next phase is trick-taking
            };
        } catch (error) {
            console.error('[GameEngine] Complete trump declaration error:', error.message);
            throw error;
        }
    }

    /**
     * Validate if a card play is legal according to Contract Crown rules
     * @param {string} gameId - Game ID
     * @param {string} roundId - Round ID
     * @param {string} trickId - Trick ID
     * @param {string} playerId - Player attempting to play card
     * @param {Object} card - Card being played {suit, rank}
     * @returns {Object} Validation result
     */
    async validateCardPlay(gameId, roundId, trickId, playerId, card) {
        try {
            // Get player's current hand
            const handResult = await dbConnection.query(`
                SELECT current_hand FROM game_players 
                WHERE game_id = ? AND user_id = ?
            `, [gameId, playerId]);

            if (handResult.length === 0) {
                return { isValid: false, reason: 'Player not found in game' };
            }

            const playerHand = JSON.parse(handResult[0].current_hand || '[]');

            // Check if player has the card
            const hasCard = playerHand.some(c => c.suit === card.suit && c.rank === card.rank);
            if (!hasCard) {
                return { isValid: false, reason: 'Player does not have this card' };
            }

            // Get trick information
            const trickResult = await dbConnection.query(`
                SELECT cards_played, leading_player_id FROM game_tricks 
                WHERE trick_id = ?
            `, [trickId]);

            if (trickResult.length === 0) {
                return { isValid: false, reason: 'Trick not found' };
            }

            const cardsPlayed = JSON.parse(trickResult[0].cards_played || '[]');

            // If this is the first card of the trick, any card is valid
            if (cardsPlayed.length === 0) {
                return { isValid: true };
            }

            // Get trump suit for this round
            const roundResult = await dbConnection.query(`
                SELECT trump_suit FROM game_rounds WHERE round_id = ?
            `, [roundId]);

            const trumpSuit = roundResult[0]?.trump_suit;
            const leadSuit = cardsPlayed[0].card.suit;

            // Check suit-following rules
            const playerSuitCards = playerHand.filter(c => c.suit === leadSuit);

            // Must follow suit if possible
            if (playerSuitCards.length > 0 && card.suit !== leadSuit) {
                return { isValid: false, reason: 'Must follow suit when possible' };
            }

            // If can't follow suit, can play trump or any other card
            return { isValid: true };
        } catch (error) {
            console.error('[GameEngine] Validate card play error:', error.message);
            return { isValid: false, reason: 'Validation error' };
        }
    }

    /**
     * Play a card in the current trick with comprehensive validation
     * @param {string} gameId - Game ID
     * @param {string} roundId - Round ID
     * @param {string} trickId - Trick ID
     * @param {string} playerId - Player playing the card
     * @param {Object} card - Card being played
     * @returns {Object} Play result
     */
    async playCard(gameId, roundId, trickId, playerId, card) {
        try {
            // Validate demo game operation
            const isValidOperation = await this.validateDemoGameOperation(gameId, 'play_card');
            if (!isValidOperation) {
                throw new Error('Play card operation not allowed in current game mode');
            }

            // Comprehensive validation
            const validation = await this.validateCardPlay(gameId, roundId, trickId, playerId, card);
            if (!validation.isValid) {
                throw new Error(validation.reason);
            }

            // Check if this is a demo game for enhanced logging
            const isDemoMode = await this.isDemoMode(gameId);
            if (isDemoMode) {
                const isBot = await this.isPlayerBotInDatabase(playerId);
                console.log(`[GameEngine] Card play in demo game ${gameId} by ${isBot ? 'bot' : 'human'} player ${playerId}: ${card.rank} of ${card.suit}`);
            }

            // Additional turn validation
            const turnValidation = await this.validatePlayerTurn(gameId, trickId, playerId);
            if (!turnValidation.isValid) {
                throw new Error(turnValidation.reason);
            }

            // Get current trick state
            const trickResult = await dbConnection.query(`
                SELECT cards_played, leading_player_id FROM game_tricks WHERE trick_id = ?
            `, [trickId]);

            if (trickResult.length === 0) {
                throw new Error('Trick not found');
            }

            const cardsPlayed = JSON.parse(trickResult[0].cards_played || '[]');
            const leadingPlayerId = trickResult[0].leading_player_id;

            // Ensure card has proper value for comparison
            const cardWithValue = {
                ...card,
                value: this.cardValues[card.rank] || 0
            };

            // Add the played card with timestamp
            const playedCard = {
                playerId,
                card: cardWithValue,
                playedAt: new Date().toISOString(),
                position: cardsPlayed.length // 0-3 for play order
            };

            cardsPlayed.push(playedCard);

            // Update trick with new card
            await dbConnection.query(`
                UPDATE game_tricks SET cards_played = ? WHERE trick_id = ?
            `, [JSON.stringify(cardsPlayed), trickId]);

            // Remove card from player's hand
            const handResult = await dbConnection.query(`
                SELECT current_hand FROM game_players 
                WHERE game_id = ? AND user_id = ?
            `, [gameId, playerId]);

            const playerHand = JSON.parse(handResult[0].current_hand || '[]');
            const updatedHand = playerHand.filter(c => !(c.suit === card.suit && c.rank === card.rank));

            await dbConnection.query(`
                UPDATE game_players SET current_hand = ? 
                WHERE game_id = ? AND user_id = ?
            `, [JSON.stringify(updatedHand), gameId, playerId]);

            console.log(`[GameEngine] Player ${playerId} played ${card.rank} of ${card.suit} in trick ${trickId} (${cardsPlayed.length}/4 cards)`);

            // Check if trick is complete (4 cards played)
            if (cardsPlayed.length === 4) {
                const trickResult = await this.completeTrick(gameId, roundId, trickId);
                return {
                    ...trickResult,
                    cardPlayed: cardWithValue,
                    playerId,
                    cardsInTrick: cardsPlayed
                };
            }

            // Get next player in turn order
            const nextPlayerId = await this.getNextPlayer(gameId, playerId);

            return {
                trickId,
                cardsPlayed,
                cardsInTrick: cardsPlayed,
                nextPlayerId,
                trickComplete: false,
                cardPlayed: cardWithValue,
                playerId,
                leadSuit: cardsPlayed.length === 1 ? card.suit : (cardsPlayed[0]?.card?.suit || null)
            };
        } catch (error) {
            console.error('[GameEngine] Play card error:', error.message);

            // Return structured error for better client handling
            throw {
                type: 'card_play_error',
                message: error.message,
                code: this.getErrorCode(error.message),
                playerId,
                card,
                trickId
            };
        }
    }

    /**
     * Validate if it's the player's turn to play
     * @param {string} gameId - Game ID
     * @param {string} trickId - Trick ID
     * @param {string} playerId - Player attempting to play
     * @returns {Object} Validation result
     */
    async validatePlayerTurn(gameId, trickId, playerId) {
        try {
            // Get trick information
            const trickResult = await dbConnection.query(`
                SELECT cards_played, leading_player_id FROM game_tricks WHERE trick_id = ?
            `, [trickId]);

            if (trickResult.length === 0) {
                return { isValid: false, reason: 'Trick not found' };
            }

            const cardsPlayed = JSON.parse(trickResult[0].cards_played || '[]');
            const leadingPlayerId = trickResult[0].leading_player_id;

            // If no cards played yet, only the leading player can play
            if (cardsPlayed.length === 0) {
                if (playerId !== leadingPlayerId) {
                    return { isValid: false, reason: 'Only the leading player can play the first card' };
                }
                return { isValid: true };
            }

            // Check if player has already played in this trick
            const hasAlreadyPlayed = cardsPlayed.some(play => play.playerId === playerId);
            if (hasAlreadyPlayed) {
                return { isValid: false, reason: 'Player has already played in this trick' };
            }

            // Determine whose turn it is based on play order
            const expectedPlayerId = await this.getExpectedPlayer(gameId, leadingPlayerId, cardsPlayed.length);
            if (playerId !== expectedPlayerId) {
                return { isValid: false, reason: 'Not your turn to play' };
            }

            return { isValid: true };
        } catch (error) {
            console.error('[GameEngine] Validate player turn error:', error.message);
            return { isValid: false, reason: 'Turn validation error' };
        }
    }

    /**
     * Get the expected player for the current position in trick
     * @param {string} gameId - Game ID
     * @param {string} leadingPlayerId - Leading player ID
     * @param {number} position - Position in trick (0-3)
     * @returns {string} Expected player ID
     */
    async getExpectedPlayer(gameId, leadingPlayerId, position) {
        try {
            const players = await this.getGamePlayers(gameId);
            const leadingIndex = players.findIndex(p => p.user_id === leadingPlayerId);

            if (leadingIndex === -1) {
                throw new Error('Leading player not found');
            }

            const expectedIndex = (leadingIndex + position) % players.length;
            return players[expectedIndex].user_id;
        } catch (error) {
            console.error('[GameEngine] Get expected player error:', error.message);
            throw error;
        }
    }

    /**
     * Get error code for structured error handling
     * @param {string} message - Error message
     * @returns {string} Error code
     */
    getErrorCode(message) {
        if (message.includes('Must follow suit')) return 'SUIT_FOLLOWING_VIOLATION';
        if (message.includes('not your turn')) return 'TURN_VIOLATION';
        if (message.includes('does not have this card')) return 'CARD_NOT_IN_HAND';
        if (message.includes('already played')) return 'ALREADY_PLAYED';
        if (message.includes('Trick not found')) return 'TRICK_NOT_FOUND';
        return 'UNKNOWN_ERROR';
    }

    /**
     * Determine the winner of a trick
     * @param {Array} cardsPlayed - Array of played cards with player info
     * @param {string} trumpSuit - Trump suit for the round
     * @returns {Object} Trick winner information
     */
    determineTrickWinner(cardsPlayed, trumpSuit) {
        if (cardsPlayed.length !== 4) {
            throw new Error('Trick must have exactly 4 cards to determine winner');
        }

        const leadSuit = cardsPlayed[0].card.suit;
        let winningCard = cardsPlayed[0];

        for (let i = 1; i < cardsPlayed.length; i++) {
            const currentCard = cardsPlayed[i];

            // Trump beats non-trump
            if (currentCard.card.suit === trumpSuit && winningCard.card.suit !== trumpSuit) {
                winningCard = currentCard;
            }
            // Higher trump beats lower trump
            else if (currentCard.card.suit === trumpSuit && winningCard.card.suit === trumpSuit) {
                if (currentCard.card.value > winningCard.card.value) {
                    winningCard = currentCard;
                }
            }
            // Higher card of lead suit beats lower (if no trump involved)
            else if (currentCard.card.suit === leadSuit && winningCard.card.suit === leadSuit) {
                if (currentCard.card.value > winningCard.card.value) {
                    winningCard = currentCard;
                }
            }
            // Lead suit beats off-suit (if no trump involved)
            else if (currentCard.card.suit === leadSuit && winningCard.card.suit !== leadSuit && winningCard.card.suit !== trumpSuit) {
                winningCard = currentCard;
            }
        }

        return {
            winningPlayerId: winningCard.playerId,
            winningCard: winningCard.card
        };
    }

    /**
     * Complete a trick and determine winner
     * @param {string} gameId - Game ID
     * @param {string} roundId - Round ID
     * @param {string} trickId - Trick ID
     * @returns {Object} Completed trick result
     */
    async completeTrick(gameId, roundId, trickId) {
        try {
            // Get trick and round information
            const [trickResult, roundResult] = await Promise.all([
                dbConnection.query(`SELECT cards_played FROM game_tricks WHERE trick_id = ?`, [trickId]),
                dbConnection.query(`SELECT trump_suit FROM game_rounds WHERE round_id = ?`, [roundId])
            ]);

            const cardsPlayed = JSON.parse(trickResult[0].cards_played);
            const trumpSuit = roundResult[0].trump_suit;

            // Determine trick winner
            const winner = this.determineTrickWinner(cardsPlayed, trumpSuit);

            // Update trick with winner and completion time
            await dbConnection.query(`
                UPDATE game_tricks 
                SET winning_player_id = ?, completed_at = NOW() 
                WHERE trick_id = ?
            `, [winner.winningPlayerId, trickId]);

            // Update player's tricks won count
            await dbConnection.query(`
                UPDATE game_players 
                SET tricks_won_current_round = tricks_won_current_round + 1 
                WHERE game_id = ? AND user_id = ?
            `, [gameId, winner.winningPlayerId]);

            console.log(`[GameEngine] Trick ${trickId} won by player ${winner.winningPlayerId}`);

            // Check if round is complete (8 tricks played)
            const tricksInRound = await dbConnection.query(`
                SELECT COUNT(*) as trick_count FROM game_tricks gt
                JOIN game_rounds gr ON gt.round_id = gr.round_id
                WHERE gr.game_id = ? AND gr.round_id = ? AND gt.completed_at IS NOT NULL
            `, [gameId, roundId]);

            const isRoundComplete = tricksInRound[0].trick_count === 8;

            if (isRoundComplete) {
                return await this.completeRound(gameId, roundId);
            }

            // Create next trick with winner as leader
            const nextTrickId = await this.createNextTrick(roundId, winner.winningPlayerId);

            return {
                trickId,
                winner: winner.winningPlayerId,
                winningCard: winner.winningCard,
                cardsPlayed,
                trickComplete: true,
                roundComplete: false,
                nextTrickId,
                nextLeaderId: winner.winningPlayerId
            };
        } catch (error) {
            console.error('[GameEngine] Complete trick error:', error.message);
            throw error;
        }
    }

    /**
     * Create the next trick in the round
     * @param {string} roundId - Round ID
     * @param {string} leadingPlayerId - Player who leads the next trick
     * @returns {string} New trick ID
     */
    async createNextTrick(roundId, leadingPlayerId) {
        try {
            // Get current trick count for this round
            const trickCountResult = await dbConnection.query(`
                SELECT COUNT(*) as trick_count FROM game_tricks WHERE round_id = ?
            `, [roundId]);

            const nextTrickNumber = trickCountResult[0].trick_count + 1;
            const trickId = uuidv4();

            await dbConnection.query(`
                INSERT INTO game_tricks (
                    trick_id, round_id, trick_number, leading_player_id, 
                    cards_played, created_at
                ) VALUES (?, ?, ?, ?, '[]', NOW())
            `, [trickId, roundId, nextTrickNumber, leadingPlayerId]);

            console.log(`[GameEngine] Created trick ${nextTrickNumber} with leader ${leadingPlayerId}`);
            return trickId;
        } catch (error) {
            console.error('[GameEngine] Create next trick error:', error.message);
            throw error;
        }
    }

    /**
     * Get the next player in turn order (clockwise)
     * @param {string} gameId - Game ID
     * @param {string} currentPlayerId - Current player's ID
     * @returns {string} Next player's ID
     */
    async getNextPlayer(gameId, currentPlayerId) {
        try {
            const players = await this.getGamePlayers(gameId);
            const currentIndex = players.findIndex(p => p.user_id === currentPlayerId);

            if (currentIndex === -1) {
                throw new Error('Current player not found in game');
            }

            const nextIndex = (currentIndex + 1) % players.length;
            return players[nextIndex].user_id;
        } catch (error) {
            console.error('[GameEngine] Get next player error:', error.message);
            throw error;
        }
    }

    /**
     * Start the first trick of a round
     * @param {string} roundId - Round ID
     * @param {string} firstPlayerId - First player to lead
     * @returns {string} Trick ID
     */
    async startFirstTrick(roundId, firstPlayerId) {
        try {
            const trickId = uuidv4();

            await dbConnection.query(`
                INSERT INTO game_tricks (
                    trick_id, round_id, trick_number, leading_player_id, 
                    cards_played, created_at
                ) VALUES (?, ?, 1, ?, '[]', NOW())
            `, [trickId, roundId, firstPlayerId]);

            console.log(`[GameEngine] Started first trick of round with leader ${firstPlayerId}`);
            return trickId;
        } catch (error) {
            console.error('[GameEngine] Start first trick error:', error.message);
            throw error;
        }
    }

    /**
     * Complete a round and calculate scores
     * @param {string} gameId - Game ID
     * @param {string} roundId - Round ID
     * @returns {Object} Round completion result with scores
     */
    async completeRound(gameId, roundId) {
        try {
            // Get round information
            const roundResult = await dbConnection.query(`
                SELECT declaring_team_id, trump_suit FROM game_rounds 
                WHERE round_id = ?
            `, [roundId]);

            const declaringTeamId = roundResult[0].declaring_team_id;
            const trumpSuit = roundResult[0].trump_suit;

            // Calculate tricks won by each team
            const teamTricks = await this.calculateTeamTricks(gameId, declaringTeamId);

            // Apply Contract Crown scoring rules
            const scores = this.calculateRoundScores(teamTricks);

            // Update team scores in database
            await this.updateTeamScores(gameId, declaringTeamId, scores);

            // Update round completion
            await dbConnection.query(`
                UPDATE game_rounds 
                SET declaring_team_tricks_won = ?, challenging_team_tricks_won = ?, 
                    round_completed_at = NOW()
                WHERE round_id = ?
            `, [teamTricks.declaringTeamTricks, teamTricks.challengingTeamTricks, roundId]);

            // Check if game is complete
            const gameComplete = await this.checkGameComplete(gameId);

            if (gameComplete.isComplete) {
                await this.completeGame(gameId, gameComplete.winningTeamId);

                return {
                    roundComplete: true,
                    gameComplete: true,
                    scores,
                    teamTricks,
                    winningTeamId: gameComplete.winningTeamId,
                    finalScores: gameComplete.finalScores
                };
            }

            // Start next round if game continues
            const nextRoundInfo = await this.startNextRound(gameId, roundId, scores);

            return {
                roundComplete: true,
                gameComplete: false,
                scores,
                teamTricks,
                nextRound: nextRoundInfo
            };
        } catch (error) {
            console.error('[GameEngine] Complete round error:', error.message);
            throw error;
        }
    }

    /**
     * Calculate tricks won by each team
     * @param {string} gameId - Game ID
     * @param {string} declaringTeamId - Declaring team ID
     * @returns {Object} Tricks won by each team
     */
    async calculateTeamTricks(gameId, declaringTeamId) {
        try {
            // Get all players and their tricks won
            const playerTricks = await dbConnection.query(`
                SELECT gp.user_id, gp.team_id, gp.tricks_won_current_round
                FROM game_players gp
                WHERE gp.game_id = ?
            `, [gameId]);

            let declaringTeamTricks = 0;
            let challengingTeamTricks = 0;

            for (const player of playerTricks) {
                if (player.team_id === declaringTeamId) {
                    declaringTeamTricks += player.tricks_won_current_round;
                } else {
                    challengingTeamTricks += player.tricks_won_current_round;
                }
            }

            return {
                declaringTeamTricks,
                challengingTeamTricks,
                declaringTeamId
            };
        } catch (error) {
            console.error('[GameEngine] Calculate team tricks error:', error.message);
            throw error;
        }
    }

    /**
     * Calculate round scores based on Contract Crown rules
     * @param {Object} teamTricks - Tricks won by each team
     * @returns {Object} Scores for each team
     */
    calculateRoundScores(teamTricks) {
        const { declaringTeamTricks, challengingTeamTricks } = teamTricks;

        // Contract Crown scoring rules:
        // - Declaring team needs 5+ tricks to score
        // - Challenging team needs 4+ tricks to score
        // - Points equal to tricks won (if minimum met)

        const declaringTeamScore = declaringTeamTricks >= 5 ? declaringTeamTricks : 0;
        const challengingTeamScore = challengingTeamTricks >= 4 ? challengingTeamTricks : 0;

        return {
            declaringTeamScore,
            challengingTeamScore,
            declaringTeamMadeContract: declaringTeamTricks >= 5,
            challengingTeamMadeContract: challengingTeamTricks >= 4
        };
    }

    /**
     * Update team scores in database
     * @param {string} gameId - Game ID
     * @param {string} declaringTeamId - Declaring team ID
     * @param {Object} scores - Round scores
     */
    async updateTeamScores(gameId, declaringTeamId, scores) {
        try {
            // Update declaring team score
            await dbConnection.query(`
                UPDATE teams 
                SET current_score = current_score + ? 
                WHERE game_id = ? AND team_id = ?
            `, [scores.declaringTeamScore, gameId, declaringTeamId]);

            // Update challenging team score
            await dbConnection.query(`
                UPDATE teams 
                SET current_score = current_score + ? 
                WHERE game_id = ? AND team_id != ?
            `, [scores.challengingTeamScore, gameId, declaringTeamId]);

            console.log(`[GameEngine] Updated scores: Declaring team +${scores.declaringTeamScore}, Challenging team +${scores.challengingTeamScore}`);
        } catch (error) {
            console.error('[GameEngine] Update team scores error:', error.message);
            throw error;
        }
    }

    /**
     * Check if game is complete (team reached 52 points)
     * @param {string} gameId - Game ID
     * @returns {Object} Game completion status
     */
    async checkGameComplete(gameId) {
        try {
            const teams = await dbConnection.query(`
                SELECT team_id, current_score FROM teams 
                WHERE game_id = ? 
                ORDER BY current_score DESC
            `, [gameId]);

            const winningTeam = teams.find(team => team.current_score >= 52);

            if (winningTeam) {
                return {
                    isComplete: true,
                    winningTeamId: winningTeam.team_id,
                    finalScores: teams.map(t => ({
                        teamId: t.team_id,
                        score: t.current_score
                    }))
                };
            }

            return { isComplete: false };
        } catch (error) {
            console.error('[GameEngine] Check game complete error:', error.message);
            throw error;
        }
    }

    /**
     * Complete the game and update final statistics
     * @param {string} gameId - Game ID
     * @param {string} winningTeamId - Winning team ID
     */
    async completeGame(gameId, winningTeamId) {
        try {
            // Update game status
            await dbConnection.query(`
                UPDATE games 
                SET status = 'completed', completed_at = NOW(), winning_team_id = ?
                WHERE game_id = ?
            `, [winningTeamId, gameId]);

            // Update player statistics
            const winningPlayers = await dbConnection.query(`
                SELECT user_id FROM game_players 
                WHERE game_id = ? AND team_id = ?
            `, [gameId, winningTeamId]);

            const allPlayers = await dbConnection.query(`
                SELECT user_id FROM game_players WHERE game_id = ?
            `, [gameId]);

            // Update stats for winning players
            for (const player of winningPlayers) {
                await dbConnection.query(`
                    UPDATE users 
                    SET total_games_played = total_games_played + 1,
                        total_games_won = total_games_won + 1
                    WHERE user_id = ?
                `, [player.user_id]);
            }

            // Update stats for losing players
            const losingPlayers = allPlayers.filter(p =>
                !winningPlayers.some(wp => wp.user_id === p.user_id)
            );

            for (const player of losingPlayers) {
                await dbConnection.query(`
                    UPDATE users 
                    SET total_games_played = total_games_played + 1
                    WHERE user_id = ?
                `, [player.user_id]);
            }

            // Reset room status back to waiting for potential next game
            try {
                const Room = (await import('../models/Room.js')).default;
                const room = await Room.findById(gameId);
                if (room && room.status === 'playing') {
                    await room.updateStatus('waiting');
                    await room.resetAllPlayerReadyStatus();
                    console.log(`[GameEngine] Room ${gameId} status reset to waiting after game completion`);
                }
            } catch (roomError) {
                console.warn('[GameEngine] Failed to reset room status after game completion:', roomError.message);
            }

            console.log(`[GameEngine] Game ${gameId} completed, winner: team ${winningTeamId}`);
        } catch (error) {
            console.error('[GameEngine] Complete game error:', error.message);
            throw error;
        }
    }

    /**
     * Start next round with Crown Rule implementation
     * @param {string} gameId - Game ID
     * @param {string} currentRoundId - Current round ID
     * @param {Object} scores - Current round scores
     * @returns {Object} Next round information
     */
    async startNextRound(gameId, currentRoundId, scores) {
        try {
            // Get current round info
            const currentRound = await dbConnection.query(`
                SELECT round_number, dealer_user_id, first_player_user_id, declaring_team_id
                FROM game_rounds WHERE round_id = ?
            `, [currentRoundId]);

            const roundInfo = currentRound[0];

            // Apply Crown Rule for trump declaration privilege
            let nextFirstPlayer;

            if (scores.declaringTeamMadeContract) {
                // Declaring team made contract: same player declares trump again
                nextFirstPlayer = roundInfo.first_player_user_id;
                console.log(`[GameEngine] Crown Rule: Declaring team made contract, same player declares trump`);
            } else {
                // Declaring team failed: trump declaration passes to dealer's left
                nextFirstPlayer = await this.getNextPlayer(gameId, roundInfo.dealer_user_id);
                console.log(`[GameEngine] Crown Rule: Declaring team failed, trump declaration passes`);
            }

            // Get next dealer (rotates clockwise)
            const nextDealerInfo = await this.getNextDealer(gameId, roundInfo.dealer_user_id);

            // Create next round
            const nextRoundNumber = roundInfo.round_number + 1;
            const nextRoundId = await this.createGameRound(
                gameId,
                nextRoundNumber,
                nextDealerInfo.dealerUserId,
                nextFirstPlayer
            );

            // Reset player trick counts for new round
            await dbConnection.query(`
                UPDATE game_players 
                SET tricks_won_current_round = 0, current_hand = NULL
                WHERE game_id = ?
            `, [gameId]);

            // Deal new cards for next round
            const dealResult = await this.dealInitialCards(gameId);

            console.log(`[GameEngine] Started round ${nextRoundNumber} for game ${gameId}`);

            return {
                roundId: nextRoundId,
                roundNumber: nextRoundNumber,
                dealerUserId: nextDealerInfo.dealerUserId,
                firstPlayerUserId: nextFirstPlayer,
                playerHands: dealResult.playerHands,
                remainingDeck: dealResult.remainingDeck,
                phase: 'trump_declaration'
            };
        } catch (error) {
            console.error('[GameEngine] Start next round error:', error.message);
            throw error;
        }
    }

    /**
     * Get current game state
     * @param {string} gameId - Game ID
     * @returns {Object} Complete game state
     */
    async getGameState(gameId) {
        try {
            // Get game info
            const gameResult = await dbConnection.query(`
                SELECT * FROM games WHERE game_id = ?
            `, [gameId]);

            if (gameResult.length === 0) {
                throw new Error('Game not found');
            }

            const game = gameResult[0];

            // Get current round
            const currentRound = await this.getCurrentRound(gameId);

            // Get teams and scores
            const teams = await this.getGameTeams(gameId);

            // Get players
            const players = await this.getGamePlayers(gameId);

            // Get current trick if in progress
            let currentTrick = null;
            if (currentRound) {
                const trickResult = await dbConnection.query(`
                    SELECT * FROM game_tricks 
                    WHERE round_id = ? AND completed_at IS NULL
                    ORDER BY trick_number DESC LIMIT 1
                `, [currentRound.round_id]);

                if (trickResult.length > 0) {
                    currentTrick = {
                        trickId: trickResult[0].trick_id,
                        trickNumber: trickResult[0].trick_number,
                        leadingPlayerId: trickResult[0].leading_player_id,
                        cardsPlayed: JSON.parse(trickResult[0].cards_played || '[]')
                    };
                }
            }

            return {
                gameId: game.game_id,
                status: game.status,
                targetScore: game.target_score,
                createdAt: game.created_at,
                startedAt: game.started_at,
                completedAt: game.completed_at,
                winningTeamId: game.winning_team_id,
                currentRound,
                teams,
                players,
                currentTrick
            };
        } catch (error) {
            console.error('[GameEngine] Get game state error:', error.message);
            throw error;
        }
    }

    /**
     * Start a new game with initial card dealing
     * @param {string} gameId - Game ID
     * @returns {Object} Initial game state with dealt cards
     */
    async startNewGame(gameId) {
        try {
            // Check if this is a demo game
            const isDemoMode = await this.isDemoMode(gameId);

            // Deal initial 4 cards to each player
            const dealResult = await this.dealInitialCards(gameId);

            // Create first round
            const roundId = await this.createGameRound(
                gameId,
                1,
                dealResult.dealerUserId,
                dealResult.firstPlayerUserId
            );

            // Update game status
            await dbConnection.query(`
                UPDATE games 
                SET status = 'in_progress', started_at = NOW() 
                WHERE game_id = ?
            `, [gameId]);

            if (isDemoMode) {
                console.log(`[GameEngine] Started new demo game ${gameId}`);
            } else {
                console.log(`[GameEngine] Started new game ${gameId}`);
            }

            return {
                gameId,
                roundId,
                roundNumber: 1,
                dealerUserId: dealResult.dealerUserId,
                firstPlayerUserId: dealResult.firstPlayerUserId,
                playerHands: dealResult.playerHands,
                remainingDeck: dealResult.remainingDeck,
                phase: 'trump_declaration', // Next phase is trump declaration
                status: 'in_progress',
                isDemoMode
            };
        } catch (error) {
            console.error('[GameEngine] Start new game error:', error.message);
            throw error;
        }
    }

    /**
     * Process next player turn, handling bot turns automatically
     * @param {string} gameId - Game ID
     * @param {string} currentPlayerId - Current player ID
     * @returns {Promise<Object>} Turn processing result
     */
    async processNextPlayerTurn(gameId, currentPlayerId) {
        try {
            // Check if this is a demo game
            const isDemoMode = await this.isDemoMode(gameId);
            if (!isDemoMode) {
                return { isBot: false, requiresHumanAction: true };
            }

            // Check if current player is a bot
            const isBot = await this.isPlayerBotInDatabase(currentPlayerId);
            if (!isBot) {
                return { isBot: false, requiresHumanAction: true };
            }

            // Import BotTurnProcessor dynamically to avoid circular dependency
            const { default: BotTurnProcessor } = await import('./BotTurnProcessor.js');

            // Process bot turn automatically
            const botActionResult = await BotTurnProcessor.processBotTurnIfNeeded(gameId, currentPlayerId);

            return {
                isBot: true,
                requiresHumanAction: false,
                botActionResult
            };

        } catch (error) {
            console.error('[GameEngine] Error processing next player turn:', error.message);
            throw error;
        }
    }

    /**
     * Get the next player who should take action
     * @param {string} gameId - Game ID
     * @returns {Promise<Object>} Next player information
     */
    async getNextActionPlayer(gameId) {
        try {
            const gameState = await this.getDemoGameState(gameId);

            // Check if we're in trump declaration phase
            if (gameState.currentRound && !gameState.currentRound.trump_suit) {
                return {
                    playerId: gameState.currentRound.first_player_user_id,
                    actionType: 'declare_trump',
                    phase: 'trump_declaration'
                };
            }

            // Check if we're in card play phase
            if (gameState.currentTrick) {
                const cardsPlayed = gameState.currentTrick.cardsPlayed || [];
                const leadingPlayerId = gameState.currentTrick.leadingPlayerId;

                if (cardsPlayed.length === 0) {
                    // First card of trick
                    return {
                        playerId: leadingPlayerId,
                        actionType: 'play_card',
                        phase: 'card_play'
                    };
                } else if (cardsPlayed.length < 4) {
                    // Subsequent cards in trick
                    const nextPlayerId = await this.getExpectedPlayer(gameId, leadingPlayerId, cardsPlayed.length);
                    return {
                        playerId: nextPlayerId,
                        actionType: 'play_card',
                        phase: 'card_play'
                    };
                }
            }

            return {
                playerId: null,
                actionType: 'none',
                phase: 'waiting'
            };

        } catch (error) {
            console.error('[GameEngine] Error getting next action player:', error.message);
            throw error;
        }
    }

    /**
     * Advance game to next turn, processing bot turns automatically
     * @param {string} gameId - Game ID
     * @returns {Promise<Object>} Game advancement result
     */
    async advanceGameTurn(gameId) {
        try {
            const isDemoMode = await this.isDemoMode(gameId);
            if (!isDemoMode) {
                return { message: 'Manual turn advancement not supported in regular games' };
            }

            const nextPlayer = await this.getNextActionPlayer(gameId);
            if (!nextPlayer.playerId) {
                return { message: 'No action required, game may be complete or waiting' };
            }

            // Process the next player's turn
            const turnResult = await this.processNextPlayerTurn(gameId, nextPlayer.playerId);

            return {
                nextPlayer,
                turnResult,
                gameAdvanced: true
            };

        } catch (error) {
            console.error('[GameEngine] Error advancing game turn:', error.message);
            throw error;
        }
    }

    /**
     * Continue processing bot turns until human action is required
     * @param {string} gameId - Game ID
     * @param {number} maxBotTurns - Maximum bot turns to process (default 10)
     * @returns {Promise<Object>} Continuous processing result
     */
    async processBotTurnsUntilHumanAction(gameId, maxBotTurns = 10) {
        try {
            const isDemoMode = await this.isDemoMode(gameId);
            if (!isDemoMode) {
                return { message: 'Continuous bot processing only supported in demo mode' };
            }

            const botActions = [];
            let turnsProcessed = 0;

            while (turnsProcessed < maxBotTurns) {
                const nextPlayer = await this.getNextActionPlayer(gameId);

                if (!nextPlayer.playerId) {
                    // No more actions needed
                    break;
                }

                const isBot = await this.isPlayerBotInDatabase(nextPlayer.playerId);
                if (!isBot) {
                    // Human action required
                    return {
                        botActions,
                        turnsProcessed,
                        requiresHumanAction: true,
                        nextHumanPlayer: nextPlayer
                    };
                }

                // Process bot turn
                const turnResult = await this.processNextPlayerTurn(gameId, nextPlayer.playerId);
                botActions.push({
                    playerId: nextPlayer.playerId,
                    actionType: nextPlayer.actionType,
                    result: turnResult.botActionResult
                });

                turnsProcessed++;

                // Small delay between bot actions for realism
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            return {
                botActions,
                turnsProcessed,
                requiresHumanAction: false,
                maxTurnsReached: turnsProcessed >= maxBotTurns
            };

        } catch (error) {
            console.error('[GameEngine] Error in continuous bot processing:', error.message);
            throw error;
        }
    }
}

export default GameEngine;