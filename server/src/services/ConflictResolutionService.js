/**
 * Conflict Resolution Service
 * Handles data conflicts in RxDB with different resolution strategies
 */
class ConflictResolutionService {
    
    /**
     * Last-write-wins strategy for user data
     * @param {Object} currentDoc - Current document in database
     * @param {Object} incomingDoc - Incoming document with changes
     * @returns {Object} Resolved document
     */
    static lastWriteWins(currentDoc, incomingDoc) {
        // Simple last-write-wins based on updated_at timestamp
        const currentTime = new Date(currentDoc.updated_at || 0).getTime();
        const incomingTime = new Date(incomingDoc.updated_at || 0).getTime();
        
        if (incomingTime >= currentTime) {
            console.log('[ConflictResolution] Last-write-wins: Using incoming document');
            return {
                ...incomingDoc,
                updated_at: new Date().toISOString()
            };
        } else {
            console.log('[ConflictResolution] Last-write-wins: Keeping current document');
            return currentDoc;
        }
    }

    /**
     * Custom merge strategy for game state conflicts
     * @param {Object} currentDoc - Current game document
     * @param {Object} incomingDoc - Incoming game document with changes
     * @returns {Object} Merged document
     */
    static mergeGameState(currentDoc, incomingDoc) {
        console.log('[ConflictResolution] Merging game state conflicts');
        
        const merged = { ...currentDoc };
        
        // Merge game_state if both exist
        if (currentDoc.game_state && incomingDoc.game_state) {
            merged.game_state = {
                ...currentDoc.game_state,
                ...incomingDoc.game_state
            };
            
            // Handle specific game state conflicts
            if (incomingDoc.game_state.current_round !== undefined) {
                merged.game_state.current_round = Math.max(
                    currentDoc.game_state.current_round || 0,
                    incomingDoc.game_state.current_round || 0
                );
            }
            
            if (incomingDoc.game_state.current_trick !== undefined) {
                merged.game_state.current_trick = Math.max(
                    currentDoc.game_state.current_trick || 0,
                    incomingDoc.game_state.current_trick || 0
                );
            }
        } else if (incomingDoc.game_state) {
            merged.game_state = incomingDoc.game_state;
        }
        
        // Always use the latest status if provided
        if (incomingDoc.status) {
            merged.status = incomingDoc.status;
        }
        
        // Update timestamp
        merged.updated_at = new Date().toISOString();
        
        return merged;
    }

    /**
     * Version-based resolution for room state changes
     * @param {Object} currentDoc - Current room document
     * @param {Object} incomingDoc - Incoming room document with changes
     * @returns {Object} Resolved document
     */
    static versionBasedResolution(currentDoc, incomingDoc) {
        console.log('[ConflictResolution] Version-based resolution for room state');
        
        const currentVersion = currentDoc.version || 0;
        const incomingVersion = incomingDoc.version || 0;
        
        if (incomingVersion > currentVersion) {
            console.log(`[ConflictResolution] Using incoming version ${incomingVersion} over current ${currentVersion}`);
            return {
                ...incomingDoc,
                version: incomingVersion + 1,
                updated_at: new Date().toISOString()
            };
        } else if (incomingVersion === currentVersion) {
            // Same version, merge non-conflicting fields
            console.log('[ConflictResolution] Same version, merging compatible fields');
            const merged = { ...currentDoc };
            
            // Merge settings if both exist
            if (currentDoc.settings && incomingDoc.settings) {
                merged.settings = {
                    ...currentDoc.settings,
                    ...incomingDoc.settings
                };
            } else if (incomingDoc.settings) {
                merged.settings = incomingDoc.settings;
            }
            
            // Update version and timestamp
            merged.version = currentVersion + 1;
            merged.updated_at = new Date().toISOString();
            
            return merged;
        } else {
            console.log(`[ConflictResolution] Keeping current version ${currentVersion} over older ${incomingVersion}`);
            return currentDoc;
        }
    }

    /**
     * Resolve conflicts based on document type
     * @param {string} collectionName - Name of the collection
     * @param {Object} currentDoc - Current document
     * @param {Object} incomingDoc - Incoming document
     * @returns {Object} Resolved document
     */
    static resolveConflict(collectionName, currentDoc, incomingDoc) {
        console.log(`[ConflictResolution] Resolving conflict for collection: ${collectionName}`);
        
        switch (collectionName) {
            case 'users':
            case 'userSessions':
                return this.lastWriteWins(currentDoc, incomingDoc);
                
            case 'games':
            case 'gameRounds':
            case 'gameTricks':
                return this.mergeGameState(currentDoc, incomingDoc);
                
            case 'rooms':
            case 'roomPlayers':
                return this.versionBasedResolution(currentDoc, incomingDoc);
                
            default:
                console.warn(`[ConflictResolution] No specific strategy for ${collectionName}, using last-write-wins`);
                return this.lastWriteWins(currentDoc, incomingDoc);
        }
    }

    /**
     * Handle RxDB conflict resolution
     * @param {Object} conflict - RxDB conflict object
     * @returns {Object} Resolved document
     */
    static handleRxDBConflict(conflict) {
        console.log('[ConflictResolution] Handling RxDB conflict:', conflict.id);
        
        const collectionName = conflict.collection.name;
        const currentDoc = conflict.documentInDb;
        const incomingDoc = conflict.newDocumentState;
        
        return this.resolveConflict(collectionName, currentDoc, incomingDoc);
    }
}

export default ConflictResolutionService;