/**
 * Conflict Resolution Service
 * Implements various conflict resolution strategies for RxDB document conflicts
 * Handles user data, game state, and room state conflicts
 */
class ConflictResolutionService {
  constructor() {
    this.strategies = {
      'last-write-wins': this.lastWriteWinsStrategy.bind(this),
      'merge-fields': this.mergeFieldsStrategy.bind(this),
      'version-based': this.versionBasedStrategy.bind(this),
      'user-data': this.resolveUserConflict.bind(this),
      'game-state': this.resolveGameStateConflict.bind(this),
      'room-state': this.resolveRoomConflict.bind(this)
    };
    
    console.log('[ConflictResolutionService] Initialized with conflict resolution strategies');
  }

  /**
   * Resolve conflict using specified strategy
   * @param {Object} localDoc - Local document version
   * @param {Object} remoteDoc - Remote document version
   * @param {string} strategy - Conflict resolution strategy name
   * @param {Object} context - Additional context for resolution
   * @returns {Object} Resolved document
   */
  resolveConflict(localDoc, remoteDoc, strategy = 'last-write-wins', context = {}) {
    try {
      const resolverFunction = this.strategies[strategy];
      if (!resolverFunction) {
        console.warn(`[ConflictResolutionService] Unknown strategy '${strategy}', using last-write-wins`);
        return this.lastWriteWinsStrategy(localDoc, remoteDoc, context);
      }

      const resolved = resolverFunction(localDoc, remoteDoc, context);
      
      console.log(`[ConflictResolutionService] Resolved conflict using '${strategy}' strategy`);
      return resolved;
    } catch (error) {
      console.error(`[ConflictResolutionService] Error resolving conflict with '${strategy}':`, error.message);
      // Fallback to remote document in case of resolution error
      return remoteDoc;
    }
  }

  /**
   * Last-write-wins strategy - chooses document with latest timestamp
   * @param {Object} localDoc - Local document version
   * @param {Object} remoteDoc - Remote document version
   * @param {Object} context - Additional context
   * @returns {Object} Document with latest timestamp
   */
  lastWriteWinsStrategy(localDoc, remoteDoc, context = {}) {
    try {
      const localTime = this._getDocumentTimestamp(localDoc);
      const remoteTime = this._getDocumentTimestamp(remoteDoc);
      
      const winner = localTime > remoteTime ? localDoc : remoteDoc;
      
      console.log(`[ConflictResolutionService] Last-write-wins: ${localTime > remoteTime ? 'local' : 'remote'} document wins`);
      return { ...winner, updated_at: new Date().toISOString() };
    } catch (error) {
      console.error(`[ConflictResolutionService] Error in last-write-wins strategy:`, error.message);
      return remoteDoc;
    }
  }

  /**
   * Merge fields strategy - intelligently merges non-conflicting fields
   * @param {Object} localDoc - Local document version
   * @param {Object} remoteDoc - Remote document version
   * @param {Object} context - Additional context
   * @returns {Object} Merged document
   */
  mergeFieldsStrategy(localDoc, remoteDoc, context = {}) {
    try {
      const merged = { ...localDoc };
      const conflictFields = context.conflictFields || [];
      
      // Merge non-conflicting fields from remote
      for (const [key, value] of Object.entries(remoteDoc)) {
        if (this._shouldMergeField(key, value, localDoc, conflictFields)) {
          merged[key] = value;
        }
      }
      
      // Handle specific conflict fields with custom logic
      for (const field of conflictFields) {
        if (localDoc[field] !== undefined && remoteDoc[field] !== undefined) {
          merged[field] = this._resolveFieldConflict(field, localDoc[field], remoteDoc[field], context);
        }
      }
      
      // Update timestamp
      merged.updated_at = new Date().toISOString();
      
      console.log(`[ConflictResolutionService] Merged fields strategy completed`);
      return merged;
    } catch (error) {
      console.error(`[ConflictResolutionService] Error in merge-fields strategy:`, error.message);
      return this.lastWriteWinsStrategy(localDoc, remoteDoc, context);
    }
  }

  /**
   * Version-based strategy - uses document version numbers
   * @param {Object} localDoc - Local document version
   * @param {Object} remoteDoc - Remote document version
   * @param {Object} context - Additional context
   * @returns {Object} Document with higher version
   */
  versionBasedStrategy(localDoc, remoteDoc, context = {}) {
    try {
      const localVersion = localDoc.version || 1;
      const remoteVersion = remoteDoc.version || 1;
      
      if (remoteVersion > localVersion) {
        console.log(`[ConflictResolutionService] Version-based: remote version ${remoteVersion} > local version ${localVersion}`);
        return { ...remoteDoc, updated_at: new Date().toISOString() };
      } else if (localVersion > remoteVersion) {
        console.log(`[ConflictResolutionService] Version-based: local version ${localVersion} > remote version ${remoteVersion}`);
        return { ...localDoc, updated_at: new Date().toISOString() };
      } else {
        // Same version, use last-write-wins as fallback
        console.log(`[ConflictResolutionService] Version-based: same version ${localVersion}, falling back to last-write-wins`);
        return this.lastWriteWinsStrategy(localDoc, remoteDoc, context);
      }
    } catch (error) {
      console.error(`[ConflictResolutionService] Error in version-based strategy:`, error.message);
      return this.lastWriteWinsStrategy(localDoc, remoteDoc, context);
    }
  }

  /**
   * Resolve user data conflicts - uses last-write-wins for user data
   * @param {Object} localDoc - Local user document
   * @param {Object} remoteDoc - Remote user document
   * @param {Object} context - Additional context
   * @returns {Object} Resolved user document
   */
  resolveUserConflict(localDoc, remoteDoc, context = {}) {
    try {
      // For user data, we generally prefer last-write-wins
      // but preserve certain fields that should not be overwritten
      const preserveFields = ['user_id', 'created_at', 'password_hash'];
      const resolved = this.lastWriteWinsStrategy(localDoc, remoteDoc, context);
      
      // Preserve critical fields from local document
      for (const field of preserveFields) {
        if (localDoc[field] !== undefined) {
          resolved[field] = localDoc[field];
        }
      }
      
      // Merge statistics (take the higher values)
      if (localDoc.total_games_played !== undefined && remoteDoc.total_games_played !== undefined) {
        resolved.total_games_played = Math.max(localDoc.total_games_played, remoteDoc.total_games_played);
      }
      
      if (localDoc.total_games_won !== undefined && remoteDoc.total_games_won !== undefined) {
        resolved.total_games_won = Math.max(localDoc.total_games_won, remoteDoc.total_games_won);
      }
      
      console.log(`[ConflictResolutionService] Resolved user conflict for user ${resolved.user_id}`);
      return resolved;
    } catch (error) {
      console.error(`[ConflictResolutionService] Error resolving user conflict:`, error.message);
      return this.lastWriteWinsStrategy(localDoc, remoteDoc, context);
    }
  }

  /**
   * Resolve game state conflicts - uses custom merge strategy for game state
   * @param {Object} localDoc - Local game document
   * @param {Object} remoteDoc - Remote game document
   * @param {Object} context - Additional context
   * @returns {Object} Resolved game document
   */
  resolveGameStateConflict(localDoc, remoteDoc, context = {}) {
    try {
      // For game state, we need to be more careful about which fields to merge
      const resolved = { ...localDoc };
      
      // Critical fields that should use version-based or timestamp-based resolution
      const criticalFields = ['status', 'started_at', 'completed_at', 'winning_team_id'];
      
      // Use the document with the latest status change for critical fields
      const localStatusTime = this._getDocumentTimestamp(localDoc);
      const remoteStatusTime = this._getDocumentTimestamp(remoteDoc);
      
      if (remoteStatusTime > localStatusTime) {
        for (const field of criticalFields) {
          if (remoteDoc[field] !== undefined) {
            resolved[field] = remoteDoc[field];
          }
        }
      }
      
      // For game progression, always take the furthest progress
      if (this._isGameMoreProgressed(remoteDoc, localDoc)) {
        resolved.status = remoteDoc.status;
        resolved.started_at = remoteDoc.started_at || resolved.started_at;
        resolved.completed_at = remoteDoc.completed_at || resolved.completed_at;
        resolved.winning_team_id = remoteDoc.winning_team_id || resolved.winning_team_id;
      }
      
      // Preserve immutable fields
      resolved.game_id = localDoc.game_id;
      resolved.game_code = localDoc.game_code;
      resolved.host_id = localDoc.host_id;
      resolved.created_at = localDoc.created_at;
      
      resolved.updated_at = new Date().toISOString();
      
      console.log(`[ConflictResolutionService] Resolved game state conflict for game ${resolved.game_id}`);
      return resolved;
    } catch (error) {
      console.error(`[ConflictResolutionService] Error resolving game state conflict:`, error.message);
      return this.lastWriteWinsStrategy(localDoc, remoteDoc, context);
    }
  }

  /**
   * Resolve room state conflicts - uses version-based resolution for room state changes
   * @param {Object} localDoc - Local room document
   * @param {Object} remoteDoc - Remote room document
   * @param {Object} context - Additional context
   * @returns {Object} Resolved room document
   */
  resolveRoomConflict(localDoc, remoteDoc, context = {}) {
    try {
      // Room state conflicts are resolved using version numbers when available
      if (localDoc.version !== undefined && remoteDoc.version !== undefined) {
        const resolved = this.versionBasedStrategy(localDoc, remoteDoc, context);
        
        // Increment version for the resolved document
        resolved.version = Math.max(localDoc.version, remoteDoc.version) + 1;
        
        console.log(`[ConflictResolutionService] Resolved room conflict using version-based strategy, new version: ${resolved.version}`);
        return resolved;
      }
      
      // Fallback to merge strategy for rooms without version numbers
      const resolved = { ...localDoc };
      
      // Merge game_state intelligently
      if (remoteDoc.game_state && localDoc.game_state) {
        resolved.game_state = this._mergeGameState(localDoc.game_state, remoteDoc.game_state);
      } else if (remoteDoc.game_state) {
        resolved.game_state = remoteDoc.game_state;
      }
      
      // Merge settings
      if (remoteDoc.settings && localDoc.settings) {
        resolved.settings = { ...localDoc.settings, ...remoteDoc.settings };
      } else if (remoteDoc.settings) {
        resolved.settings = remoteDoc.settings;
      }
      
      // Use latest status change
      const localTime = this._getDocumentTimestamp(localDoc);
      const remoteTime = this._getDocumentTimestamp(remoteDoc);
      
      if (remoteTime > localTime) {
        resolved.status = remoteDoc.status;
        resolved.started_at = remoteDoc.started_at || resolved.started_at;
        resolved.finished_at = remoteDoc.finished_at || resolved.finished_at;
      }
      
      // Preserve immutable fields
      resolved.room_id = localDoc.room_id;
      resolved.owner_id = localDoc.owner_id;
      resolved.created_at = localDoc.created_at;
      
      resolved.updated_at = new Date().toISOString();
      resolved.version = (resolved.version || 1) + 1;
      
      console.log(`[ConflictResolutionService] Resolved room conflict for room ${resolved.room_id}`);
      return resolved;
    } catch (error) {
      console.error(`[ConflictResolutionService] Error resolving room conflict:`, error.message);
      return this.lastWriteWinsStrategy(localDoc, remoteDoc, context);
    }
  }

  /**
   * Get document timestamp for comparison
   * @private
   */
  _getDocumentTimestamp(doc) {
    return new Date(doc.updated_at || doc.created_at || 0);
  }

  /**
   * Check if a field should be merged
   * @private
   */
  _shouldMergeField(key, value, localDoc, conflictFields) {
    // Don't merge system fields
    if (['updated_at', 'version'].includes(key)) {
      return false;
    }
    
    // Don't merge if it's a conflict field (handled separately)
    if (conflictFields.includes(key)) {
      return false;
    }
    
    // Merge if local doesn't have the field or it's null/undefined
    return !localDoc.hasOwnProperty(key) || localDoc[key] === null || localDoc[key] === undefined;
  }

  /**
   * Resolve individual field conflicts
   * @private
   */
  _resolveFieldConflict(field, localValue, remoteValue, context) {
    // Custom field resolution logic
    switch (field) {
      case 'current_score':
        // For scores, take the higher value
        return Math.max(localValue, remoteValue);
      
      case 'is_ready':
        // For ready status, prefer true (ready) over false
        return localValue || remoteValue;
      
      case 'team_assignment':
        // For team assignments, prefer non-null values
        return localValue !== null ? localValue : remoteValue;
      
      default:
        // Default to remote value for unknown fields
        return remoteValue;
    }
  }

  /**
   * Check if a game is more progressed than another
   * @private
   */
  _isGameMoreProgressed(gameA, gameB) {
    const statusOrder = ['waiting', 'in_progress', 'completed', 'cancelled'];
    const statusAIndex = statusOrder.indexOf(gameA.status);
    const statusBIndex = statusOrder.indexOf(gameB.status);
    
    return statusAIndex > statusBIndex;
  }

  /**
   * Merge game state objects intelligently
   * @private
   */
  _mergeGameState(localGameState, remoteGameState) {
    const merged = { ...localGameState };
    
    // Take the higher round number
    if (remoteGameState.currentRound > (localGameState.currentRound || 0)) {
      merged.currentRound = remoteGameState.currentRound;
      merged.currentTrick = remoteGameState.currentTrick;
      merged.phase = remoteGameState.phase;
    }
    
    // Merge scores (take higher values)
    if (remoteGameState.scores && localGameState.scores) {
      merged.scores = {};
      for (const [team, score] of Object.entries(localGameState.scores)) {
        merged.scores[team] = Math.max(score, remoteGameState.scores[team] || 0);
      }
      // Add any new teams from remote
      for (const [team, score] of Object.entries(remoteGameState.scores)) {
        if (!merged.scores[team]) {
          merged.scores[team] = score;
        }
      }
    } else if (remoteGameState.scores) {
      merged.scores = remoteGameState.scores;
    }
    
    // Merge player hands (prefer non-empty hands)
    if (remoteGameState.playerHands && localGameState.playerHands) {
      merged.playerHands = { ...localGameState.playerHands };
      for (const [playerId, hand] of Object.entries(remoteGameState.playerHands)) {
        if (!merged.playerHands[playerId] || merged.playerHands[playerId].length === 0) {
          merged.playerHands[playerId] = hand;
        }
      }
    } else if (remoteGameState.playerHands) {
      merged.playerHands = remoteGameState.playerHands;
    }
    
    // Use remote trump suit if local doesn't have one
    if (!merged.trumpSuit && remoteGameState.trumpSuit) {
      merged.trumpSuit = remoteGameState.trumpSuit;
    }
    
    return merged;
  }

  /**
   * Get available conflict resolution strategies
   * @returns {Array<string>} Array of strategy names
   */
  getAvailableStrategies() {
    return Object.keys(this.strategies);
  }

  /**
   * Validate conflict resolution strategy
   * @param {string} strategy - Strategy name to validate
   * @returns {boolean} True if strategy is valid
   */
  isValidStrategy(strategy) {
    return this.strategies.hasOwnProperty(strategy);
  }
}

export default ConflictResolutionService;