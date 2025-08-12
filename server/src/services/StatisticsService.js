// Legacy MariaDB connection removed - now using RxDB
// import dbConnection from '../../database/connection.js';

/**
 * Statistics Service
 * Handles user and game statistics tracking and updates
 */
class StatisticsService {
    constructor() {
        // Statistics categories
        this.statCategories = {
            GAMES_PLAYED: 'games_played',
            GAMES_WON: 'games_won',
            TOTAL_TRICKS_WON: 'total_tricks_won',
            SUCCESSFUL_TRUMP_DECLARATIONS: 'successful_trump_declarations',
            FAILED_TRUMP_DECLARATIONS: 'failed_trump_declarations',
            AVERAGE_SCORE_PER_GAME: 'average_score_per_game'
        };
    }

    /**
     * Update user statistics after game completion
     * @param {string} gameId - Game ID
     * @returns {Object} Updated statistics
     */
    async updateGameStatistics(gameId) {
        try {
            // Get game information
            const gameResult = await dbConnection.query(`
                SELECT g.winning_team_id, g.completed_at, g.created_at
                FROM games g
                WHERE g.game_id = ? AND g.status = 'completed'
            `, [gameId]);

            if (gameResult.length === 0) {
                throw new Error('Game not found or not completed');
            }

            const game = gameResult[0];
            const gameDuration = new Date(game.completed_at) - new Date(game.created_at);

            // Get all players in the game
            const playersResult = await dbConnection.query(`
                SELECT gp.user_id, gp.team_id, u.username,
                       SUM(gp.tricks_won_current_round) as total_tricks_won
                FROM game_players gp
                JOIN users u ON gp.user_id = u.user_id
                WHERE gp.game_id = ?
                GROUP BY gp.user_id, gp.team_id, u.username
            `, [gameId]);

            // Get team final scores
            const teamsResult = await dbConnection.query(`
                SELECT team_id, current_score
                FROM teams
                WHERE game_id = ?
            `, [gameId]);

            const teamScores = {};
            teamsResult.forEach(team => {
                teamScores[team.team_id] = team.current_score;
            });

            // Update statistics for each player
            const playerStats = [];
            for (const player of playersResult) {
                const isWinner = player.team_id === game.winning_team_id;
                const teamScore = teamScores[player.team_id] || 0;

                // Update user statistics
                await this.updateUserStatistics(player.user_id, {
                    gamesPlayed: 1,
                    gamesWon: isWinner ? 1 : 0,
                    totalTricksWon: player.total_tricks_won || 0,
                    totalScore: teamScore
                });

                playerStats.push({
                    userId: player.user_id,
                    username: player.username,
                    teamId: player.team_id,
                    tricksWon: player.total_tricks_won || 0,
                    teamScore: teamScore,
                    isWinner
                });
            }

            // Get trump declaration statistics
            const trumpStats = await this.getTrumpDeclarationStats(gameId);

            // Create game statistics record
            await this.createGameStatisticsRecord(gameId, {
                duration: gameDuration,
                playerStats,
                trumpStats
            });

            console.log(`[StatisticsService] Updated statistics for game ${gameId}`);

            return {
                gameId,
                duration: gameDuration,
                playerStats,
                trumpStats
            };
        } catch (error) {
            console.error('[StatisticsService] Update game statistics error:', error.message);
            throw error;
        }
    }

    /**
     * Update individual user statistics
     * @param {string} userId - User ID
     * @param {Object} stats - Statistics to update
     */
    async updateUserStatistics(userId, stats) {
        try {
            const { gamesPlayed, gamesWon, totalTricksWon, totalScore } = stats;

            // Update user statistics in database
            await dbConnection.query(`
                UPDATE users 
                SET total_games_played = total_games_played + ?,
                    total_games_won = total_games_won + ?,
                    total_tricks_won = COALESCE(total_tricks_won, 0) + ?,
                    total_score = COALESCE(total_score, 0) + ?,
                    last_game_played = NOW()
                WHERE user_id = ?
            `, [gamesPlayed, gamesWon, totalTricksWon, totalScore, userId]);

            console.log(`[StatisticsService] Updated statistics for user ${userId}`);
        } catch (error) {
            console.error('[StatisticsService] Update user statistics error:', error.message);
            throw error;
        }
    }

    /**
     * Get trump declaration statistics for a game
     * @param {string} gameId - Game ID
     * @returns {Object} Trump declaration statistics
     */
    async getTrumpDeclarationStats(gameId) {
        try {
            const roundsResult = await dbConnection.query(`
                SELECT gr.first_player_user_id, gr.declaring_team_id,
                       gr.declaring_team_tricks_won, gr.challenging_team_tricks_won
                FROM game_rounds gr
                WHERE gr.game_id = ? AND gr.round_completed_at IS NOT NULL
            `, [gameId]);

            const trumpStats = {};

            roundsResult.forEach(round => {
                const declarerId = round.first_player_user_id;
                const successful = round.declaring_team_tricks_won >= 5;

                if (!trumpStats[declarerId]) {
                    trumpStats[declarerId] = {
                        declarations: 0,
                        successful: 0,
                        failed: 0
                    };
                }

                trumpStats[declarerId].declarations++;
                if (successful) {
                    trumpStats[declarerId].successful++;
                } else {
                    trumpStats[declarerId].failed++;
                }
            });

            return trumpStats;
        } catch (error) {
            console.error('[StatisticsService] Get trump declaration stats error:', error.message);
            throw error;
        }
    }

    /**
     * Create game statistics record
     * @param {string} gameId - Game ID
     * @param {Object} stats - Game statistics
     */
    async createGameStatisticsRecord(gameId, stats) {
        try {
            await dbConnection.query(`
                INSERT INTO game_statistics (
                    game_id, duration_ms, player_stats, trump_stats, created_at
                ) VALUES (?, ?, ?, ?, NOW())
            `, [
                gameId,
                stats.duration,
                JSON.stringify(stats.playerStats),
                JSON.stringify(stats.trumpStats)
            ]);
        } catch (error) {
            console.error('[StatisticsService] Create game statistics record error:', error.message);
            // Don't throw error - statistics are not critical
        }
    }

    /**
     * Get user statistics
     * @param {string} userId - User ID
     * @returns {Object} User statistics
     */
    async getUserStatistics(userId) {
        try {
            const userResult = await dbConnection.query(`
                SELECT total_games_played, total_games_won, total_tricks_won,
                       total_score, last_game_played, created_at
                FROM users
                WHERE user_id = ?
            `, [userId]);

            if (userResult.length === 0) {
                throw new Error('User not found');
            }

            const user = userResult[0];

            // Calculate derived statistics
            const winRate = user.total_games_played > 0 
                ? (user.total_games_won / user.total_games_played * 100).toFixed(1)
                : 0;

            const averageScore = user.total_games_played > 0
                ? (user.total_score / user.total_games_played).toFixed(1)
                : 0;

            const averageTricksPerGame = user.total_games_played > 0
                ? (user.total_tricks_won / user.total_games_played).toFixed(1)
                : 0;

            // Get recent game history
            const recentGames = await this.getRecentGameHistory(userId, 10);

            return {
                userId,
                gamesPlayed: user.total_games_played || 0,
                gamesWon: user.total_games_won || 0,
                totalTricksWon: user.total_tricks_won || 0,
                totalScore: user.total_score || 0,
                winRate: parseFloat(winRate),
                averageScore: parseFloat(averageScore),
                averageTricksPerGame: parseFloat(averageTricksPerGame),
                lastGamePlayed: user.last_game_played,
                memberSince: user.created_at,
                recentGames
            };
        } catch (error) {
            console.error('[StatisticsService] Get user statistics error:', error.message);
            throw error;
        }
    }

    /**
     * Get recent game history for a user
     * @param {string} userId - User ID
     * @param {number} limit - Number of games to retrieve
     * @returns {Array} Recent games
     */
    async getRecentGameHistory(userId, limit = 10) {
        try {
            const gamesResult = await dbConnection.query(`
                SELECT g.game_id, g.completed_at, g.winning_team_id,
                       gp.team_id, t.current_score as team_score,
                       COUNT(DISTINCT gp2.user_id) as total_players
                FROM games g
                JOIN game_players gp ON g.game_id = gp.game_id AND gp.user_id = ?
                JOIN teams t ON gp.team_id = t.team_id
                JOIN game_players gp2 ON g.game_id = gp2.game_id
                WHERE g.status = 'completed'
                GROUP BY g.game_id, g.completed_at, g.winning_team_id, gp.team_id, t.current_score
                ORDER BY g.completed_at DESC
                LIMIT ?
            `, [userId, limit]);

            return gamesResult.map(game => ({
                gameId: game.game_id,
                completedAt: game.completed_at,
                teamScore: game.team_score,
                totalPlayers: game.total_players,
                isWinner: game.team_id === game.winning_team_id
            }));
        } catch (error) {
            console.error('[StatisticsService] Get recent game history error:', error.message);
            return [];
        }
    }

    /**
     * Get leaderboard statistics
     * @param {number} limit - Number of top players to retrieve
     * @returns {Array} Leaderboard data
     */
    async getLeaderboard(limit = 20) {
        try {
            const leaderboardResult = await dbConnection.query(`
                SELECT user_id, username, total_games_played, total_games_won,
                       total_tricks_won, total_score,
                       CASE 
                           WHEN total_games_played > 0 
                           THEN (total_games_won * 100.0 / total_games_played)
                           ELSE 0 
                       END as win_rate,
                       CASE 
                           WHEN total_games_played > 0 
                           THEN (total_score * 1.0 / total_games_played)
                           ELSE 0 
                       END as average_score
                FROM users
                WHERE total_games_played > 0
                ORDER BY win_rate DESC, total_games_won DESC, total_score DESC
                LIMIT ?
            `, [limit]);

            return leaderboardResult.map((player, index) => ({
                rank: index + 1,
                userId: player.user_id,
                username: player.username,
                gamesPlayed: player.total_games_played,
                gamesWon: player.total_games_won,
                totalTricksWon: player.total_tricks_won,
                totalScore: player.total_score,
                winRate: parseFloat(player.win_rate).toFixed(1),
                averageScore: parseFloat(player.average_score).toFixed(1)
            }));
        } catch (error) {
            console.error('[StatisticsService] Get leaderboard error:', error.message);
            throw error;
        }
    }

    /**
     * Get game statistics by ID
     * @param {string} gameId - Game ID
     * @returns {Object} Game statistics
     */
    async getGameStatistics(gameId) {
        try {
            const statsResult = await dbConnection.query(`
                SELECT duration_ms, player_stats, trump_stats, created_at
                FROM game_statistics
                WHERE game_id = ?
            `, [gameId]);

            if (statsResult.length === 0) {
                // Generate statistics if not found
                return await this.generateGameStatistics(gameId);
            }

            const stats = statsResult[0];
            return {
                gameId,
                duration: stats.duration_ms,
                playerStats: JSON.parse(stats.player_stats),
                trumpStats: JSON.parse(stats.trump_stats),
                generatedAt: stats.created_at
            };
        } catch (error) {
            console.error('[StatisticsService] Get game statistics error:', error.message);
            throw error;
        }
    }

    /**
     * Generate game statistics from game data
     * @param {string} gameId - Game ID
     * @returns {Object} Generated statistics
     */
    async generateGameStatistics(gameId) {
        try {
            // Get game information
            const gameResult = await dbConnection.query(`
                SELECT status, created_at, completed_at, winning_team_id
                FROM games WHERE game_id = ?
            `, [gameId]);

            if (gameResult.length === 0) {
                throw new Error('Game not found');
            }

            const game = gameResult[0];

            // Get rounds and tricks data
            const roundsResult = await dbConnection.query(`
                SELECT COUNT(*) as total_rounds
                FROM game_rounds
                WHERE game_id = ? AND round_completed_at IS NOT NULL
            `, [gameId]);

            const tricksResult = await dbConnection.query(`
                SELECT COUNT(*) as total_tricks
                FROM game_tricks gt
                JOIN game_rounds gr ON gt.round_id = gr.round_id
                WHERE gr.game_id = ? AND gt.completed_at IS NOT NULL
            `, [gameId]);

            // Get player performance
            const playersResult = await dbConnection.query(`
                SELECT gp.user_id, u.username, gp.team_id,
                       SUM(gp.tricks_won_current_round) as tricks_won,
                       t.current_score as team_score
                FROM game_players gp
                JOIN users u ON gp.user_id = u.user_id
                JOIN teams t ON gp.team_id = t.team_id
                WHERE gp.game_id = ?
                GROUP BY gp.user_id, u.username, gp.team_id, t.current_score
            `, [gameId]);

            return {
                gameId,
                status: game.status,
                duration: game.completed_at ? 
                    new Date(game.completed_at) - new Date(game.created_at) : null,
                totalRounds: roundsResult[0].total_rounds,
                totalTricks: tricksResult[0].total_tricks,
                players: playersResult.map(player => ({
                    userId: player.user_id,
                    username: player.username,
                    teamId: player.team_id,
                    tricksWon: player.tricks_won || 0,
                    teamScore: player.team_score,
                    isWinner: player.team_id === game.winning_team_id
                }))
            };
        } catch (error) {
            console.error('[StatisticsService] Generate game statistics error:', error.message);
            throw error;
        }
    }
}

export default StatisticsService;