import express from 'express';
import SeedDataService from '../services/SeedDataService.js';

const router = express.Router();

// Get status of default users
router.get('/users/status', async (req, res) => {
    try {
        const seedService = new SeedDataService();
        const userStatus = await seedService.checkDefaultUsers();
        
        res.json({
            success: true,
            users: userStatus,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[Seed API] Failed to check user status:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to check default users status'
        });
    }
});

// Manually trigger seeding (useful for development)
router.post('/users/seed', async (req, res) => {
    try {
        const seedService = new SeedDataService();
        const summary = await seedService.seedAllData();
        
        res.json({
            success: true,
            summary,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[Seed API] Failed to seed users:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to seed default users'
        });
    }
});

// Reset default users (recreate them)
router.post('/users/reset', async (req, res) => {
    try {
        const seedService = new SeedDataService();
        const users = await seedService.resetDefaultUsers();
        
        res.json({
            success: true,
            users: users.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[Seed API] Failed to reset users:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to reset default users'
        });
    }
});

export default router;