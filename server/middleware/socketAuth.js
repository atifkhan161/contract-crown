import jwt from 'jsonwebtoken';

/**
 * WebSocket Authentication Middleware
 * Handles JWT token verification for Socket.IO connections
 */

/**
 * Middleware to authenticate Socket.IO connections
 * @param {Object} socket - Socket.IO socket instance
 * @param {Function} next - Next middleware function
 */
export const authenticateSocket = async (socket, next) => {
  try {
    // Extract token from various possible locations
    const token = extractToken(socket);
    
    if (!token) {
      const error = new Error('Authentication token required');
      error.data = { code: 'NO_TOKEN' };
      return next(error);
    }

    // Verify JWT token
    const decoded = verifyToken(token);
    
    // Attach user information to socket
    socket.userId = decoded.userId;
    socket.username = decoded.username;
    socket.email = decoded.email;
    
    // Log successful authentication
    console.log(`[SocketAuth] User authenticated: ${socket.username} (${socket.userId})`);
    
    next();
  } catch (error) {
    console.error('[SocketAuth] Authentication failed:', error.message);
    
    const authError = new Error('Invalid authentication token');
    authError.data = { 
      code: 'INVALID_TOKEN',
      message: error.message 
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
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid
 */
function verifyToken(token) {
  const secret = process.env.JWT_SECRET || 'your-secret-key';
  
  try {
    const decoded = jwt.verify(token, secret);
    
    // Validate required fields
    if (!decoded.userId || !decoded.username) {
      throw new Error('Token missing required user information');
    }
    
    // Check token expiration (jwt.verify already does this, but we can add custom logic)
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      throw new Error('Token has expired');
    }
    
    return decoded;
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