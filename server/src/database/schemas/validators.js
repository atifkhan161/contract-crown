/**
 * RxDB Schema Validators
 * Custom validation functions for RxDB schemas
 */

/**
 * Email validation function
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email format
 */
export function validateEmail(email) {
  if (typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim().toLowerCase());
}

/**
 * Username validation function
 * @param {string} username - Username to validate
 * @returns {boolean} - True if valid username format
 */
export function validateUsername(username) {
  if (typeof username !== 'string') return false;
  // Username: 3-50 characters, alphanumeric and underscores only
  const usernameRegex = /^[a-zA-Z0-9_]{3,50}$/;
  return usernameRegex.test(username.trim());
}

/**
 * Game code validation function
 * @param {string} gameCode - Game code to validate
 * @returns {boolean} - True if valid game code format
 */
export function validateGameCode(gameCode) {
  if (typeof gameCode !== 'string') return false;
  // Game code: 6-10 characters, alphanumeric uppercase
  const gameCodeRegex = /^[A-Z0-9]{6,10}$/;
  return gameCodeRegex.test(gameCode);
}

/**
 * Room invite code validation function
 * @param {string} inviteCode - Invite code to validate
 * @returns {boolean} - True if valid invite code format
 */
export function validateInviteCode(inviteCode) {
  if (typeof inviteCode !== 'string') return false;
  // Invite code: 5 characters, alphanumeric uppercase (excluding confusing chars)
  const inviteCodeRegex = /^[0-9ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/;
  return inviteCodeRegex.test(inviteCode);
}

/**
 * UUID validation function
 * @param {string} uuid - UUID to validate
 * @returns {boolean} - True if valid UUID format
 */
export function validateUUID(uuid) {
  if (typeof uuid !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * ISO 8601 date-time validation function
 * @param {string} dateTime - Date-time string to validate
 * @returns {boolean} - True if valid ISO 8601 format
 */
export function validateDateTime(dateTime) {
  if (typeof dateTime !== 'string') return false;
  try {
    const date = new Date(dateTime);
    return date.toISOString() === dateTime;
  } catch {
    return false;
  }
}

/**
 * IP address validation function (IPv4 and IPv6)
 * @param {string} ip - IP address to validate
 * @returns {boolean} - True if valid IP address
 */
export function validateIPAddress(ip) {
  if (typeof ip !== 'string') return false;
  
  // IPv4 regex
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  
  // IPv6 regex (simplified)
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
  
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * Card validation function for game tricks
 * @param {object} card - Card object to validate
 * @returns {boolean} - True if valid card format
 */
export function validateCard(card) {
  if (typeof card !== 'object' || card === null) return false;
  
  const validSuits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
  const validRanks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  
  return validSuits.includes(card.suit) && validRanks.includes(card.rank);
}

/**
 * Cards played validation function for game tricks
 * @param {object} cardsPlayed - Cards played object to validate
 * @returns {boolean} - True if valid cards played format
 */
export function validateCardsPlayed(cardsPlayed) {
  if (typeof cardsPlayed !== 'object' || cardsPlayed === null) return false;
  
  // Should be an object with player IDs as keys and card objects as values
  const entries = Object.entries(cardsPlayed);
  if (entries.length === 0 || entries.length > 4) return false;
  
  return entries.every(([playerId, card]) => {
    return validateUUID(playerId) && validateCard(card);
  });
}

/**
 * Room settings validation function
 * @param {object} settings - Room settings object to validate
 * @returns {boolean} - True if valid settings format
 */
export function validateRoomSettings(settings) {
  if (typeof settings !== 'object' || settings === null) return false;
  
  const validKeys = ['timeLimit', 'allowSpectators', 'autoStart'];
  const keys = Object.keys(settings);
  
  // Check if all keys are valid
  if (!keys.every(key => validKeys.includes(key))) return false;
  
  // Validate individual settings
  if (settings.timeLimit !== undefined) {
    if (typeof settings.timeLimit !== 'number' || settings.timeLimit < 10 || settings.timeLimit > 300) {
      return false;
    }
  }
  
  if (settings.allowSpectators !== undefined) {
    if (typeof settings.allowSpectators !== 'boolean') return false;
  }
  
  if (settings.autoStart !== undefined) {
    if (typeof settings.autoStart !== 'boolean') return false;
  }
  
  return true;
}

/**
 * Game state validation function
 * @param {object} gameState - Game state object to validate
 * @returns {boolean} - True if valid game state format
 */
export function validateGameState(gameState) {
  if (typeof gameState !== 'object' || gameState === null) return false;
  
  // Basic structure validation - can be expanded based on actual game state structure
  const validKeys = ['currentRound', 'currentTrick', 'phase', 'trumpSuit', 'scores', 'playerHands'];
  const keys = Object.keys(gameState);
  
  // Allow empty game state
  if (keys.length === 0) return true;
  
  // Check if all keys are valid
  return keys.every(key => validKeys.includes(key));
}

/**
 * User agent validation function
 * @param {string} userAgent - User agent string to validate
 * @returns {boolean} - True if valid user agent format
 */
export function validateUserAgent(userAgent) {
  if (typeof userAgent !== 'string') return false;
  
  // Basic user agent validation - should not be empty and have reasonable length
  return userAgent.trim().length > 0 && userAgent.length <= 1000;
}

// Export all validators
export const validators = {
  validateEmail,
  validateUsername,
  validateGameCode,
  validateInviteCode,
  validateUUID,
  validateDateTime,
  validateIPAddress,
  validateCard,
  validateCardsPlayed,
  validateRoomSettings,
  validateGameState,
  validateUserAgent
};

export default validators;