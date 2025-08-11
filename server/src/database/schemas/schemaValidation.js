/**
 * Schema Validation Utilities
 * Additional validation logic for RxDB schemas
 */

import { validators } from './validators.js';

/**
 * Pre-insert validation hook for Users collection
 * @param {Object} docData - Document data to validate
 * @returns {Object} - Validated document data
 * @throws {Error} - If validation fails
 */
export function validateUserDocument(docData) {
    const errors = [];

    // Validate UUID format
    if (!validators.validateUUID(docData.user_id)) {
        errors.push('Invalid user_id format');
    }

    // Validate username
    if (!validators.validateUsername(docData.username)) {
        errors.push('Username must be 3-50 characters, alphanumeric and underscores only');
    }

    // Validate email
    if (!validators.validateEmail(docData.email)) {
        errors.push('Invalid email format');
    }

    // Validate password hash exists
    if (!docData.password_hash || docData.password_hash.trim().length === 0) {
        errors.push('Password hash is required');
    }

    // Validate date-time fields
    if (docData.created_at && !validators.validateDateTime(docData.created_at)) {
        errors.push('Invalid created_at date format');
    }

    if (docData.last_login && !validators.validateDateTime(docData.last_login)) {
        errors.push('Invalid last_login date format');
    }

    // Validate numeric constraints
    if (docData.total_games_played < 0) {
        errors.push('total_games_played cannot be negative');
    }

    if (docData.total_games_won < 0) {
        errors.push('total_games_won cannot be negative');
    }

    if (docData.total_games_won > docData.total_games_played) {
        errors.push('total_games_won cannot exceed total_games_played');
    }

    if (errors.length > 0) {
        throw new Error(`User validation failed: ${errors.join(', ')}`);
    }

    return docData;
}

/**
 * Pre-insert validation hook for Games collection
 * @param {Object} docData - Document data to validate
 * @returns {Object} - Validated document data
 * @throws {Error} - If validation fails
 */
export function validateGameDocument(docData) {
    const errors = [];

    // Validate UUIDs
    if (!validators.validateUUID(docData.game_id)) {
        errors.push('Invalid game_id format');
    }

    if (!validators.validateUUID(docData.host_id)) {
        errors.push('Invalid host_id format');
    }

    if (docData.winning_team_id && !validators.validateUUID(docData.winning_team_id)) {
        errors.push('Invalid winning_team_id format');
    }

    // Validate game code
    if (!validators.validateGameCode(docData.game_code)) {
        errors.push('Game code must be 6-10 characters, alphanumeric uppercase');
    }

    // Validate status enum
    const validStatuses = ['waiting', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(docData.status)) {
        errors.push(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    // Validate date-time fields
    if (docData.created_at && !validators.validateDateTime(docData.created_at)) {
        errors.push('Invalid created_at date format');
    }

    if (docData.started_at && !validators.validateDateTime(docData.started_at)) {
        errors.push('Invalid started_at date format');
    }

    if (docData.completed_at && !validators.validateDateTime(docData.completed_at)) {
        errors.push('Invalid completed_at date format');
    }

    // Validate target score
    if (docData.target_score < 1 || docData.target_score > 1000) {
        errors.push('target_score must be between 1 and 1000');
    }

    // Validate date logic
    if (docData.started_at && docData.created_at) {
        const createdDate = new Date(docData.created_at);
        const startedDate = new Date(docData.started_at);
        if (startedDate < createdDate) {
            errors.push('started_at cannot be before created_at');
        }
    }

    if (docData.completed_at && docData.started_at) {
        const startedDate = new Date(docData.started_at);
        const completedDate = new Date(docData.completed_at);
        if (completedDate < startedDate) {
            errors.push('completed_at cannot be before started_at');
        }
    }

    if (errors.length > 0) {
        throw new Error(`Game validation failed: ${errors.join(', ')}`);
    }

    return docData;
}

/**
 * Pre-insert validation hook for Rooms collection
 * @param {Object} docData - Document data to validate
 * @returns {Object} - Validated document data
 * @throws {Error} - If validation fails
 */
export function validateRoomDocument(docData) {
    const errors = [];

    // Validate UUIDs
    if (!validators.validateUUID(docData.room_id)) {
        errors.push('Invalid room_id format');
    }

    if (!validators.validateUUID(docData.owner_id)) {
        errors.push('Invalid owner_id format');
    }

    // Validate room name
    if (!docData.name || docData.name.trim().length === 0) {
        errors.push('Room name is required');
    }

    if (docData.name.length > 50) {
        errors.push('Room name cannot exceed 50 characters');
    }

    // Validate max players
    if (docData.max_players < 2 || docData.max_players > 6) {
        errors.push('max_players must be between 2 and 6');
    }

    // Validate status enum
    const validStatuses = ['waiting', 'playing', 'finished'];
    if (!validStatuses.includes(docData.status)) {
        errors.push(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    // Validate invite code
    if (docData.invite_code && !validators.validateInviteCode(docData.invite_code)) {
        errors.push('Invite code must be 5 characters, alphanumeric uppercase (excluding I, O)');
    }

    // Validate settings
    if (docData.settings && !validators.validateRoomSettings(docData.settings)) {
        errors.push('Invalid room settings format');
    }

    // Validate game state
    if (docData.game_state && !validators.validateGameState(docData.game_state)) {
        errors.push('Invalid game state format');
    }

    // Validate date-time fields
    if (docData.created_at && !validators.validateDateTime(docData.created_at)) {
        errors.push('Invalid created_at date format');
    }

    if (docData.updated_at && !validators.validateDateTime(docData.updated_at)) {
        errors.push('Invalid updated_at date format');
    }

    if (docData.started_at && !validators.validateDateTime(docData.started_at)) {
        errors.push('Invalid started_at date format');
    }

    if (docData.finished_at && !validators.validateDateTime(docData.finished_at)) {
        errors.push('Invalid finished_at date format');
    }

    // Validate version
    if (docData.version < 1) {
        errors.push('version must be at least 1');
    }

    if (errors.length > 0) {
        throw new Error(`Room validation failed: ${errors.join(', ')}`);
    }

    return docData;
}

/**
 * Pre-insert validation hook for Game Tricks collection
 * @param {Object} docData - Document data to validate
 * @returns {Object} - Validated document data
 * @throws {Error} - If validation fails
 */
export function validateGameTrickDocument(docData) {
    const errors = [];

    // Validate UUIDs
    if (!validators.validateUUID(docData.trick_id)) {
        errors.push('Invalid trick_id format');
    }

    if (!validators.validateUUID(docData.round_id)) {
        errors.push('Invalid round_id format');
    }

    if (!validators.validateUUID(docData.leading_player_id)) {
        errors.push('Invalid leading_player_id format');
    }

    if (docData.winning_player_id && !validators.validateUUID(docData.winning_player_id)) {
        errors.push('Invalid winning_player_id format');
    }

    // Validate trick number
    if (docData.trick_number < 1 || docData.trick_number > 8) {
        errors.push('trick_number must be between 1 and 8');
    }

    // Validate cards played
    if (!validators.validateCardsPlayed(docData.cards_played)) {
        errors.push('Invalid cards_played format');
    }

    // Validate date-time fields
    if (docData.created_at && !validators.validateDateTime(docData.created_at)) {
        errors.push('Invalid created_at date format');
    }

    if (docData.completed_at && !validators.validateDateTime(docData.completed_at)) {
        errors.push('Invalid completed_at date format');
    }

    if (errors.length > 0) {
        throw new Error(`Game trick validation failed: ${errors.join(', ')}`);
    }

    return docData;
}

/**
 * Pre-insert validation hook for User Sessions collection
 * @param {Object} docData - Document data to validate
 * @returns {Object} - Validated document data
 * @throws {Error} - If validation fails
 */
export function validateUserSessionDocument(docData) {
    const errors = [];

    // Validate UUIDs
    if (!validators.validateUUID(docData.session_id)) {
        errors.push('Invalid session_id format');
    }

    if (!validators.validateUUID(docData.user_id)) {
        errors.push('Invalid user_id format');
    }

    // Validate token hash
    if (!docData.token_hash || docData.token_hash.trim().length === 0) {
        errors.push('token_hash is required');
    }

    // Validate date-time fields
    if (!validators.validateDateTime(docData.expires_at)) {
        errors.push('Invalid expires_at date format');
    }

    if (docData.created_at && !validators.validateDateTime(docData.created_at)) {
        errors.push('Invalid created_at date format');
    }

    if (docData.last_used_at && !validators.validateDateTime(docData.last_used_at)) {
        errors.push('Invalid last_used_at date format');
    }

    // Validate expiration logic
    const expiresAt = new Date(docData.expires_at);
    const now = new Date();
    if (expiresAt <= now) {
        errors.push('expires_at must be in the future');
    }

    // Validate user agent
    if (docData.user_agent && !validators.validateUserAgent(docData.user_agent)) {
        errors.push('Invalid user_agent format');
    }

    // Validate IP address
    if (docData.ip_address && !validators.validateIPAddress(docData.ip_address)) {
        errors.push('Invalid ip_address format');
    }

    if (errors.length > 0) {
        throw new Error(`User session validation failed: ${errors.join(', ')}`);
    }

    return docData;
}

// Export all validation functions
export const schemaValidators = {
    validateUserDocument,
    validateGameDocument,
    validateRoomDocument,
    validateGameTrickDocument,
    validateUserSessionDocument
};

export default schemaValidators;