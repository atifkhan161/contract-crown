/**
 * Data Transformation Service
 * Handles transformation of data between MariaDB and RxDB formats
 * Includes timestamp conversion, foreign key mapping, and JSON field handling
 */
class DataTransformationService {
    constructor() {
        // Define field mappings between MariaDB and RxDB
        this.fieldMappings = {
            // Common timestamp fields that need ISO 8601 conversion
            timestampFields: [
                'created_at', 'updated_at', 'started_at', 'finished_at',
                'completed_at', 'last_login', 'expires_at', 'last_used_at',
                'joined_at', 'round_completed_at'
            ],
            
            // JSON fields that need parsing/stringifying
            jsonFields: {
                'rooms': ['game_state', 'settings'],
                'game_players': ['current_hand'],
                'game_tricks': ['cards_played']
            },
            
            // Foreign key relationships for reference mapping
            foreignKeys: {
                'games': {
                    'host_id': { table: 'users', field: 'user_id' },
                    'winning_team_id': { table: 'teams', field: 'team_id' }
                },
                'teams': {
                    'game_id': { table: 'games', field: 'game_id' },
                    'player1_id': { table: 'users', field: 'user_id' },
                    'player2_id': { table: 'users', field: 'user_id' }
                },
                'game_players': {
                    'game_id': { table: 'games', field: 'game_id' },
                    'user_id': { table: 'users', field: 'user_id' },
                    'team_id': { table: 'teams', field: 'team_id' }
                },
                'game_rounds': {
                    'game_id': { table: 'games', field: 'game_id' },
                    'dealer_user_id': { table: 'users', field: 'user_id' },
                    'first_player_user_id': { table: 'users', field: 'user_id' },
                    'declaring_team_id': { table: 'teams', field: 'team_id' }
                },
                'game_tricks': {
                    'round_id': { table: 'game_rounds', field: 'round_id' },
                    'leading_player_id': { table: 'users', field: 'user_id' },
                    'winning_player_id': { table: 'users', field: 'user_id' }
                },
                'rooms': {
                    'owner_id': { table: 'users', field: 'user_id' }
                },
                'room_players': {
                    'room_id': { table: 'rooms', field: 'room_id' },
                    'user_id': { table: 'users', field: 'user_id' }
                },
                'user_sessions': {
                    'user_id': { table: 'users', field: 'user_id' }
                }
            }
        };
    }

    /**
     * Transform MariaDB data to RxDB format
     * @param {string} tableName - Name of the table
     * @param {Array} mariadbData - Array of records from MariaDB
     * @returns {Promise<Array>} Transformed data for RxDB
     */
    async transformMariaDBToRxDB(tableName, mariadbData) {
        try {
            console.log(`[DataTransformation] Transforming ${mariadbData.length} records from ${tableName} (MariaDB → RxDB)`);
            
            const transformedData = [];
            
            for (let i = 0; i < mariadbData.length; i++) {
                const record = mariadbData[i];
                
                try {
                    const transformedRecord = await this.transformSingleRecord(tableName, record, 'mariadb-to-rxdb');
                    transformedData.push(transformedRecord);
                } catch (recordError) {
                    console.error(`[DataTransformation] Error transforming record ${i} in ${tableName}:`, recordError.message);
                    // Include original record with error marker
                    record._transformation_error = recordError.message;
                    transformedData.push(record);
                }
            }
            
            console.log(`[DataTransformation] Successfully transformed ${transformedData.length} records for ${tableName}`);
            return transformedData;
            
        } catch (error) {
            console.error(`[DataTransformation] Error transforming ${tableName} data:`, error.message);
            throw error;
        }
    }

    /**
     * Transform RxDB data back to MariaDB format (for rollback)
     * @param {string} tableName - Name of the table
     * @param {Array} rxdbData - Array of records from RxDB
     * @returns {Promise<Array>} Transformed data for MariaDB
     */
    async transformRxDBToMariaDB(tableName, rxdbData) {
        try {
            console.log(`[DataTransformation] Transforming ${rxdbData.length} records from ${tableName} (RxDB → MariaDB)`);
            
            const transformedData = [];
            
            for (let i = 0; i < rxdbData.length; i++) {
                const record = rxdbData[i];
                
                try {
                    const transformedRecord = await this.transformSingleRecord(tableName, record, 'rxdb-to-mariadb');
                    transformedData.push(transformedRecord);
                } catch (recordError) {
                    console.error(`[DataTransformation] Error transforming record ${i} in ${tableName}:`, recordError.message);
                    // Include original record with error marker
                    record._transformation_error = recordError.message;
                    transformedData.push(record);
                }
            }
            
            console.log(`[DataTransformation] Successfully transformed ${transformedData.length} records for ${tableName}`);
            return transformedData;
            
        } catch (error) {
            console.error(`[DataTransformation] Error transforming ${tableName} data:`, error.message);
            throw error;
        }
    }

    /**
     * Transform a single record between formats
     * @param {string} tableName - Name of the table
     * @param {Object} record - Record to transform
     * @param {string} direction - 'mariadb-to-rxdb' or 'rxdb-to-mariadb'
     * @returns {Promise<Object>} Transformed record
     */
    async transformSingleRecord(tableName, record, direction) {
        try {
            const transformedRecord = { ...record };
            
            // Remove any previous transformation error markers
            delete transformedRecord._transformation_error;
            delete transformedRecord._validation_errors;
            delete transformedRecord._processing_error;
            
            // Transform timestamps
            await this.transformTimestamps(transformedRecord, direction);
            
            // Transform JSON fields
            await this.transformJsonFields(tableName, transformedRecord, direction);
            
            // Transform foreign key relationships (maintain as string references)
            await this.transformForeignKeys(tableName, transformedRecord, direction);
            
            // Apply table-specific transformations
            await this.applyTableSpecificTransformations(tableName, transformedRecord, direction);
            
            return transformedRecord;
            
        } catch (error) {
            console.error(`[DataTransformation] Error transforming single record in ${tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Transform timestamp fields between MariaDB and RxDB formats
     * @param {Object} record - Record to transform
     * @param {string} direction - Transformation direction
     */
    async transformTimestamps(record, direction) {
        try {
            for (const field of this.fieldMappings.timestampFields) {
                if (record[field] !== null && record[field] !== undefined) {
                    if (direction === 'mariadb-to-rxdb') {
                        // Convert MariaDB timestamp to ISO 8601 string
                        if (record[field] instanceof Date) {
                            record[field] = record[field].toISOString();
                        } else if (typeof record[field] === 'string') {
                            // Handle string timestamps from MariaDB
                            const date = new Date(record[field]);
                            if (!isNaN(date.getTime())) {
                                record[field] = date.toISOString();
                            } else {
                                console.warn(`[DataTransformation] Invalid timestamp in field ${field}: ${record[field]}`);
                                record[field] = null;
                            }
                        }
                    } else if (direction === 'rxdb-to-mariadb') {
                        // Convert ISO 8601 string back to Date object for MariaDB
                        if (typeof record[field] === 'string') {
                            const date = new Date(record[field]);
                            if (!isNaN(date.getTime())) {
                                record[field] = date;
                            } else {
                                console.warn(`[DataTransformation] Invalid ISO timestamp in field ${field}: ${record[field]}`);
                                record[field] = null;
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[DataTransformation] Error transforming timestamps:', error.message);
            throw error;
        }
    }

    /**
     * Transform JSON fields between string and object formats
     * @param {string} tableName - Name of the table
     * @param {Object} record - Record to transform
     * @param {string} direction - Transformation direction
     */
    async transformJsonFields(tableName, record, direction) {
        try {
            const jsonFields = this.fieldMappings.jsonFields[tableName] || [];
            
            for (const field of jsonFields) {
                if (record[field] !== null && record[field] !== undefined) {
                    if (direction === 'mariadb-to-rxdb') {
                        // Parse JSON strings to objects for RxDB
                        if (typeof record[field] === 'string') {
                            try {
                                record[field] = JSON.parse(record[field]);
                            } catch (parseError) {
                                console.warn(`[DataTransformation] Invalid JSON in ${tableName}.${field}:`, parseError.message);
                                record[field] = this.getDefaultJsonValue(tableName, field);
                            }
                        }
                    } else if (direction === 'rxdb-to-mariadb') {
                        // Stringify objects to JSON strings for MariaDB
                        if (typeof record[field] === 'object') {
                            try {
                                record[field] = JSON.stringify(record[field]);
                            } catch (stringifyError) {
                                console.warn(`[DataTransformation] Error stringifying JSON in ${tableName}.${field}:`, stringifyError.message);
                                record[field] = JSON.stringify(this.getDefaultJsonValue(tableName, field));
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`[DataTransformation] Error transforming JSON fields for ${tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Get default JSON value for a field
     * @param {string} tableName - Name of the table
     * @param {string} fieldName - Name of the field
     * @returns {*} Default value for the JSON field
     */
    getDefaultJsonValue(tableName, fieldName) {
        const defaults = {
            'rooms': {
                'game_state': null,
                'settings': {
                    timeLimit: 30,
                    allowSpectators: true,
                    autoStart: false
                }
            },
            'game_players': {
                'current_hand': null
            },
            'game_tricks': {
                'cards_played': []
            }
        };
        
        return defaults[tableName]?.[fieldName] || null;
    }

    /**
     * Transform foreign key relationships (maintain as string references)
     * @param {string} tableName - Name of the table
     * @param {Object} record - Record to transform
     * @param {string} direction - Transformation direction
     */
    async transformForeignKeys(tableName, record, direction) {
        try {
            const foreignKeys = this.fieldMappings.foreignKeys[tableName] || {};
            
            // For now, we maintain foreign keys as string references
            // In the future, this could be extended to create RxDB document references
            for (const [fieldName, relationship] of Object.entries(foreignKeys)) {
                if (record[fieldName] !== null && record[fieldName] !== undefined) {
                    // Ensure foreign key is a string (RxDB uses string IDs)
                    if (typeof record[fieldName] !== 'string') {
                        record[fieldName] = String(record[fieldName]);
                    }
                    
                    // Add metadata about the relationship (for future use)
                    if (direction === 'mariadb-to-rxdb') {
                        // Could add relationship metadata here if needed
                        // record[`_${fieldName}_ref`] = relationship;
                    }
                }
            }
        } catch (error) {
            console.error(`[DataTransformation] Error transforming foreign keys for ${tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Apply table-specific transformations
     * @param {string} tableName - Name of the table
     * @param {Object} record - Record to transform
     * @param {string} direction - Transformation direction
     */
    async applyTableSpecificTransformations(tableName, record, direction) {
        try {
            switch (tableName) {
                case 'users':
                    await this.transformUsersTable(record, direction);
                    break;
                    
                case 'games':
                    await this.transformGamesTable(record, direction);
                    break;
                    
                case 'rooms':
                    await this.transformRoomsTable(record, direction);
                    break;
                    
                case 'teams':
                    await this.transformTeamsTable(record, direction);
                    break;
                    
                case 'game_players':
                    await this.transformGamePlayersTable(record, direction);
                    break;
                    
                case 'game_rounds':
                    await this.transformGameRoundsTable(record, direction);
                    break;
                    
                case 'game_tricks':
                    await this.transformGameTricksTable(record, direction);
                    break;
                    
                case 'room_players':
                    await this.transformRoomPlayersTable(record, direction);
                    break;
                    
                case 'user_sessions':
                    await this.transformUserSessionsTable(record, direction);
                    break;
            }
        } catch (error) {
            console.error(`[DataTransformation] Error in table-specific transformation for ${tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Transform users table records
     */
    async transformUsersTable(record, direction) {
        // Ensure boolean fields are properly typed
        if (record.is_active !== null && record.is_active !== undefined) {
            record.is_active = Boolean(record.is_active);
        }
        if (record.is_bot !== null && record.is_bot !== undefined) {
            record.is_bot = Boolean(record.is_bot);
        }
        
        // Ensure numeric fields are properly typed
        if (record.total_games_played !== null && record.total_games_played !== undefined) {
            record.total_games_played = Number(record.total_games_played);
        }
        if (record.total_games_won !== null && record.total_games_won !== undefined) {
            record.total_games_won = Number(record.total_games_won);
        }
    }

    /**
     * Transform games table records
     */
    async transformGamesTable(record, direction) {
        // Ensure numeric fields are properly typed
        if (record.target_score !== null && record.target_score !== undefined) {
            record.target_score = Number(record.target_score);
        }
        
        // Ensure boolean fields are properly typed
        if (record.is_demo_mode !== null && record.is_demo_mode !== undefined) {
            record.is_demo_mode = Boolean(record.is_demo_mode);
        }
        
        // Validate status enum
        const validStatuses = ['waiting', 'in_progress', 'completed', 'cancelled'];
        if (record.status && !validStatuses.includes(record.status)) {
            console.warn(`[DataTransformation] Invalid game status: ${record.status}, defaulting to 'waiting'`);
            record.status = 'waiting';
        }
    }

    /**
     * Transform rooms table records
     */
    async transformRoomsTable(record, direction) {
        // Ensure numeric fields are properly typed
        if (record.max_players !== null && record.max_players !== undefined) {
            record.max_players = Number(record.max_players);
        }
        if (record.version !== null && record.version !== undefined) {
            record.version = Number(record.version);
        }
        
        // Ensure boolean fields are properly typed
        if (record.is_private !== null && record.is_private !== undefined) {
            record.is_private = Boolean(record.is_private);
        }
        
        // Validate status enum
        const validStatuses = ['waiting', 'playing', 'finished'];
        if (record.status && !validStatuses.includes(record.status)) {
            console.warn(`[DataTransformation] Invalid room status: ${record.status}, defaulting to 'waiting'`);
            record.status = 'waiting';
        }
    }

    /**
     * Transform teams table records
     */
    async transformTeamsTable(record, direction) {
        // Ensure numeric fields are properly typed
        if (record.team_number !== null && record.team_number !== undefined) {
            record.team_number = Number(record.team_number);
        }
        if (record.current_score !== null && record.current_score !== undefined) {
            record.current_score = Number(record.current_score);
        }
        
        // Validate team_number
        if (record.team_number && ![1, 2].includes(record.team_number)) {
            console.warn(`[DataTransformation] Invalid team_number: ${record.team_number}, defaulting to 1`);
            record.team_number = 1;
        }
    }

    /**
     * Transform game_players table records
     */
    async transformGamePlayersTable(record, direction) {
        // Ensure numeric fields are properly typed
        if (record.seat_position !== null && record.seat_position !== undefined) {
            record.seat_position = Number(record.seat_position);
        }
        if (record.tricks_won_current_round !== null && record.tricks_won_current_round !== undefined) {
            record.tricks_won_current_round = Number(record.tricks_won_current_round);
        }
        
        // Ensure boolean fields are properly typed
        if (record.is_ready !== null && record.is_ready !== undefined) {
            record.is_ready = Boolean(record.is_ready);
        }
        if (record.is_host !== null && record.is_host !== undefined) {
            record.is_host = Boolean(record.is_host);
        }
    }

    /**
     * Transform game_rounds table records
     */
    async transformGameRoundsTable(record, direction) {
        // Ensure numeric fields are properly typed
        if (record.round_number !== null && record.round_number !== undefined) {
            record.round_number = Number(record.round_number);
        }
        if (record.declaring_team_tricks_won !== null && record.declaring_team_tricks_won !== undefined) {
            record.declaring_team_tricks_won = Number(record.declaring_team_tricks_won);
        }
        if (record.challenging_team_tricks_won !== null && record.challenging_team_tricks_won !== undefined) {
            record.challenging_team_tricks_won = Number(record.challenging_team_tricks_won);
        }
        
        // Validate trump_suit enum
        const validSuits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
        if (record.trump_suit && !validSuits.includes(record.trump_suit)) {
            console.warn(`[DataTransformation] Invalid trump_suit: ${record.trump_suit}, setting to null`);
            record.trump_suit = null;
        }
    }

    /**
     * Transform game_tricks table records
     */
    async transformGameTricksTable(record, direction) {
        // Ensure numeric fields are properly typed
        if (record.trick_number !== null && record.trick_number !== undefined) {
            record.trick_number = Number(record.trick_number);
        }
    }

    /**
     * Transform room_players table records
     */
    async transformRoomPlayersTable(record, direction) {
        // Ensure boolean fields are properly typed
        if (record.is_ready !== null && record.is_ready !== undefined) {
            record.is_ready = Boolean(record.is_ready);
        }
        
        // Ensure numeric fields are properly typed
        if (record.team_assignment !== null && record.team_assignment !== undefined) {
            record.team_assignment = Number(record.team_assignment);
        }
        
        // Validate team_assignment
        if (record.team_assignment && ![1, 2].includes(record.team_assignment)) {
            console.warn(`[DataTransformation] Invalid team_assignment: ${record.team_assignment}, setting to null`);
            record.team_assignment = null;
        }
    }

    /**
     * Transform user_sessions table records
     */
    async transformUserSessionsTable(record, direction) {
        // No specific transformations needed for user_sessions
        // All fields are strings or timestamps which are handled by general transformations
    }

    /**
     * Validate transformed data integrity
     * @param {string} tableName - Name of the table
     * @param {Array} transformedData - Transformed data to validate
     * @returns {Promise<Object>} Validation result
     */
    async validateTransformedData(tableName, transformedData) {
        try {
            const validationResult = {
                isValid: true,
                totalRecords: transformedData.length,
                validRecords: 0,
                invalidRecords: 0,
                errors: []
            };
            
            for (let i = 0; i < transformedData.length; i++) {
                const record = transformedData[i];
                
                if (record._transformation_error) {
                    validationResult.invalidRecords++;
                    validationResult.errors.push({
                        recordIndex: i,
                        error: record._transformation_error
                    });
                } else {
                    validationResult.validRecords++;
                }
            }
            
            if (validationResult.invalidRecords > 0) {
                validationResult.isValid = false;
            }
            
            console.log(`[DataTransformation] Validation result for ${tableName}: ${validationResult.validRecords}/${validationResult.totalRecords} valid records`);
            
            return validationResult;
            
        } catch (error) {
            console.error(`[DataTransformation] Error validating transformed data for ${tableName}:`, error.message);
            throw error;
        }
    }
}

export default DataTransformationService;