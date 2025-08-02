import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import auth from '../middlewares/auth.js';

const router = express.Router();

// Create a demo game session
router.post('/demo', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const username = req.user.username;

        // Generate unique demo game ID
        const demoGameId = `demo_${uuidv4()}`;
        
        // Create demo game session data
        const demoGame = {
            id: demoGameId,
            isDemoMode: true,
            humanPlayerId: userId,
            humanPlayerName: username,
            status: 'ready',
            createdAt: new Date().toISOString(),
            players: [
                {
                    id: userId,
                    username: username,
                    isBot: false,
                    seatPosition: 0,
                    isReady: true
                },
                {
                    id: `bot_1_${demoGameId}`,
                    username: 'Bot Alice',
                    isBot: true,
                    seatPosition: 1,
                    isReady: true
                },
                {
                    id: `bot_2_${demoGameId}`,
                    username: 'Bot Bob',
                    isBot: true,
                    seatPosition: 2,
                    isReady: true
                },
                {
                    id: `bot_3_${demoGameId}`,
                    username: 'Bot Charlie',
                    isBot: true,
                    seatPosition: 3,
                    isReady: true
                }
            ]
        };

        // Store demo game session (in memory for now, could be moved to database later)
        if (!global.demoGames) {
            global.demoGames = new Map();
        }
        global.demoGames.set(demoGameId, demoGame);

        console.log(`[Demo API] Created demo game ${demoGameId} for user ${username} (${userId})`);

        res.status(201).json({
            success: true,
            message: 'Demo game created successfully',
            game: {
                id: demoGameId,
                isDemoMode: true,
                status: 'ready',
                players: demoGame.players,
                createdAt: demoGame.createdAt
            }
        });
    } catch (error) {
        console.error('Error creating demo game:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create demo game'
        });
    }
});

// Get demo game details
router.get('/demo/:gameId', auth, async (req, res) => {
    try {
        const { gameId } = req.params;
        const userId = req.user.id;

        if (!global.demoGames || !global.demoGames.has(gameId)) {
            return res.status(404).json({
                success: false,
                message: 'Demo game not found'
            });
        }

        const demoGame = global.demoGames.get(gameId);

        // Verify user has access to this demo game
        if (demoGame.humanPlayerId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this demo game'
            });
        }

        res.json({
            success: true,
            game: {
                id: demoGame.id,
                isDemoMode: demoGame.isDemoMode,
                status: demoGame.status,
                players: demoGame.players,
                createdAt: demoGame.createdAt
            }
        });
    } catch (error) {
        console.error('Error fetching demo game:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch demo game'
        });
    }
});

export default router;