import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * JWT Authentication and User ID Validation System
 * Provides consistent JWT token validation with database user verification
 * and user ID normalization across websocket and HTTP connections
 */
class JWTValidator {
  constructor() {
    this.secret = process.env.JWT_SECRET || 'your-secret-key';
  }

  /**
   * Validate JWT token and verify user exists in database
   * @param {string} token - JWT token to validate
   * @returns {Promise<{userId: string, username: string, email: string}>} Validated user data
   * @throws {Error} If token is invalid or user doesn't exist
   */
  async validateToken(token) {
    if (!token) {
      throw new Error('Authentication token is required');
    }

    try {
      // Verify JWT token structure and signature
      const decoded = jwt.verify(token, this.secret);
      
      // Normalize user ID from token (JWT uses 'id' field, database uses 'user_id')
      const userId = this.normalizeUserId(decoded);
      
      if (!userId || !decoded.username) {
        throw new Error('Token missing required user information');
      }

      // Verify user exists in database
      const userExists = await this.validateUserExists(userId);
      if (!userExists) {
        throw new Error('User not found in database');
      }

      return {
        userId: String(userId),
        username: decoded.username,
        email: decoded.email || null
      };
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token format');
      } else if (error.name === 'TokenExpiredError') {
        throw new Error('Token has expired');
      } else if (error.name === 'NotBeforeError') {
        throw new Error('Token not active yet');
      } else {
        throw error;
      }
    }
  }

  /**
   * Verify that user ID from token exists in database
   * @param {string} userId - User ID to verify
   * @returns {Promise<boolean>} True if user exists, false otherwise
   */
  async validateUserExists(userId) {
    try {
      const user = await User.findById(userId);
      return user !== null;
    } catch (error) {
      console.error('[JWTValidator] Database error during user validation:', error.message);
      return false;
    }
  }

  /**
   * Normalize user ID from various token formats
   * Handles both 'id' and 'user_id' fields consistently
   * @param {Object} tokenData - Decoded JWT token data
   * @returns {string} Normalized user ID as string
   */
  normalizeUserId(tokenData) {
    // JWT tokens typically use 'id' field, database uses 'user_id'
    // Normalize to string for consistent comparisons
    const userId = tokenData.id || tokenData.user_id || tokenData.userId;
    return userId ? String(userId) : null;
  }

  /**
   * Validate token for websocket connections with enhanced error handling
   * @param {string} token - JWT token to validate
   * @returns {Promise<{userId: string, username: string, email: string}>} Validated user data
   * @throws {Error} With specific error codes for websocket handling
   */
  async validateWebsocketToken(token) {
    try {
      return await this.validateToken(token);
    } catch (error) {
      // Add specific error codes for websocket error handling
      const websocketError = new Error(error.message);
      
      if (error.message.includes('required')) {
        websocketError.code = 'NO_TOKEN';
      } else if (error.message.includes('expired')) {
        websocketError.code = 'TOKEN_EXPIRED';
      } else if (error.message.includes('not found')) {
        websocketError.code = 'USER_NOT_FOUND';
      } else if (error.message.includes('Invalid token')) {
        websocketError.code = 'INVALID_TOKEN';
      } else {
        websocketError.code = 'AUTH_ERROR';
      }
      
      throw websocketError;
    }
  }

  /**
   * Validate token for HTTP requests with middleware-friendly error handling
   * @param {string} token - JWT token to validate
   * @returns {Promise<{userId: string, username: string, email: string}>} Validated user data
   * @throws {Error} With HTTP status codes
   */
  async validateHttpToken(token) {
    try {
      return await this.validateToken(token);
    } catch (error) {
      // Add HTTP status codes for middleware error handling
      const httpError = new Error(error.message);
      
      if (error.message.includes('required')) {
        httpError.status = 401;
        httpError.code = 'NO_TOKEN';
      } else if (error.message.includes('expired')) {
        httpError.status = 401;
        httpError.code = 'TOKEN_EXPIRED';
      } else if (error.message.includes('not found')) {
        httpError.status = 401;
        httpError.code = 'USER_NOT_FOUND';
      } else if (error.message.includes('Invalid token')) {
        httpError.status = 401;
        httpError.code = 'INVALID_TOKEN';
      } else {
        httpError.status = 500;
        httpError.code = 'AUTH_ERROR';
      }
      
      throw httpError;
    }
  }

  /**
   * Extract token from various request sources
   * @param {Object} req - Express request object or Socket handshake
   * @returns {string|null} Extracted token or null if not found
   */
  extractToken(req) {
    // For Express requests
    if (req.header) {
      const authHeader = req.header('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
      }
    }

    // For Socket.IO handshake
    if (req.handshake) {
      // Try auth object first (preferred method)
      if (req.handshake.auth && req.handshake.auth.token) {
        return req.handshake.auth.token;
      }

      // Try Authorization header
      const authHeader = req.handshake.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
      }

      // Try query parameters (fallback)
      if (req.handshake.query && req.handshake.query.token) {
        return req.handshake.query.token;
      }
    }

    return null;
  }

  /**
   * Create authentication context for consistent user data handling
   * @param {Object} validatedUser - User data from token validation
   * @returns {Object} Authentication context object
   */
  createAuthContext(validatedUser) {
    return {
      userId: String(validatedUser.userId),
      username: validatedUser.username,
      email: validatedUser.email,
      tokenValid: true,
      databaseUserExists: true,
      lastValidated: new Date().toISOString()
    };
  }

  /**
   * Validate user ID consistency between token and request data
   * @param {string} tokenUserId - User ID from JWT token
   * @param {string} requestUserId - User ID from request data
   * @returns {boolean} True if IDs match, false otherwise
   */
  validateUserIdConsistency(tokenUserId, requestUserId) {
    if (!tokenUserId || !requestUserId) {
      return false;
    }

    // Normalize both IDs to strings for comparison
    const normalizedTokenId = String(tokenUserId);
    const normalizedRequestId = String(requestUserId);

    return normalizedTokenId === normalizedRequestId;
  }
}

export default JWTValidator;
