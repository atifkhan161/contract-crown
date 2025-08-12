import express from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import UserSession from '../models/UserSession.js';

const router = express.Router();

// Rate limiting for auth endpoints (disabled in test environment)
const authLimiter = process.env.NODE_ENV === 'test'
    ? (req, res, next) => next() // Skip rate limiting in tests
    : rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 150, // limit each IP to 5 requests per windowMs for auth
        message: {
            error: 'Too many authentication attempts, please try again later.'
        },
        standardHeaders: true,
        legacyHeaders: false,
    });

// Registration endpoint
router.post('/register',
    authLimiter,
    [
        body('username')
            .trim()
            .isLength({ min: 3, max: 50 })
            .matches(/^[a-zA-Z0-9_]+$/)
            .withMessage('Username must be 3-50 characters and contain only letters, numbers, and underscores'),
        body('email')
            .trim()
            .isEmail()
            .normalizeEmail()
            .withMessage('Please provide a valid email address'),
        body('password')
            .isLength({ min: 6 })
            .withMessage('Password must be at least 6 characters long')
    ],
    async (req, res) => {
        try {
            // Check for validation errors
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array().map(err => ({
                        field: err.path,
                        message: err.msg
                    }))
                });
            }

            const { username, email, password } = req.body;

            // Additional validation
            if (!User.validateEmail(email)) {
                return res.status(400).json({
                    error: 'Invalid email format'
                });
            }

            if (!User.validateUsername(username)) {
                return res.status(400).json({
                    error: 'Username must be 3-50 characters and contain only letters, numbers, and underscores'
                });
            }

            if (!User.validatePassword(password)) {
                return res.status(400).json({
                    error: 'Password must be at least 6 characters long'
                });
            }

            // Create user
            const user = await User.create({
                username,
                email,
                password
            });

            console.log(`[Auth] User registered successfully: ${username}`);

            res.status(201).json({
                success: true,
                message: 'User registered successfully',
                user: user
            });

        } catch (error) {
            console.error('[Auth] Registration error:', error.message);

            // Handle specific database errors
            if (error.message.includes('Email already registered')) {
                return res.status(409).json({
                    error: 'Email already registered',
                    field: 'email'
                });
            }

            if (error.message.includes('Username already taken')) {
                return res.status(409).json({
                    error: 'Username already taken',
                    field: 'username'
                });
            }

            // Generic error response
            res.status(500).json({
                error: 'Registration failed. Please try again.'
            });
        }
    }
);

// Login endpoint
router.post('/login',
    authLimiter,
    [
        body('username')
            .notEmpty()
            .trim()
            .withMessage('Username or email is required'),
        body('password')
            .notEmpty()
            .withMessage('Password is required')
    ],
    async (req, res) => {
        try {

            // Check for validation errors
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                console.log('[Auth] Validation errors:', errors.array());
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    details: errors.array().map(err => ({
                        field: err.path,
                        message: err.msg
                    }))
                });
            }

            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Username and password are required'
                });
            }

            console.log('[Auth] Login attempt for:', username);

            // Find user by email or username
            let user;
            if (User.validateEmail(username)) {
                console.log('[Auth] Looking up user by email');
                user = await User.findByEmail(username);
            } else {
                console.log('[Auth] Looking up user by username');
                user = await User.findByUsername(username);
            }

            if (!user) {
                console.log('[Auth] User not found');
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials'
                });
            }

            // Verify password
            console.log('[Auth] Verifying password');
            const isValidPassword = await user.verifyPassword(password);
            if (!isValidPassword) {
                console.log('[Auth] Invalid password');
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials'
                });
            }

            // Update last login
            await user.updateLastLogin();

            // Generate JWT token
            const payload = {
                id: user.user_id,
                username: user.username,
                email: user.email
            };

            const token = jwt.sign(
                payload,
                process.env.JWT_SECRET || 'your-secret-key',
                { expiresIn: '24h' }
            );

            // Create user session in RxDB
            try {
                const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
                await UserSession.create({
                    user_id: user.user_id,
                    token: token,
                    expires_at: expiresAt,
                    user_agent: req.get('User-Agent'),
                    ip_address: req.ip || req.connection.remoteAddress
                });
            } catch (sessionError) {
                console.error('[Auth] Failed to create session:', sessionError.message);
                // Continue with login even if session creation fails
            }

            console.log(`[Auth] User logged in successfully: ${user.username}`);

            res.status(200).json({
                success: true,
                message: 'Login successful',
                user: user.toSafeObject(),
                token: token
            });

        } catch (error) {
            console.error('[Auth] Login error:', error.message);
            console.error('[Auth] Login error stack:', error.stack);

            // Check for specific database errors
            if (error.message.includes('Connection refused') || error.message.includes('ECONNREFUSED')) {
                console.error('[Auth] Database connection failed');
                return res.status(500).json({
                    success: false,
                    message: 'Database connection failed. Please check your database configuration.'
                });
            }

            if (error.message.includes('Unknown database')) {
                console.error('[Auth] Database does not exist');
                return res.status(500).json({
                    success: false,
                    message: 'Database not found. Please run database initialization.'
                });
            }

            if (error.message.includes("Table") && error.message.includes("doesn't exist")) {
                console.error('[Auth] Database tables not found');
                return res.status(500).json({
                    success: false,
                    message: 'Database tables not found. Please run database initialization.'
                });
            }

            // Generic error response for security
            res.status(500).json({
                success: false,
                message: 'Login failed. Please try again.'
            });
        }
    }
);

// Token validation endpoint
router.post('/validate', async (req, res) => {
    try {
        const authHeader = req.header('Authorization');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                valid: false,
                message: 'No token provided'
            });
        }

        const token = authHeader.substring(7);
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        // Check if session exists and is valid
        const session = await UserSession.findByToken(token);
        if (!session || !session.isValid()) {
            return res.status(401).json({
                valid: false,
                message: 'Session expired or invalid'
            });
        }

        // Check if user still exists
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({
                valid: false,
                message: 'User not found'
            });
        }

        // Update session last used time
        await session.updateLastUsed();

        res.json({
            valid: true,
            user: user.toSafeObject(),
            session: session.toSafeObject()
        });
    } catch (error) {
        console.error('Token validation error:', error);
        res.status(401).json({
            valid: false,
            message: 'Invalid token'
        });
    }
});

// Token refresh endpoint (placeholder for future implementation)
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                message: 'Refresh token required'
            });
        }

        // TODO: Implement refresh token logic
        // For now, return error to indicate not implemented
        res.status(501).json({
            success: false,
            message: 'Refresh token functionality not yet implemented'
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({
            success: false,
            message: 'Token refresh failed'
        });
    }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
    try {
        const authHeader = req.header('Authorization');
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            
            try {
                // Find and revoke the session
                const session = await UserSession.findByToken(token);
                if (session) {
                    await session.revoke();
                    console.log(`[Auth] Session revoked for logout: ${session.session_id}`);
                }
            } catch (sessionError) {
                console.error('[Auth] Error revoking session during logout:', sessionError.message);
                // Continue with logout even if session revocation fails
            }
        }

        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        console.error('[Auth] Logout error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Logout failed'
        });
    }
});

// Get user sessions endpoint
router.get('/sessions', async (req, res) => {
    try {
        const authHeader = req.header('Authorization');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        const sessions = await UserSession.findByUserId(decoded.id);
        
        res.json({
            success: true,
            sessions: sessions.map(session => session.toSafeObject())
        });
    } catch (error) {
        console.error('[Auth] Get sessions error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve sessions'
        });
    }
});

// Revoke all sessions endpoint
router.post('/revoke-all-sessions', async (req, res) => {
    try {
        const authHeader = req.header('Authorization');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        await UserSession.revokeAllForUser(decoded.id);
        
        res.json({
            success: true,
            message: 'All sessions revoked successfully'
        });
    } catch (error) {
        console.error('[Auth] Revoke all sessions error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to revoke sessions'
        });
    }
});

// Cleanup expired sessions endpoint (admin only)
router.post('/cleanup-sessions', async (req, res) => {
    try {
        const cleanedCount = await UserSession.cleanupExpired();
        
        res.json({
            success: true,
            message: `Cleaned up ${cleanedCount} expired sessions`
        });
    } catch (error) {
        console.error('[Auth] Cleanup sessions error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to cleanup sessions'
        });
    }
});

// Health check for auth routes
router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        service: 'Authentication API',
        timestamp: new Date().toISOString()
    });
});

export default router;