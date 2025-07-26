import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();

/**
 * Generate test JWT token for development/testing
 * This endpoint should only be available in development mode
 */
router.post('/test-token', async (req, res) => {
    try {
        // Only allow in development mode
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({
                success: false,
                message: 'Test token generation not available in production'
            });
        }

        const { username = 'testuser', email = 'test@example.com' } = req.body;
        
        const payload = {
            id: 'test-user-' + Date.now(), // Use 'id' to match main auth route
            username: username,
            email: email,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours from now
        };

        const secret = process.env.JWT_SECRET || 'your-secret-key';
        const token = jwt.sign(payload, secret);

        const user = {
            id: payload.id, // Use 'id' to match the JWT structure
            username: payload.username,
            email: payload.email
        };

        console.log(`[TestAuth] Generated test JWT token for: ${username}`);

        res.json({
            success: true,
            token: token,
            user: user,
            message: 'Test JWT token generated successfully'
        });

    } catch (error) {
        console.error('[TestAuth] Error generating test token:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate test token'
        });
    }
});

/**
 * Validate JWT token (for testing purposes)
 */
router.post('/validate', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const token = authHeader.substring(7);
        const secret = process.env.JWT_SECRET || 'your-secret-key';
        
        const decoded = jwt.verify(token, secret);
        
        res.json({
            success: true,
            valid: true,
            user: {
                userId: decoded.userId,
                username: decoded.username,
                email: decoded.email
            },
            message: 'Token is valid'
        });

    } catch (error) {
        console.error('[TestAuth] Token validation error:', error);
        res.status(401).json({
            success: false,
            valid: false,
            message: 'Invalid token'
        });
    }
});

export default router;