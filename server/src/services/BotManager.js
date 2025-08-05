import BotPlayer from './BotPlayer.js';
import dbConnection from '../../database/connection.js';

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
                
                // Insert bot as a temporary user (using only basic columns)
                try {
                    await dbConnection.query(`
                        INSERT INTO users (user_id, username, email, created_at)
                        VALUES (?, ?, ?, NOW())
                        ON DUPLICATE KEY UPDATE
                        username = VALUES(username)
                    `, [
                        botData.user_id,
                        botData.username,
                        `${botData.user_id}@bot.local` // Dummy email for bots
                    ]);
                } catch (columnError) {
                    // If basic insertion fails, try with minimal columns
                    await dbConnection.query(`
                        INSERT IGNORE INTO users (user_id, username)
                        VALUES (?, ?)
                    `, [
                        botData.user_id,
                        botData.username
                    ]);
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
            const botPlayers = await dbConnection.query(`
                SELECT gp.*, u.username, u.bot_personality, u.bot_difficulty
                FROM game_players gp
                JOIN users u ON gp.user_id = u.user_id
                WHERE gp.game_id = ? AND u.is_bot = 1
                ORDER BY gp.seat_position
            `, [gameId]);

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
            // Get bot user IDs for this game
            const botUsers = await dbConnection.query(`
                SELECT DISTINCT gp.user_id
                FROM game_players gp
                JOIN users u ON gp.user_id = u.user_id
                WHERE gp.game_id = ? AND u.is_bot = 1
            `, [gameId]);

            if (botUsers.length === 0) {
                return;
            }

            const botUserIds = botUsers.map(bot => bot.user_id);

            // Remove bot users (they're temporary)
            await dbConnection.query(`
                DELETE FROM users WHERE user_id IN (${botUserIds.map(() => '?').join(',')}) AND is_bot = 1
            `, botUserIds);

            console.log(`[BotManager] Cleaned up ${botUsers.length} bot users for game ${gameId}`);
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