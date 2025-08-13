import BotPlayer from './BotPlayer.js';
// Legacy MariaDB connection removed - now using RxDB
// import dbConnection from '../../database/connection.js';

/**
 * BotManager handles creation, storage, and management of bot players
 * Provides methods for bot lifecycle management in games
 */
class BotManager {
    constructor() {
        this.activeBots = new Map(); // gameId -> Map(botId -> BotPlayer)
        this.botCounter = 0;
    }

    /**
     * Create multiple bot players for a game
     * @param {string} gameId - Game ID
     * @param {number} count - Number of bots to create (default 3)
     * @param {Object} options - Bot creation options
     * @returns {Array} Array of created BotPlayer instances
     */
    createBotsForGame(gameId, count = 3, options = {}) {
        try {
            const bots = [];

            // Ensure we don't have bots for this game already
            if (this.activeBots.has(gameId)) {
                console.warn(`[BotManager] Bots already exist for game ${gameId}, clearing existing bots`);
                this.clearGameBots(gameId);
            }

            // Create bot map for this game
            this.activeBots.set(gameId, new Map());
            const gameBots = this.activeBots.get(gameId);

            // Create the specified number of bots
            for (let i = 0; i < count; i++) {
                const botOptions = {
                    gameId,
                    difficulty: options.difficulty || 'medium',
                    personality: options.personalities ? options.personalities[i] : undefined,
                    name: options.names ? options.names[i] : undefined,
                    ...options
                };

                const bot = new BotPlayer(botOptions);
                bots.push(bot);
                gameBots.set(bot.id, bot);

                this.botCounter++;
            }

            console.log(`[BotManager] Created ${count} bots for game ${gameId}`);
            return bots;
        } catch (error) {
            console.error('[BotManager] Error creating bots for game:', error);
            throw error;
        }
    }

    /**
     * Get bot player by ID
     * @param {string} gameId - Game ID
     * @param {string} botId - Bot ID
     * @returns {BotPlayer|null} Bot player instance or null
     */
    getBotPlayer(gameId, botId) {
        const gameBots = this.activeBots.get(gameId);
        if (!gameBots) {
            return null;
        }
        return gameBots.get(botId) || null;
    }

    /**
     * Get all bots for a specific game
     * @param {string} gameId - Game ID
     * @returns {Array} Array of BotPlayer instances
     */
    getGameBots(gameId) {
        const gameBots = this.activeBots.get(gameId);
        if (!gameBots) {
            return [];
        }
        return Array.from(gameBots.values());
    }

    /**
     * Check if a player ID belongs to a bot
     * @param {string} gameId - Game ID
     * @param {string} playerId - Player ID to check
     * @returns {boolean} True if player is a bot
     */
    isBotPlayer(gameId, playerId) {
        const gameBots = this.activeBots.get(gameId);
        if (!gameBots) {
            return false;
        }
        return gameBots.has(playerId);
    }

    /**
     * Assign bots to teams and seat positions
     * @param {string} gameId - Game ID
     * @param {Array} teamAssignments - Array of team assignment objects
     * @returns {Array} Updated bot players with team assignments
     */
    assignBotsToTeams(gameId, teamAssignments) {
        try {
            const gameBots = this.activeBots.get(gameId);
            if (!gameBots) {
                throw new Error(`No bots found for game ${gameId}`);
            }

            const bots = Array.from(gameBots.values());
            const updatedBots = [];

            teamAssignments.forEach((assignment, index) => {
                if (index < bots.length) {
                    const bot = bots[index];
                    bot.setTeamAssignment(assignment.teamId, assignment.seatPosition);
                    updatedBots.push(bot);
                }
            });

            console.log(`[BotManager] Assigned ${updatedBots.length} bots to teams in game ${gameId}`);
            return updatedBots;
        } catch (error) {
            console.error('[BotManager] Error assigning bots to teams:', error);
            throw error;
        }
    }

    /**
     * Update bot hands with new cards
     * @param {string} gameId - Game ID
     * @param {Object} handUpdates - Object mapping botId to card array
     */
    updateBotHands(gameId, handUpdates) {
        try {
            const gameBots = this.activeBots.get(gameId);
            if (!gameBots) {
                console.warn(`[BotManager] No bots found for game ${gameId}`);
                return;
            }

            Object.entries(handUpdates).forEach(([botId, cards]) => {
                const bot = gameBots.get(botId);
                if (bot) {
                    bot.updateHand(cards);
                }
            });

            console.log(`[BotManager] Updated hands for ${Object.keys(handUpdates).length} bots in game ${gameId}`);
        } catch (error) {
            console.error('[BotManager] Error updating bot hands:', error);
            throw error;
        }
    }

    /**
     * Store bot players in database for persistence
     * @param {string} gameId - Game ID
     * @returns {Promise<void>}
     */
    async storeBotPlayersInDatabase(gameId) {
        try {
            const gameBots = this.activeBots.get(gameId);
            if (!gameBots) {
                throw new Error(`No bots found for game ${gameId}`);
            }

            const bots = Array.from(gameBots.values());

            // Store each bot as a user record with bot flags
            for (const bot of bots) {
                const botData = bot.toDatabaseFormat();

                // Insert bot as a temporary user with all required fields and unique identifiers
                const uniqueUsername = `${botData.username}_${botData.user_id.slice(-8)}`;
                const uniqueEmail = `${botData.user_id}@bot.local`;

                try {
                    const { default: User } = await import('../models/User.js');
                    const userModel = new User();

                    // Check if bot user already exists
                    const existingBot = await userModel.findOne({ user_id: botData.user_id });

                    if (!existingBot) {
                        await userModel.create({
                            user_id: botData.user_id,
                            username: uniqueUsername,
                            email: uniqueEmail,
                            password_hash: 'BOT_NO_PASSWORD',
                            is_bot: true,
                            bot_personality: botData.personality,
                            bot_difficulty: botData.difficulty,
                            created_at: new Date().toISOString()
                        });
                    } else {
                        // Update existing bot user
                        await existingBot.update({
                            username: uniqueUsername,
                            email: uniqueEmail,
                            bot_personality: botData.personality,
                            bot_difficulty: botData.difficulty
                        });
                    }
                } catch (columnError) {
                    console.error('[BotManager] Failed to insert bot user:', columnError);
                    throw columnError;
                }
            }

            console.log(`[BotManager] Stored ${bots.length} bots in database for game ${gameId}`);
        } catch (error) {
            console.error('[BotManager] Error storing bots in database:', error);
            throw error;
        }
    }

    /**
     * Retrieve bot players from database
     * @param {string} gameId - Game ID
     * @returns {Promise<Array>} Array of bot data from database
     */
    async retrieveBotPlayersFromDatabase(gameId) {
        try {
            const { default: GamePlayer } = await import('../models/GamePlayer.js');
            const { default: User } = await import('../models/User.js');

            const gamePlayerModel = new GamePlayer();
            const userModel = new User();

            // Get all game players for this game
            const gamePlayers = await gamePlayerModel.find({ game_id: gameId });

            // Filter for bot players and get their user data
            const botPlayers = [];
            for (const gamePlayer of gamePlayers) {
                const user = await userModel.findOne({ user_id: gamePlayer.user_id });
                if (user && user.is_bot) {
                    botPlayers.push({
                        ...gamePlayer,
                        username: user.username,
                        bot_personality: user.bot_personality,
                        bot_difficulty: user.bot_difficulty
                    });
                }
            }

            // Sort by seat position
            botPlayers.sort((a, b) => (a.seat_position || 0) - (b.seat_position || 0));

            console.log(`[BotManager] Retrieved ${botPlayers.length} bot players from database for game ${gameId}`);
            return botPlayers;
        } catch (error) {
            console.error('[BotManager] Error retrieving bots from database:', error);
            throw error;
        }
    }

    /**
     * Restore bot players from database data
     * @param {string} gameId - Game ID
     * @param {Array} botData - Bot data from database
     * @returns {Array} Restored BotPlayer instances
     */
    restoreBotsFromDatabase(gameId, botData) {
        try {
            // Clear existing bots for this game
            this.clearGameBots(gameId);

            // Create bot map for this game
            this.activeBots.set(gameId, new Map());
            const gameBots = this.activeBots.get(gameId);

            const restoredBots = [];

            botData.forEach(data => {
                const bot = new BotPlayer({
                    id: data.user_id,
                    name: data.username,
                    personality: data.bot_personality,
                    difficulty: data.bot_difficulty,
                    gameId: gameId,
                    teamId: data.team_id,
                    seatPosition: data.seat_position
                });

                // Restore hand if available
                if (data.current_hand) {
                    const hand = JSON.parse(data.current_hand);
                    bot.updateHand(hand);
                }

                gameBots.set(bot.id, bot);
                restoredBots.push(bot);
            });

            console.log(`[BotManager] Restored ${restoredBots.length} bots for game ${gameId}`);
            return restoredBots;
        } catch (error) {
            console.error('[BotManager] Error restoring bots from database:', error);
            throw error;
        }
    }

    /**
     * Clear all bots for a specific game
     * @param {string} gameId - Game ID
     */
    clearGameBots(gameId) {
        try {
            const gameBots = this.activeBots.get(gameId);
            if (gameBots) {
                const botCount = gameBots.size;
                gameBots.clear();
                this.activeBots.delete(gameId);
                console.log(`[BotManager] Cleared ${botCount} bots for game ${gameId}`);
            }
        } catch (error) {
            console.error('[BotManager] Error clearing game bots:', error);
        }
    }

    /**
     * Clean up bot users from database after game completion
     * @param {string} gameId - Game ID
     * @returns {Promise<void>}
     */
    async cleanupBotUsers(gameId) {
        try {
            const { default: GamePlayer } = await import('../models/GamePlayer.js');
            const { default: User } = await import('../models/User.js');

            const gamePlayerModel = new GamePlayer();
            const userModel = new User();

            // Get all game players for this game
            const gamePlayers = await gamePlayerModel.find({ game_id: gameId });

            // Find bot user IDs
            const botUserIds = [];
            for (const gamePlayer of gamePlayers) {
                const user = await userModel.findOne({ user_id: gamePlayer.user_id });
                if (user && user.is_bot) {
                    botUserIds.push(user.user_id);
                }
            }

            if (botUserIds.length === 0) {
                return;
            }

            // Remove bot users (they're temporary)
            for (const botUserId of botUserIds) {
                const botUser = await userModel.findOne({ user_id: botUserId });
                if (botUser && botUser.is_bot) {
                    await botUser.remove();
                }
            }

            console.log(`[BotManager] Cleaned up ${botUserIds.length} bot users for game ${gameId}`);
        } catch (error) {
            console.error('[BotManager] Error cleaning up bot users:', error);
            // Don't throw - cleanup errors shouldn't break game flow
        }
    }

    /**
     * Get statistics about active bots
     * @returns {Object} Bot statistics
     */
    getStatistics() {
        const totalGames = this.activeBots.size;
        let totalBots = 0;
        const personalityCount = { aggressive: 0, conservative: 0, balanced: 0 };
        const difficultyCount = { easy: 0, medium: 0, hard: 0 };

        this.activeBots.forEach(gameBots => {
            totalBots += gameBots.size;
            gameBots.forEach(bot => {
                personalityCount[bot.personality] = (personalityCount[bot.personality] || 0) + 1;
                difficultyCount[bot.difficulty] = (difficultyCount[bot.difficulty] || 0) + 1;
            });
        });

        return {
            totalGames,
            totalBots,
            averageBotsPerGame: totalGames > 0 ? (totalBots / totalGames).toFixed(2) : 0,
            personalityDistribution: personalityCount,
            difficultyDistribution: difficultyCount,
            totalBotsCreated: this.botCounter
        };
    }
}

// Export singleton instance
export default new BotManager();