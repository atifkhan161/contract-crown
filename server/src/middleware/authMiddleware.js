import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import UserSession from '../models/UserSession.js';

// Authentication middleware that validates JWT tokens and sessions
export const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Access token required'
            });
        }

        const token = authHeader.substring(7);
        
        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        // Check if session exists and is valid
        const session = await UserSession.findByToken(token);
        if (!session || !session.isValid()) {
            return res.status(401).json({
                success: false,
                message: 'Session expired or invalid'
            });
        }

        // Check if user still exists and is active
        const user = await User.findById(decoded.id);
        if (!user || !user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'User not found or inactive'
            });
        }

        // Update session last used time
        await session.updateLastUsed();

        // Attach user and session to request
        req.user = user;
        req.session = session;
        
        next();
    } catch (error) {
        console.error('[Auth] Token authentication error:', error.message);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }
        
        return res.status(500).json({
            success: false,
            message: 'Authentication failed'
        });
    }
};

// Optional authentication middleware (doesn't fail if no token)
export const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // No token provided, continue without authentication
            req.user = null;
            req.session = null;
            return next();
        }

        const token = authHeader.substring(7);
        
        try {
            // Verify JWT token
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            
            // Check if session exists and is valid
            const session = await UserSession.findByToken(token);
            if (session && session.isValid()) {
                // Check if user still exists and is active
                const user = await User.findById(decoded.id);
                if (user && user.is_active) {
                    // Update session last used time
                    await session.updateLastUsed();
                    
                    // Attach user and session to request
                    req.user = user;
                    req.session = session;
                } else {
                    req.user = null;
                    req.session = null;
                }
            } else {
                req.user = null;
                req.session = null;
            }
        } catch (tokenError) {
            // Invalid token, continue without authentication
            req.user = null;
            req.session = null;
        }
        
        next();
    } catch (error) {
        console.error('[Auth] Optional authentication error:', error.message);
        // Continue without authentication on error
        req.user = null;
        req.session = null;
        next();
    }
};

// Middleware to check if user is authenticated
export const requireAuth = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }
    next();
};

// Middleware to check if user is admin (placeholder for future implementation)
export const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }
    
    // TODO: Implement admin role checking
    // For now, all authenticated users are considered admins
    next();
};

export default {
    authenticateToken,
    optionalAuth,
    requireAuth,
    requireAdmin
};