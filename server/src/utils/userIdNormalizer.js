/**
 * User ID Normalization Utilities
 * Provides consistent user ID handling across different data sources
 * and resolves field name inconsistencies between JWT tokens and database
 */
class UserIdNormalizer {
  /**
   * Normalize user ID from JWT token data
   * JWT tokens typically use 'id' field while database uses 'user_id'
   * @param {Object} tokenData - Decoded JWT token payload
   * @returns {string|null} Normalized user ID as string
   */
  static normalizeFromToken(tokenData) {
    if (!tokenData || typeof tokenData !== 'object') {
      return null;
    }

    // Check for various possible field names in order of preference
    const userId = tokenData.id || tokenData.user_id || tokenData.userId;
    
    return userId ? String(userId).trim() : null;
  }

  /**
   * Normalize user ID from database record
   * Database records use 'user_id' field
   * @param {Object} dbRecord - Database record object
   * @returns {string|null} Normalized user ID as string
   */
  static normalizeFromDatabase(dbRecord) {
    if (!dbRecord || typeof dbRecord !== 'object') {
      return null;
    }

    // Database typically uses 'user_id' field
    const userId = dbRecord.user_id || dbRecord.id || dbRecord.userId;
    
    return userId ? String(userId).trim() : null;
  }

  /**
   * Normalize user ID from request data
   * Request data can come in various formats
   * @param {Object} requestData - Request payload or parameters
   * @returns {string|null} Normalized user ID as string
   */
  static normalizeFromRequest(requestData) {
    if (!requestData || typeof requestData !== 'object') {
      return null;
    }

    // Check for various possible field names
    const userId = requestData.userId || requestData.user_id || requestData.id;
    
    return userId ? String(userId).trim() : null;
  }

  /**
   * Normalize user ID from socket authentication data
   * Socket data can have user ID attached in various ways
   * @param {Object} socket - Socket.IO socket object
   * @returns {string|null} Normalized user ID as string
   */
  static normalizeFromSocket(socket) {
    if (!socket || typeof socket !== 'object') {
      return null;
    }

    // Check socket properties for user ID
    const userId = socket.userId || socket.user_id || socket.id;
    
    return userId ? String(userId).trim() : null;
  }

  /**
   * Normalize and validate user ID from multiple sources
   * Ensures consistency across different data sources
   * @param {Object} sources - Object containing different data sources
   * @param {Object} sources.token - JWT token data
   * @param {Object} sources.database - Database record
   * @param {Object} sources.request - Request data
   * @param {Object} sources.socket - Socket data
   * @returns {Object} Normalized user data with validation results
   */
  static normalizeFromMultipleSources(sources = {}) {
    const { token, database, request, socket } = sources;

    const tokenUserId = token ? this.normalizeFromToken(token) : null;
    const dbUserId = database ? this.normalizeFromDatabase(database) : null;
    const requestUserId = request ? this.normalizeFromRequest(request) : null;
    const socketUserId = socket ? this.normalizeFromSocket(socket) : null;

    // Collect all non-null user IDs
    const userIds = [tokenUserId, dbUserId, requestUserId, socketUserId].filter(Boolean);
    
    // Check for consistency
    const isConsistent = userIds.length <= 1 || userIds.every(id => id === userIds[0]);
    
    // Use the first available user ID as the canonical one
    const canonicalUserId = userIds[0] || null;

    return {
      userId: canonicalUserId,
      sources: {
        token: tokenUserId,
        database: dbUserId,
        request: requestUserId,
        socket: socketUserId
      },
      isConsistent,
      hasMultipleSources: userIds.length > 1,
      validationPassed: isConsistent && canonicalUserId !== null
    };
  }

  /**
   * Create user data object with normalized fields
   * Ensures consistent field naming across the application
   * @param {Object} userData - Raw user data from any source
   * @returns {Object} Normalized user data object
   */
  static createNormalizedUserData(userData) {
    if (!userData || typeof userData !== 'object') {
      return null;
    }

    return {
      userId: this.normalizeFromToken(userData) || this.normalizeFromDatabase(userData) || this.normalizeFromRequest(userData),
      username: userData.username || userData.user_name || userData.name,
      email: userData.email || userData.user_email,
      // Preserve original data for debugging
      _original: userData
    };
  }

  /**
   * Validate user ID format
   * Ensures user ID meets expected format requirements
   * @param {string} userId - User ID to validate
   * @returns {Object} Validation result
   */
  static validateUserIdFormat(userId) {
    if (!userId) {
      return {
        isValid: false,
        error: 'User ID is required'
      };
    }

    const normalizedId = String(userId).trim();

    if (normalizedId.length === 0) {
      return {
        isValid: false,
        error: 'User ID cannot be empty'
      };
    }

    // Check for UUID format (common in this application)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const isUuid = uuidRegex.test(normalizedId);

    // Check for numeric ID format
    const isNumeric = /^\d+$/.test(normalizedId);

    // Check for alphanumeric ID format
    const isAlphanumeric = /^[a-zA-Z0-9_-]+$/.test(normalizedId);

    if (!isUuid && !isNumeric && !isAlphanumeric) {
      return {
        isValid: false,
        error: 'User ID format is invalid'
      };
    }

    return {
      isValid: true,
      normalizedId,
      format: isUuid ? 'uuid' : isNumeric ? 'numeric' : 'alphanumeric'
    };
  }

  /**
   * Compare user IDs for equality with normalization
   * @param {string} userId1 - First user ID
   * @param {string} userId2 - Second user ID
   * @returns {boolean} True if user IDs are equal after normalization
   */
  static compareUserIds(userId1, userId2) {
    if (!userId1 || !userId2) {
      return false;
    }

    const normalized1 = String(userId1).trim();
    const normalized2 = String(userId2).trim();

    return normalized1 === normalized2;
  }

  /**
   * Extract user ID from various authentication contexts
   * @param {Object} authContext - Authentication context (req.user, socket, etc.)
   * @returns {string|null} Extracted and normalized user ID
   */
  static extractFromAuthContext(authContext) {
    if (!authContext) {
      return null;
    }

    // Handle Express req.user object
    if (authContext.user) {
      return this.normalizeFromRequest(authContext.user);
    }

    // Handle Socket.IO socket object
    if (authContext.userId || authContext.handshake) {
      return this.normalizeFromSocket(authContext);
    }

    // Handle direct user data
    return this.normalizeFromRequest(authContext);
  }
}

export default UserIdNormalizer;