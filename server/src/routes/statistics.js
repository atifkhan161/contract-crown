import express from 'express';
import StatisticsService from '../services/StatisticsService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const statisticsService = new StatisticsService();

/**
 * Get current user's statistics
 */
router.get('/user', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        const statistics = await statisticsService.getUserStatistics(userId);
        
        res.json({
            success: true,
            data: statistics
        });
    } catch (error) {
        console.error('Get user statistics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve user statistics',
            error: error.message
        });
    }
});

/**
 * Get statistics for a specific user (public)
 */
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const statistics = await statisticsService.getUserStatistics(userId);
        
        // Remove sensitive information for public view
        const publicStats = {
            userId: statistics.userId,
            gamesPlayed: statistics.gamesPlayed,
            gamesWon: statistics.gamesWon,
            winRate: statistics.winRate,
            averageScore: statistics.averageScore,
            averageTricksPerGame: statistics.averageTricksPerGame,
            memberSince: statistics.memberSince
        };
        
        res.json({
            success: true,
            data: publicStats
        });
    } catch (error) {
        console.error('Get public user statistics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve user statistics',
            error: error.message
        });
    }
});

/**
 * Get leaderboard
 */
router.get('/leaderboard', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const leaderboard = await statisticsService.getLeaderboard(limit);
        
        res.json({
            success: true,
            data: leaderboard
        });
    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve leaderboard',
            error: error.message
        });
    }
});

/**
 * Get game statistics
 */
router.get('/game/:gameId', authenticateToken, async (req, res) => {
    try {
        const { gameId } = req.params;
        const statistics = await statisticsService.getGameStatistics(gameId);
        
        res.json({
            success: true,
            data: statistics
        });
    } catch (error) {
        console.error('Get game statistics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve game statistics',
            error: error.message
        });
    }
});

/**
 * Update game statistics (called after game completion)
 */
router.post('/game/:gameId/update', authenticateToken, async (req, res) => {
    try {
        const { gameId } = req.params;
        const statistics = await statisticsService.updateGameStatistics(gameId);
        
        res.json({
            success: true,
            data: statistics,
            message: 'Game statistics updated successfully'
        });
    } catch (error) {
        console.error('Update game statistics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update game statistics',
            error: error.message
        });
    }
});

/**
 * Get user's recent game history
 */
router.get('/user/:userId/history', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit) || 10;
        
        // Check if user is requesting their own history or if they have permission
        const requestingUserId = req.user.userId || req.user.id;
        if (userId !== requestingUserId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        
        const history = await statisticsService.getRecentGameHistory(userId, limit);
        
        res.json({
            success: true,
            data: history
        });
    } catch (error) {
        console.error('Get user game history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve game history',
            error: error.message
        });
    }
});

/**
 * Get user achievements (placeholder for future implementation)
 */
router.get('/user/:userId/achievements', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Placeholder - achievements system to be implemented
        const achievements = [
            {
                id: 'first_game',
                name: 'First Game',
                description: 'Played your first game',
                earned: true,
                earnedAt: new Date().toISOString()
            },
            {
                id: 'trump_master',
                name: 'Trump Master',
                description: 'Successfully declared trump 10 times',
                earned: false,
                progress: 3,
                target: 10
            }
        ];
        
        res.json({
            success: true,
            data: achievements
        });
    } catch (error) {
        console.error('Get user achievements error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve achievements',
            error: error.message
        });
    }
});

export default router;