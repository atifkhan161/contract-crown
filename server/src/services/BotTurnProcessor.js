import BotManager from './BotManager.js';
import GameEngine from './GameEngine.js';
// Legacy MariaDB connection removed - now using LokiJS
// import dbConnection from '../../database/connection.js';

// Temporary compatibility layer - this needs to be replaced with LokiJS queries
const dbConnection = {
    query: () => {
        throw new Error('dbConnection is not defined - BotTurnProcessor needs to be migrated to LokiJS');
    }
};

/**
 * BotTurnProcessor handles automatic bot turn processing and action execution
 * Manages bot decision-making timing and integration with game flow
 */
class BotTurnProcessor {
    constructor() {
        this.gameEngine = new GameEngine();
        this.processingQueue = new Map(); // gameId -> processing status
        this.botActionTimeouts = new Map(); // gameId -> timeout handles
    }

    /**
     * Check if it's a bot's turn and process automatically
     * @param {string} gameId - Game ID
     * @param {string} currentPlayerId - Current player whose turn it is
     * @returns {Promise<Object|null>} Bot action result or null if not a bot
     */
    async processBotTurnIfNeeded(gameId, currentPlayerId) {
        try {
            // Check if this is a demo game
            const isDemoMode = await this.gameEngine.isDemoMode(gameId);
            if (!isDemoMode) {
                return null; // Only process bots in demo mode
            }

            // Check if current player is a bot
            const isBot = await this.gameEngine.isPlayerBotInDatabase(currentPlayerId);
            if (!isBot) {
                return null; // Not a bot, no processing needed
            }

            // Prevent concurrent processing for the same game
            if (this.processingQueue.get(gameId)) {
                console.log(`[BotTurnProcessor] Already processing bot turn for game ${gameId}`);
                return null;
            }

            this.processingQueue.set(gameId, true);

            console.log(`[BotTurnProcessor] Processing bot turn for player ${currentPlayerId} in game ${gameId}`);

            // Get bot player instance
            const botPlayer = BotManager.getBotPlayer(gameId, currentPlayerId);
            if (!botPlayer) {
                console.warn(`[BotTurnProcessor] Bot player ${currentPlayerId} not found in BotManager`);
                this.processingQueue.set(gameId, false);
                return null;
            }

            // Determine what action the bot needs to take
            const gameState = await this.gameEngine.getDemoGameState(gameId);
            const actionType = await this.determineBotActionType(gameId, gameState);

            let result = null;

            switch (actionType) {
                case 'declare_trump':
                    result = await this.processBotTrumpDeclaration(gameId, botPlayer, gameState);
                    break;
                case 'play_card':
                    result = await this.processBotCardPlay(gameId, botPlayer, gameState);
                    break;
                default:
                    console.warn(`[BotTurnProcessor] Unknown action type: ${actionType}`);
            }

            this.processingQueue.set(gameId, false);
            return result;

        } catch (error) {
            console.error('[BotTurnProcessor] Error processing bot turn:', error.message);
            this.processingQueue.set(gameId, false);
            throw error;
        }
    }

    /**
     * Determine what type of action the bot needs to take
     * @param {string} gameId - Game ID
     * @param {Object} gameState - Current game state
     * @returns {Promise<string>} Action type ('declare_trump', 'play_card', 'none')
     */
    async determineBotActionType(gameId, gameState) {
        try {
            // Check if we're in trump declaration phase
            const currentRound = gameState.currentRound;
            if (currentRound && !currentRound.trump_suit) {
                return 'declare_trump';
            }

            // Check if we're in card play phase
            const currentTrick = gameState.currentTrick;
            if (currentTrick) {
                return 'play_card';
            }

            return 'none';
        } catch (error) {
            console.error('[BotTurnProcessor] Error determining action type:', error.message);
            return 'none';
        }
    }

    /**
     * Process bot trump declaration with timing delay
     * @param {string} gameId - Game ID
     * @param {Object} botPlayer - Bot player instance
     * @param {Object} gameState - Current game state
     * @returns {Promise<Object>} Trump declaration result
     */
    async processBotTrumpDeclaration(gameId, botPlayer, gameState) {
        try {
            console.log(`[BotTurnProcessor] Bot ${botPlayer.name} is declaring trump`);

            // Get bot's current hand for trump declaration
            const playerHand = await this.getBotHand(gameId, botPlayer.id);
            if (playerHand.length === 0) {
                throw new Error('Bot has no cards for trump declaration');
            }

            // Add realistic delay before bot makes decision
            await this.simulateBotDecisionDelay(botPlayer);

            // Let bot decide trump suit
            const chosenTrump = await botPlayer.declareTrump(playerHand);
            
            console.log(`[BotTurnProcessor] Bot ${botPlayer.name} chose ${chosenTrump} as trump`);

            // Execute trump declaration through game engine
            const currentRound = gameState.currentRound;
            const result = await this.gameEngine.declareTrump(
                gameId, 
                currentRound.round_id, 
                botPlayer.id, 
                chosenTrump
            );

            return {
                actionType: 'declare_trump',
                playerId: botPlayer.id,
                playerName: botPlayer.name,
                trumpSuit: chosenTrump,
                result,
                isBot: true
            };

        } catch (error) {
            console.error('[BotTurnProcessor] Error in bot trump declaration:', error.message);
            throw error;
        }
    }

    /**
     * Process bot card play with timing delay
     * @param {string} gameId - Game ID
     * @param {Object} botPlayer - Bot player instance
     * @param {Object} gameState - Current game state
     * @returns {Promise<Object>} Card play result
     */
    async processBotCardPlay(gameId, botPlayer, gameState) {
        try {
            console.log(`[BotTurnProcessor] Bot ${botPlayer.name} is playing a card`);

            // Get bot's current hand
            const playerHand = await this.getBotHand(gameId, botPlayer.id);
            if (playerHand.length === 0) {
                throw new Error('Bot has no cards to play');
            }

            // Prepare game context for bot decision
            const gameContext = {
                hand: playerHand,
                trickState: gameState.currentTrick,
                gameState: gameState,
                trumpSuit: gameState.currentRound?.trump_suit
            };

            // Add realistic delay before bot makes decision
            await this.simulateBotDecisionDelay(botPlayer);

            // Let bot decide which card to play
            const chosenCard = await botPlayer.playCard(gameContext);
            
            console.log(`[BotTurnProcessor] Bot ${botPlayer.name} chose to play ${chosenCard.rank} of ${chosenCard.suit}`);

            // Execute card play through game engine
            const result = await this.gameEngine.playCard(
                gameId,
                gameState.currentRound.round_id,
                gameState.currentTrick.trickId,
                botPlayer.id,
                chosenCard
            );

            return {
                actionType: 'play_card',
                playerId: botPlayer.id,
                playerName: botPlayer.name,
                card: chosenCard,
                result,
                isBot: true
            };

        } catch (error) {
            console.error('[BotTurnProcessor] Error in bot card play:', error.message);
            throw error;
        }
    }

    /**
     * Get bot's current hand from database
     * @param {string} gameId - Game ID
     * @param {string} botId - Bot player ID
     * @returns {Promise<Array>} Bot's current hand
     */
    async getBotHand(gameId, botId) {
        try {
            const handResult = await dbConnection.query(`
                SELECT current_hand FROM game_players 
                WHERE game_id = ? AND user_id = ?
            `, [gameId, botId]);

            if (handResult.length === 0) {
                return [];
            }

            const hand = JSON.parse(handResult[0].current_hand || '[]');
            return hand;
        } catch (error) {
            console.error('[BotTurnProcessor] Error getting bot hand:', error.message);
            return [];
        }
    }

    /**
     * Simulate realistic decision delay based on bot personality and difficulty
     * @param {Object} botPlayer - Bot player instance
     * @returns {Promise<void>}
     */
    async simulateBotDecisionDelay(botPlayer) {
        const delay = botPlayer.decisionDelay || 2000; // Default 2 seconds
        console.log(`[BotTurnProcessor] Bot ${botPlayer.name} thinking for ${delay}ms...`);
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Schedule automatic bot turn processing with timeout
     * @param {string} gameId - Game ID
     * @param {string} botPlayerId - Bot player ID
     * @param {number} timeoutMs - Timeout in milliseconds (default 5000)
     * @returns {Promise<Object>} Bot action result
     */
    async scheduleBotTurn(gameId, botPlayerId, timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
            const timeoutHandle = setTimeout(async () => {
                try {
                    const result = await this.processBotTurnIfNeeded(gameId, botPlayerId);
                    this.botActionTimeouts.delete(gameId);
                    resolve(result);
                } catch (error) {
                    this.botActionTimeouts.delete(gameId);
                    reject(error);
                }
            }, timeoutMs);

            this.botActionTimeouts.set(gameId, timeoutHandle);
        });
    }

    /**
     * Cancel scheduled bot turn processing
     * @param {string} gameId - Game ID
     */
    cancelScheduledBotTurn(gameId) {
        const timeoutHandle = this.botActionTimeouts.get(gameId);
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
            this.botActionTimeouts.delete(gameId);
            console.log(`[BotTurnProcessor] Cancelled scheduled bot turn for game ${gameId}`);
        }
    }

    /**
     * Validate bot action before execution
     * @param {string} gameId - Game ID
     * @param {string} botPlayerId - Bot player ID
     * @param {string} actionType - Action type
     * @returns {Promise<Object>} Validation result
     */
    async validateBotAction(gameId, botPlayerId, actionType) {
        try {
            // Check if game is in demo mode
            const isDemoMode = await this.gameEngine.isDemoMode(gameId);
            if (!isDemoMode) {
                return { isValid: false, reason: 'Bot actions only allowed in demo mode' };
            }

            // Check if player is actually a bot
            const isBot = await this.gameEngine.isPlayerBotInDatabase(botPlayerId);
            if (!isBot) {
                return { isValid: false, reason: 'Player is not a bot' };
            }

            // Check if it's the bot's turn
            const gameState = await this.gameEngine.getDemoGameState(gameId);
            const expectedActionType = await this.determineBotActionType(gameId, gameState);
            
            if (actionType !== expectedActionType) {
                return { isValid: false, reason: `Expected ${expectedActionType}, got ${actionType}` };
            }

            return { isValid: true };
        } catch (error) {
            console.error('[BotTurnProcessor] Error validating bot action:', error.message);
            return { isValid: false, reason: 'Validation error' };
        }
    }

    /**
     * Handle bot action errors with fallback behavior
     * @param {string} gameId - Game ID
     * @param {string} botPlayerId - Bot player ID
     * @param {Error} error - Error that occurred
     * @returns {Promise<Object>} Fallback action result
     */
    async handleBotActionError(gameId, botPlayerId, error) {
        try {
            console.warn(`[BotTurnProcessor] Bot action error for ${botPlayerId}: ${error.message}`);

            // Get bot player
            const botPlayer = BotManager.getBotPlayer(gameId, botPlayerId);
            if (!botPlayer) {
                throw new Error('Bot player not found for error handling');
            }

            // Determine fallback action based on error type
            if (error.message.includes('trump')) {
                // Trump declaration error - choose random trump
                const trumpSuits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
                const randomTrump = trumpSuits[Math.floor(Math.random() * trumpSuits.length)];
                
                console.log(`[BotTurnProcessor] Bot ${botPlayer.name} fallback: choosing random trump ${randomTrump}`);
                
                const gameState = await this.gameEngine.getDemoGameState(gameId);
                const result = await this.gameEngine.declareTrump(
                    gameId,
                    gameState.currentRound.round_id,
                    botPlayerId,
                    randomTrump
                );

                return {
                    actionType: 'declare_trump',
                    playerId: botPlayerId,
                    trumpSuit: randomTrump,
                    result,
                    isFallback: true
                };
            } else if (error.message.includes('card')) {
                // Card play error - choose first valid card
                const playerHand = await this.getBotHand(gameId, botPlayerId);
                if (playerHand.length > 0) {
                    const fallbackCard = playerHand[0];
                    
                    console.log(`[BotTurnProcessor] Bot ${botPlayer.name} fallback: playing first card ${fallbackCard.rank} of ${fallbackCard.suit}`);
                    
                    const gameState = await this.gameEngine.getDemoGameState(gameId);
                    const result = await this.gameEngine.playCard(
                        gameId,
                        gameState.currentRound.round_id,
                        gameState.currentTrick.trickId,
                        botPlayerId,
                        fallbackCard
                    );

                    return {
                        actionType: 'play_card',
                        playerId: botPlayerId,
                        card: fallbackCard,
                        result,
                        isFallback: true
                    };
                }
            }

            throw error; // Re-throw if no fallback possible
        } catch (fallbackError) {
            console.error('[BotTurnProcessor] Fallback action also failed:', fallbackError.message);
            throw fallbackError;
        }
    }

    /**
     * Get processing statistics
     * @returns {Object} Processing statistics
     */
    getStatistics() {
        return {
            activeProcessingGames: Array.from(this.processingQueue.entries())
                .filter(([gameId, isProcessing]) => isProcessing)
                .map(([gameId]) => gameId),
            scheduledBotTurns: this.botActionTimeouts.size,
            totalProcessingQueue: this.processingQueue.size
        };
    }

    /**
     * Clean up resources for a completed game
     * @param {string} gameId - Game ID
     */
    cleanup(gameId) {
        this.cancelScheduledBotTurn(gameId);
        this.processingQueue.delete(gameId);
        console.log(`[BotTurnProcessor] Cleaned up resources for game ${gameId}`);
    }
}

// Export singleton instance
export default new BotTurnProcessor();
