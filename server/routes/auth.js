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
        body('identifier')
            .trim()
            .notEmpty()
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
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array().map(err => ({
                        field: err.path,
                        message: err.msg
                    }))
                });
            }

            const { identifier, password } = req.body;

            // Find user by email or username
            let user;
            if (User.validateEmail(identifier)) {
                user = await User.findByEmail(identifier);
            } else {
                user = await User.findByUsername(identifier);
            }

            if (!user) {
                return res.status(401).json({
                    error: 'Invalid credentials'
                });
            }

            // Verify password
            const isValidPassword = await user.verifyPassword(password);
            if (!isValidPassword) {
                return res.status(401).json({
                    error: 'Invalid credentials'
                });
            }

            // Update last login
            await user.updateLastLogin();

            console.log(`[Auth] User logged in successfully: ${user.username}`);

            res.status(200).json({
                message: 'Login successful',
                user: user.toSafeObject()
            });

        } catch (error) {
            console.error('[Auth] Login error:', error.message);

            // Generic error response for security
            res.status(500).json({
                error: 'Login failed. Please try again.'
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