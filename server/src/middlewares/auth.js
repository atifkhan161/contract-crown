import JWTValidator from '../utils/jwtValidator.js';
import UserIdNormalizer from '../utils/userIdNormalizer.js';

// Create JWT validator instance
const jwtValidator = new JWTValidator();

/**
 * Enhanced HTTP Authentication Middleware
 * Handles JWT token verification with database user validation for HTTP requests
 */
const auth = async (req, res, next) => {
    try {
        // Extract token from request
        const token = jwtValidator.extractToken(req);
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided, authorization denied',
                code: 'NO_TOKEN'
            });
        }

        // Validate token with database user verification
        const validatedUser = await jwtValidator.validateHttpToken(token);

        // Create normalized user data
        const normalizedUser = UserIdNormalizer.createNormalizedUserData(validatedUser);

        if (!normalizedUser || !normalizedUser.userId || !normalizedUser.username) {
            console.error('[Auth] Failed to normalize user data:', validatedUser);
            return res.status(401).json({
                success: false,
                message: 'Invalid user data after normalization',
                code: 'NORMALIZATION_FAILED'
            });
        }

        // Validate user ID format
        const userIdValidation = UserIdNormalizer.validateUserIdFormat(normalizedUser.userId);
        if (!userIdValidation.isValid) {
            console.error('[Auth] Invalid user ID format:', userIdValidation.error);
            return res.status(401).json({
                success: false,
                message: `Invalid user ID format: ${userIdValidation.error}`,
                code: 'INVALID_USER_ID_FORMAT'
            });
        }

        // Add validated and normalized user to request object
        req.user = {
            id: normalizedUser.userId, // Keep 'id' for backward compatibility
            userId: normalizedUser.userId, // Add normalized field
            username: normalizedUser.username,
            email: normalizedUser.email
        };

        // Create authentication context for debugging and monitoring
        req.authContext = jwtValidator.createAuthContext(validatedUser);

        console.log(`[Auth] User authenticated and verified: ${req.user.username} (${req.user.userId}) - Format: ${userIdValidation.format}`);

        next();
    } catch (error) {
        console.error('[Auth] Authentication failed:', error.message);
        
        // Handle specific error types with enhanced error codes
        const status = error.status || 401;
        const code = error.code || 'AUTH_ERROR';
        
        let message = 'Authentication failed';
        if (error.message.includes('expired')) {
            message = 'Token has expired';
        } else if (error.message.includes('not found')) {
            message = 'User not found';
        } else if (error.message.includes('Invalid token')) {
            message = 'Token is not valid';
        } else if (error.message.includes('required')) {
            message = 'Authentication token is required';
        }
        
        res.status(status).json({
            success: false,
            message,
            code,
            timestamp: new Date().toISOString()
        });
    }
};

export default auth;