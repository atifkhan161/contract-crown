import express from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';

const router = express.Router();

// Rate limiting for auth endpoints (disabled in test environment)
const authLimiter = process.env.NODE_ENV === 'test'
    ? (req, res, next) => next() // Skip rate limiting in tests
    : rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // limit each IP to 5 requests per windowMs for auth
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

            console.log(`[Auth] User logged in successfully: ${user.username}`);

            res.status(200).json({
                success: true,
                message: 'Login successful',
                user: user.toSafeObject(),
                token: 'placeholder_jwt_token' // TODO: Implement JWT token generation
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

// Health check for auth routes
router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        service: 'Authentication API',
        timestamp: new Date().toISOString()
    });
});

export default router;