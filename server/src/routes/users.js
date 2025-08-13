import express from 'express';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Get user statistics
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.user_id;
        
        // Get user with stats
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Calculate win rate
        const gamesPlayed = user.total_games_played || 0;
        const gamesWon = user.total_games_won || 0;
        const winRate = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;

        const stats = {
            gamesPlayed,
            gamesWon,
            winRate
        };

        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Error fetching user stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user statistics'
        });
    }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { username, email } = req.body;
        
        // Validate input
        if (!username || !username.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Username is required'
            });
        }

        if (!User.validateUsername(username.trim())) {
            return res.status(400).json({
                success: false,
                message: 'Username must be 3-50 characters, alphanumeric and underscores only'
            });
        }

        if (email && !User.validateEmail(email.trim())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        // Check if username is already taken by another user
        const existingUser = await User.findByUsername(username.trim());
        if (existingUser && existingUser.user_id !== userId) {
            return res.status(400).json({
                success: false,
                message: 'Username is already taken'
            });
        }

        // For SQL-based User model, we need to implement an update method
        // For now, return a placeholder response
        res.json({
            success: true,
            message: 'Profile update functionality will be implemented with SQL update queries',
            user: {
                id: userId,
                username: username.trim(),
                email: email ? email.trim() : req.user.email
            }
        });
    } catch (error) {
        console.error('Error updating user profile:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile'
        });
    }
});

export default router;
