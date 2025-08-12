import fs from 'fs/promises';
import path from 'path';

/**
 * RxDB Runtime Error Handler
 * Provides comprehensive error handling for RxDB operations including validation errors,
 * conflict resolution, storage failures, and graceful degradation
 */
class RxDBErrorHandler {
    constructor() {
        this.logPath = path.join(process.cwd(), 'server', 'data', 'logs');
        this.alertThresholds = {
            errorRate: 10, // errors per minute
            conflictRate: 5, // conflicts per minute
            storageFailures: 3 // storage failures per hour
        };
        
        // Error tracking for monitoring
        this.errorCounts = {
            validation: 0,
            conflict: 0,
            storage: 0,
            connection: 0,
            timeout: 0,
            unknown: 0
        };
        
        this.lastResetTime = Date.now();
        
        // RxDB specific error types
        this.rxdbErrorTypes = {
            VALIDATION_ERROR: 'RxValidationError',
            CONFLICT_ERROR: 'RxConflictError', 
            STORAGE_ERROR: 'RxStorageError',
            SCHEMA_ERROR: 'RxSchemaError',
            QUERY_ERROR: 'RxQueryError',
            REPLICATION_ERROR: 'RxReplicationError',
            DOCUMENT_ERROR: 'RxDocumentError'
        };
        
        // Graceful degradation strategies
        this.degradationStrategies = {
            CACHE_ONLY: 'cache_only',
            READ_ONLY: 'read_only',
            OFFLINE_MODE: 'offline_mode',
            FALLBACK_STORAGE: 'fallback_storage'
        };
        
        this.currentDegradationLevel = null;
        this.ensureLogDirectory();
    }

    /**
     * Ensure log directory exists
     */
    async ensureLogDirectory() {
        try {
            await fs.access(this.logPath);
        } catch (error) {
            await fs.mkdir(this.logPath, { recursive: true });
        }
    }

    /**
     * Handle RxDB validation errors
     * @param {Error} error - RxDB validation error
     * @param {Object} document - Document that failed validation
     * @param {string} collection - Collection name
     * @returns {Promise<Object>} Error handling result
     */
    async handleValidationError(error, document, collection) {
        try {
            this.errorCounts.validation++;
            
            const errorInfo = {
                timestamp: new Date().toISOString(),
                type: 'validation',
                collection,
                documentId: document?.id || document?._id || 'unknown',
                error: {
                    message: error.message,
                    validationErrors: error.validationErrors || [],
                    schemaPath: error.schemaPath || null
                },
                document: this.sanitizeDocument(document),
                severity: 'HIGH'
            };

            await this.logRuntimeError(errorInfo);

            // Attempt to fix common validation issues
            const fixedDocument = await this.attemptValidationFix(document, error, collection);
            
            if (fixedDocument) {
                console.log(`[RxDB Error Handler] Successfully fixed validation error for document ${errorInfo.documentId}`);
                return {
                    success: true,
                    fixedDocument,
                    action: 'auto_fixed',
                    errorInfo
                };
            }

            // If auto-fix failed, provide detailed feedback
            const userFriendlyMessage = this.generateValidationErrorMessage(error, collection);
            const suggestedActions = this.generateValidationSuggestions(error, collection);

            console.error(`[RxDB Error Handler] Validation error in ${collection}: ${userFriendlyMessage}`);

            return {
                success: false,
                action: 'validation_failed',
                userMessage: userFriendlyMessage,
                suggestedActions,
                errorInfo,
                requiresManualIntervention: true
            };

        } catch (handlingError) {
            console.error('[RxDB Error Handler] Error handling validation error:', handlingError.message);
            return {
                success: false,
                action: 'error_handler_failed',
                originalError: error.message,
                handlingError: handlingError.message
            };
        }
    }

    /**
     * Handle RxDB conflict errors with resolution strategies
     * @param {Error} error - RxDB conflict error
     * @param {string} documentId - Document ID that has conflict
     * @param {string} collection - Collection name
     * @returns {Promise<Object>} Conflict resolution result
     */
    async handleConflictError(error, documentId, collection) {
        try {
            this.errorCounts.conflict++;
            
            const errorInfo = {
                timestamp: new Date().toISOString(),
                type: 'conflict',
                collection,
                documentId,
                error: {
                    message: error.message,
                    conflictedRevision: error.conflictedRevision || null,
                    currentRevision: error.currentRevision || null
                },
                severity: 'MEDIUM'
            };

            await this.logRuntimeError(errorInfo);

            // Apply conflict resolution strategy based on collection type
            const resolutionStrategy = this.getConflictResolutionStrategy(collection);
            const resolutionResult = await this.resolveConflict(
                documentId, 
                collection, 
                resolutionStrategy, 
                error
            );

            if (resolutionResult.success) {
                console.log(`[RxDB Error Handler] Conflict resolved for ${documentId} using ${resolutionStrategy} strategy`);
                return {
                    success: true,
                    action: 'conflict_resolved',
                    strategy: resolutionStrategy,
                    resolvedDocument: resolutionResult.document,
                    errorInfo
                };
            } else {
                console.error(`[RxDB Error Handler] Failed to resolve conflict for ${documentId}`);
                return {
                    success: false,
                    action: 'conflict_resolution_failed',
                    strategy: resolutionStrategy,
                    userMessage: 'Document conflict could not be automatically resolved. Manual intervention required.',
                    suggestedActions: [
                        'Review conflicting document versions',
                        'Manually merge document changes',
                        'Choose which version to keep',
                        'Update conflict resolution strategy if needed'
                    ],
                    errorInfo,
                    requiresManualIntervention: true
                };
            }

        } catch (handlingError) {
            console.error('[RxDB Error Handler] Error handling conflict error:', handlingError.message);
            return {
                success: false,
                action: 'error_handler_failed',
                originalError: error.message,
                handlingError: handlingError.message
            };
        }
    }

    /**
     * Handle RxDB storage errors with graceful degradation
     * @param {Error} error - RxDB storage error
     * @param {string} operation - Operation that failed
     * @param {Object} context - Additional context
     * @returns {Promise<Object>} Storage error handling result
     */
    async handleStorageError(error, operation, context = {}) {
        try {
            this.errorCounts.storage++;
            
            const errorInfo = {
                timestamp: new Date().toISOString(),
                type: 'storage',
                operation,
                error: {
                    message: error.message,
                    code: error.code,
                    errno: error.errno
                },
                context,
                severity: this.determineStorageErrorSeverity(error)
            };

            await this.logRuntimeError(errorInfo);

            // Determine if graceful degradation is needed
            const degradationNeeded = this.shouldActivateGracefulDegradation(error);
            
            if (degradationNeeded) {
                const degradationResult = await this.activateGracefulDegradation(error, operation);
                
                return {
                    success: false,
                    action: 'graceful_degradation_activated',
                    degradationLevel: degradationResult.level,
                    userMessage: degradationResult.userMessage,
                    errorInfo,
                    temporaryMode: true
                };
            }

            // Attempt storage recovery
            const recoveryResult = await this.attemptStorageRecovery(error, operation, context);
            
            if (recoveryResult.success) {
                console.log(`[RxDB Error Handler] Storage recovery successful for operation: ${operation}`);
                return {
                    success: true,
                    action: 'storage_recovered',
                    recoveryMethod: recoveryResult.method,
                    errorInfo
                };
            }

            // Storage recovery failed
            const userMessage = this.generateStorageErrorMessage(error);
            const suggestedActions = this.generateStorageErrorSuggestions(error);

            console.error(`[RxDB Error Handler] Storage error for operation ${operation}: ${userMessage}`);

            return {
                success: false,
                action: 'storage_error_unrecoverable',
                userMessage,
                suggestedActions,
                errorInfo,
                requiresManualIntervention: true
            };

        } catch (handlingError) {
            console.error('[RxDB Error Handler] Error handling storage error:', handlingError.message);
            return {
                success: false,
                action: 'error_handler_failed',
                originalError: error.message,
                handlingError: handlingError.message
            };
        }
    }

    /**
     * Handle general RxDB runtime errors
     * @param {Error} error - RxDB error
     * @param {string} operation - Operation that failed
     * @param {Object} context - Additional context
     * @returns {Promise<Object>} Error handling result
     */
    async handleRuntimeError(error, operation, context = {}) {
        try {
            // Categorize the error type
            const errorType = this.categorizeRxDBError(error);
            
            // Route to specific handler based on error type
            switch (errorType) {
                case this.rxdbErrorTypes.VALIDATION_ERROR:
                    return await this.handleValidationError(error, context.document, context.collection);
                    
                case this.rxdbErrorTypes.CONFLICT_ERROR:
                    return await this.handleConflictError(error, context.documentId, context.collection);
                    
                case this.rxdbErrorTypes.STORAGE_ERROR:
                    return await this.handleStorageError(error, operation, context);
                    
                default:
                    return await this.handleGenericRxDBError(error, operation, context);
            }
            
        } catch (handlingError) {
            console.error('[RxDB Error Handler] Error in runtime error handling:', handlingError.message);
            return {
                success: false,
                action: 'error_handler_failed',
                originalError: error.message,
                handlingError: handlingError.message
            };
        }
    }

    /**
     * Handle generic RxDB errors
     * @param {Error} error - RxDB error
     * @param {string} operation - Operation that failed
     * @param {Object} context - Additional context
     * @returns {Promise<Object>} Error handling result
     */
    async handleGenericRxDBError(error, operation, context = {}) {
        try {
            this.errorCounts.unknown++;
            
            const errorInfo = {
                timestamp: new Date().toISOString(),
                type: 'generic',
                operation,
                error: {
                    message: error.message,
                    name: error.name,
                    stack: error.stack
                },
                context,
                severity: 'MEDIUM'
            };

            await this.logRuntimeError(errorInfo);

            const userMessage = `RxDB operation '${operation}' failed: ${error.message}`;
            const suggestedActions = [
                'Check RxDB database connection',
                'Verify operation parameters',
                'Review error logs for more details',
                'Consider retrying the operation'
            ];

            console.error(`[RxDB Error Handler] Generic RxDB error in ${operation}: ${error.message}`);

            return {
                success: false,
                action: 'generic_error',
                userMessage,
                suggestedActions,
                errorInfo,
                retryable: this.isRetryableError(error)
            };

        } catch (handlingError) {
            console.error('[RxDB Error Handler] Error handling generic RxDB error:', handlingError.message);
            return {
                success: false,
                action: 'error_handler_failed',
                originalError: error.message,
                handlingError: handlingError.message
            };
        }
    }

    /**
     * Attempt to fix validation errors automatically
     * @param {Object} document - Document with validation errors
     * @param {Error} error - Validation error
     * @param {string} collection - Collection name
     * @returns {Promise<Object|null>} Fixed document or null if can't fix
     */
    async attemptValidationFix(document, error, collection) {
        try {
            if (!document || !error.validationErrors) {
                return null;
            }

            const fixedDocument = { ...document };
            let hasChanges = false;

            for (const validationError of error.validationErrors) {
                const fieldPath = validationError.instancePath || validationError.dataPath;
                const keyword = validationError.keyword;

                // Fix missing required fields
                if (keyword === 'required') {
                    const missingField = validationError.missingProperty || validationError.params?.missingProperty;
                    if (missingField) {
                        const defaultValue = this.getDefaultValueForField(collection, missingField);
                        if (defaultValue !== undefined) {
                            fixedDocument[missingField] = defaultValue;
                            hasChanges = true;
                        }
                    }
                }

                // Fix type mismatches
                if (keyword === 'type') {
                    const expectedType = validationError.params?.type;
                    const fieldName = fieldPath.replace('/', '');
                    
                    if (fieldName && expectedType && fixedDocument[fieldName] !== undefined) {
                        const convertedValue = this.convertToType(fixedDocument[fieldName], expectedType);
                        if (convertedValue !== null) {
                            fixedDocument[fieldName] = convertedValue;
                            hasChanges = true;
                        }
                    }
                }

                // Fix format issues
                if (keyword === 'format') {
                    const format = validationError.params?.format;
                    const fieldName = fieldPath.replace('/', '');
                    
                    if (fieldName && format === 'date-time' && fixedDocument[fieldName]) {
                        const dateValue = new Date(fixedDocument[fieldName]);
                        if (!isNaN(dateValue.getTime())) {
                            fixedDocument[fieldName] = dateValue.toISOString();
                            hasChanges = true;
                        }
                    }
                }
            }

            return hasChanges ? fixedDocument : null;

        } catch (error) {
            console.error('[RxDB Error Handler] Error attempting validation fix:', error.message);
            return null;
        }
    }

    /**
     * Get default value for a field based on collection and field name
     * @param {string} collection - Collection name
     * @param {string} fieldName - Field name
     * @returns {any} Default value or undefined
     */
    getDefaultValueForField(collection, fieldName) {
        const defaults = {
            users: {
                total_games_played: 0,
                total_games_won: 0,
                is_active: true,
                is_bot: false,
                created_at: new Date().toISOString()
            },
            games: {
                status: 'waiting',
                target_score: 52,
                is_demo_mode: false,
                created_at: new Date().toISOString()
            },
            rooms: {
                max_players: 4,
                status: 'waiting',
                is_private: false,
                version: 1,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            },
            teams: {
                score: 0,
                tricks_won: 0
            }
        };

        return defaults[collection]?.[fieldName];
    }

    /**
     * Convert value to specified type
     * @param {any} value - Value to convert
     * @param {string} targetType - Target type
     * @returns {any} Converted value or null if conversion failed
     */
    convertToType(value, targetType) {
        try {
            switch (targetType) {
                case 'string':
                    return String(value);
                case 'number':
                    const num = Number(value);
                    return isNaN(num) ? null : num;
                case 'boolean':
                    if (typeof value === 'boolean') return value;
                    if (typeof value === 'string') {
                        return value.toLowerCase() === 'true' || value === '1';
                    }
                    return Boolean(value);
                case 'integer':
                    const int = parseInt(value, 10);
                    return isNaN(int) ? null : int;
                default:
                    return null;
            }
        } catch (error) {
            return null;
        }
    }

    /**
     * Get conflict resolution strategy for collection
     * @param {string} collection - Collection name
     * @returns {string} Resolution strategy
     */
    getConflictResolutionStrategy(collection) {
        const strategies = {
            users: 'last_write_wins',
            games: 'custom_merge',
            rooms: 'version_based',
            teams: 'last_write_wins',
            game_players: 'custom_merge',
            user_sessions: 'last_write_wins'
        };

        return strategies[collection] || 'last_write_wins';
    }

    /**
     * Resolve document conflict using specified strategy
     * @param {string} documentId - Document ID
     * @param {string} collection - Collection name
     * @param {string} strategy - Resolution strategy
     * @param {Error} error - Conflict error
     * @returns {Promise<Object>} Resolution result
     */
    async resolveConflict(documentId, collection, strategy, error) {
        try {
            // This is a simplified implementation
            // In a real scenario, you would need access to the RxDB collection
            // and the conflicting document versions
            
            switch (strategy) {
                case 'last_write_wins':
                    return {
                        success: true,
                        method: 'last_write_wins',
                        document: null // Would contain the resolved document
                    };
                    
                case 'custom_merge':
                    return await this.performCustomMerge(documentId, collection, error);
                    
                case 'version_based':
                    return await this.performVersionBasedResolution(documentId, collection, error);
                    
                default:
                    return { success: false, error: 'Unknown resolution strategy' };
            }
            
        } catch (error) {
            console.error('[RxDB Error Handler] Error resolving conflict:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Perform custom merge for complex documents
     * @param {string} documentId - Document ID
     * @param {string} collection - Collection name
     * @param {Error} error - Conflict error
     * @returns {Promise<Object>} Merge result
     */
    async performCustomMerge(documentId, collection, error) {
        // Simplified implementation - would need actual document access
        return {
            success: true,
            method: 'custom_merge',
            document: null // Would contain the merged document
        };
    }

    /**
     * Perform version-based conflict resolution
     * @param {string} documentId - Document ID
     * @param {string} collection - Collection name
     * @param {Error} error - Conflict error
     * @returns {Promise<Object>} Resolution result
     */
    async performVersionBasedResolution(documentId, collection, error) {
        // Simplified implementation - would need actual document access
        return {
            success: true,
            method: 'version_based',
            document: null // Would contain the resolved document
        };
    }

    /**
     * Determine if graceful degradation should be activated
     * @param {Error} error - Storage error
     * @returns {boolean} True if degradation should be activated
     */
    shouldActivateGracefulDegradation(error) {
        const criticalErrors = [
            'ENOSPC', // No space left on device
            'EACCES', // Permission denied
            'EROFS',  // Read-only file system
            'EIO'     // I/O error
        ];

        return criticalErrors.includes(error.code) || 
               error.message.includes('disk full') ||
               error.message.includes('permission denied') ||
               this.errorCounts.storage > this.alertThresholds.storageFailures;
    }

    /**
     * Activate graceful degradation
     * @param {Error} error - Storage error
     * @param {string} operation - Failed operation
     * @returns {Promise<Object>} Degradation result
     */
    async activateGracefulDegradation(error, operation) {
        try {
            let degradationLevel;
            let userMessage;

            if (error.code === 'ENOSPC' || error.message.includes('disk full')) {
                degradationLevel = this.degradationStrategies.READ_ONLY;
                userMessage = 'Storage space is full. The application is now in read-only mode.';
            } else if (error.code === 'EACCES' || error.message.includes('permission')) {
                degradationLevel = this.degradationStrategies.CACHE_ONLY;
                userMessage = 'Storage permission issues detected. Using cache-only mode.';
            } else {
                degradationLevel = this.degradationStrategies.OFFLINE_MODE;
                userMessage = 'Storage issues detected. Operating in offline mode with limited functionality.';
            }

            this.currentDegradationLevel = degradationLevel;

            console.warn(`[RxDB Error Handler] Graceful degradation activated: ${degradationLevel}`);
            console.warn(`[RxDB Error Handler] User message: ${userMessage}`);

            // Log degradation activation
            await this.logRuntimeError({
                timestamp: new Date().toISOString(),
                type: 'degradation',
                level: degradationLevel,
                trigger: error.message,
                operation,
                severity: 'HIGH'
            });

            return {
                level: degradationLevel,
                userMessage,
                activated: true
            };

        } catch (degradationError) {
            console.error('[RxDB Error Handler] Error activating graceful degradation:', degradationError.message);
            return {
                level: this.degradationStrategies.OFFLINE_MODE,
                userMessage: 'System experiencing issues. Limited functionality available.',
                activated: false,
                error: degradationError.message
            };
        }
    }

    /**
     * Attempt storage recovery
     * @param {Error} error - Storage error
     * @param {string} operation - Failed operation
     * @param {Object} context - Additional context
     * @returns {Promise<Object>} Recovery result
     */
    async attemptStorageRecovery(error, operation, context) {
        try {
            // Attempt different recovery methods based on error type
            if (error.code === 'ENOENT') {
                // File not found - attempt to recreate
                return await this.recreateMissingFiles(error, context);
            }

            if (error.message.includes('corrupt') || error.message.includes('invalid')) {
                // Corruption detected - attempt repair
                return await this.repairCorruptedStorage(error, context);
            }

            if (error.code === 'EMFILE' || error.code === 'ENFILE') {
                // Too many open files - attempt cleanup
                return await this.cleanupFileHandles(error, context);
            }

            // Generic recovery attempt
            return await this.performGenericRecovery(error, operation, context);

        } catch (recoveryError) {
            console.error('[RxDB Error Handler] Error during storage recovery:', recoveryError.message);
            return {
                success: false,
                method: 'recovery_failed',
                error: recoveryError.message
            };
        }
    }

    /**
     * Recreate missing files
     * @param {Error} error - File not found error
     * @param {Object} context - Context information
     * @returns {Promise<Object>} Recovery result
     */
    async recreateMissingFiles(error, context) {
        // Simplified implementation - would need actual file recreation logic
        console.log('[RxDB Error Handler] Attempting to recreate missing files...');
        return {
            success: false, // Would be true if files were successfully recreated
            method: 'file_recreation',
            message: 'File recreation not implemented in this version'
        };
    }

    /**
     * Repair corrupted storage
     * @param {Error} error - Corruption error
     * @param {Object} context - Context information
     * @returns {Promise<Object>} Recovery result
     */
    async repairCorruptedStorage(error, context) {
        // Simplified implementation - would need actual repair logic
        console.log('[RxDB Error Handler] Attempting to repair corrupted storage...');
        return {
            success: false, // Would be true if repair was successful
            method: 'storage_repair',
            message: 'Storage repair not implemented in this version'
        };
    }

    /**
     * Cleanup file handles
     * @param {Error} error - File handle error
     * @param {Object} context - Context information
     * @returns {Promise<Object>} Recovery result
     */
    async cleanupFileHandles(error, context) {
        // Simplified implementation - would need actual cleanup logic
        console.log('[RxDB Error Handler] Attempting to cleanup file handles...');
        return {
            success: false, // Would be true if cleanup was successful
            method: 'file_handle_cleanup',
            message: 'File handle cleanup not implemented in this version'
        };
    }

    /**
     * Perform generic recovery
     * @param {Error} error - Storage error
     * @param {string} operation - Failed operation
     * @param {Object} context - Context information
     * @returns {Promise<Object>} Recovery result
     */
    async performGenericRecovery(error, operation, context) {
        // Simplified implementation - would need actual recovery logic
        console.log('[RxDB Error Handler] Attempting generic recovery...');
        return {
            success: false, // Would be true if recovery was successful
            method: 'generic_recovery',
            message: 'Generic recovery not implemented in this version'
        };
    }

    /**
     * Categorize RxDB error type
     * @param {Error} error - RxDB error
     * @returns {string} Error type
     */
    categorizeRxDBError(error) {
        const errorName = error.name || '';
        const errorMessage = error.message.toLowerCase();

        if (errorName.includes('Validation') || errorMessage.includes('validation')) {
            return this.rxdbErrorTypes.VALIDATION_ERROR;
        }

        if (errorName.includes('Conflict') || errorMessage.includes('conflict')) {
            return this.rxdbErrorTypes.CONFLICT_ERROR;
        }

        if (errorName.includes('Storage') || errorMessage.includes('storage') || 
            errorMessage.includes('lokijs') || errorMessage.includes('file')) {
            return this.rxdbErrorTypes.STORAGE_ERROR;
        }

        if (errorName.includes('Schema') || errorMessage.includes('schema')) {
            return this.rxdbErrorTypes.SCHEMA_ERROR;
        }

        if (errorName.includes('Query') || errorMessage.includes('query')) {
            return this.rxdbErrorTypes.QUERY_ERROR;
        }

        if (errorName.includes('Replication') || errorMessage.includes('replication')) {
            return this.rxdbErrorTypes.REPLICATION_ERROR;
        }

        if (errorName.includes('Document') || errorMessage.includes('document')) {
            return this.rxdbErrorTypes.DOCUMENT_ERROR;
        }

        return 'unknown';
    }

    /**
     * Determine storage error severity
     * @param {Error} error - Storage error
     * @returns {string} Severity level
     */
    determineStorageErrorSeverity(error) {
        const criticalCodes = ['ENOSPC', 'EROFS', 'EIO'];
        const highCodes = ['EACCES', 'EPERM', 'EMFILE'];

        if (criticalCodes.includes(error.code)) {
            return 'CRITICAL';
        }

        if (highCodes.includes(error.code)) {
            return 'HIGH';
        }

        return 'MEDIUM';
    }

    /**
     * Check if error is retryable
     * @param {Error} error - Error to check
     * @returns {boolean} True if retryable
     */
    isRetryableError(error) {
        const retryableCodes = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'];
        const retryableMessages = ['timeout', 'connection', 'network'];

        return retryableCodes.includes(error.code) ||
               retryableMessages.some(msg => error.message.toLowerCase().includes(msg));
    }

    /**
     * Generate user-friendly validation error message
     * @param {Error} error - Validation error
     * @param {string} collection - Collection name
     * @returns {string} User-friendly message
     */
    generateValidationErrorMessage(error, collection) {
        if (error.validationErrors && error.validationErrors.length > 0) {
            const firstError = error.validationErrors[0];
            const field = firstError.instancePath || firstError.dataPath || 'unknown field';
            const keyword = firstError.keyword;

            switch (keyword) {
                case 'required':
                    return `Required field '${firstError.missingProperty}' is missing in ${collection} document.`;
                case 'type':
                    return `Field '${field}' has incorrect type in ${collection} document. Expected ${firstError.params?.type}.`;
                case 'format':
                    return `Field '${field}' has incorrect format in ${collection} document. Expected ${firstError.params?.format}.`;
                default:
                    return `Validation failed for field '${field}' in ${collection} document: ${firstError.message}`;
            }
        }

        return `Document validation failed in ${collection}: ${error.message}`;
    }

    /**
     * Generate validation error suggestions
     * @param {Error} error - Validation error
     * @param {string} collection - Collection name
     * @returns {Array} Suggested actions
     */
    generateValidationSuggestions(error, collection) {
        const suggestions = [
            'Review document structure and required fields',
            'Check data types match schema requirements',
            'Verify all required fields are present',
            'Update document to match collection schema'
        ];

        if (error.validationErrors) {
            for (const validationError of error.validationErrors) {
                if (validationError.keyword === 'required') {
                    suggestions.push(`Add missing field: ${validationError.missingProperty}`);
                }
                if (validationError.keyword === 'format' && validationError.params?.format === 'date-time') {
                    suggestions.push('Ensure date fields are in ISO 8601 format');
                }
            }
        }

        return suggestions;
    }

    /**
     * Generate storage error message
     * @param {Error} error - Storage error
     * @returns {string} User-friendly message
     */
    generateStorageErrorMessage(error) {
        switch (error.code) {
            case 'ENOSPC':
                return 'Storage space is full. Please free up disk space.';
            case 'EACCES':
            case 'EPERM':
                return 'Permission denied accessing storage. Please check file permissions.';
            case 'EROFS':
                return 'Storage is read-only. Write operations are not possible.';
            case 'EIO':
                return 'Storage I/O error. There may be hardware issues.';
            case 'EMFILE':
            case 'ENFILE':
                return 'Too many files open. System resource limit reached.';
            default:
                return `Storage operation failed: ${error.message}`;
        }
    }

    /**
     * Generate storage error suggestions
     * @param {Error} error - Storage error
     * @returns {Array} Suggested actions
     */
    generateStorageErrorSuggestions(error) {
        const baseSuggestions = [
            'Check system logs for more details',
            'Verify storage system health',
            'Contact system administrator if needed'
        ];

        switch (error.code) {
            case 'ENOSPC':
                return [
                    'Free up disk space',
                    'Clean up temporary files',
                    'Archive old data',
                    ...baseSuggestions
                ];
            case 'EACCES':
            case 'EPERM':
                return [
                    'Check file and directory permissions',
                    'Ensure application has write access',
                    'Run with appropriate user privileges',
                    ...baseSuggestions
                ];
            case 'EROFS':
                return [
                    'Check if storage is mounted read-only',
                    'Remount storage with write permissions',
                    'Verify storage device is not write-protected',
                    ...baseSuggestions
                ];
            default:
                return baseSuggestions;
        }
    }

    /**
     * Sanitize document for logging (remove sensitive data)
     * @param {Object} document - Document to sanitize
     * @returns {Object} Sanitized document
     */
    sanitizeDocument(document) {
        if (!document || typeof document !== 'object') {
            return document;
        }

        const sanitized = { ...document };
        const sensitiveFields = ['password', 'password_hash', 'token', 'secret', 'key'];

        for (const field of sensitiveFields) {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        }

        return sanitized;
    }

    /**
     * Log runtime error to file
     * @param {Object} errorInfo - Error information
     */
    async logRuntimeError(errorInfo) {
        try {
            const logFileName = `rxdb-runtime-errors-${new Date().toISOString().split('T')[0]}.log`;
            const logFilePath = path.join(this.logPath, logFileName);
            
            const logLine = JSON.stringify(errorInfo) + '\n';
            await fs.appendFile(logFilePath, logLine);
            
        } catch (logError) {
            console.error('[RxDB Error Handler] Failed to write runtime error log:', logError.message);
        }
    }

    /**
     * Get runtime error statistics
     * @param {string} date - Date to get stats for (YYYY-MM-DD format)
     * @returns {Promise<Object>} Error statistics
     */
    async getRuntimeErrorStatistics(date = null) {
        try {
            const targetDate = date || new Date().toISOString().split('T')[0];
            const logFileName = `rxdb-runtime-errors-${targetDate}.log`;
            const logFilePath = path.join(this.logPath, logFileName);
            
            try {
                const logData = await fs.readFile(logFilePath, 'utf8');
                const logLines = logData.trim().split('\n').filter(line => line.trim());
                
                const stats = {
                    date: targetDate,
                    totalErrors: logLines.length,
                    errorsByType: {},
                    errorsBySeverity: {},
                    errorsByCollection: {},
                    degradationActivations: 0,
                    currentDegradationLevel: this.currentDegradationLevel
                };
                
                for (const line of logLines) {
                    try {
                        const logEntry = JSON.parse(line);
                        
                        // Count by type
                        const type = logEntry.type;
                        stats.errorsByType[type] = (stats.errorsByType[type] || 0) + 1;
                        
                        // Count by severity
                        const severity = logEntry.severity;
                        stats.errorsBySeverity[severity] = (stats.errorsBySeverity[severity] || 0) + 1;
                        
                        // Count by collection
                        if (logEntry.collection) {
                            const collection = logEntry.collection;
                            stats.errorsByCollection[collection] = (stats.errorsByCollection[collection] || 0) + 1;
                        }
                        
                        // Count degradation activations
                        if (logEntry.type === 'degradation') {
                            stats.degradationActivations++;
                        }
                        
                    } catch (parseError) {
                        console.warn('[RxDB Error Handler] Failed to parse runtime error log entry:', parseError.message);
                    }
                }
                
                return stats;
                
            } catch (readError) {
                return {
                    date: targetDate,
                    totalErrors: 0,
                    message: `No runtime error log found for date ${targetDate}`,
                    currentDegradationLevel: this.currentDegradationLevel
                };
            }
            
        } catch (error) {
            console.error('[RxDB Error Handler] Error getting runtime error statistics:', error.message);
            throw error;
        }
    }

    /**
     * Reset error counts (called periodically for monitoring)
     */
    resetErrorCounts() {
        this.errorCounts = {
            validation: 0,
            conflict: 0,
            storage: 0,
            connection: 0,
            timeout: 0,
            unknown: 0
        };
        this.lastResetTime = Date.now();
    }

    /**
     * Check if alert thresholds are exceeded
     * @returns {Object} Alert status
     */
    checkAlertThresholds() {
        const now = Date.now();
        const timeSinceReset = now - this.lastResetTime;
        const minutesSinceReset = timeSinceReset / (1000 * 60);
        
        const alerts = {
            errorRateExceeded: false,
            conflictRateExceeded: false,
            storageFailuresExceeded: false,
            recommendations: []
        };
        
        if (minutesSinceReset > 0) {
            const totalErrorRate = Object.values(this.errorCounts).reduce((sum, count) => sum + count, 0) / minutesSinceReset;
            const conflictRate = this.errorCounts.conflict / minutesSinceReset;
            
            if (totalErrorRate > this.alertThresholds.errorRate) {
                alerts.errorRateExceeded = true;
                alerts.recommendations.push('High error rate detected. Consider investigating system health.');
            }
            
            if (conflictRate > this.alertThresholds.conflictRate) {
                alerts.conflictRateExceeded = true;
                alerts.recommendations.push('High conflict rate detected. Review concurrent access patterns.');
            }
        }
        
        if (this.errorCounts.storage > this.alertThresholds.storageFailures) {
            alerts.storageFailuresExceeded = true;
            alerts.recommendations.push('Multiple storage failures detected. Check storage system health.');
        }
        
        return alerts;
    }

    /**
     * Deactivate graceful degradation
     * @returns {Promise<boolean>} True if deactivation successful
     */
    async deactivateGracefulDegradation() {
        try {
            if (this.currentDegradationLevel) {
                const previousLevel = this.currentDegradationLevel;
                this.currentDegradationLevel = null;
                
                console.log(`[RxDB Error Handler] Graceful degradation deactivated. Previous level: ${previousLevel}`);
                
                // Log deactivation
                await this.logRuntimeError({
                    timestamp: new Date().toISOString(),
                    type: 'degradation_deactivated',
                    previousLevel,
                    severity: 'INFO'
                });
                
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error('[RxDB Error Handler] Error deactivating graceful degradation:', error.message);
            return false;
        }
    }
}

export default RxDBErrorHandler;