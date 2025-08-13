import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import UserSession from '../models/UserSession.js';

/**
 * Enhanced WebSocket Authentication Middleware
 * Handles JWT token verification with LokiJS user and session validation for Socket.IO connections
 */

/**
 * Enhanced middleware to authenticate Socket.IO connections with LokiJS verification
 * @param {Object} socket - Socket.IO socket instance
 * @param {Function} next - Next middleware function
 */
export const authenticateSocket = async (socket, next) => {
  try {
    // Check if database is ready
    const lokiConnection = (await import('../../database/loki-db.js')).default;
    if (!lokiConnection.isReady()) {
      console.error('[SocketAuth] Database not ready');
      const error = new Error('Database not ready');
      error.data = { code: 'DATABASE_NOT_READY' };
      return next(error);
    }

    // Extract token from various possible locations
    const token = extractToken(socket);

    if (!token) {
      console.error('[SocketAuth] No token provided');
      const error = new Error('Authentication token required');
      error.data = { code: 'NO_TOKEN' };
      return next(error);
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    } catch (jwtError) {
      console.error('[SocketAuth] JWT verification failed:', jwtError.message);
      const error = new Error('Invalid token format');
      error.data = { code: 'INVALID_TOKEN' };
      return next(error);
    }

    // Check if session exists and is valid
    let session;
    try {
      session = await UserSession.findByToken(token);
    } catch (sessionError) {
      console.error('[SocketAuth] Session lookup failed:', sessionError.message);
      const error = new Error('Session lookup failed');
      error.data = { code: 'SESSION_LOOKUP_ERROR' };
      return next(error);
    }

    if (!session || !session.isValid()) {
      console.error('[SocketAuth] Session expired or invalid');
      const error = new Error('Session expired or invalid');
      error.data = { code: 'SESSION_INVALID' };
      return next(error);
    }

    // Check if user still exists and is active
    let user;
    try {
      user = await User.findById(decoded.id);
    } catch (userError) {
      console.error('[SocketAuth] User lookup failed:', userError.message);
      const error = new Error('User lookup failed');
      error.data = { code: 'USER_LOOKUP_ERROR' };
      return next(error);
    }

    if (!user || !user.is_active) {
      console.error('[SocketAuth] User not found or inactive');
      const error = new Error('User not found or inactive');
      error.data = { code: 'USER_NOT_FOUND' };
      return next(error);
    }

    // Update session last used time
    try {
      await session.updateLastUsed();
    } catch (updateError) {
      console.error('[SocketAuth] Session update failed:', updateError.message);
      // Don't fail authentication for this, just log the error
    }

    // Attach user information to socket
    socket.userId = user.user_id;
    socket.username = user.username;
    socket.email = user.email;
    socket.user = user;
    socket.session = session;

    // Log successful authentication
    console.log(`[SocketAuth] User authenticated: ${socket.username} (${socket.userId})`);

    next();
  } catch (error) {
    console.error('[SocketAuth] Authentication failed:', error.message);

    // Create enhanced error with specific codes for better error handling
    let errorCode = 'INVALID_TOKEN';
    let errorMessage = 'Invalid authentication token';

    if (error.name === 'JsonWebTokenError') {
      errorCode = 'INVALID_TOKEN';
      errorMessage = 'Invalid token format';
    } else if (error.name === 'TokenExpiredError') {
      errorCode = 'TOKEN_EXPIRED';
      errorMessage = 'Token has expired';
    } else if (error.message.includes('Session')) {
      errorCode = 'SESSION_INVALID';
      errorMessage = error.message;
    } else if (error.message.includes('User')) {
      errorCode = 'USER_NOT_FOUND';
      errorMessage = error.message;
    }

    const authError = new Error(errorMessage);
    authError.data = {
      code: errorCode,
      message: errorMessage,
      timestamp: new Date().toISOString()
    };

    next(authError);
  }
};

/**
 * Extract JWT token from socket handshake
 * @param {Object} socket - Socket.IO socket instance
 * @returns {string|null} JWT token or null if not found
 */
function extractToken(socket) {
  // Try to get token from auth object (preferred method)
  if (socket.handshake.auth && socket.handshake.auth.token) {
    return socket.handshake.auth.token;
  }

  // Try to get token from Authorization header
  const authHeader = socket.handshake.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Try to get token from query parameters (fallback)
  if (socket.handshake.query && socket.handshake.query.token) {
    return socket.handshake.query.token;
  }

  return null;
}



/**
 * Middleware to authorize specific socket events
 * @param {Array} allowedRoles - Array of roles allowed to perform the action
 * @returns {Function} Middleware function
 */
export const authorizeSocket = (allowedRoles = []) => {
  return (socket, next) => {
    try {
      // If no roles specified, allow all authenticated users
      if (allowedRoles.length === 0) {
        return next();
      }

      // Check if user has required role (extend this based on your user model)
      const userRole = socket.userRole || 'player'; // Default role

      if (!allowedRoles.includes(userRole)) {
        const error = new Error('Insufficient permissions');
        error.data = {
          code: 'INSUFFICIENT_PERMISSIONS',
          required: allowedRoles,
          current: userRole
        };
        return next(error);
      }

      next();
    } catch (error) {
      console.error('[SocketAuth] Authorization failed:', error.message);
      next(error);
    }
  };
};

/**
 * Middleware to validate game room access
 * @param {Object} socket - Socket.IO socket instance
 * @param {string} gameId - Game ID to validate access for
 * @param {Function} callback - Callback function with (error, isAuthorized)
 */
export const validateGameAccess = async (socket, gameId, callback) => {
  try {
    const { userId } = socket;

    if (!gameId) {
      return callback(new Error('Game ID is required'), false);
    }

    // Here you would typically check database to see if user has access to the game
    // For now, we'll implement basic validation

    // TODO: Add database check for game membership
    // const hasAccess = await checkGameMembership(userId, gameId);

    // For now, allow access to all authenticated users
    const hasAccess = true;

    if (!hasAccess) {
      const error = new Error('Access denied to game room');
      error.data = {
        code: 'GAME_ACCESS_DENIED',
        gameId,
        userId
      };
      return callback(error, false);
    }

    callback(null, true);
  } catch (error) {
    console.error('[SocketAuth] Game access validation failed:', error.message);
    callback(error, false);
  }
};

/**
 * Rate limiting middleware for socket events
 * @param {number} maxEvents - Maximum events per window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Function} Middleware function
 */
export const rateLimitSocket = (maxEvents = 100, windowMs = 60000) => {
  const clients = new Map();

  return (socket, next) => {
    const clientId = socket.userId || socket.id;
    const now = Date.now();

    if (!clients.has(clientId)) {
      clients.set(clientId, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const client = clients.get(clientId);

    if (now > client.resetTime) {
      // Reset the counter
      client.count = 1;
      client.resetTime = now + windowMs;
      return next();
    }

    if (client.count >= maxEvents) {
      const error = new Error('Rate limit exceeded');
      error.data = {
        code: 'RATE_LIMIT_EXCEEDED',
        maxEvents,
        windowMs,
        resetTime: client.resetTime
      };
      return next(error);
    }

    client.count++;
    next();
  };
};

export default {
  authenticateSocket,
  authorizeSocket,
  validateGameAccess,
  rateLimitSocket
};
